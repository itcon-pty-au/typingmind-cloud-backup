if (window.typingMindCloudSync) {
  console.log("TypingMind Cloud Sync already loaded");
} else {
  window.typingMindCloudSync = true;

  class ConfigManager {
    constructor() {
      this.config = this.loadConfig();
      this.exclusions = this.loadExclusions();
    }
    loadConfig() {
      const defaults = {
        syncInterval: 15,
        bucketName: "",
        region: "",
        accessKey: "",
        secretKey: "",
        endpoint: "",
        encryptionKey: "",
        syncMode: "sync",
      };
      const stored = {};
      const keyMappings = {
        bucketName: "tcs_aws-bucket",
        region: "tcs_aws-region",
        accessKey: "tcs_aws-access-key",
        secretKey: "tcs_aws-secret-key",
        endpoint: "tcs_aws-endpoint",
        encryptionKey: "tcs_encryption-key",
        syncInterval: "tcs_backup-interval",
        syncMode: "tcs_sync-mode",
      };
      Object.keys(defaults).forEach((key) => {
        const storageKey =
          keyMappings[key] ||
          `tcs_${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
        const value = localStorage.getItem(storageKey);
        stored[key] =
          key === "syncInterval" ? parseInt(value) || 15 : value || "";
      });
      return { ...defaults, ...stored };
    }
    loadExclusions() {
      const exclusions = localStorage.getItem("tcs_sync-exclusions");
      const userExclusions = exclusions
        ? exclusions
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      const systemExclusions = [
        "tcs_aws-bucket",
        "tcs_aws-access-key",
        "tcs_aws-secret-key",
        "tcs_aws-region",
        "tcs_aws-endpoint",
        "tcs_encryption-key",
        "tcs_last-cloud-sync",
        "tcs_sync-exclusions",
        "tcs_cloud-metadata-v4",
        "referrer",
        "TM_useLastVerifiedToken",
        "TM_useStateUpdateHistory",
      ];
      return [...systemExclusions, ...userExclusions];
    }
    get(key) {
      return this.config[key];
    }
    set(key, value) {
      this.config[key] = value;
    }
    save() {
      const keyMappings = {
        bucketName: "tcs_aws-bucket",
        region: "tcs_aws-region",
        accessKey: "tcs_aws-access-key",
        secretKey: "tcs_aws-secret-key",
        endpoint: "tcs_aws-endpoint",
        encryptionKey: "tcs_encryption-key",
        syncInterval: "tcs_backup-interval",
        syncMode: "tcs_sync-mode",
      };
      Object.keys(this.config).forEach((key) => {
        const storageKey =
          keyMappings[key] ||
          `tcs_${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
        localStorage.setItem(storageKey, this.config[key].toString());
      });
    }
    isConfigured() {
      return !!(
        this.config.accessKey &&
        this.config.secretKey &&
        this.config.region &&
        this.config.bucketName
      );
    }
    shouldExclude(key) {
      const debugEnabled =
        new URLSearchParams(window.location.search).get("log") === "true";
      const inExclusionsList = this.exclusions.includes(key);
      const startsWith_tcs = key.startsWith("tcs_");
      const result = inExclusionsList || startsWith_tcs;

      return result;
    }
  }

  class Logger {
    constructor() {
      this.enabled =
        new URLSearchParams(window.location.search).get("log") === "true";
      this.icons = {
        info: "ℹ️",
        success: "✅",
        warning: "⚠️",
        error: "❌",
        start: "🔄",
        skip: "⏭️",
      };
    }
    log(type, message, data = null) {
      if (!this.enabled) return;
      const timestamp = new Date().toLocaleString();
      console.log(
        `${this.icons[type] || "ℹ️"} [${timestamp}] ${message}`,
        data || ""
      );
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      const url = new URL(window.location);
      if (enabled) url.searchParams.set("log", "true");
      else url.searchParams.delete("log");
      window.history.replaceState({}, "", url);
    }
  }

  class DataService {
    constructor(configManager) {
      this.config = configManager;
      this.dbPromise = null;
    }
    async getDB() {
      if (!this.dbPromise) {
        this.dbPromise = new Promise((resolve, reject) => {
          const request = indexedDB.open("keyval-store");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error("Failed to open IndexedDB"));
        });
      }
      return this.dbPromise;
    }
    async getAllItems() {
      const items = new Map();
      const db = await this.getDB();
      const transaction = db.transaction(["keyval"], "readonly");
      const store = transaction.objectStore("keyval");
      let totalIDB = 0;
      let includedIDB = 0;
      let excludedIDB = 0;
      await new Promise((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const key = cursor.key;
            const value = cursor.value;
            totalIDB++;
            if (
              typeof key === "string" &&
              value !== undefined &&
              !this.config.shouldExclude(key)
            ) {
              items.set(key, {
                id: key,
                data: { id: key, ...value },
                type: "idb",
              });
              includedIDB++;
            } else {
              excludedIDB++;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => resolve();
      });
      const debugEnabled =
        new URLSearchParams(window.location.search).get("log") === "true";
      let totalLS = 0;
      let excludedLS = 0;
      let includedLS = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        totalLS++;
        if (key && !this.config.shouldExclude(key)) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            items.set(key, { id: key, data: { key, value }, type: "ls" });
            includedLS++;
          }
        } else {
          excludedLS++;
        }
      }
      if (debugEnabled) {
        console.log(
          `📊 IndexedDB Stats: Total=${totalIDB}, Included=${includedIDB}, Excluded=${excludedIDB}`
        );
        console.log(
          `📊 localStorage Stats: Total=${totalLS}, Included=${includedLS}, Excluded=${excludedLS}`
        );
        console.log(`📊 Total items to sync: ${items.size} (IDB + LS)`);
      }
      return Array.from(items.values());
    }
    async getItem(itemId, type) {
      if (type === "idb") {
        const db = await this.getDB();
        const transaction = db.transaction(["keyval"], "readonly");
        const store = transaction.objectStore("keyval");
        return new Promise((resolve) => {
          const request = store.get(itemId);
          request.onsuccess = () => {
            const result = request.result;
            resolve(result ? { id: itemId, ...result } : null);
          };
          request.onerror = () => resolve(null);
        });
      } else if (type === "ls") {
        const value = localStorage.getItem(itemId);
        return value !== null ? { key: itemId, value } : null;
      }
      return null;
    }
    async saveItem(item, type) {
      if (type === "idb") {
        const db = await this.getDB();
        const transaction = db.transaction(["keyval"], "readwrite");
        const store = transaction.objectStore("keyval");
        const itemId = item.id;
        const itemData = { ...item };
        delete itemData.id;
        return new Promise((resolve) => {
          const request = store.put(itemData, itemId);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      } else if (type === "ls") {
        try {
          localStorage.setItem(item.key, item.value);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
    async deleteItem(itemId, type) {
      if (type === "idb") {
        const db = await this.getDB();
        const transaction = db.transaction(["keyval"], "readwrite");
        const store = transaction.objectStore("keyval");
        return new Promise((resolve) => {
          const request = store.delete(itemId);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      } else if (type === "ls") {
        try {
          localStorage.removeItem(itemId);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
    async generateHash(content) {
      const data = new TextEncoder().encode(
        typeof content === "string" ? content : JSON.stringify(content)
      );
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .slice(0, 4)
        .join("");
    }
  }

  class CryptoService {
    constructor(configManager) {
      this.config = configManager;
      this.keyCache = new Map();
    }
    async deriveKey(password) {
      if (this.keyCache.has(password)) return this.keyCache.get(password);
      const data = new TextEncoder().encode(password);
      const hash = await crypto.subtle.digest("SHA-256", data);
      const key = await crypto.subtle.importKey(
        "raw",
        hash,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
      this.keyCache.set(password, key);
      return key;
    }
    async encrypt(data) {
      const encryptionKey = this.config.get("encryptionKey");
      if (!encryptionKey) throw new Error("No encryption key configured");
      const key = await this.deriveKey(encryptionKey);
      const encodedData = new TextEncoder().encode(JSON.stringify(data));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encodedData
      );
      const result = new Uint8Array(iv.length + encrypted.byteLength);
      result.set(iv, 0);
      result.set(new Uint8Array(encrypted), iv.length);
      return result;
    }
    async decrypt(encryptedData) {
      const encryptionKey = this.config.get("encryptionKey");
      if (!encryptionKey) throw new Error("No encryption key configured");
      const key = await this.deriveKey(encryptionKey);
      const iv = encryptedData.slice(0, 12);
      const data = encryptedData.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        data
      );
      return JSON.parse(new TextDecoder().decode(decrypted));
    }
  }

  class S3Service {
    constructor(configManager, cryptoService, logger) {
      this.config = configManager;
      this.crypto = cryptoService;
      this.logger = logger;
      this.client = null;
      this.sdkLoaded = false;
    }
    async initialize() {
      if (!this.config.isConfigured())
        throw new Error("AWS configuration incomplete");
      await this.loadSDK();
      const config = this.config.config;
      const s3Config = {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
        region: config.region,
      };
      if (config.endpoint) {
        s3Config.endpoint = config.endpoint;
        s3Config.s3ForcePathStyle = true;
      }
      AWS.config.update(s3Config);
      this.client = new AWS.S3();
      this.logger.log("success", "S3 service initialized");
    }
    async loadSDK() {
      if (this.sdkLoaded || window.AWS) {
        this.sdkLoaded = true;
        return;
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.1691.0.min.js";
        script.onload = () => {
          this.sdkLoaded = true;
          resolve();
        };
        script.onerror = () => reject(new Error("Failed to load AWS SDK"));
        document.head.appendChild(script);
      });
    }
    async withRetry(operation, maxRetries = 3) {
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          if (error.code === "NoSuchKey" || error.statusCode === 404)
            throw error;
          if (attempt === maxRetries) break;
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.logger.log(
            "warning",
            `Retry ${attempt + 1}/${maxRetries} in ${delay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw lastError;
    }
    async upload(key, data, isMetadata = false) {
      return this.withRetry(async () => {
        const body = isMetadata
          ? JSON.stringify(data)
          : await this.crypto.encrypt(data);
        const result = await this.client
          .upload({
            Bucket: this.config.get("bucketName"),
            Key: key,
            Body: body,
            ContentType: isMetadata
              ? "application/json"
              : "application/octet-stream",
          })
          .promise();
        this.logger.log("success", `Uploaded ${key}`);
        return result;
      });
    }
    async download(key, isMetadata = false) {
      return this.withRetry(async () => {
        const result = await this.client
          .getObject({ Bucket: this.config.get("bucketName"), Key: key })
          .promise();
        const data = isMetadata
          ? JSON.parse(result.Body.toString())
          : await this.crypto.decrypt(new Uint8Array(result.Body));
        return data;
      });
    }
    async downloadRaw(key) {
      return this.withRetry(async () => {
        const result = await this.client
          .getObject({ Bucket: this.config.get("bucketName"), Key: key })
          .promise();
        return new Uint8Array(result.Body);
      });
    }
    async delete(key) {
      return this.withRetry(async () => {
        await this.client
          .deleteObject({ Bucket: this.config.get("bucketName"), Key: key })
          .promise();
        this.logger.log("success", `Deleted ${key}`);
      });
    }
    async list(prefix = "") {
      return this.withRetry(async () => {
        const result = await this.client
          .listObjectsV2({
            Bucket: this.config.get("bucketName"),
            Prefix: prefix,
          })
          .promise();
        return result.Contents || [];
      });
    }
  }

  class SyncOrchestrator {
    constructor(configManager, dataService, s3Service, logger) {
      this.config = configManager;
      this.dataService = dataService;
      this.s3 = s3Service;
      this.logger = logger;
      this.metadata = this.loadMetadata();
      this.syncInProgress = false;
      this.lastChangeCheck = 0;
      this.lastActivity = Date.now();
      this.knownItems = new Map();
      this.potentialDeletions = new Map();
      this.setupActivityMonitoring();
      this.startDeletionMonitoring();
    }
    loadMetadata() {
      const stored = localStorage.getItem("tcs_cloud-metadata-v4");
      return stored
        ? JSON.parse(stored)
        : { lastSync: 0, lastModified: 0, items: {}, deleted: [] };
    }
    saveMetadata() {
      this.metadata.lastModified = Date.now();
      localStorage.setItem(
        "tcs_cloud-metadata-v4",
        JSON.stringify(this.metadata)
      );
    }
    getLastCloudSync() {
      const stored = localStorage.getItem("tcs_last-cloud-sync");
      return stored ? parseInt(stored) : 0;
    }
    setLastCloudSync(timestamp) {
      localStorage.setItem("tcs_last-cloud-sync", timestamp.toString());
    }
    setupActivityMonitoring() {
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;
      localStorage.setItem = (...args) => {
        this.lastActivity = Date.now();
        return originalSetItem.apply(localStorage, args);
      };
      localStorage.removeItem = (...args) => {
        this.lastActivity = Date.now();
        return originalRemoveItem.apply(localStorage, args);
      };
    }
    async detectChanges() {
      const now = Date.now();
      const timeSinceActivity = now - this.lastActivity;
      if (timeSinceActivity > 30000 && now - this.lastChangeCheck < 10000) {
        return { changedItems: [], hasChanges: false };
      }
      this.lastChangeCheck = now;
      const allItems = await this.dataService.getAllItems();
      const debugEnabled =
        new URLSearchParams(window.location.search).get("log") === "true";

      const changedItems = [];
      let processedCount = 0;

      for (const item of allItems) {
        const existingItem = this.metadata.items[item.id];
        const hash = await this.dataService.generateHash(item.data);
        processedCount++;

        if (!existingItem || existingItem.hash !== hash) {
          changedItems.push({
            id: item.id,
            type: item.type,
            hash,
            modified: now,
            synced: existingItem?.synced || 0,
          });

          if (debugEnabled) {
            this.logger.log(
              "info",
              `📝 Change detected: ${item.id} (${item.type}) - ${
                !existingItem ? "NEW" : "MODIFIED"
              }`
            );
          }
        }
      }

      for (const [itemId, metadata] of Object.entries(this.metadata.items)) {
        if (metadata.deleted && metadata.synced < metadata.modified) {
          changedItems.push({
            id: itemId,
            type: metadata.type,
            hash: "deleted",
            modified: metadata.modified,
            synced: metadata.synced,
            deleted: true,
          });

          if (debugEnabled) {
            this.logger.log(
              "info",
              `🗑️ Tombstone needs sync: ${itemId} (${metadata.type})`
            );
          }
        }
      }

      if (debugEnabled) {
        this.logger.log(
          "info",
          `🔍 Change detection: Processed ${processedCount} items, Found ${changedItems.length} changes`
        );
      }

      return { changedItems, hasChanges: changedItems.length > 0 };
    }
    async syncToCloud() {
      if (this.syncInProgress) {
        this.logger.log("skip", "Sync already in progress");
        return;
      }
      this.syncInProgress = true;
      try {
        this.logger.log("start", "Starting sync to cloud");
        const { changedItems } = await this.detectChanges();

        const debugEnabled =
          new URLSearchParams(window.location.search).get("log") === "true";
        if (debugEnabled) {
          this.logger.log(
            "info",
            `🔍 syncToCloud detectChanges result: ${changedItems.length} items`
          );
          if (changedItems.length > 0) {
            changedItems.forEach((item) => {
              this.logger.log(
                "info",
                `  📝 Found change: ${item.id} (${item.type}) - modified=${item.modified}, synced=${item.synced}`
              );
            });
          }
        }

        const itemsToSync = changedItems.filter(
          (item) => item.modified > item.synced
        );

        if (debugEnabled && changedItems.length > 0) {
          this.logger.log(
            "info",
            `📊 Sync filter: ${changedItems.length} changed items, ${itemsToSync.length} need sync`
          );
          changedItems.forEach((item) => {
            const needsSync = item.modified > item.synced;
            this.logger.log(
              "info",
              `  • ${item.id} (${item.type}): modified=${
                item.modified
              }, synced=${item.synced} → ${needsSync ? "SYNC" : "SKIP"}`
            );
          });
        }

        if (itemsToSync.length === 0) {
          this.logger.log("info", "No items to sync to cloud");
          return;
        }
        this.logger.log("info", `Syncing ${itemsToSync.length} items to cloud`);
        let cloudMetadata;
        try {
          cloudMetadata = await this.s3.download("metadata.json", true);
        } catch (error) {
          if (error.code === "NoSuchKey" || error.statusCode === 404) {
            cloudMetadata = {
              lastSync: 0,
              lastModified: 0,
              items: {},
              deleted: [],
            };
          } else {
            throw error;
          }
        }
        if (!cloudMetadata || typeof cloudMetadata !== "object") {
          cloudMetadata = {
            lastSync: 0,
            lastModified: 0,
            items: {},
            deleted: [],
          };
        }
        if (!cloudMetadata.items) {
          cloudMetadata.items = {};
        }
        if (!cloudMetadata.deleted) {
          cloudMetadata.deleted = [];
        }
        const uploadPromises = itemsToSync.map(async (item) => {
          if (item.deleted) {
            this.metadata.items[item.id].synced = Date.now();
            cloudMetadata.items[item.id] = { ...this.metadata.items[item.id] };
            this.logger.log(
              "info",
              `🗑️ Synced tombstone for ${item.id} to cloud`
            );
          } else {
            const data = await this.dataService.getItem(item.id, item.type);
            if (data) {
              await this.s3.upload(`items/${item.id}.json`, data);
              this.metadata.items[item.id] = {
                hash: item.hash,
                modified: item.modified,
                synced: Date.now(),
                type: item.type,
              };
              cloudMetadata.items[item.id] = {
                ...this.metadata.items[item.id],
              };
            }
          }
        });
        await Promise.allSettled(uploadPromises);
        cloudMetadata.lastSync = Date.now();
        cloudMetadata.lastModified = this.metadata.lastModified;
        await this.s3.upload("metadata.json", cloudMetadata, true);
        this.metadata.lastSync = cloudMetadata.lastSync;
        this.setLastCloudSync(cloudMetadata.lastModified);
        this.saveMetadata();
        this.logger.log(
          "success",
          `Sync to cloud completed - ${itemsToSync.length} items synced`
        );
      } catch (error) {
        this.logger.log("error", "Failed to sync to cloud", error.message);
        throw error;
      } finally {
        this.syncInProgress = false;
      }
    }
    async syncFromCloud() {
      if (this.syncInProgress) {
        this.logger.log("skip", "Sync already in progress");
        return;
      }
      this.syncInProgress = true;
      try {
        this.logger.log("start", "Starting sync from cloud");
        let cloudMetadata;
        try {
          cloudMetadata = await this.s3.download("metadata.json", true);
        } catch (error) {
          if (error.code === "NoSuchKey" || error.statusCode === 404) {
            this.logger.log(
              "info",
              "No cloud metadata found - creating initial sync"
            );
            return await this.createInitialSync();
          } else {
            throw error;
          }
        }
        if (!cloudMetadata || !cloudMetadata.items) {
          this.logger.log(
            "info",
            "Invalid or empty cloud metadata - creating initial sync"
          );
          return await this.createInitialSync();
        }
        const lastCloudSync = this.getLastCloudSync();
        const cloudLastModified = cloudMetadata.lastModified || 0;
        const hasCloudChanges = cloudLastModified > lastCloudSync;

        if (!hasCloudChanges) {
          this.logger.log(
            "info",
            "No cloud changes detected - skipping item downloads"
          );
          await this.detectChanges();
          this.metadata.lastSync = Date.now();
          this.setLastCloudSync(cloudLastModified);
          this.saveMetadata();
          this.logger.log("success", "Sync from cloud completed (no changes)");
          return;
        }

        this.logger.log(
          "info",
          `Cloud changes detected - proceeding with full sync (cloud: ${cloudLastModified}, local: ${lastCloudSync})`
        );
        await this.detectChanges();
        const itemsToDownload = Object.entries(cloudMetadata.items).filter(
          ([key, cloudItem]) => {
            const localItem = this.metadata.items[key];
            return (
              !localItem ||
              (cloudItem.hash !== localItem.hash &&
                cloudItem.modified > localItem.modified)
            );
          }
        );
        if (itemsToDownload.length > 0) {
          this.logger.log(
            "info",
            `Downloading ${itemsToDownload.length} items from cloud`
          );
        }
        const downloadPromises = itemsToDownload.map(
          async ([key, cloudItem]) => {
            if (cloudItem.deleted) {
              this.logger.log(
                "info",
                `🗑️ Processing cloud tombstone for ${key}`
              );
              await this.dataService.deleteItem(key, cloudItem.type);
              this.metadata.items[key] = { ...cloudItem };
            } else {
              const data = await this.s3.download(`items/${key}.json`);
              if (data) {
                await this.dataService.saveItem(data, cloudItem.type);
                this.metadata.items[key] = { ...cloudItem };
              }
            }
          }
        );
        await Promise.allSettled(downloadPromises);
        const deletedItems = cloudMetadata.deleted || [];
        for (const deletedKey of deletedItems) {
          if (this.metadata.items[deletedKey]) {
            const item = this.metadata.items[deletedKey];
            await this.dataService.deleteItem(deletedKey, item.type);
            delete this.metadata.items[deletedKey];
          }
        }
        this.metadata.lastSync = Date.now();
        this.setLastCloudSync(cloudLastModified);
        this.saveMetadata();
        this.logger.log("success", "Sync from cloud completed");
      } catch (error) {
        this.logger.log("error", "Failed to sync from cloud", error.message);
        throw error;
      } finally {
        this.syncInProgress = false;
      }
    }
    async createInitialSync() {
      this.logger.log("start", "Creating initial sync");
      const { changedItems } = await this.detectChanges();
      const cloudMetadata = {
        lastSync: Date.now(),
        lastModified: Date.now(),
        items: {},
        deleted: [],
      };
      const uploadPromises = changedItems.map(async (item) => {
        const data = await this.dataService.getItem(item.id, item.type);
        if (data) {
          await this.s3.upload(`items/${item.id}.json`, data);
          this.metadata.items[item.id] = {
            hash: item.hash,
            modified: item.modified,
            synced: Date.now(),
            type: item.type,
          };
          cloudMetadata.items[item.id] = { ...this.metadata.items[item.id] };
        }
      });
      await Promise.allSettled(uploadPromises);
      await this.s3.upload("metadata.json", cloudMetadata, true);
      this.metadata.lastSync = cloudMetadata.lastSync;
      this.setLastCloudSync(cloudMetadata.lastModified);
      this.saveMetadata();
      this.logger.log(
        "success",
        `Initial sync completed - ${changedItems.length} items uploaded`
      );
    }
    async performFullSync() {
      await this.syncFromCloud();
      await this.syncToCloud();

      const now = Date.now();
      const lastCleanup = localStorage.getItem("tcs_last-tombstone-cleanup");
      const cleanupInterval = 24 * 60 * 60 * 1000;

      if (!lastCleanup || now - parseInt(lastCleanup) > cleanupInterval) {
        this.logger.log("info", "🧹 Starting periodic tombstone cleanup");
        const localCleaned = this.cleanupOldTombstones();
        const cloudCleaned = await this.cleanupCloudTombstones();
        localStorage.setItem("tcs_last-tombstone-cleanup", now.toString());

        if (localCleaned > 0 || cloudCleaned > 0) {
          this.logger.log(
            "success",
            `Tombstone cleanup completed: ${localCleaned} local, ${cloudCleaned} cloud`
          );
        }
      }
    }
    async cleanupCloudTombstones() {
      try {
        const cloudMetadata = await this.s3.download("metadata.json", true);
        const now = Date.now();
        const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
        let cleanupCount = 0;

        if (cloudMetadata.items) {
          for (const [itemId, metadata] of Object.entries(
            cloudMetadata.items
          )) {
            if (
              metadata.deleted &&
              metadata.deletedAt &&
              now - metadata.deletedAt > tombstoneRetentionPeriod
            ) {
              delete cloudMetadata.items[itemId];
              cleanupCount++;

              if (cloudMetadata.deleted) {
                const deletedIndex = cloudMetadata.deleted.indexOf(itemId);
                if (deletedIndex > -1) {
                  cloudMetadata.deleted.splice(deletedIndex, 1);
                }
              }
            }
          }

          if (cleanupCount > 0) {
            await this.s3.upload("metadata.json", cloudMetadata, true);
            this.logger.log(
              "info",
              `🧹 Cleaned up ${cleanupCount} old cloud tombstones`
            );
          }
        }

        return cleanupCount;
      } catch (error) {
        this.logger.log(
          "error",
          "Error cleaning up cloud tombstones",
          error.message
        );
        return 0;
      }
    }
    startAutoSync() {
      const interval = Math.max(this.config.get("syncInterval") * 1000, 15000);
      return setInterval(async () => {
        if (this.config.isConfigured() && !this.syncInProgress) {
          try {
            await this.performFullSync();
          } catch (error) {
            this.logger.log("error", "Auto-sync failed", error.message);
          }
        }
      }, interval);
    }
    startDeletionMonitoring() {
      const MIN_ITEM_AGE_MS = 60 * 1000;
      const REQUIRED_MISSING_DETECTIONS = 2;

      this.dataService.getAllItems().then((items) => {
        const now = Date.now();
        items.forEach((item) => {
          if (item.id) {
            this.knownItems.set(item.id, {
              detectedAt: now,
              confirmedCount: 3,
              type: item.type,
            });
          }
        });
        this.logger.log(
          "info",
          `🗂️ Initialized deletion monitor with ${this.knownItems.size} items`
        );
      });

      setInterval(async () => {
        if (document.hidden) return;
        try {
          const now = Date.now();
          const currentItems = await this.dataService.getAllItems();
          const currentItemIds = new Set(currentItems.map((item) => item.id));

          for (const item of currentItems) {
            if (this.knownItems.has(item.id)) {
              const itemInfo = this.knownItems.get(item.id);
              itemInfo.confirmedCount = Math.min(
                itemInfo.confirmedCount + 1,
                5
              );
              if (this.potentialDeletions.has(item.id)) {
                this.potentialDeletions.delete(item.id);
              }
            } else {
              this.knownItems.set(item.id, {
                detectedAt: now,
                confirmedCount: 1,
                type: item.type,
              });
            }
          }

          for (const [itemId, itemInfo] of this.knownItems.entries()) {
            if (!currentItemIds.has(itemId)) {
              const isEstablishedItem =
                itemInfo.confirmedCount >= 2 &&
                now - itemInfo.detectedAt > MIN_ITEM_AGE_MS;

              if (isEstablishedItem) {
                const missingCount =
                  (this.potentialDeletions.get(itemId) || 0) + 1;
                this.potentialDeletions.set(itemId, missingCount);

                if (missingCount >= REQUIRED_MISSING_DETECTIONS) {
                  if (this.metadata.items[itemId]?.deleted === true) {
                    this.knownItems.delete(itemId);
                    this.potentialDeletions.delete(itemId);
                    continue;
                  }

                  this.logger.log(
                    "info",
                    `🗑️ Confirmed deletion of ${itemId} (${itemInfo.type}) - creating tombstone`
                  );

                  this.metadata.items[itemId] = {
                    deleted: true,
                    deletedAt: Date.now(),
                    modified: Date.now(),
                    synced: 0,
                    type: itemInfo.type,
                    hash: "deleted",
                  };

                  if (!this.metadata.deleted) {
                    this.metadata.deleted = [];
                  }
                  if (!this.metadata.deleted.includes(itemId)) {
                    this.metadata.deleted.push(itemId);
                  }

                  this.saveMetadata();
                  this.knownItems.delete(itemId);
                  this.potentialDeletions.delete(itemId);
                } else {
                  this.logger.log(
                    "info",
                    `🕐 Item ${itemId} appears deleted (${missingCount}/${REQUIRED_MISSING_DETECTIONS} checks)`
                  );
                }
              } else {
                if (this.potentialDeletions.has(itemId)) {
                  const missingCount = this.potentialDeletions.get(itemId) + 1;
                  if (missingCount > 5) {
                    this.knownItems.delete(itemId);
                    this.potentialDeletions.delete(itemId);
                  } else {
                    this.potentialDeletions.set(itemId, missingCount);
                  }
                } else {
                  this.potentialDeletions.set(itemId, 1);
                }
              }
            }
          }
        } catch (error) {
          this.logger.log("error", "Error in deletion monitor", error.message);
        }
      }, 10000);
    }
    cleanupOldTombstones() {
      const now = Date.now();
      const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
      let cleanupCount = 0;

      for (const [itemId, metadata] of Object.entries(this.metadata.items)) {
        if (
          metadata.deleted &&
          metadata.deletedAt &&
          now - metadata.deletedAt > tombstoneRetentionPeriod
        ) {
          delete this.metadata.items[itemId];
          cleanupCount++;

          if (this.metadata.deleted) {
            const deletedIndex = this.metadata.deleted.indexOf(itemId);
            if (deletedIndex > -1) {
              this.metadata.deleted.splice(deletedIndex, 1);
            }
          }
        }
      }

      if (cleanupCount > 0) {
        this.saveMetadata();
        this.logger.log("info", `🧹 Cleaned up ${cleanupCount} old tombstones`);
      }

      return cleanupCount;
    }
  }

  class BackupService {
    constructor(dataService, s3Service, logger) {
      this.dataService = dataService;
      this.s3 = s3Service;
      this.logger = logger;
    }
    async createSnapshot(name) {
      this.logger.log("start", `Creating snapshot: ${name}`);
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "");
      const filename = `SS_${timestamp}_${name.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}.zip`;
      const allItems = await this.dataService.getAllItems();
      const idbData = allItems
        .filter((item) => item.type === "idb")
        .map((item) => item.data);
      const lsData = allItems
        .filter((item) => item.type === "ls")
        .reduce((acc, item) => {
          acc[item.data.key] = item.data.value;
          return acc;
        }, {});
      const snapshot = { idbData, lsData, created: Date.now(), name };
      await this.s3.upload(`snapshots/${filename}`, snapshot);
      this.logger.log("success", `Snapshot created: ${filename}`);
      return true;
    }
    async loadBackupList() {
      try {
        const objects = await this.s3.list("snapshots/");
        return objects.map((obj) => ({
          key: obj.Key,
          name: obj.Key.replace("snapshots/", "").replace(".zip", ""),
          size: obj.Size,
          modified: obj.LastModified,
        }));
      } catch (error) {
        this.logger.log("error", "Failed to load backup list", error.message);
        return [];
      }
    }
    async restoreFromBackup(key) {
      this.logger.log("start", `Restoring from backup: ${key}`);
      const backup = await this.s3.download(key);
      const promises = [];
      if (backup.idbData) {
        promises.push(
          ...backup.idbData.map((item) =>
            this.dataService.saveItem(item, "idb")
          )
        );
      }
      if (backup.lsData) {
        const lsPromises = Object.entries(backup.lsData).map(([k, v]) =>
          this.dataService.saveItem({ key: k, value: v }, "ls")
        );
        promises.push(...lsPromises);
      }
      await Promise.all(promises);
      this.logger.log("success", "Backup restored successfully");
      return true;
    }
    async performDailyBackup() {
      const lastBackupDate = localStorage.getItem("tcs_last-daily-backup-date");
      const today = new Date().toLocaleDateString("en-GB");
      if (lastBackupDate === today) {
        this.logger.log("info", "Daily backup already completed today");
        return;
      }
      this.logger.log("start", "Performing daily backup");
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "");
      const filename = `Daily_${timestamp}.zip`;
      const allItems = await this.dataService.getAllItems();
      const idbData = allItems
        .filter((item) => item.type === "idb")
        .map((item) => item.data);
      const lsData = allItems
        .filter((item) => item.type === "ls")
        .reduce((acc, item) => {
          acc[item.data.key] = item.data.value;
          return acc;
        }, {});
      const backup = {
        idbData,
        lsData,
        created: Date.now(),
        name: "daily-auto",
      };
      await this.s3.upload(`snapshots/${filename}`, backup);
      localStorage.setItem("tcs_last-daily-backup-date", today);
      this.logger.log("success", `Daily backup completed: ${filename}`);
      await this.cleanupOldBackups();
    }
    async cleanupOldBackups() {
      try {
        const objects = await this.s3.list("snapshots/");
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        let deletedCount = 0;
        for (const obj of objects) {
          if (new Date(obj.LastModified).getTime() < thirtyDaysAgo) {
            try {
              await this.s3.delete(obj.Key);
              deletedCount++;
            } catch (error) {
              this.logger.log("warning", `Failed to delete backup: ${obj.Key}`);
            }
          }
        }
        if (deletedCount > 0) {
          this.logger.log("success", `Cleaned up ${deletedCount} old backups`);
        }
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to cleanup old backups",
          error.message
        );
      }
    }
  }

  class CloudSyncApp {
    constructor() {
      this.logger = new Logger();
      this.config = new ConfigManager();
      this.dataService = new DataService(this.config);
      this.cryptoService = new CryptoService(this.config);
      this.s3Service = new S3Service(
        this.config,
        this.cryptoService,
        this.logger
      );
      this.syncOrchestrator = new SyncOrchestrator(
        this.config,
        this.dataService,
        this.s3Service,
        this.logger
      );
      this.backupService = new BackupService(
        this.dataService,
        this.s3Service,
        this.logger
      );
      this.autoSyncInterval = null;
    }
    async initialize() {
      this.logger.log(
        "start",
        "Initializing Cloud Sync v4 (Optimized Single File)"
      );
      await this.waitForDOM();
      this.insertSyncButton();
      if (this.config.isConfigured()) {
        try {
          await this.s3Service.initialize();
          await this.syncOrchestrator.performFullSync();
          this.startAutoSync();
          this.updateSyncStatus("success");
          this.logger.log("success", "Cloud Sync initialized successfully");
        } catch (error) {
          this.logger.log("error", "Initialization failed", error.message);
          this.updateSyncStatus("error");
        }
      }
    }
    async waitForDOM() {
      if (document.readyState === "loading") {
        return new Promise((resolve) =>
          document.addEventListener("DOMContentLoaded", resolve)
        );
      }
    }
    insertSyncButton() {
      if (document.querySelector('[data-element-id="workspace-tab-cloudsync"]'))
        return;
      const style = document.createElement("style");
      style.textContent = `#sync-status-dot { position: absolute; top: 2px; right: 2px; width: 8px; height: 8px; border-radius: 50%; background-color: #6b7280; display: none; z-index: 10; }`;
      document.head.appendChild(style);
      const button = document.createElement("button");
      button.setAttribute("data-element-id", "workspace-tab-cloudsync");
      button.className =
        "min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative";
      button.innerHTML = `<span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors"><div class="relative"><svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.5A4.5 4.5 0 0114.5 9M9 13.5A4.5 4.5 0 013.5 9"/><polyline points="9,2.5 9,4.5 11,4.5"/><polyline points="9,15.5 9,13.5 7,13.5"/></g></svg><div id="sync-status-dot"></div></div><span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">Sync</span></span>`;
      button.addEventListener("click", () => this.openSyncModal());
      const chatButton = document.querySelector(
        'button[data-element-id="workspace-tab-chat"]'
      );
      if (chatButton?.parentNode) {
        chatButton.parentNode.insertBefore(button, chatButton.nextSibling);
      }
      this.logger.log("success", "Sync button inserted");
    }
    updateSyncStatus(status = "success") {
      const dot = document.getElementById("sync-status-dot");
      if (!dot) return;
      const colors = {
        success: "#22c55e",
        error: "#ef4444",
        warning: "#eab308",
        syncing: "#3b82f6",
      };
      dot.style.backgroundColor = colors[status] || "#6b7280";
      dot.style.display = "block";
    }
    openSyncModal() {
      if (document.querySelector(".cloud-sync-modal")) return;
      this.logger.log("start", "Opening sync modal");
      this.createModal();
    }
    createModal() {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;`;
      const modal = document.createElement("div");
      modal.className = "cloud-sync-modal";
      modal.innerHTML = this.getModalHTML();
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this.setupModalEventListeners(modal, overlay);
    }
    getModalHTML() {
      return `<div class="text-white text-left text-sm">
        <div class="flex justify-center items-center mb-3">
          <h3 class="text-center text-xl font-bold text-white">S3 Backup & Sync Settings</h3>
          <button class="ml-2 text-blue-400 text-lg hint--bottom-left hint--rounded hint--large" 
            aria-label="Fill form & Save. If you are using Amazon S3 - fill in S3 Bucket Name, AWS Region, AWS Access Key, AWS Secret Key and Encryption key.&#10;&#10;Initial backup: You will need to click on Export to create your first backup in S3. Thereafter, automatic backups are done to S3 as per Backup Interval if the browser tab is active.&#10;&#10;Restore backup: If S3 already has an existing backup, this extension will automatically pick it and restore the local data.&#10;&#10;&#10;&#10;Snapshot: Creates an instant no-touch backup that will not be overwritten.&#10;&#10;Download: You can select the backup data to be download and click on Download button to download it for local storage.&#10;&#10;Restore: Select the backup you want to restore and Click on Restore. The typingmind data will be restored to the selected backup data/date.">ⓘ</button>
        </div>
        <div class="space-y-3">
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-zinc-300">Available Backups</label>
            </div>
            <div class="space-y-2">
              <div class="w-full">
                <select id="backup-files" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white">
                  <option value="">Please configure AWS credentials first</option>
                </select>
              </div>
              <div class="flex justify-end space-x-2">
                <button id="download-backup-btn" class="z-1 px-2 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>
                  Download
                </button>
                <button id="restore-backup-btn" class="z-1 px-2 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>
                  Restore
                </button>
                <button id="delete-backup-btn" class="z-1 px-2 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>
                  Delete
                </button>
              </div>
            </div>
          </div>
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="space-y-2">
              <div class="flex space-x-4">
                <div class="w-2/3">
                  <label for="aws-bucket" class="block text-sm font-medium text-zinc-300">Bucket Name <span class="text-red-400">*</span></label>
                  <input id="aws-bucket" name="aws-bucket" type="text" value="${
                    this.config.get("bucketName") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
                <div class="w-1/3">
                  <label for="aws-region" class="block text-sm font-medium text-zinc-300">Region <span class="text-red-400">*</span></label>
                  <input id="aws-region" name="aws-region" type="text" value="${
                    this.config.get("region") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
              </div>
              <div>
                <label for="aws-access-key" class="block text-sm font-medium text-zinc-300">Access Key <span class="text-red-400">*</span></label>
                <input id="aws-access-key" name="aws-access-key" type="password" value="${
                  this.config.get("accessKey") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
              </div>
              <div>
                <label for="aws-secret-key" class="block text-sm font-medium text-zinc-300">Secret Key <span class="text-red-400">*</span></label>
                <input id="aws-secret-key" name="aws-secret-key" type="password" value="${
                  this.config.get("secretKey") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
              </div>
              <div>
                <label for="aws-endpoint" class="block text-sm font-medium text-zinc-300">
                  S3 Compatible Storage Endpoint
                  <button class="ml-1 text-blue-400 text-lg hint--top hint--rounded hint--medium" aria-label="For Amazon AWS, leave this blank. For S3 compatible cloud services like Cloudflare, iDrive and the likes, populate this.">ⓘ</button>
                </label>
                <input id="aws-endpoint" name="aws-endpoint" type="text" value="${
                  this.config.get("endpoint") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off">
              </div>
              <div class="flex space-x-4">
                <div class="w-1/2">
                  <label for="sync-interval" class="block text-sm font-medium text-zinc-300">Sync Interval
                  <button class="ml-1 text-blue-400 text-lg hint--top-right hint--rounded hint--medium" aria-label="How often do you want to sync your data to cloud? Minimum 15 seconds">ⓘ</button></label>
                  <input id="sync-interval" name="sync-interval" type="number" min="15" value="${this.config.get(
                    "syncInterval"
                  )}" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
                <div class="w-1/2">
                  <label for="encryption-key" class="block text-sm font-medium text-zinc-300">
                    Encryption Key <span class="text-red-400">*</span>
                    <button class="ml-1 text-blue-400 text-lg hint--top-left hint--rounded hint--medium" aria-label="Choose a secure 8+ character string. This is to encrypt the backup file before uploading to cloud. Securely store this somewhere as you will need this to restore backup from cloud.">ⓘ</button>
                  </label>
                  <input id="encryption-key" name="encryption-key" type="password" value="${
                    this.config.get("encryptionKey") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
              </div>
              <div>
                <label for="sync-exclusions" class="block text-sm font-medium text-zinc-300">
                  Exclusions (Comma separated)
                  <button class="ml-1 text-blue-400 text-lg hint--top hint--rounded hint--medium" aria-label="Additional settings to exclude from sync. Enter comma-separated setting names that you want to prevent from syncing between devices.">ⓘ</button>
                </label>
                <input id="sync-exclusions" name="sync-exclusions" type="text" value="${
                  localStorage.getItem("tcs_sync-exclusions") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" placeholder="e.g., my-setting, another-setting" autocomplete="off">
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end mb-4 space-x-2">
            <span class="text-sm text-zinc-400">
              Console Logging
              <button class="ml-1 text-blue-400 text-lg hint--top-left hint--rounded hint--medium" aria-label="Use this to enable detailed logging in Browser console for troubleshooting purpose. Clicking on this button will instantly start logging. However, earlier events will not be logged. You could add ?log=true to the page URL and reload the page to start logging from the beginning of the page load.">ⓘ</button>
            </span>
            <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
          </div>
          <div class="flex justify-between space-x-2 mt-4">
            <button id="save-settings" class="z-1 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">
              Save
            </button>
            <div class="flex space-x-2">
              <button id="sync-now" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">
                Sync Now
              </button>
              <button id="create-snapshot" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">
                Snapshot
              </button>
              <button id="close-modal" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                Close
              </button>
            </div>
          </div>
          <div class="text-center mt-4">
            <span id="last-sync-msg" class="text-zinc-400"></span>
          </div>
          <div id="action-msg" class="text-center text-zinc-400"></div>
        </div>
      </div>`;
    }
    setupModalEventListeners(modal, overlay) {
      overlay.addEventListener("click", () => this.closeModal(overlay));
      modal.addEventListener("click", (e) => e.stopPropagation());
      modal
        .querySelector("#close-modal")
        .addEventListener("click", () => this.closeModal(overlay));
      modal
        .querySelector("#save-settings")
        .addEventListener("click", () => this.saveSettings(overlay));
      modal
        .querySelector("#create-snapshot")
        .addEventListener("click", () => this.createSnapshot());
      modal
        .querySelector("#sync-now")
        .addEventListener("click", () => this.handleSyncNow(modal));
      modal
        .querySelector("#console-logging-toggle")
        .addEventListener("change", (e) =>
          this.logger.setEnabled(e.target.checked)
        );
      const consoleLoggingCheckbox = modal.querySelector(
        "#console-logging-toggle"
      );
      consoleLoggingCheckbox.checked = this.logger.enabled;
      this.loadBackupList(modal);
      this.setupBackupListHandlers(modal);
    }
    handleSyncNow(modal) {
      const syncNowButton = modal.querySelector("#sync-now");
      const originalText = syncNowButton.textContent;
      syncNowButton.disabled = true;
      syncNowButton.textContent = "Working...";
      this.syncOrchestrator
        .performFullSync()
        .then(() => {
          syncNowButton.textContent = "Done!";
          setTimeout(() => {
            syncNowButton.textContent = originalText;
            syncNowButton.disabled = false;
          }, 2000);
        })
        .catch(() => {
          syncNowButton.textContent = "Failed";
          setTimeout(() => {
            syncNowButton.textContent = originalText;
            syncNowButton.disabled = false;
          }, 2000);
        });
    }
    async loadBackupList(modal) {
      try {
        const backupList = modal.querySelector("#backup-files");
        if (!backupList) return;
        backupList.innerHTML = '<option value="">Loading backups...</option>';
        backupList.disabled = true;
        if (!this.config.isConfigured()) {
          backupList.innerHTML =
            '<option value="">Please configure AWS credentials first</option>';
          backupList.disabled = false;
          return;
        }
        const backups = await this.s3Service.list();
        backupList.innerHTML = "";
        backupList.disabled = false;
        const filteredBackups = backups.filter(
          (backup) =>
            backup.Key !== "metadata.json" &&
            !backup.Key.startsWith("items/") &&
            !backup.Key.startsWith("chats/") &&
            !backup.Key.startsWith("settings/") &&
            backup.Key !== "chats/"
        );
        if (filteredBackups.length === 0) {
          const option = document.createElement("option");
          option.value = "";
          option.text = "No backups found";
          backupList.appendChild(option);
        } else {
          const sortedBackups = filteredBackups.sort((a, b) => {
            return new Date(b.LastModified) - new Date(a.LastModified);
          });
          sortedBackups.forEach((backup) => {
            const option = document.createElement("option");
            option.value = backup.Key;
            const size = this.formatFileSize(backup.Size || 0);
            const date = new Date(backup.LastModified).toLocaleString();
            option.text = `${backup.Key} - ${size} (${date})`;
            backupList.appendChild(option);
          });
        }
        this.updateBackupButtonStates(modal);
        backupList.addEventListener("change", () =>
          this.updateBackupButtonStates(modal)
        );
      } catch (error) {
        console.error("Failed to load backup list:", error);
        if (backupList) {
          backupList.innerHTML =
            '<option value="">Error loading backups</option>';
          backupList.disabled = false;
        }
      }
    }
    updateBackupButtonStates(modal) {
      const backupList = modal.querySelector("#backup-files");
      const selectedValue = backupList.value || "";
      const downloadButton = modal.querySelector("#download-backup-btn");
      const restoreButton = modal.querySelector("#restore-backup-btn");
      const deleteButton = modal.querySelector("#delete-backup-btn");
      const isZipFile = selectedValue.endsWith(".zip");
      const isMetadataFile = selectedValue === "metadata.json";
      if (downloadButton) {
        downloadButton.disabled = !selectedValue;
      }
      if (restoreButton) {
        restoreButton.disabled = !selectedValue || !isZipFile;
      }
      if (deleteButton) {
        const isProtectedFile =
          !selectedValue ||
          isMetadataFile ||
          selectedValue.startsWith("items/");
        deleteButton.disabled = isProtectedFile;
      }
    }
    setupBackupListHandlers(modal) {
      const downloadButton = modal.querySelector("#download-backup-btn");
      const restoreButton = modal.querySelector("#restore-backup-btn");
      const deleteButton = modal.querySelector("#delete-backup-btn");
      const backupList = modal.querySelector("#backup-files");
      if (downloadButton) {
        downloadButton.addEventListener("click", async () => {
          const key = backupList.value;
          if (!key) {
            alert("Please select a backup to download");
            return;
          }
          try {
            downloadButton.disabled = true;
            downloadButton.textContent = "Downloading...";
            const backup = await this.s3Service.downloadRaw(key);
            if (backup) {
              await this.handleBackupDownload(backup, key);
              downloadButton.textContent = "Downloaded!";
            }
          } catch (error) {
            console.error("Failed to download backup:", error);
            alert("Failed to download backup: " + error.message);
            downloadButton.textContent = "Failed";
          } finally {
            setTimeout(() => {
              downloadButton.textContent = "Download";
              downloadButton.disabled = false;
              this.updateBackupButtonStates(modal);
            }, 2000);
          }
        });
      }
      if (restoreButton) {
        restoreButton.addEventListener("click", async () => {
          const key = backupList.value;
          if (!key) {
            alert("Please select a backup to restore");
            return;
          }
          if (
            confirm(
              "Are you sure you want to restore this backup? This will overwrite your current data."
            )
          ) {
            try {
              restoreButton.disabled = true;
              restoreButton.textContent = "Restoring...";
              const success = await this.backupService.restoreFromBackup(key);
              if (success) {
                alert("Backup restored successfully! Page will reload.");
                location.reload();
              }
            } catch (error) {
              console.error("Failed to restore backup:", error);
              alert("Failed to restore backup: " + error.message);
              restoreButton.textContent = "Failed";
              setTimeout(() => {
                restoreButton.textContent = "Restore";
                restoreButton.disabled = false;
                this.updateBackupButtonStates(modal);
              }, 2000);
            }
          }
        });
      }
      if (deleteButton) {
        deleteButton.addEventListener("click", async () => {
          const key = backupList.value;
          if (!key) {
            alert("Please select a backup to delete");
            return;
          }
          if (
            confirm(
              "Are you sure you want to delete this backup? This cannot be undone."
            )
          ) {
            try {
              deleteButton.disabled = true;
              deleteButton.textContent = "Deleting...";
              await this.s3Service.delete(key);
              await this.loadBackupList(modal);
              deleteButton.textContent = "Deleted!";
              setTimeout(() => {
                deleteButton.textContent = "Delete";
                this.updateBackupButtonStates(modal);
              }, 2000);
            } catch (error) {
              console.error("Failed to delete backup:", error);
              alert("Failed to delete backup: " + error.message);
              deleteButton.textContent = "Failed";
              setTimeout(() => {
                deleteButton.textContent = "Delete";
                deleteButton.disabled = false;
                this.updateBackupButtonStates(modal);
              }, 2000);
            }
          }
        });
      }
    }
    async handleBackupDownload(backupData, key) {
      try {
        let content;
        if (key.endsWith(".zip")) {
          try {
            const decryptedContent = await this.cryptoService.decrypt(
              backupData
            );
            content = JSON.stringify(decryptedContent, null, 2);
          } catch (decryptError) {
            console.warn(
              "Failed to decrypt zip file, downloading as raw data:",
              decryptError
            );
            const blob = new Blob([backupData], { type: "application/zip" });
            this.downloadFile(key, blob);
            return;
          }
        } else if (
          key.startsWith("SS_") ||
          key.startsWith("Daily_") ||
          key.includes("snapshot")
        ) {
          try {
            const decryptedContent = await this.cryptoService.decrypt(
              backupData
            );
            content = JSON.stringify(decryptedContent, null, 2);
          } catch (decryptError) {
            console.warn(
              "Failed to decrypt backup file, downloading as raw data:",
              decryptError
            );
            const blob = new Blob([backupData], {
              type: "application/octet-stream",
            });
            this.downloadFile(key, blob);
            return;
          }
        } else {
          if (typeof backupData === "string") {
            content = backupData;
          } else {
            try {
              const decryptedContent = await this.cryptoService.decrypt(
                backupData
              );
              content = JSON.stringify(decryptedContent, null, 2);
            } catch (decryptError) {
              console.warn(
                "Failed to decrypt file, downloading as raw data:",
                decryptError
              );
              const blob = new Blob([backupData], {
                type: "application/octet-stream",
              });
              this.downloadFile(key, blob);
              return;
            }
          }
        }
        this.downloadFile(key.replace(".zip", ".json"), content);
      } catch (error) {
        console.error("Failed to process backup:", error);
        const blob = new Blob([backupData], {
          type: "application/octet-stream",
        });
        this.downloadFile(key, blob);
      }
    }
    downloadFile(filename, content) {
      let blob;
      if (content instanceof Blob) {
        blob = content;
      } else if (typeof content === "string") {
        blob = new Blob([content], { type: "application/json" });
      } else {
        blob = new Blob([JSON.stringify(content, null, 2)], {
          type: "application/json",
        });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    formatFileSize(bytes) {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
    closeModal(overlay) {
      if (overlay) overlay.remove();
    }
    async saveSettings(overlay) {
      const newConfig = {
        bucketName: document.getElementById("aws-bucket").value.trim(),
        region: document.getElementById("aws-region").value.trim(),
        accessKey: document.getElementById("aws-access-key").value.trim(),
        secretKey: document.getElementById("aws-secret-key").value.trim(),
        endpoint: document.getElementById("aws-endpoint").value.trim(),
        syncInterval:
          parseInt(document.getElementById("sync-interval").value) || 15,
        encryptionKey: document.getElementById("encryption-key").value.trim(),
      };
      const exclusions = document.getElementById("sync-exclusions").value;
      localStorage.setItem("tcs_sync-exclusions", exclusions);
      if (
        !newConfig.bucketName ||
        !newConfig.region ||
        !newConfig.accessKey ||
        !newConfig.secretKey ||
        !newConfig.encryptionKey
      ) {
        alert("Please fill in all required AWS settings");
        return;
      }
      if (newConfig.syncInterval < 15) {
        alert("Sync interval must be at least 15 seconds");
        return;
      }
      Object.keys(newConfig).forEach((key) =>
        this.config.set(key, newConfig[key])
      );
      this.config.save();
      try {
        await this.s3Service.initialize();
        await this.syncOrchestrator.performFullSync();
        this.startAutoSync();
        this.updateSyncStatus("success");
        this.closeModal(overlay);
        this.logger.log("success", "Configuration saved and sync completed");
      } catch (error) {
        this.logger.log("error", "Failed to save configuration", error.message);
        alert("Failed to initialize sync. Please check your configuration.");
      }
    }
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = this.syncOrchestrator.startAutoSync();
      this.logger.log("info", "Auto-sync started");
    }
    async createSnapshot() {
      const name = prompt("Enter snapshot name:");
      if (name) {
        try {
          await this.backupService.createSnapshot(name);
          alert("Snapshot created successfully!");
        } catch (error) {
          this.logger.log("error", "Failed to create snapshot", error.message);
          alert("Failed to create snapshot: " + error.message);
        }
      }
    }
  }

  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      overflow-y: auto;
      animation: fadeIn 0.2s ease-out;
    }
    #sync-status-dot {
      position: absolute;
      top: -0.15rem;
      right: -0.6rem;
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 9999px;
    }
    .cloud-sync-modal {
      display: inline-block;
      width: 100%;
      background-color: rgb(39, 39, 42);
      color: white;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: left;
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.1), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      transform: translateY(0);
      transition: all 0.3s ease-in-out;
      max-width: 32rem;
      overflow: hidden;
      animation: slideIn 0.3s ease-out;
      position: relative;
      z-index: 100000;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    [class*="hint--"] {
      position: relative;
      display: inline-block;
    }
    [class*="hint--"]::before,
    [class*="hint--"]::after {
      position: absolute;
      transform: translate3d(0, 0, 0);
      visibility: hidden;
      opacity: 0;
      z-index: 100000;
      pointer-events: none;
      transition: 0.3s ease;
      transition-delay: 0ms;
    }
    [class*="hint--"]::before {
      content: '';
      position: absolute;
      background: transparent;
      border: 6px solid transparent;
      z-index: 100000;
    }
    [class*="hint--"]::after {
      content: attr(aria-label);
      background: #383838;
      color: white;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 16px;
      white-space: pre-wrap;
      box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.3);
      max-width: 400px !important;
      min-width: 200px !important;
      width: auto !important;
      border-radius: 4px;
    }
    .hint--top::after,
    .hint--top-right::after,
    .hint--top-left::after,
    .hint--bottom::after,
    .hint--bottom-right::after,
    .hint--bottom-left::after {
      max-width: 400px !important;
      min-width: 200px !important;
      width: auto !important;
    }
    [class*="hint--"]:hover::before,
    [class*="hint--"]:hover::after {
      visibility: visible;
      opacity: 1;
    }
    .hint--top::before {
      border-top-color: #383838;
      margin-bottom: -12px;
    }
    .hint--top::after {
      margin-bottom: -6px;
    }
    .hint--top::before,
    .hint--top::after {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
    }
    .hint--top-right::before {
      border-top-color: #383838;
      margin-bottom: -12px;
    }
    .hint--top-right::after {
      margin-bottom: -6px;
    }
    .hint--top-right::before,
    .hint--top-right::after {
      bottom: 100%;
      left: 0;
    }
    .hint--top-left::before {
      border-top-color: #383838;
      margin-bottom: -12px;
    }
    .hint--top-left::after {
      margin-bottom: -6px;
    }
    .hint--top-left::before,
    .hint--top-left::after {
      bottom: 100%;
      right: 0;
    }
    .hint--bottom::before {
      border-bottom-color: #383838;
      margin-top: -12px;
    }
    .hint--bottom::after {
      margin-top: -6px;
    }
    .hint--bottom::before,
    .hint--bottom::after {
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
    }
    .hint--bottom-right::before {
      border-bottom-color: #383838;
      margin-top: -12px;
    }
    .hint--bottom-right::after {
      margin-top: -6px;
    }
    .hint--bottom-right::before,
    .hint--bottom-right::after {
      top: 100%;
      left: 0;
    }
    .hint--bottom-left::before {
      border-bottom-color: #383838;
      margin-top: -12px;
    }
    .hint--bottom-left::after {
      margin-top: -6px;
    }
    .hint--bottom-left::before,
    .hint--bottom-left::after {
      top: 100%;
      right: 0;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideIn {
      from { 
        opacity: 0;
        transform: translateY(-20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }
    .modal-header {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: bold;
      text-align: center;
      color: white;
    }
    .modal-section {
      margin-top: 1rem;
      background-color: rgb(39, 39, 42);
      padding: 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid rgb(63, 63, 70);
    }
    .modal-section-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: rgb(161, 161, 170);
      margin-bottom: 0.25rem;
    }
    .form-group {
      margin-bottom: 0.75rem;
    }
    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: rgb(161, 161, 170);
      margin-bottom: 0.25rem;
    }
    .form-group input,
    .form-group select {
      width: 100%;
      padding: 0.375rem 0.5rem;
      border: 1px solid rgb(63, 63, 70);
      border-radius: 0.375rem;
      background-color: rgb(39, 39, 42);
      color: white;
      font-size: 0.875rem;
      line-height: 1.25rem;
      outline: none;
    }
    .form-group input:focus,
    .form-group select:focus {
      border-color: rgb(59, 130, 246);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    .button-group {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .button {
      display: inline-flex;
      align-items: center;
      padding: 0.375rem 0.75rem;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .button-primary {
      background-color: rgb(37, 99, 235);
      color: white;
    }
    .button-primary:hover {
      background-color: rgb(29, 78, 216);
    }
    .button-secondary {
      background-color: rgb(82, 82, 91);
      color: white;
    }
    .button-secondary:hover {
      background-color: rgb(63, 63, 70);
    }
    .button:disabled {
      background-color: rgb(82, 82, 91);
      cursor: not-allowed;
      opacity: 0.5;
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding: 0.75rem;
      background-color: rgb(39, 39, 42);
      border-radius: 0.5rem;
      border: 1px solid rgb(63, 63, 70);
    }
    .backup-list {
      max-height: 300px;
      overflow-y: auto;
      margin-top: 0.5rem;
      border: 1px solid rgb(63, 63, 70);
      border-radius: 0.375rem;
      background-color: rgb(24, 24, 27);
    }
    .backup-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      border-bottom: 1px solid rgb(63, 63, 70);
      transition: background-color 0.2s;
    }
    .backup-item:hover {
      background-color: rgb(39, 39, 42);
    }
    .backup-item:last-child {
      border-bottom: none;
    }
    .backup-info {
      flex: 1;
      min-width: 0;
    }
    .backup-name {
      font-weight: 500;
      color: rgb(244, 244, 245);
      margin-bottom: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .backup-type {
      display: inline-block;
      padding: 0.125rem 0.375rem;
      margin-right: 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      background-color: rgb(59, 130, 246);
      color: white;
    }
    .backup-item.snapshot .backup-type {
      background-color: rgb(16, 185, 129);
    }
    .backup-item.daily .backup-type {
      background-color: rgb(245, 158, 11);
    }
    .backup-item.time .backup-type {
      background-color: rgb(99, 102, 241);
    }
    .backup-date {
      font-size: 0.875rem;
      color: rgb(161, 161, 170);
    }
    .backup-actions {
      display: flex;
      gap: 0.5rem;
      margin-left: 1rem;
    }
    .backup-action {
      padding: 0.25rem 0.5rem;
      border: none;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      color: white;
      min-width: 4rem;
      text-align: center;
    }
    .restore-btn {
      background-color: rgb(16, 185, 129);
    }
    .restore-btn:hover:not(:disabled) {
      background-color: rgb(5, 150, 105);
    }
    .download-btn {
      background-color: rgb(59, 130, 246);
    }
    .download-btn:hover:not(:disabled) {
      background-color: rgb(37, 99, 235);
    }
    .delete-btn {
      background-color: rgb(239, 68, 68);
    }
    .delete-btn:hover:not(:disabled) {
      background-color: rgb(220, 38, 38);
    }
    .backup-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background-color: rgb(82, 82, 91);
    }
  `;
  document.head.appendChild(styleSheet);

  const app = new CloudSyncApp();
  app.initialize();
  window.cloudSyncApp = app;
}

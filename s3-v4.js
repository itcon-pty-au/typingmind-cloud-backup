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
      };
      const stored = {};
      Object.keys(defaults).forEach((key) => {
        const storageKey = `tcs_${key
          .replace(/([A-Z])/g, "-$1")
          .toLowerCase()}`;
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
      Object.keys(this.config).forEach((key) => {
        const storageKey = `tcs_${key
          .replace(/([A-Z])/g, "-$1")
          .toLowerCase()}`;
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
      return this.exclusions.includes(key) || key.startsWith("tcs_");
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
        `${this.icons[type] || "ℹ️"} [Cloud Sync v4] [${timestamp}] ${message}`,
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
      await new Promise((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const key = cursor.key;
            const value = cursor.value;
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
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => resolve();
      });
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !this.config.shouldExclude(key)) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            items.set(key, { id: key, data: { key, value }, type: "ls" });
          }
        }
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
      this.setupActivityMonitoring();
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
      const changedItems = [];
      for (const item of allItems) {
        const existingItem = this.metadata.items[item.id];
        const hash = await this.dataService.generateHash(item.data);
        if (!existingItem || existingItem.hash !== hash) {
          changedItems.push({
            id: item.id,
            type: item.type,
            hash,
            modified: now,
            synced: existingItem?.synced || 0,
          });
          this.metadata.items[item.id] = {
            hash,
            modified: now,
            synced: existingItem?.synced || 0,
            type: item.type,
          };
        }
      }
      if (changedItems.length > 0) this.saveMetadata();
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
        const itemsToSync = changedItems.filter(
          (item) => item.modified > item.synced
        );
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
        const uploadPromises = itemsToSync.map(async (item) => {
          const data = await this.dataService.getItem(item.id, item.type);
          if (data) {
            await this.s3.upload(`items/${item.id}.json`, data);
            this.metadata.items[item.id].synced = Date.now();
            cloudMetadata.items[item.id] = { ...this.metadata.items[item.id] };
          }
        });
        await Promise.allSettled(uploadPromises);
        cloudMetadata.lastSync = Date.now();
        cloudMetadata.lastModified = this.metadata.lastModified;
        await this.s3.upload("metadata.json", cloudMetadata, true);
        this.metadata.lastSync = cloudMetadata.lastSync;
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
            const data = await this.s3.download(`items/${key}.json`);
            if (data) {
              await this.dataService.saveItem(data, cloudItem.type);
              this.metadata.items[key] = { ...cloudItem };
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
          this.metadata.items[item.id].synced = Date.now();
          cloudMetadata.items[item.id] = { ...this.metadata.items[item.id] };
        }
      });
      await Promise.allSettled(uploadPromises);
      await this.s3.upload("metadata.json", cloudMetadata, true);
      this.metadata.lastSync = cloudMetadata.lastSync;
      this.saveMetadata();
      this.logger.log(
        "success",
        `Initial sync completed - ${changedItems.length} items uploaded`
      );
    }
    async performFullSync() {
      await this.syncFromCloud();
      await this.syncToCloud();
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
      const chats = allItems
        .filter((item) => item.type === "idb")
        .map((item) => item.data);
      const settings = allItems
        .filter((item) => item.type === "ls")
        .reduce((acc, item) => {
          acc[item.data.key] = item.data.value;
          return acc;
        }, {});
      const snapshot = { chats, settings, created: Date.now(), name };
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
      if (backup.chats) {
        promises.push(
          ...backup.chats.map((chat) => this.dataService.saveItem(chat, "idb"))
        );
      }
      if (backup.settings) {
        const settingsPromises = Object.entries(backup.settings).map(([k, v]) =>
          this.dataService.saveItem({ key: k, value: v }, "ls")
        );
        promises.push(...settingsPromises);
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
      const chats = allItems
        .filter((item) => item.type === "idb")
        .map((item) => item.data);
      const settings = allItems
        .filter((item) => item.type === "ls")
        .reduce((acc, item) => {
          acc[item.data.key] = item.data.value;
          return acc;
        }, {});
      const backup = {
        chats,
        settings,
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
      modal.style.cssText = `background: white; border-radius: 8px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;`;
      modal.innerHTML = this.getModalHTML();
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this.setupModalEventListeners(modal, overlay);
    }
    getModalHTML() {
      return `<h3 style="text-align: center; margin-bottom: 20px; font-size: 24px; font-weight: bold;">S3 Cloud Sync Settings</h3>
      <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Bucket Name *</label><input id="aws-bucket" type="text" value="${
        this.config.get("bucketName") || ""
      }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
      <div style="display: flex; gap: 16px; margin-bottom: 20px;"><div style="flex: 1;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Region *</label><input id="aws-region" type="text" value="${
        this.config.get("region") || ""
      }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div><div style="flex: 1;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Sync Interval (seconds)</label><input id="sync-interval" type="number" min="15" value="${this.config.get(
        "syncInterval"
      )}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div></div>
      <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Access Key *</label><input id="aws-access-key" type="password" value="${
        this.config.get("accessKey") || ""
      }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
      <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Secret Key *</label><input id="aws-secret-key" type="password" value="${
        this.config.get("secretKey") || ""
      }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
      <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Encryption Key *</label><input id="encryption-key" type="password" value="${
        this.config.get("encryptionKey") || ""
      }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
      <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">S3 Endpoint (optional)</label><input id="aws-endpoint" type="text" value="${
        this.config.get("endpoint") || ""
      }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div>
      <div style="display: flex; justify-content: space-between; gap: 12px;"><button id="save-settings" style="background: #3b82f6; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Save & Sync</button><div style="display: flex; gap: 8px;"><button id="create-snapshot" style="background: #10b981; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Create Snapshot</button><button id="restore-backup" style="background: #f59e0b; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Restore</button><button id="close-modal" style="background: #ef4444; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Close</button></div></div>
      <div style="margin-top: 20px; text-align: center;"><label style="display: inline-flex; align-items: center; gap: 8px;"><input type="checkbox" id="console-logging-toggle" ${
        this.logger.enabled ? "checked" : ""
      }> Enable Console Logging</label></div>`;
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
        .querySelector("#restore-backup")
        .addEventListener("click", () => this.restoreBackup());
      modal
        .querySelector("#console-logging-toggle")
        .addEventListener("change", (e) =>
          this.logger.setEnabled(e.target.checked)
        );
    }
    closeModal(overlay) {
      if (overlay) overlay.remove();
    }
    async saveSettings(overlay) {
      const config = {
        bucketName: document.getElementById("aws-bucket").value.trim(),
        region: document.getElementById("aws-region").value.trim(),
        accessKey: document.getElementById("aws-access-key").value.trim(),
        secretKey: document.getElementById("aws-secret-key").value.trim(),
        endpoint: document.getElementById("aws-endpoint").value.trim(),
        encryptionKey: document.getElementById("encryption-key").value.trim(),
        syncInterval:
          parseInt(document.getElementById("sync-interval").value) || 15,
      };
      if (
        !config.bucketName ||
        !config.region ||
        !config.accessKey ||
        !config.secretKey ||
        !config.encryptionKey
      ) {
        alert("Please fill in all required fields.");
        return;
      }
      Object.keys(config).forEach((key) => this.config.set(key, config[key]));
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
    async restoreBackup() {
      try {
        const backupList = await this.backupService.loadBackupList();
        if (backupList.length === 0) {
          alert("No backups found.");
          return;
        }
        const backupNames = backupList.map(
          (backup, index) =>
            `${index + 1}. ${backup.name} (${new Date(
              backup.modified
            ).toLocaleString()})`
        );
        const selection = prompt(
          `Select backup to restore:\n${backupNames.join(
            "\n"
          )}\n\nEnter number (1-${backupList.length}):`
        );
        const selectedIndex = parseInt(selection) - 1;
        if (selectedIndex >= 0 && selectedIndex < backupList.length) {
          if (confirm("This will overwrite your current data. Are you sure?")) {
            await this.backupService.restoreFromBackup(
              backupList[selectedIndex].key
            );
            alert("Backup restored successfully! Page will reload.");
            location.reload();
          }
        } else {
          alert("Invalid selection.");
        }
      } catch (error) {
        this.logger.log("error", "Failed to restore backup", error.message);
        alert("Failed to restore backup: " + error.message);
      }
    }
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = this.syncOrchestrator.startAutoSync();
      this.logger.log("info", "Auto-sync started");
    }
  }

  const app = new CloudSyncApp();
  app.initialize();
  window.cloudSyncApp = app;
}

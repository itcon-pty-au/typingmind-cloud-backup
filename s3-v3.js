/* 
TypingMind Cloud Sync v3 by ITCON, AU
-------------------------
Features:
- Sync typingmind database with S3 bucket
- Snapshots on demand
- Automatic daily backups
- Backup management in Extension config UI
- Detailed logging in console
*/
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
        let storageKey;
        if (key === "encryptionKey") {
          storageKey = "tcs_encryptionkey";
        } else {
          storageKey = `tcs_aws_${key.toLowerCase()}`;
        }
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
        "tcs_aws_bucketname",
        "tcs_aws_accesskey",
        "tcs_aws_secretkey",
        "tcs_aws_region",
        "tcs_aws_endpoint",
        "tcs_encryptionkey",
        "tcs_last-cloud-sync",
        "tcs_last-daily-backup",
        "tcs_backup-size",
        "tcs_sync-exclusions",
        "tcs_local-metadata",
        "tcs_localMigrated",
        "tcs_migrationBackup",
        "tcs_last-tombstone-cleanup",
        "referrer",
        "TM_useLastVerifiedToken",
        "TM_useStateUpdateHistory",
        "INSTANCE_ID",
        "eruda-console",
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
        let storageKey;
        if (key === "encryptionKey") {
          storageKey = "tcs_encryptionkey";
        } else {
          storageKey = `tcs_aws_${key.toLowerCase()}`;
        }
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
      return (
        this.exclusions.includes(key) ||
        key.startsWith("tcs_") ||
        key.includes("eruda")
      );
    }
    reloadExclusions() {
      this.exclusions = this.loadExclusions();
    }
  }

  class Logger {
    constructor() {
      const urlParams = new URLSearchParams(window.location.search);
      this.enabled = urlParams.get("log") === "true" || urlParams.has("log");
      this.icons = {
        info: "ℹ️",
        success: "✅",
        warning: "⚠️",
        error: "❌",
        start: "🔄",
        skip: "⏭️",
      };
      if (this.enabled) {
        this.loadEruda();
      }
    }
    loadEruda() {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
      if (!isMobile) return;
      if (document.getElementById("eruda-script")) return;
      const script = document.createElement("script");
      script.id = "eruda-script";
      script.src = "https://cdn.jsdelivr.net/npm/eruda";
      script.onload = () => {
        if (window.eruda) {
          window.eruda.init();
        }
      };
      document.head.appendChild(script);
    }
    destroyEruda() {
      if (window.eruda) {
        window.eruda.destroy();
      }
      const script = document.getElementById("eruda-script");
      if (script) {
        script.remove();
      }
    }
    log(type, message, data = null) {
      if (!this.enabled) return;
      const timestamp = new Date().toLocaleTimeString();
      const icon = this.icons[type] || "ℹ️";
      const logMessage = `${icon} [${timestamp}] ${message}`;

      switch (type) {
        case "error":
          console.error(logMessage, data || "");
          break;
        case "warning":
          console.warn(logMessage, data || "");
          break;
        default:
          console.log(logMessage, data || "");
      }
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      const url = new URL(window.location);
      if (enabled) {
        url.searchParams.set("log", "");
        this.loadEruda();
      } else {
        url.searchParams.delete("log");
        this.destroyEruda();
      }
      window.history.replaceState({}, "", url);
    }
  }

  class DataService {
    constructor(configManager, logger, operationQueue = null) {
      this.config = configManager;
      this.logger = logger;
      this.operationQueue = operationQueue;
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

      //this.logger.log("start", "📊 Getting all items for deletion check", {
      //  timestamp: new Date().toISOString(),
      //});

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
                data: value,
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
      const urlParams = new URLSearchParams(window.location.search);
      const debugEnabled =
        urlParams.get("log") === "true" || urlParams.has("log");
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

      const chatItems = Array.from(items.keys()).filter((id) =>
        id.startsWith("CHAT_")
      );
      const otherItems = Array.from(items.keys()).filter(
        (id) => !id.startsWith("CHAT_")
      );

      this.logger.log("success", "📋 Retrieved all items for deletion check", {
        totalItems: items.size,
        idbStats: {
          total: totalIDB,
          included: includedIDB,
          excluded: excludedIDB,
        },
        lsStats: { total: totalLS, included: includedLS, excluded: excludedLS },
        chatCount: chatItems.length,
        otherCount: otherItems.length,
        sampleChatItems: chatItems.slice(0, 5),
        sampleOtherItems: otherItems.slice(0, 5),
      });

      return Array.from(items.values());
    }

    async getAllItemKeys() {
      const itemKeys = new Set();

      // Use openKeyCursor() for performance - only fetches keys, not values
      const db = await this.getDB();
      const transaction = db.transaction(["keyval"], "readonly");
      const store = transaction.objectStore("keyval");

      await new Promise((resolve) => {
        const request = store.openKeyCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const key = cursor.key;
            if (typeof key === "string" && !this.config.shouldExclude(key)) {
              itemKeys.add(key);
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
          itemKeys.add(key);
        }
      }

      return itemKeys;
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
            resolve(result || null);
          };
          request.onerror = () => resolve(null);
        });
      } else if (type === "ls") {
        const value = localStorage.getItem(itemId);
        return value !== null ? { key: itemId, value } : null;
      }
      return null;
    }
    async saveItem(item, type, itemKey = null) {
      if (type === "idb") {
        const db = await this.getDB();
        const transaction = db.transaction(["keyval"], "readwrite");
        const store = transaction.objectStore("keyval");
        const itemId = itemKey || (item && item.id);
        const itemData = item;
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
      const success = await this.performDelete(itemId, type);
      if (success) {
        this.createTombstone(itemId, type, "manual-delete");
      }
      return success;
    }
    async performDelete(itemId, type) {
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
    createTombstone(itemId, type, source = "unknown") {
      const orchestrator = window.cloudSyncApp?.syncOrchestrator;
      if (!orchestrator) {
        this.logger.log(
          "error",
          "❌ Cannot create tombstone: SyncOrchestrator not found."
        );
        return null;
      }

      const timestamp = Date.now();
      const tombstone = {
        deleted: timestamp,
        deletedAt: timestamp,
        type: type,
        source: source,
        tombstoneVersion: 1,
      };

      this.logger.log("start", "🪦 Creating tombstone in metadata", {
        itemId: itemId,
        type: type,
        source: source,
      });

      const existingItem = orchestrator.metadata.items[itemId];
      if (existingItem && existingItem.deleted) {
        tombstone.tombstoneVersion = (existingItem.tombstoneVersion || 0) + 1;
        this.logger.log(
          "info",
          "📈 Incrementing existing tombstone version in metadata",
          {
            newVersion: tombstone.tombstoneVersion,
          }
        );
      }

      orchestrator.metadata.items[itemId] = {
        ...tombstone,
        synced: 0,
      };
      orchestrator.saveMetadata();

      this.logger.log("success", "✅ Tombstone created in metadata", {
        itemId: itemId,
        version: tombstone.tombstoneVersion,
      });

      if (this.operationQueue) {
        this.operationQueue.add(
          `tombstone-sync-${itemId}`,
          () => this.syncTombstone(itemId),
          "high"
        );
      }

      return tombstone;
    }
    getTombstoneFromStorage(itemId) {
      try {
        const storageKey = `tcs_tombstone_${itemId}`;
        // this.logger.log("info", "🔍 Checking for existing tombstone", {
        //   itemId: itemId,
        //   storageKey: storageKey,
        // });

        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const tombstone = JSON.parse(stored);
          // this.logger.log("success", "📥 Found existing tombstone", {
          //   itemId: itemId,
          //   tombstone: tombstone,
          // });
          return tombstone;
        } else {
          // this.logger.log("info", "❌ No existing tombstone found", {
          //   itemId: itemId,
          //   storageKey: storageKey,
          // });
          return null;
        }
      } catch (error) {
        this.logger.log("error", "❌ Error reading tombstone from storage", {
          itemId: itemId,
          error: error.message,
        });
        return null;
      }
    }
    saveTombstoneToStorage(itemId, tombstone) {
      try {
        const storageKey = `tcs_tombstone_${itemId}`;
        // this.logger.log("start", "💾 Saving tombstone to localStorage", {
        //   itemId: itemId,
        //   storageKey: storageKey,
        //   tombstone: tombstone,
        // });

        localStorage.setItem(storageKey, JSON.stringify(tombstone));

        // Verify it was saved
        const verification = localStorage.getItem(storageKey);
        if (verification) {
          this.logger.log(
            "success",
            "✅ Tombstone successfully saved and verified",
            {
              itemId: itemId,
              storageKey: storageKey,
            }
          );
        } else {
          this.logger.log("error", "❌ Tombstone save verification failed", {
            itemId: itemId,
            storageKey: storageKey,
          });
        }
      } catch (error) {
        this.logger.log("error", "❌ Failed to save tombstone to storage", {
          itemId: itemId,
          error: error.message,
        });
      }
    }
    getAllTombstones() {
      const tombstones = new Map();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("tcs_tombstone_")) {
          const itemId = key.replace("tcs_tombstone_", "");
          try {
            const tombstone = JSON.parse(localStorage.getItem(key));
            tombstones.set(itemId, tombstone);
          } catch {
            continue;
          }
        }
      }
      return tombstones;
    }
    async syncTombstone(itemId) {
      this.logger.log("info", `🔄 Triggering sync for tombstone ${itemId}`);

      if (window.cloudSyncApp && window.cloudSyncApp.syncOrchestrator) {
        try {
          await window.cloudSyncApp.syncOrchestrator.syncToCloud();
          this.logger.log(
            "success",
            `✅ Tombstone sync completed for ${itemId}`
          );
        } catch (error) {
          this.logger.log(
            "error",
            `❌ Tombstone sync failed for ${itemId}`,
            error.message
          );
          throw error;
        }
      } else {
        this.logger.log(
          "warning",
          `⚠️ Sync orchestrator not available for ${itemId}`
        );
      }
    }
    cleanup() {
      if (this.dbPromise) {
        this.dbPromise
          .then((db) => {
            if (db && db.close) {
              db.close();
            }
          })
          .catch(() => {});
      }
      this.dbPromise = null;
      this.config = null;
      this.logger = null;
      this.operationQueue = null;
    }
  }

  class CryptoService {
    constructor(configManager, logger) {
      this.config = configManager;
      this.logger = logger;
      this.keyCache = new Map();
      this.maxCacheSize = 10;
      this.lastCacheCleanup = Date.now();
    }

    async deriveKey(password) {
      const now = Date.now();
      if (now - this.lastCacheCleanup > 30 * 60 * 1000) {
        this.cleanupKeyCache();
        this.lastCacheCleanup = now;
      }

      if (this.keyCache.has(password)) return this.keyCache.get(password);

      if (this.keyCache.size >= this.maxCacheSize) {
        const firstKey = this.keyCache.keys().next().value;
        this.keyCache.delete(firstKey);
      }

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

    cleanupKeyCache() {
      if (this.keyCache.size > this.maxCacheSize / 2) {
        const keysToRemove = Math.floor(this.keyCache.size / 2);
        const keyIterator = this.keyCache.keys();

        for (let i = 0; i < keysToRemove; i++) {
          const oldestKey = keyIterator.next().value;
          if (oldestKey) {
            this.keyCache.delete(oldestKey);
          }
        }
      }
    }
    async encrypt(data) {
      const encryptionKey = this.config.get("encryptionKey");
      if (!encryptionKey) throw new Error("No encryption key configured");
      const key = await this.deriveKey(encryptionKey);
      let encodedData = new TextEncoder().encode(JSON.stringify(data));
      try {
        if (window.CompressionStream) {
          const compressedStream = new Blob([encodedData])
            .stream()
            .pipeThrough(new CompressionStream("deflate-raw"));
          encodedData = new Uint8Array(
            await new Response(compressedStream).arrayBuffer()
          );
        } else {
          this.logger.log(
            "warning",
            "CompressionStream API not supported, uploading uncompressed."
          );
        }
      } catch (e) {
        this.logger.log(
          "warning",
          "Could not compress data, uploading uncompressed.",
          e
        );
      }
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
    async encryptBytes(data) {
      const encryptionKey = this.config.get("encryptionKey");
      if (!encryptionKey) throw new Error("No encryption key configured");
      const key = await this.deriveKey(encryptionKey);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        data
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
      try {
        if (window.DecompressionStream) {
          const stream = new Blob([decrypted])
            .stream()
            .pipeThrough(new DecompressionStream("deflate-raw"));
          const text = await new Response(stream).text();
          return JSON.parse(text);
        } else {
          this.logger.log(
            "warning",
            "DecompressionStream API not supported, decoding as text."
          );
          return JSON.parse(new TextDecoder().decode(decrypted));
        }
      } catch (e) {
        return JSON.parse(new TextDecoder().decode(decrypted));
      }
    }
    async decryptBytes(encryptedData) {
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
      return new Uint8Array(decrypted);
    }
    cleanup() {
      this.keyCache.clear();
      this.lastCacheCleanup = 0;
      this.config = null;
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
      //this.logger.log("success", "S3 service initialized");
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
            `Retry ${attempt + 1}/${maxRetries} in ${delay}ms - Error: ${
              error.message || error.code || "Unknown error"
            }`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw lastError;
    }
    async upload(key, data, isMetadata = false) {
      return this.withRetry(async () => {
        try {
          const body = isMetadata
            ? JSON.stringify(data)
            : await this.crypto.encrypt(data);
          const params = {
            Bucket: this.config.get("bucketName"),
            Key: key,
            Body: body,
            ContentType: isMetadata
              ? "application/json"
              : "application/octet-stream",
          };
          if (isMetadata) {
            params.CacheControl =
              "no-cache, no-store, max-age=0, must-revalidate";
          }
          const result = await this.client.upload(params).promise();
          this.logger.log("success", `Uploaded ${key}`, { ETag: result.ETag });
          return result;
        } catch (error) {
          this.logger.log(
            "error",
            `Failed to upload ${key}: ${
              error.message || error.code || "Unknown error"
            }`
          );
          throw error;
        }
      });
    }

    async uploadRaw(key, data) {
      return this.withRetry(async () => {
        try {
          const result = await this.client
            .upload({
              Bucket: this.config.get("bucketName"),
              Key: key,
              Body: data,
              ContentType: key.endsWith(".zip")
                ? "application/zip"
                : "application/octet-stream",
            })
            .promise();
          this.logger.log("success", `Uploaded raw ${key}`, {
            ETag: result.ETag,
          });
          return result;
        } catch (error) {
          this.logger.log(
            "error",
            `Failed to upload raw ${key}: ${
              error.message || error.code || "Unknown error"
            }`
          );
          throw error;
        }
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

    async downloadWithResponse(key) {
      return this.withRetry(async () => {
        const result = await this.client
          .getObject({ Bucket: this.config.get("bucketName"), Key: key })
          .promise();
        return result;
      });
    }
  }

  class SyncOrchestrator {
    constructor(
      configManager,
      dataService,
      s3Service,
      logger,
      operationQueue = null
    ) {
      this.config = configManager;
      this.dataService = dataService;
      this.s3Service = s3Service;
      this.logger = logger;
      this.operationQueue = operationQueue;
      this.metadata = this.loadMetadata();
      this.syncInProgress = false;
      this.autoSyncInterval = null;
    }
    loadMetadata() {
      const stored = localStorage.getItem("tcs_local-metadata");
      const result = stored ? JSON.parse(stored) : { lastSync: 0, items: {} };
      return result;
    }
    saveMetadata() {
      localStorage.setItem("tcs_local-metadata", JSON.stringify(this.metadata));
    }
    getLastCloudSync() {
      const stored = localStorage.getItem("tcs_last-cloud-sync");
      return stored ? parseInt(stored) : 0;
    }
    setLastCloudSync(timestamp) {
      localStorage.setItem("tcs_last-cloud-sync", timestamp.toString());
    }
    getItemSize(data) {
      return JSON.stringify(data).length;
    }
    async detectChanges() {
      const changedItems = [];
      const now = Date.now();
      const idbKeys = new Set();
      const lsKeys = new Set();
      const db = await this.dataService.getDB();
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
              idbKeys.add(key);
              const existingItem = this.metadata.items[key];
              const currentSize = this.getItemSize(value);

              // Skip items marked as deleted in metadata
              if (existingItem && existingItem.deleted) {
                // Silently skip deleted items to avoid spam
              } else {
                if (!existingItem) {
                  changedItems.push({
                    id: key,
                    type: "idb",
                    size: currentSize,
                    lastModified: now,
                    reason: "new",
                  });
                } else if (currentSize !== existingItem.size) {
                  // Debug logging for size changes
                  if (key.startsWith("CHAT_")) {
                    this.logger.log(
                      "warning",
                      `Size change detected for ${key}`,
                      {
                        currentSize,
                        existingSize: existingItem.size,
                        lastSynced: existingItem.synced
                          ? new Date(existingItem.synced).toISOString()
                          : "never",
                      }
                    );
                  }
                  changedItems.push({
                    id: key,
                    type: "idb",
                    size: currentSize,
                    lastModified: now,
                    reason: "size",
                  });
                } else if (!existingItem.synced) {
                  // Debug logging for never-synced items
                  if (key.startsWith("CHAT_")) {
                    this.logger.log(
                      "warning",
                      `Never-synced item detected for ${key}`,
                      {
                        hasMetadata: !!existingItem,
                        synced: existingItem.synced,
                        size: currentSize,
                      }
                    );
                  }
                  changedItems.push({
                    id: key,
                    type: "idb",
                    size: currentSize,
                    lastModified: now,
                    reason: "never-synced",
                  });
                }
              }
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
          lsKeys.add(key);
          const value = localStorage.getItem(key);
          const existingItem = this.metadata.items[key];
          const currentSize = this.getItemSize(value);

          // Skip items marked as deleted in metadata
          if (existingItem && existingItem.deleted) {
            // Silently skip deleted items to avoid spam
          } else {
            if (!existingItem) {
              changedItems.push({
                id: key,
                type: "ls",
                size: currentSize,
                lastModified: now,
                reason: "new",
              });
            } else if (currentSize !== existingItem.size) {
              // Debug logging for size changes
              this.logger.log(
                "warning",
                `localStorage size change detected for ${key}`,
                {
                  currentSize,
                  existingSize: existingItem.size,
                  lastSynced: existingItem.synced
                    ? new Date(existingItem.synced).toISOString()
                    : "never",
                }
              );
              changedItems.push({
                id: key,
                type: "ls",
                size: currentSize,
                lastModified: now,
                reason: "size",
              });
            } else if (!existingItem.synced) {
              // Debug logging for never-synced items
              this.logger.log(
                "warning",
                `localStorage never-synced item detected for ${key}`,
                {
                  hasMetadata: !!existingItem,
                  synced: existingItem.synced,
                  size: currentSize,
                }
              );
              changedItems.push({
                id: key,
                type: "ls",
                size: currentSize,
                lastModified: now,
                reason: "never-synced",
              });
            }
          }
        }
      }
      const tombstones = this.dataService.getAllTombstones();
      for (const [itemId, tombstone] of tombstones.entries()) {
        const existingItem = this.metadata.items[itemId];
        const needsSync =
          !existingItem ||
          !existingItem.deleted ||
          existingItem.deleted < tombstone.deleted ||
          (existingItem.tombstoneVersion || 0) <
            (tombstone.tombstoneVersion || 1);
        if (needsSync) {
          changedItems.push({
            id: itemId,
            type: tombstone.type,
            deleted: tombstone.deleted,
            tombstoneVersion: tombstone.tombstoneVersion,
            reason: "tombstone",
          });
        }
      }
      for (const [itemId, metadata] of Object.entries(this.metadata.items)) {
        if (metadata.deleted && metadata.deleted > (metadata.synced || 0)) {
          changedItems.push({
            id: itemId,
            type: metadata.type,
            deleted: metadata.deleted,
            tombstoneVersion: metadata.tombstoneVersion || 1,
            reason: "tombstone",
          });
        }
      }
      // Check for key overlaps between IndexedDB and localStorage
      const overlappingKeys = Array.from(idbKeys).filter((key) =>
        lsKeys.has(key)
      );
      if (overlappingKeys.length > 0) {
        const chatOverlaps = overlappingKeys.filter((key) =>
          key.startsWith("CHAT_")
        );
        if (chatOverlaps.length > 0) {
          this.logger.log(
            "error",
            `🚨 DETECTED DUPLICATE KEYS IN BOTH STORAGE TYPES`,
            {
              totalOverlaps: overlappingKeys.length,
              chatOverlaps: chatOverlaps.slice(0, 10), // Show first 10
              totalChatOverlaps: chatOverlaps.length,
              totalIdbKeys: idbKeys.size,
              totalLsKeys: lsKeys.size,
            }
          );
        }
      }

      // Detect deleted items by comparing metadata with current keys
      for (const itemId in this.metadata.items) {
        if (!idbKeys.has(itemId) && !lsKeys.has(itemId)) {
          const metadataItem = this.metadata.items[itemId];
          // Only add a tombstone if it's not already marked as deleted
          if (!metadataItem.deleted) {
            this.logger.log("warning", `Item deleted locally: ${itemId}`);
            changedItems.push({
              id: itemId,
              type: metadataItem.type || "unknown",
              deleted: now,
              reason: "tombstone",
            });
          }
        }
      }

      return { changedItems, hasChanges: changedItems.length > 0 };
    }
    async syncToCloud() {
      if (this.syncInProgress) {
        this.logger.log("skip", "Sync to cloud already in progress");
        return;
      }
      this.syncInProgress = true;
      try {
        //this.logger.log("start", "Starting sync to cloud");
        const { changedItems } = await this.detectChanges();
        const cloudMetadata = await this.getCloudMetadata();
        if (changedItems.length === 0) {
          this.logger.log("info", "No items to sync to cloud");
          return;
        }

        // Log potential sync loops for debugging
        const now = Date.now();
        const recentlyChangedItems = changedItems.filter(
          (item) =>
            this.metadata.items[item.id] &&
            this.metadata.items[item.id].synced &&
            now - this.metadata.items[item.id].synced < 60000 // Last synced within 1 minute
        );

        if (recentlyChangedItems.length > 0) {
          this.logger.log(
            "warning",
            `Detected ${recentlyChangedItems.length} items synced recently, potential sync loop`,
            {
              items: recentlyChangedItems.map((item) => ({
                id: item.id,
                reason: item.reason,
                currentSize: item.size,
                lastSynced: this.metadata.items[item.id].synced
                  ? new Date(this.metadata.items[item.id].synced).toISOString()
                  : "never",
                metadataSize: this.metadata.items[item.id]?.size,
                metadataSynced: this.metadata.items[item.id]?.synced,
                metadataLastModified:
                  this.metadata.items[item.id]?.lastModified,
              })),
            }
          );
        }
        this.logger.log(
          "info",
          `Syncing ${changedItems.length} items to cloud`
        );

        let itemsSynced = 0;

        const uploadPromises = changedItems.map(async (item) => {
          const cloudItem = cloudMetadata.items[item.id];
          if (
            cloudItem &&
            !item.deleted &&
            (cloudItem.lastModified || 0) >
              (this.metadata.items[item.id]?.lastModified || 0) + 2000
          ) {
            this.logger.log(
              "skip",
              `Skipping upload for ${item.id}, cloud version is newer`
            );
            this.metadata.items[item.id] = { ...cloudItem };
            return;
          }

          try {
            if (item.deleted || item.reason === "tombstone") {
              const timestamp = Date.now();
              const tombstoneData = {
                deleted: item.deleted || timestamp,
                deletedAt: item.deleted || timestamp,
                type: item.type,
                tombstoneVersion: item.tombstoneVersion || 1,
                synced: timestamp,
              };
              this.metadata.items[item.id] = tombstoneData;
              cloudMetadata.items[item.id] = { ...tombstoneData };
              itemsSynced++;
              this.logger.log(
                "info",
                `🗑️ Synced tombstone for key "${item.id}" to cloud (v${tombstoneData.tombstoneVersion})`
              );
            } else {
              const data = await this.dataService.getItem(item.id, item.type);
              if (data) {
                await this.s3Service.upload(`items/${item.id}.json`, data);
                this.metadata.items[item.id] = {
                  synced: Date.now(),
                  type: item.type,
                  size: item.size,
                  lastModified: item.lastModified,
                };
                cloudMetadata.items[item.id] = {
                  ...this.metadata.items[item.id],
                };
                itemsSynced++;
                this.logger.log("info", `Synced key "${item.id}" to cloud`);
              }
            }
          } catch (error) {
            this.logger.log(
              "error",
              `Failed to sync key "${item.id}": ${
                error.message || error.code || "Unknown error"
              }`
            );
            if (
              this.operationQueue &&
              (item.deleted || item.reason === "tombstone")
            ) {
              this.operationQueue.add(
                `retry-tombstone-${item.id}`,
                () => this.retrySyncTombstone(item),
                "high"
              );
            }
            throw error;
          }
        });

        await Promise.allSettled(uploadPromises);

        if (itemsSynced > 0) {
          cloudMetadata.lastSync = Date.now();
          await this.s3Service.upload("metadata.json", cloudMetadata, true);
          this.metadata.lastSync = cloudMetadata.lastSync;
          this.setLastCloudSync(cloudMetadata.lastSync);
          this.saveMetadata();
          this.logger.log(
            "success",
            `Sync to cloud completed - ${itemsSynced} items synced`
          );
        } else {
          this.logger.log("info", "Sync to cloud did not upload any items.");
        }
      } catch (error) {
        this.logger.log("error", "Failed to sync to cloud", error.message);
        if (this.operationQueue) {
          this.operationQueue.add(
            "retry-sync-to-cloud",
            () => this.syncToCloud(),
            "normal"
          );
        }
        throw error;
      } finally {
        this.syncInProgress = false;
      }
    }
    async retrySyncTombstone(item) {
      this.logger.log(
        "info",
        `🔄 Retrying tombstone sync for key "${item.id}"`
      );
      const cloudMetadata = await this.getCloudMetadata();
      const timestamp = Date.now();
      const tombstoneData = {
        deleted: item.deleted || timestamp,
        deletedAt: item.deleted || timestamp,
        type: item.type,
        tombstoneVersion: item.tombstoneVersion || 1,
        synced: timestamp,
      };
      this.metadata.items[item.id] = tombstoneData;
      cloudMetadata.items[item.id] = { ...tombstoneData };
      await this.s3Service.upload("metadata.json", cloudMetadata, true);
      this.saveMetadata();
      this.logger.log(
        "success",
        `✅ Retry tombstone sync completed for key "${item.id}"`
      );
    }
    async syncFromCloud() {
      if (this.syncInProgress) {
        this.logger.log("skip", "Sync from cloud already in progress");
        return;
      }
      this.syncInProgress = true;
      try {
        const { metadata: cloudMetadata, etag: cloudMetadataETag } =
          await this.getCloudMetadataWithETag();

        this.logger.log("info", "Downloaded cloud metadata", {
          ETag: cloudMetadataETag,
          lastSync: cloudMetadata.lastSync
            ? new Date(cloudMetadata.lastSync).toISOString()
            : "never",
        });

        const debugEnabled =
          new URLSearchParams(window.location.search).get("log") === "true";
        if (debugEnabled && cloudMetadata.items) {
          const cloudItems = Object.keys(cloudMetadata.items);
          const cloudDeleted = cloudItems.filter(
            (id) => cloudMetadata.items[id].deleted
          ).length;
          const cloudActive = cloudItems.length - cloudDeleted;
          console.log(
            `📊 Cloud Metadata Stats: Total=${cloudItems.length}, Active=${cloudActive}, Deleted=${cloudDeleted}`
          );
        }

        const lastMetadataETag = localStorage.getItem("tcs_metadata_etag");
        const hasCloudChanges = cloudMetadataETag !== lastMetadataETag;
        const cloudLastSync = cloudMetadata.lastSync || 0;

        if (!hasCloudChanges) {
          this.logger.log(
            "info",
            "No cloud changes detected based on ETag - skipping item downloads"
          );
          this.metadata.lastSync = cloudLastSync;
          this.setLastCloudSync(cloudLastSync);
          this.saveMetadata();
          this.logger.log("success", "Sync from cloud completed (no changes)");
          return;
        }
        this.logger.log(
          "info",
          `Cloud changes detected - proceeding with full sync`
        );
        const itemsToDownload = Object.entries(cloudMetadata.items).filter(
          ([key, cloudItem]) => {
            if (this.config.shouldExclude(key)) {
              return false;
            }
            const localItem = this.metadata.items[key];
            const localTombstone =
              this.dataService.getTombstoneFromStorage(key);

            if (cloudItem.deleted) {
              const cloudVersion = cloudItem.tombstoneVersion || 1;
              const localMetadataVersion =
                localItem && localItem.deleted
                  ? localItem.tombstoneVersion || 1
                  : 0;
              const localStorageVersion = localTombstone?.tombstoneVersion || 0;
              const localVersion = Math.max(
                localMetadataVersion,
                localStorageVersion
              );
              return cloudVersion > localVersion;
            }

            if (localItem && localItem.deleted) {
              return (cloudItem.lastModified || 0) > localItem.deleted;
            }

            if (!localItem) {
              return true;
            }

            return (
              (cloudItem.lastModified || 0) >
              (localItem.lastModified || 0) + 2000
            );
          }
        );

        if (itemsToDownload.length > 0) {
          this.logger.log(
            "info",
            `Processing ${itemsToDownload.length} items from cloud`
          );
        }
        const downloadPromises = itemsToDownload.map(
          async ([key, cloudItem]) => {
            if (cloudItem.deleted) {
              this.logger.log(
                "info",
                `🗑️ Processing cloud tombstone for key "${key}" (v${
                  cloudItem.tombstoneVersion || 1
                })`
              );
              await this.dataService.performDelete(key, cloudItem.type);
              const tombstoneData = {
                deleted: cloudItem.deleted,
                deletedAt: cloudItem.deletedAt || cloudItem.deleted,
                type: cloudItem.type,
                tombstoneVersion: cloudItem.tombstoneVersion || 1,
              };
              this.dataService.saveTombstoneToStorage(key, tombstoneData);
              this.metadata.items[key] = { ...cloudItem };
              this.logger.log("info", `Synced key "${key}" from cloud`);
            } else {
              const data = await this.s3Service.download(`items/${key}.json`);
              if (data) {
                await this.dataService.saveItem(data, cloudItem.type, key);
                const syncTime = Date.now();
                this.metadata.items[key] = {
                  synced: syncTime,
                  type: cloudItem.type,
                  size: cloudItem.size || this.getItemSize(data),
                  lastModified: syncTime,
                };
                this.logger.log("info", `Synced key "${key}" from cloud`);
              }
            }
          }
        );
        await Promise.allSettled(downloadPromises);
        this.metadata.lastSync = cloudLastSync;
        this.setLastCloudSync(cloudLastSync);
        localStorage.setItem("tcs_metadata_etag", cloudMetadataETag);
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
      try {
        const { changedItems } = await this.detectChanges();
        const cloudMetadata = {
          lastSync: Date.now(),
          items: {},
        };
        const uploadPromises = changedItems.map(async (item) => {
          if (item.deleted || item.reason === "tombstone") {
            const tombstoneData = {
              deleted: item.deleted || Date.now(),
              deletedAt: item.deleted || Date.now(),
              type: item.type,
              tombstoneVersion: item.tombstoneVersion || 1,
              synced: Date.now(),
            };
            this.metadata.items[item.id] = tombstoneData;
            cloudMetadata.items[item.id] = { ...tombstoneData };
            this.logger.log(
              "info",
              `🗑️ Added tombstone for ${item.id} to initial sync`
            );
          } else {
            const data = await this.dataService.getItem(item.id, item.type);
            if (data) {
              await this.s3Service.upload(`items/${item.id}.json`, data);
              this.metadata.items[item.id] = {
                synced: Date.now(),
                type: item.type,
                size: item.size || this.getItemSize(data),
                lastModified: item.lastModified,
              };
              cloudMetadata.items[item.id] = {
                ...this.metadata.items[item.id],
              };
            }
          }
        });
        await Promise.allSettled(uploadPromises);
        await this.s3Service.upload("metadata.json", cloudMetadata, true);
        this.metadata.lastSync = cloudMetadata.lastSync;
        this.setLastCloudSync(cloudMetadata.lastSync);
        this.saveMetadata();
        this.logger.log(
          "success",
          `Initial sync completed - ${changedItems.length} items uploaded`
        );
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to create initial sync",
          error.message
        );
        throw error;
      }
    }
    async performFullSync() {
      await this.initializeLocalMetadata();
      const urlParams = new URLSearchParams(window.location.search);
      const debugEnabled =
        urlParams.get("log") === "true" || urlParams.has("log");
      if (debugEnabled) {
        const localItems = Object.keys(this.metadata.items || {});
        const localDeleted = localItems.filter(
          (id) => this.metadata.items[id].deleted
        ).length;
        const localActive = localItems.length - localDeleted;
        console.log(
          `📊 Local Metadata Stats: Total=${localItems.length}, Active=${localActive}, Deleted=${localDeleted}`
        );
      }

      await this.syncFromCloud();

      const cloudMetadata = await this.getCloudMetadata();
      const localMetadataEmpty =
        Object.keys(this.metadata.items || {}).length === 0;
      const cloudMetadataEmpty =
        Object.keys(cloudMetadata.items || {}).length === 0;

      if (localMetadataEmpty && cloudMetadataEmpty) {
        const allItems = await this.dataService.getAllItems();
        if (allItems.length > 0) {
          this.logger.log(
            "info",
            `🚀 Fresh setup detected: ${allItems.length} local items found with empty metadata. Triggering initial sync.`
          );
          await this.createInitialSync();
        } else {
          this.logger.log(
            "info",
            "Fresh setup with no local data - nothing to sync"
          );
        }
      } else {
        await this.syncToCloud();
      }
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
    async initializeLocalMetadata() {
      const isEmptyMetadata =
        Object.keys(this.metadata.items || {}).length === 0;
      if (!isEmptyMetadata) {
        // this.logger.log(
        //   "info",
        //   "Local metadata already exists, skipping initialization"
        // );
        return;
      }
      this.logger.log(
        "start",
        "🔧 Initializing local metadata from database contents"
      );
      const allItems = await this.dataService.getAllItems();
      const tombstones = this.dataService.getAllTombstones();
      let itemCount = 0;
      let tombstoneCount = 0;
      for (const item of allItems) {
        if (item.id && item.data) {
          const key = item.id;
          this.metadata.items[key] = {
            synced: 0,
            type: item.type,
            size: this.getItemSize(item.data),
            lastModified: 0,
          };
          itemCount++;
        }
      }
      for (const [itemId, tombstone] of tombstones.entries()) {
        if (!this.metadata.items[itemId]) {
          this.metadata.items[itemId] = {
            deleted: tombstone.deleted,
            deletedAt: tombstone.deletedAt || tombstone.deleted,
            type: tombstone.type,
            tombstoneVersion: tombstone.tombstoneVersion || 1,
            synced: 0,
          };
          tombstoneCount++;
        }
      }
      if (itemCount > 0 || tombstoneCount > 0) {
        this.saveMetadata();
        this.logger.log(
          "success",
          `✅ Local metadata initialized: ${itemCount} items, ${tombstoneCount} tombstones`
        );
      } else {
        this.logger.log("info", "No local items found to initialize metadata");
      }
      if (this.config.isConfigured()) {
        try {
          this.logger.log(
            "info",
            "🔍 Checking cloud for missing items to restore"
          );
          const cloudMetadata = await this.getCloudMetadata();
          let restoredCount = 0;
          for (const [cloudItemId, cloudItem] of Object.entries(
            cloudMetadata.items || {}
          )) {
            if (!cloudItem.deleted && !this.metadata.items[cloudItemId]) {
              try {
                const data = await this.s3Service.download(
                  `items/${cloudItemId}.json`
                );
                if (data) {
                  await this.dataService.saveItem(
                    data,
                    cloudItem.type,
                    cloudItemId
                  );
                  const syncTime = Date.now();
                  this.metadata.items[cloudItemId] = {
                    synced: syncTime,
                    type: cloudItem.type,
                    size: cloudItem.size || this.getItemSize(data),
                    lastModified: syncTime,
                  };
                  restoredCount++;
                  this.logger.log(
                    "info",
                    `📥 Restored missing item: ${cloudItemId}`
                  );
                }
              } catch (error) {
                this.logger.log(
                  "warning",
                  `Failed to restore item ${cloudItemId}: ${error.message}`
                );
              }
            } else if (cloudItem.deleted && !this.metadata.items[cloudItemId]) {
              try {
                await this.dataService.performDelete(
                  cloudItemId,
                  cloudItem.type
                );
                const tombstoneData = {
                  deleted: cloudItem.deleted,
                  deletedAt: cloudItem.deletedAt || cloudItem.deleted,
                  type: cloudItem.type,
                  tombstoneVersion: cloudItem.tombstoneVersion || 1,
                  synced: Date.now(),
                };
                this.dataService.saveTombstoneToStorage(
                  cloudItemId,
                  tombstoneData
                );
                this.metadata.items[cloudItemId] = tombstoneData;
                restoredCount++;
                this.logger.log(
                  "info",
                  `🗑️ Applied missing tombstone: ${cloudItemId}`
                );
              } catch (error) {
                this.logger.log(
                  "warning",
                  `Failed to apply tombstone ${cloudItemId}: ${error.message}`
                );
              }
            }
          }
          if (restoredCount > 0) {
            this.saveMetadata();
            this.logger.log(
              "success",
              `🔄 Restored ${restoredCount} missing items and tombstones from cloud`
            );
          } else {
            this.logger.log(
              "info",
              "No missing items found in cloud to restore"
            );
          }
        } catch (error) {
          this.logger.log(
            "warning",
            "Could not check cloud for missing items",
            error.message
          );
        }
      }
    }
    async cleanupCloudTombstones() {
      try {
        const cloudMetadata = await this.getCloudMetadata();
        const now = Date.now();
        const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
        let cleanupCount = 0;

        if (cloudMetadata.items) {
          for (const [itemId, metadata] of Object.entries(
            cloudMetadata.items
          )) {
            if (
              metadata.deleted &&
              now - metadata.deleted > tombstoneRetentionPeriod
            ) {
              delete cloudMetadata.items[itemId];
              cleanupCount++;
            }
          }

          if (cleanupCount > 0) {
            await this.s3Service.upload("metadata.json", cloudMetadata, true);
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
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);

      const interval = Math.max(this.config.get("syncInterval") * 1000, 15000);

      this.autoSyncInterval = setInterval(async () => {
        if (this.config.isConfigured() && !this.syncInProgress) {
          try {
            await this.performFullSync();
          } catch (error) {
            this.logger.log("error", "Auto-sync failed", error.message);
          }
        }
      }, interval);

      this.logger.log("info", "Auto-sync started");
    }
    cleanupOldTombstones() {
      const now = Date.now();
      const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
      let cleanupCount = 0;

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("tcs_tombstone_")) {
          try {
            const tombstone = JSON.parse(localStorage.getItem(key));
            if (
              tombstone.deleted &&
              now - tombstone.deleted > tombstoneRetentionPeriod
            ) {
              localStorage.removeItem(key);
              cleanupCount++;
            }
          } catch {
            localStorage.removeItem(key);
            cleanupCount++;
          }
        }
      }

      for (const [itemId, metadata] of Object.entries(this.metadata.items)) {
        if (
          metadata.deleted &&
          now - metadata.deleted > tombstoneRetentionPeriod
        ) {
          delete this.metadata.items[itemId];
          cleanupCount++;
        }
      }

      if (cleanupCount > 0) {
        this.saveMetadata();
        this.logger.log("info", `🧹 Cleaned up ${cleanupCount} old tombstones`);
      }

      return cleanupCount;
    }

    async getCloudMetadataWithETag() {
      try {
        const result = await this.s3Service.downloadWithResponse(
          "metadata.json"
        );
        const metadata = JSON.parse(result.Body.toString());
        const etag = result.ETag;

        if (!metadata || typeof metadata !== "object") {
          return { metadata: { lastSync: 0, items: {} }, etag };
        }
        if (!metadata.items) {
          metadata.items = {};
        }
        return { metadata, etag };
      } catch (error) {
        if (error.code === "NoSuchKey" || error.statusCode === 404) {
          return { metadata: { lastSync: 0, items: {} }, etag: null };
        }
        throw error;
      }
    }

    async getCloudMetadata() {
      const { metadata } = await this.getCloudMetadataWithETag();
      return metadata;
    }

    cleanup() {
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
      this.syncInProgress = false;
      this.config = null;
      this.dataService = null;
      this.s3Service = null;
      this.logger = null;
      this.operationQueue = null;
      this.metadata = null;
    }
  }

  class BackupService {
    constructor(dataService, s3Service, logger) {
      this.dataService = dataService;
      this.s3Service = s3Service;
      this.logger = logger;
      this.chunkSizeLimit = 50 * 1024 * 1024;
      this.jsZipLoaded = false;
    }

    async loadJSZip() {
      if (this.jsZipLoaded || window.JSZip) {
        this.jsZipLoaded = true;
        return window.JSZip;
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        script.onload = () => {
          this.jsZipLoaded = true;
          this.logger.log("success", "JSZip library loaded successfully");
          resolve(window.JSZip);
        };
        script.onerror = () => {
          this.logger.log("error", "Failed to load JSZip library");
          reject(new Error("Failed to load JSZip library"));
        };
        document.head.appendChild(script);
      });
    }

    async createCompressedBackup(filename, data) {
      try {
        const JSZip = await this.loadJSZip();

        const stringifiedData = JSON.stringify(data);
        const uncompressedSize = stringifiedData.length;

        const textEncoder = new TextEncoder();
        const stringifiedDataBytes = textEncoder.encode(stringifiedData);

        // Create ZIP with high compression from raw data
        const zip = new JSZip();
        const jsonFileName = filename.replace(".zip", ".json");
        zip.file(jsonFileName, stringifiedDataBytes, {
          compression: "DEFLATE",
          compressionOptions: { level: 9 },
        });

        // Generate compressed blob as a Uint8Array
        const compressedData = await zip.generateAsync({ type: "uint8array" });

        if (compressedData.length < 100) {
          throw new Error(
            "Backup file is too small or empty. Upload cancelled."
          );
        }

        // Encrypt the compressed data
        const encryptedData = await this.s3Service.crypto.encryptBytes(
          compressedData
        );

        // Upload raw encrypted data
        await this.s3Service.uploadRaw(filename, encryptedData);

        this.logger.log(
          "info",
          `Compression: ${this.formatFileSize(
            uncompressedSize
          )} → ${this.formatFileSize(compressedData.length)} ` +
            `(${Math.round(
              (1 - compressedData.length / uncompressedSize) * 100
            )}% reduction)`
        );

        return true;
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to create compressed backup",
          error.message
        );
        throw error;
      }
    }

    async estimateDataSize() {
      try {
        const items = await this.dataService.getAllItems();
        let totalSize = 0;

        items.forEach((item) => {
          try {
            const itemStr = JSON.stringify(item.data);
            totalSize += itemStr.length * 2; // Rough estimate with overhead
          } catch (error) {
            this.logger.log(
              "warning",
              `Skipping item ${item.id} in size estimation: ${error.message}`
            );
          }
        });

        return totalSize;
      } catch (error) {
        this.logger.log("error", "Failed to estimate data size", error.message);
        return 0;
      }
    }

    async createSnapshot(name) {
      this.logger.log("start", `Creating snapshot: ${name}`);

      const estimatedSize = await this.estimateDataSize();
      this.logger.log(
        "info",
        `Estimated data size: ${this.formatFileSize(estimatedSize)}`
      );

      if (estimatedSize > this.chunkSizeLimit) {
        return await this.createChunkedSnapshot(name, estimatedSize);
      } else {
        return await this.createSimpleSnapshot(name);
      }
    }

    async createSimpleSnapshot(name) {
      this.logger.log("info", "Using simple snapshot method for small dataset");
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "");
      const filename = `s-${name.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${timestamp}.zip`;

      const allItems = await this.dataService.getAllItems();

      const indexedDBData = {};
      allItems
        .filter((item) => item.type === "idb")
        .forEach((item) => {
          if (item.data) {
            indexedDBData[item.id] = item.data;
          }
        });

      const localStorageData = {};
      allItems
        .filter((item) => item.type === "ls")
        .forEach((item) => {
          localStorageData[item.data.key] = item.data.value;
        });

      const snapshot = {
        localStorage: localStorageData,
        indexedDB: indexedDBData,
        created: Date.now(),
        name,
        format: "simple",
      };

      await this.createCompressedBackup(filename, snapshot);
      this.logger.log("success", `Simple snapshot created: ${filename}`);
      return true;
    }

    async createChunkedSnapshot(name, estimatedSize) {
      this.logger.log(
        "info",
        `Using chunked snapshot method for large dataset (${this.formatFileSize(
          estimatedSize
        )})`
      );

      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "");
      const baseFilename = `s-${name.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${timestamp}`;

      try {
        const allItems = await this.dataService.getAllItems();
        const chunks = await this.createDataChunks(allItems);

        this.logger.log("info", `Created ${chunks.length} chunks for upload`);

        // Upload metadata first
        const metadata = {
          format: "chunked",
          created: Date.now(),
          name,
          totalChunks: chunks.length,
          estimatedSize,
          chunkList: chunks.map((chunk, index) => ({
            index,
            filename: `${baseFilename}-chunk-${index
              .toString()
              .padStart(3, "0")}.zip`,
            itemCount: chunk.length,
          })),
        };

        await this.s3Service.upload(
          `${baseFilename}-metadata.json`,
          metadata,
          true
        );

        // Upload chunks with progress tracking
        for (let i = 0; i < chunks.length; i++) {
          const chunkFilename = `${baseFilename}-chunk-${i
            .toString()
            .padStart(3, "0")}.zip`;
          const chunkData = {
            chunkIndex: i,
            totalChunks: chunks.length,
            items: chunks[i],
            created: Date.now(),
          };

          this.logger.log(
            "info",
            `Uploading chunk ${i + 1}/${chunks.length} (${
              chunks[i].length
            } items)`
          );

          try {
            await this.createCompressedBackup(chunkFilename, chunkData);
          } catch (error) {
            this.logger.log(
              "error",
              `Failed to upload chunk ${i + 1}: ${error.message}`
            );
            throw new Error(
              `Chunked snapshot failed at chunk ${i + 1}/${chunks.length}`
            );
          }
        }

        this.logger.log(
          "success",
          `Chunked snapshot created: ${baseFilename} (${chunks.length} chunks)`
        );
        return true;
      } catch (error) {
        this.logger.log(
          "error",
          "Chunked snapshot creation failed",
          error.message
        );
        throw error;
      }
    }

    async createDataChunks(allItems) {
      const chunks = [];
      let currentChunk = [];
      let currentChunkSize = 0;

      for (const item of allItems) {
        try {
          const itemStr = JSON.stringify(item);
          const itemSize = itemStr.length * 2; // Rough size estimate

          // If adding this item would exceed chunk size, start new chunk
          if (
            currentChunkSize + itemSize > this.chunkSizeLimit &&
            currentChunk.length > 0
          ) {
            chunks.push([...currentChunk]);
            currentChunk = [];
            currentChunkSize = 0;
          }

          currentChunk.push(item);
          currentChunkSize += itemSize;
        } catch (error) {
          this.logger.log(
            "warning",
            `Skipping problematic item ${item.id}: ${error.message}`
          );
        }
      }

      // Add the last chunk if it has items
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      return chunks;
    }

    async checkAndPerformDailyBackup() {
      const lastBackupStr = localStorage.getItem("tcs_last-daily-backup");
      const now = new Date();
      const currentDateStr = `${now.getFullYear()}${String(
        now.getMonth() + 1
      ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

      if (!lastBackupStr || lastBackupStr !== currentDateStr) {
        this.logger.log("info", "Starting daily backup...");
        await this.performDailyBackup();
        localStorage.setItem("tcs_last-daily-backup", currentDateStr);
        this.logger.log("success", "Daily backup completed");
      }
      //else {
      //   this.logger.log("info", "Daily backup already performed today");
      // }
    }

    async performDailyBackup() {
      //this.logger.log("start", "Starting daily backup");

      const estimatedSize = await this.estimateDataSize();
      this.logger.log(
        "info",
        `Estimated data size: ${this.formatFileSize(estimatedSize)}`
      );

      if (estimatedSize > this.chunkSizeLimit) {
        return await this.performChunkedDailyBackup(estimatedSize);
      } else {
        return await this.performSimpleDailyBackup();
      }
    }

    async performSimpleDailyBackup() {
      this.logger.log("info", "Using simple daily backup method");
      const today = new Date();
      const dateString = `${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const filename = `typingmind-backup-${dateString}.zip`;

      const allItems = await this.dataService.getAllItems();

      const indexedDBData = {};
      allItems
        .filter((item) => item.type === "idb")
        .forEach((item) => {
          if (item.data) {
            indexedDBData[item.id] = item.data;
          }
        });

      const localStorageData = {};
      allItems
        .filter((item) => item.type === "ls")
        .forEach((item) => {
          localStorageData[item.data.key] = item.data.value;
        });

      const backup = {
        localStorage: localStorageData,
        indexedDB: indexedDBData,
        created: Date.now(),
        name: "daily-auto",
        format: "simple",
      };

      await this.createCompressedBackup(filename, backup);
      this.logger.log("success", `Simple daily backup completed: ${filename}`);
      await this.cleanupOldBackups();
    }

    async performChunkedDailyBackup(estimatedSize) {
      this.logger.log(
        "info",
        `Using chunked daily backup method (${this.formatFileSize(
          estimatedSize
        )})`
      );

      const today = new Date();
      const dateString = `${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const baseFilename = `typingmind-backup-${dateString}`;

      try {
        const allItems = await this.dataService.getAllItems();
        const chunks = await this.createDataChunks(allItems);

        this.logger.log(
          "info",
          `Created ${chunks.length} chunks for daily backup`
        );

        // Upload metadata
        const metadata = {
          format: "chunked",
          created: Date.now(),
          name: "daily-auto",
          type: "daily-backup",
          totalChunks: chunks.length,
          estimatedSize,
          chunkList: chunks.map((chunk, index) => ({
            index,
            filename: `${baseFilename}-chunk-${index
              .toString()
              .padStart(3, "0")}.json`,
            itemCount: chunk.length,
          })),
        };

        await this.s3Service.upload(
          `${baseFilename}-metadata.json`,
          metadata,
          true
        );

        // Upload chunks
        for (let i = 0; i < chunks.length; i++) {
          const chunkFilename = `${baseFilename}-chunk-${i
            .toString()
            .padStart(3, "0")}.zip`;
          const chunkData = {
            chunkIndex: i,
            totalChunks: chunks.length,
            items: chunks[i],
            created: Date.now(),
          };

          this.logger.log(
            "info",
            `Uploading daily backup chunk ${i + 1}/${chunks.length}`
          );
          await this.createCompressedBackup(chunkFilename, chunkData);
        }

        this.logger.log(
          "success",
          `Chunked daily backup completed: ${baseFilename} (${chunks.length} chunks)`
        );
        await this.cleanupOldBackups();
      } catch (error) {
        this.logger.log("error", "Chunked daily backup failed", error.message);
        throw error;
      }
    }

    formatFileSize(bytes) {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    async loadBackupList() {
      try {
        const objects = await this.s3Service.list("");
        const backups = [];

        for (const obj of objects) {
          if (!obj.Key.includes("/")) {
            const isValidBackupFile =
              obj.Key.startsWith("typingmind-backup-") ||
              obj.Key.startsWith("s-");

            if (isValidBackupFile) {
              if (obj.Key.endsWith("-metadata.json")) {
                try {
                  const metadata = await this.s3Service.download(obj.Key, true);
                  if (metadata.format === "chunked") {
                    const backupType = this.getBackupType(obj.Key);
                    const baseName = obj.Key.replace("-metadata.json", "");
                    const chunkFiles = objects.filter(
                      (o) =>
                        o.Key.startsWith(baseName) && o.Key.includes("-chunk-")
                    );
                    const totalChunkSize = chunkFiles.reduce(
                      (sum, chunk) => sum + chunk.Size,
                      0
                    );
                    backups.push({
                      key: obj.Key,
                      name: obj.Key.replace("-metadata.json", ""),
                      displayName: this.formatBackupDisplayName(
                        obj.Key,
                        metadata
                      ),
                      size: totalChunkSize,
                      modified: obj.LastModified,
                      format: "chunked",
                      chunks: metadata.totalChunks,
                      type: backupType,
                      sortOrder: backupType === "snapshot" ? 1 : 2,
                    });
                  }
                } catch (error) {
                  this.logger.log(
                    "warning",
                    `Failed to read metadata for ${obj.Key}`
                  );
                }
              } else if (
                obj.Key.match(/\.(zip|json)$/) &&
                !obj.Key.includes("-chunk-")
              ) {
                const backupType = this.getBackupType(obj.Key);
                backups.push({
                  key: obj.Key,
                  name: obj.Key.replace(/\.(zip|json)$/, ""),
                  displayName: this.formatBackupDisplayName(obj.Key),
                  size: obj.Size,
                  modified: obj.LastModified,
                  format: "simple",
                  type: backupType,
                  sortOrder: backupType === "snapshot" ? 1 : 2,
                });
              }
            }
          }
        }

        return backups.sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }
          return new Date(b.modified) - new Date(a.modified);
        });
      } catch (error) {
        this.logger.log("error", "Failed to load backup list", error.message);
        return [];
      }
    }

    getBackupType(filename) {
      if (filename.startsWith("s-")) {
        return "snapshot";
      } else if (filename.startsWith("typingmind-backup-")) {
        return "daily";
      }
      return "unknown";
    }

    formatBackupDisplayName(filename, metadata = null) {
      const type = this.getBackupType(filename);
      const isChunked = metadata && metadata.format === "chunked";

      if (type === "snapshot") {
        const cleanName = filename
          .replace(/^s-/, "")
          .replace(/-\d{8}T\d{6}.*$/, "")
          .replace("-metadata.json", "")
          .replace(/\.(zip|json)$/, "");
        const timestamp = filename.match(/-(\d{8}T\d{6})/);
        let displayName = `📸 Snapshot: ${cleanName}`;
        if (timestamp) {
          const dateStr = timestamp[1];
          const date = new Date(
            dateStr.slice(0, 4) +
              "-" +
              dateStr.slice(4, 6) +
              "-" +
              dateStr.slice(6, 8) +
              "T" +
              dateStr.slice(9, 11) +
              ":" +
              dateStr.slice(11, 13) +
              ":" +
              dateStr.slice(13, 15)
          );
          displayName += ` (${date.toLocaleDateString()})`;
        }
        return displayName;
      } else if (type === "daily") {
        const dateMatch = filename.match(/typingmind-backup-(\d{8})/);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          const date = new Date(
            dateStr.slice(0, 4) +
              "-" +
              dateStr.slice(4, 6) +
              "-" +
              dateStr.slice(6, 8)
          );
          return `🗓️ Daily Backup (${date.toLocaleDateString()})`;
        }
        return "🗓️ Daily Backup";
      }

      return filename
        .replace(/\.(zip|json)$/, "")
        .replace("-metadata.json", "");
    }

    async restoreFromBackup(key, cryptoService) {
      this.logger.log("start", `Restoring from backup: ${key}`);

      try {
        if (key.endsWith("-metadata.json")) {
          return await this.restoreFromChunkedBackup(key, cryptoService);
        } else {
          return await this.restoreFromSimpleBackup(key, cryptoService);
        }
      } catch (error) {
        this.logger.log("error", "Backup restoration failed", error.message);
        throw error;
      }
    }

    async restoreFromSimpleBackup(key, cryptoService) {
      this.logger.log("info", "Restoring from simple backup format");

      let backup;
      if (key.endsWith(".zip")) {
        backup = await this.restoreFromZipBackup(key, cryptoService);
      } else {
        backup = await this.s3Service.download(key);
      }

      if (!backup) {
        throw new Error("Backup not found");
      }

      let decryptedData;
      if (backup.data) {
        decryptedData = await cryptoService.decrypt(backup.data);
      } else {
        decryptedData = backup;
      }

      if (!decryptedData.localStorage && !decryptedData.indexedDB) {
        throw new Error(
          "Invalid backup format - missing localStorage and indexedDB data"
        );
      }

      await this.restoreData(decryptedData);
      this.logger.log("success", "Simple backup restored successfully");

      setTimeout(() => {
        window.location.reload();
      }, 3000);

      return true;
    }

    async restoreFromZipBackup(key, cryptoService, legacy = false) {
      try {
        const JSZip = await this.loadJSZip();

        // Download raw ZIP data
        const zipData = await this.s3Service.downloadRaw(key);

        if (legacy) {
          // Legacy: Encrypted THEN compressed
          const zip = await JSZip.loadAsync(zipData);
          const jsonFile = Object.keys(zip.files).find((f) =>
            f.endsWith(".json")
          );
          if (!jsonFile) {
            throw new Error("No JSON file found in ZIP backup");
          }
          const encryptedData = await zip.file(jsonFile).async("uint8array");
          return await cryptoService.decrypt(encryptedData);
        }

        // New method: Compressed THEN encrypted
        const decryptedZipBytes = await cryptoService.decryptBytes(zipData);

        // Load ZIP from decrypted bytes
        const zip = await JSZip.loadAsync(decryptedZipBytes);

        // Find JSON file inside ZIP
        const jsonFile = Object.keys(zip.files).find((f) =>
          f.endsWith(".json")
        );
        if (!jsonFile) {
          throw new Error("No JSON file found in ZIP backup");
        }

        // Extract and parse the content
        const jsonContent = await zip.file(jsonFile).async("string");
        const decryptedData = JSON.parse(jsonContent);

        this.logger.log(
          "info",
          "Successfully extracted and decrypted ZIP backup"
        );
        return decryptedData;
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to restore from ZIP backup",
          error.message
        );
        throw error;
      }
    }

    async restoreFromChunkedBackup(metadataKey, cryptoService) {
      this.logger.log("info", "Restoring from chunked backup format");

      const metadata = await this.s3Service.download(metadataKey, true);
      if (!metadata || metadata.format !== "chunked") {
        throw new Error("Invalid chunked backup metadata");
      }

      this.logger.log(
        "info",
        `Restoring chunked backup: ${metadata.totalChunks} chunks`
      );

      const allData = {
        localStorage: {},
        indexedDB: {},
      };

      for (let i = 0; i < metadata.totalChunks; i++) {
        const chunkInfo = metadata.chunkList[i];
        this.logger.log(
          "info",
          `Processing chunk ${i + 1}/${metadata.totalChunks}`
        );

        try {
          let chunkData;
          if (chunkInfo.filename.endsWith(".zip")) {
            chunkData = await this.restoreFromZipBackup(
              chunkInfo.filename,
              cryptoService
            );
          } else {
            chunkData = await this.s3Service.download(chunkInfo.filename);
          }

          if (chunkData.items) {
            for (const item of chunkData.items) {
              if (item.type === "idb" && item.data) {
                allData.indexedDB[item.id] = item.data;
              } else if (item.type === "ls" && item.data) {
                allData.localStorage[item.data.key] = item.data.value;
              }
            }
          }
        } catch (error) {
          this.logger.log(
            "error",
            `Failed to process chunk ${i + 1}: ${error.message}`
          );
          throw new Error(
            `Chunked backup restoration failed at chunk ${i + 1}`
          );
        }
      }

      await this.restoreData(allData);
      this.logger.log(
        "success",
        `Chunked backup restored successfully (${metadata.totalChunks} chunks)`
      );

      setTimeout(() => {
        window.location.reload();
      }, 3000);

      return true;
    }

    async restoreData(data) {
      this.logger.log("info", "Restoring data to local storage");

      if (!data || typeof data !== "object") {
        throw new Error("Invalid restore data: data must be an object");
      }

      if (!data.localStorage && !data.indexedDB) {
        throw new Error(
          "Invalid restore data: missing localStorage and indexedDB sections"
        );
      }

      this.logger.log(
        "warning",
        "⚠️ CRITICAL: This restore will overwrite ALL local data. Page will reload after restore."
      );

      const promises = [];

      if (data.indexedDB && typeof data.indexedDB === "object") {
        Object.entries(data.indexedDB).forEach(([key, itemData]) => {
          if (key && itemData !== undefined && itemData !== null) {
            promises.push(this.dataService.saveItem(itemData, "idb", key));
            this.logger.log("info", `🔄 Restoring IndexedDB item: ${key}`);
          } else {
            this.logger.log(
              "warning",
              `Skipping invalid IndexedDB item: ${key}`
            );
          }
        });
      }

      if (data.localStorage && typeof data.localStorage === "object") {
        Object.entries(data.localStorage).forEach(([key, value]) => {
          if (key && value !== undefined && value !== null) {
            promises.push(this.dataService.saveItem({ key, value }, "ls"));
            this.logger.log("info", `🔄 Restoring localStorage item: ${key}`);
          } else {
            this.logger.log(
              "warning",
              `Skipping invalid localStorage item: ${key}`
            );
          }
        });
      }

      await Promise.all(promises);

      this.logger.log(
        "info",
        "✅ Data restore completed. Clearing sync metadata to force fresh sync."
      );

      localStorage.removeItem("tcs_cloud-metadata");
      localStorage.removeItem("tcs_last-cloud-sync");

      this.logger.log(
        "success",
        "Restore completed successfully. Page will reload in 3 seconds."
      );
    }

    async cleanupOldBackups() {
      try {
        const objects = await this.s3Service.list("");
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        let deletedCount = 0;

        const backupFiles = objects.filter(
          (obj) =>
            obj.Key.startsWith("typingmind-backup-") ||
            obj.Key.startsWith("s-") ||
            obj.Key.endsWith("-metadata.json") ||
            obj.Key.includes("-chunk-")
        );

        for (const obj of backupFiles) {
          const isOldBackup =
            new Date(obj.LastModified).getTime() < thirtyDaysAgo;

          if (isOldBackup) {
            try {
              await this.s3Service.delete(obj.Key);
              deletedCount++;
              this.logger.log("info", `Cleaned up old backup: ${obj.Key}`);
            } catch (error) {
              this.logger.log("warning", `Failed to delete backup: ${obj.Key}`);
            }
          }
        }

        if (deletedCount > 0) {
          this.logger.log(
            "success",
            `Cleaned up ${deletedCount} old backup files`
          );
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

  class OperationQueue {
    constructor(logger) {
      this.logger = logger;
      this.queue = new Map();
      this.processing = false;
      this.maxRetries = 3;
      this.activeTimeouts = new Set();
      this.maxQueueSize = 100;
      this.lastCleanup = 0;
    }

    add(operationId, operation, priority = "normal") {
      const now = Date.now();

      if (now - this.lastCleanup > 10 * 60 * 1000) {
        this.cleanupStaleOperations(now);
        this.lastCleanup = now;
      }

      if (this.queue.has(operationId)) {
        this.logger.log("skip", `Operation ${operationId} already queued`);
        return;
      }

      if (this.queue.size >= this.maxQueueSize) {
        this.logger.log(
          "warning",
          `Queue full (${this.maxQueueSize}), removing oldest operation`
        );
        const oldestKey = this.queue.keys().next().value;
        this.queue.delete(oldestKey);
      }

      this.queue.set(operationId, {
        id: operationId,
        operation,
        priority,
        retries: 0,
        addedAt: now,
      });

      this.logger.log("info", `📋 Queued operation: ${operationId}`);
      this.process();
    }

    cleanupStaleOperations(now) {
      const staleThreshold = 60 * 60 * 1000;
      let removedCount = 0;

      for (const [operationId, operation] of this.queue.entries()) {
        if (
          now - operation.addedAt > staleThreshold &&
          operation.retries >= this.maxRetries
        ) {
          this.queue.delete(operationId);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        this.logger.log(
          "info",
          `🧹 Cleaned up ${removedCount} stale operations from queue`
        );
      }
    }

    async process() {
      if (this.processing || this.queue.size === 0) return;

      this.processing = true;

      while (this.queue.size > 0) {
        const operations = Array.from(this.queue.values());
        const highPriority = operations.filter((op) => op.priority === "high");
        const nextOp =
          highPriority.length > 0 ? highPriority[0] : operations[0];

        try {
          this.logger.log("info", `⚡ Executing: ${nextOp.id}`);
          await nextOp.operation();
          this.queue.delete(nextOp.id);
          this.logger.log("success", `✅ Completed: ${nextOp.id}`);
        } catch (error) {
          this.logger.log("error", `❌ Failed: ${nextOp.id}`, error.message);

          if (nextOp.retries < this.maxRetries) {
            nextOp.retries++;
            const delay = Math.min(1000 * Math.pow(2, nextOp.retries), 10000);
            this.logger.log(
              "warning",
              `🔄 Retrying ${nextOp.id} in ${delay}ms (${nextOp.retries}/${this.maxRetries})`
            );

            const timeoutId = setTimeout(() => {
              this.activeTimeouts.delete(timeoutId);
              if (this.queue.has(nextOp.id)) {
                this.process();
              }
            }, delay);
            this.activeTimeouts.add(timeoutId);
            break;
          } else {
            this.logger.log("error", `💀 Giving up on: ${nextOp.id}`);
            this.queue.delete(nextOp.id);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      this.processing = false;
    }

    clear() {
      this.queue.clear();
      this.clearTimeouts();
      this.processing = false;
    }

    clearTimeouts() {
      for (const timeoutId of this.activeTimeouts) {
        clearTimeout(timeoutId);
      }
      this.activeTimeouts.clear();
    }

    size() {
      return this.queue.size;
    }

    cleanup() {
      this.clear();
      this.lastCleanup = 0;
      this.logger = null;
    }
  }

  class CloudSyncApp {
    constructor() {
      this.logger = new Logger();
      this.config = new ConfigManager();
      this.operationQueue = new OperationQueue(this.logger);
      this.dataService = new DataService(
        this.config,
        this.logger,
        this.operationQueue
      );
      this.cryptoService = new CryptoService(this.config, this.logger);
      this.s3Service = new S3Service(
        this.config,
        this.cryptoService,
        this.logger
      );
      this.syncOrchestrator = new SyncOrchestrator(
        this.config,
        this.dataService,
        this.s3Service,
        this.logger,
        this.operationQueue
      );
      this.backupService = new BackupService(
        this.dataService,
        this.s3Service,
        this.logger
      );
      this.autoSyncInterval = null;
      this.eventListeners = [];
      this.modalCleanupCallbacks = [];
      this.noSyncMode = false;
      this.diagnosticsInterval = null;
      this.diagnosticsExpanded = false;
    }
    async initialize() {
      this.logger.log("start", "Initializing TypingmindCloud Sync V3");

      // Check for nosync parameter and get URL config
      const urlParams = new URLSearchParams(window.location.search);
      this.noSyncMode =
        urlParams.get("nosync") === "true" || urlParams.has("nosync");
      const urlConfig = this.getConfigFromUrlParams();

      // Apply URL config to in-memory config and save to localStorage
      if (urlConfig.hasParams) {
        Object.keys(urlConfig.config).forEach((key) => {
          if (key === "exclusions") {
            localStorage.setItem(
              "tcs_sync-exclusions",
              urlConfig.config.exclusions
            );
            this.config.reloadExclusions();
          } else {
            this.config.set(key, urlConfig.config[key]);
          }
        });
        this.config.save();
        this.logger.log(
          "info",
          "Applied and saved URL parameters to config and localStorage."
        );
        this.removeConfigFromUrl();
      }

      if (this.noSyncMode) {
        this.logger.log(
          "info",
          "🚫 NoSync mode enabled - only snapshot functionality available"
        );
      }

      // Check for mandatory configuration if not in nosync mode
      if (!this.noSyncMode && !this.checkMandatoryConfig(urlConfig.config)) {
        alert(
          "⚠️ Cloud Sync Configuration Required\n\nPlease configure the following mandatory fields in the sync settings:\n• AWS Bucket Name\n• AWS Region\n• AWS Access Key\n• AWS Secret Key\n• Encryption Key\n\nClick on the Sync button to open settings, then reload the page after configuration."
        );
        await this.waitForDOM();
        this.insertSyncButton();
        return;
      }

      await this.performV2toV3Migration();
      await this.waitForDOM();
      this.insertSyncButton();

      // Check for URL config parameters and auto-open modal if requested
      if (urlConfig.autoOpen || urlConfig.hasParams) {
        this.logger.log(
          "info",
          "Auto-opening sync modal due to URL parameters"
        );
        setTimeout(() => this.openSyncModal(), 1000);
      }

      // Only start monitoring and syncing if not in nosync mode
      if (!this.noSyncMode) {
        if (this.config.isConfigured()) {
          try {
            await this.s3Service.initialize();
            await this.backupService.checkAndPerformDailyBackup();
            await this.syncOrchestrator.performFullSync();
            this.startAutoSync();
            this.updateSyncStatus("success");
            this.logger.log("success", "Cloud Sync initialized successfully");
          } catch (error) {
            this.logger.log("error", "Initialization failed", error.message);
            this.updateSyncStatus("error");
          }
        } else {
          this.logger.log(
            "info",
            "AWS not configured - running in limited capacity"
          );
        }
      } else {
        this.logger.log(
          "info",
          "NoSync mode: Daily backups and auto-sync disabled"
        );
        if (this.config.isConfigured()) {
          try {
            await this.s3Service.initialize();
          } catch (error) {
            this.logger.log("error", "S3 initialization failed", error.message);
          }
        }
      }
    }
    checkMandatoryConfig(urlConfig = {}) {
      const requiredFields = [
        { key: "tcs_aws_bucketname", urlKey: "bucketName" },
        { key: "tcs_aws_region", urlKey: "region" },
        { key: "tcs_aws_accesskey", urlKey: "accessKey" },
        { key: "tcs_aws_secretkey", urlKey: "secretKey" },
        { key: "tcs_encryptionkey", urlKey: "encryptionKey" },
      ];

      const missingFields = [];

      for (const field of requiredFields) {
        const localValue = localStorage.getItem(field.key);
        const urlValue = urlConfig[field.urlKey];

        if (
          (!localValue || localValue.trim() === "") &&
          (!urlValue || urlValue.trim() === "")
        ) {
          this.logger.log(
            "warning",
            `Missing mandatory field: ${field.key} (not in localStorage or URL params)`
          );
          missingFields.push(field.key);
        }
      }

      if (missingFields.length > 0) {
        this.logger.log(
          "warning",
          `Missing ${missingFields.length} mandatory fields`,
          missingFields
        );
        return false;
      }

      //this.logger.log(
      //  "success",
      //  "All mandatory configuration fields are present (localStorage + URL params)"
      //);
      return true;
    }

    isSnapshotAvailable() {
      // Snapshots require S3 configuration to work
      const urlConfig = this.getConfigFromUrlParams();
      return this.checkMandatoryConfig(urlConfig.config);
    }

    getConfigFromUrlParams() {
      const urlParams = new URLSearchParams(window.location.search);
      const config = {};
      const autoOpen = urlParams.has("config") || urlParams.has("autoconfig");

      // Map URL parameters to config values
      const paramMap = {
        bucket: "bucketName",
        bucketname: "bucketName",
        region: "region",
        accesskey: "accessKey",
        secretkey: "secretKey",
        endpoint: "endpoint",
        encryptionkey: "encryptionKey",
        syncinterval: "syncInterval",
        exclusions: "exclusions",
      };

      let hasConfigParams = false;

      for (const [urlParam, configKey] of Object.entries(paramMap)) {
        const value = urlParams.get(urlParam);
        if (value !== null) {
          config[configKey] = value;
          hasConfigParams = true;
        }
      }

      // Re-process sensitive keys that may contain '+' which URLSearchParams converts to space.
      const sensitiveKeys = {
        accesskey: "accessKey",
        secretkey: "secretKey",
        encryptionkey: "encryptionKey",
      };

      const rawQuery = window.location.search.substring(1);
      if (rawQuery) {
        const params = rawQuery.split("&");
        for (const p of params) {
          const idx = p.indexOf("=");
          if (idx > 0) {
            const key = p.substring(0, idx);
            if (sensitiveKeys[key]) {
              const value = decodeURIComponent(p.substring(idx + 1));
              config[sensitiveKeys[key]] = value;
              hasConfigParams = true;
            }
          }
        }
      }

      //this.logger.log("info", "URL config parameters detected", {
      //  hasParams: hasConfigParams,
      //  autoOpen: autoOpen,
      //  configKeys: Object.keys(config),
      //});

      return {
        config: config,
        hasParams: hasConfigParams,
        autoOpen: autoOpen,
      };
    }

    removeConfigFromUrl() {
      const url = new URL(window.location);
      const params = url.searchParams;

      const paramsToRemove = [
        "bucket",
        "bucketname",
        "region",
        "accesskey",
        "secretkey",
        "endpoint",
        "encryptionkey",
        "syncinterval",
        "exclusions",
        "config",
        "autoconfig",
      ];

      let removedSomething = false;
      paramsToRemove.forEach((p) => {
        if (params.has(p)) {
          params.delete(p);
          removedSomething = true;
        }
      });

      if (removedSomething) {
        window.history.replaceState({}, document.title, url.toString());
        this.logger.log("info", "Removed configuration parameters from URL.");
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
      style.textContent = `#sync-status-dot { position: absolute; top: 2px; width: 8px; height: 8px; border-radius: 50%; background-color: #6b7280; display: none; z-index: 10; }`;
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
      //this.logger.log("success", "Sync button inserted");
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
      const modal = document.querySelector(".cloud-sync-modal");
      if (modal && !this.diagnosticsInterval) {
        this.diagnosticsInterval = setInterval(
          () => this.loadSyncDiagnostics(modal),
          5000
        );
      }
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
      const modeStatus = this.noSyncMode
        ? `<div class="mb-3 p-2 bg-orange-600 rounded-lg border border-orange-500">
             <div class="text-center text-sm font-medium">
               🚫 NoSync Mode Active - Only snapshot functionality available
             </div>
           </div>`
        : "";

      return `<div class="text-white text-left text-sm">
        <div class="flex justify-center items-center mb-3">
          <h3 class="text-center text-xl font-bold text-white">S3 Backup & Sync Settings</h3>
        </div>
        ${modeStatus}
        <div class="space-y-3">
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="sync-diagnostics-header">
              <div class="flex items-center gap-2">
                <label class="block text-sm font-medium text-zinc-300">Sync Diagnostics</label>
                <span id="sync-overall-status" class="text-lg">✅</span>
              </div>
              <div class="flex items-center gap-1">
                <span id="sync-diagnostics-summary" class="text-xs text-zinc-400">Tap to view details</span>
                <svg id="sync-diagnostics-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </div>
            <div id="sync-diagnostics-content" class="overflow-x-auto">
              <table id="sync-diagnostics-table" class="w-full text-xs text-zinc-300 border-collapse">
                <thead>
                  <tr class="border-b border-zinc-600">
                    <th class="text-left py-1 px-2 font-medium">Type</th>
                    <th class="text-right py-1 px-2 font-medium">Count</th>
                    <th class="text-right py-1 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody id="sync-diagnostics-body">
                  <tr><td colspan="3" class="text-center py-2 text-zinc-500">Loading...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
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
                <label for="aws-endpoint" class="block text-sm font-medium text-zinc-300">S3 Compatible Storage Endpoint</label>
                <input id="aws-endpoint" name="aws-endpoint" type="text" value="${
                  this.config.get("endpoint") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off">
              </div>
              <div class="flex space-x-4">
                <div class="w-1/2">
                  <label for="sync-interval" class="block text-sm font-medium text-zinc-300">Sync Interval</label>
                  <input id="sync-interval" name="sync-interval" type="number" min="15" value="${this.config.get(
                    "syncInterval"
                  )}" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
                <div class="w-1/2">
                  <label for="encryption-key" class="block text-sm font-medium text-zinc-300">Encryption Key <span class="text-red-400">*</span></label>
                  <input id="encryption-key" name="encryption-key" type="password" value="${
                    this.config.get("encryptionKey") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
              </div>
              <div>
                <label for="sync-exclusions" class="block text-sm font-medium text-zinc-300">Exclusions (Comma separated)</label>
                <input id="sync-exclusions" name="sync-exclusions" type="text" value="${
                  localStorage.getItem("tcs_sync-exclusions") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" placeholder="e.g., my-setting, another-setting" autocomplete="off">
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end mb-4 space-x-2">
            <span class="text-sm text-zinc-400">Console Logging</span>
            <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
          </div>
          <div class="flex justify-between space-x-2 mt-4">
            <button id="save-settings" class="z-1 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">
              Save
            </button>
            <div class="flex space-x-2">
              <button id="sync-now" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-500 disabled:cursor-default transition-colors" ${
                this.noSyncMode ? "disabled" : ""
              }>
                ${this.noSyncMode ? "Sync Disabled" : "Sync Now"}
              </button>
              <button id="create-snapshot" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors" ${
                !this.isSnapshotAvailable() ? "disabled" : ""
              }>
                Snapshot
              </button>
              <button id="close-modal" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                Close
              </button>
            </div>
          </div>
          <div class="text-center mt-4">
            <span id="last-sync-msg" class="text-zinc-400">${
              this.noSyncMode
                ? "NoSync Mode: Automatic sync operations disabled"
                : ""
            }</span>
          </div>
          <div id="action-msg" class="text-center text-zinc-400"></div>
        </div>
      </div>`;
    }
    setupModalEventListeners(modal, overlay) {
      const closeModalHandler = () => this.closeModal(overlay);
      const saveSettingsHandler = () => this.saveSettings(overlay);
      const createSnapshotHandler = () => this.createSnapshot();
      const handleSyncNowHandler = () => this.handleSyncNow(modal);
      const consoleLoggingHandler = (e) =>
        this.logger.setEnabled(e.target.checked);

      overlay.addEventListener("click", closeModalHandler);
      modal.addEventListener("click", (e) => e.stopPropagation());
      modal
        .querySelector("#close-modal")
        .addEventListener("click", closeModalHandler);
      modal
        .querySelector("#save-settings")
        .addEventListener("click", saveSettingsHandler);
      modal
        .querySelector("#create-snapshot")
        .addEventListener("click", createSnapshotHandler);
      modal
        .querySelector("#sync-now")
        .addEventListener("click", handleSyncNowHandler);
      modal
        .querySelector("#console-logging-toggle")
        .addEventListener("change", consoleLoggingHandler);

      this.modalCleanupCallbacks.push(() => {
        overlay.removeEventListener("click", closeModalHandler);
        modal
          .querySelector("#close-modal")
          ?.removeEventListener("click", closeModalHandler);
        modal
          .querySelector("#save-settings")
          ?.removeEventListener("click", saveSettingsHandler);
        modal
          .querySelector("#create-snapshot")
          ?.removeEventListener("click", createSnapshotHandler);
        modal
          .querySelector("#sync-now")
          ?.removeEventListener("click", handleSyncNowHandler);
        modal
          .querySelector("#console-logging-toggle")
          ?.removeEventListener("change", consoleLoggingHandler);
      });

      const consoleLoggingCheckbox = modal.querySelector(
        "#console-logging-toggle"
      );
      consoleLoggingCheckbox.checked = this.logger.enabled;

      // Auto-populate form with URL parameters if present
      this.populateFormFromUrlParams(modal);

      this.loadBackupList(modal);
      this.setupBackupListHandlers(modal);
      this.loadSyncDiagnostics(modal);
      this.setupDiagnosticsToggle(modal);
    }

    populateFormFromUrlParams(modal) {
      const urlConfig = this.getConfigFromUrlParams();

      if (!urlConfig.hasParams) {
        this.logger.log("info", "No URL config parameters to populate");
        return;
      }

      this.logger.log(
        "info",
        "Populating form with URL parameters",
        urlConfig.config
      );

      // Map config keys to form field IDs
      const fieldMap = {
        bucketName: "aws-bucket",
        region: "aws-region",
        accessKey: "aws-access-key",
        secretKey: "aws-secret-key",
        endpoint: "aws-endpoint",
        encryptionKey: "encryption-key",
        syncInterval: "sync-interval",
        exclusions: "sync-exclusions",
      };

      let populatedCount = 0;

      for (const [configKey, fieldId] of Object.entries(fieldMap)) {
        const value = urlConfig.config[configKey];
        if (value !== undefined) {
          const field = modal.querySelector(`#${fieldId}`);
          if (field) {
            field.value = value;
            populatedCount++;
            this.logger.log(
              "info",
              `Populated field ${fieldId} with URL value`
            );
          }
        }
      }

      if (populatedCount > 0) {
        // Show a message to the user that fields were auto-populated
        const actionMsg = modal.querySelector("#action-msg");
        if (actionMsg) {
          actionMsg.textContent = `✨ Auto-populated ${populatedCount} field(s) from URL parameters`;
          actionMsg.style.color = "#22c55e"; // Green color
          setTimeout(() => {
            actionMsg.textContent = "";
            actionMsg.style.color = "";
          }, 5000);
        }
      }
    }
    handleSyncNow(modal) {
      if (this.noSyncMode) {
        alert(
          "⚠️ Sync operations are disabled in NoSync mode.\n\nTo enable sync operations, remove the ?nosync parameter from the URL and reload the page."
        );
        return;
      }

      const syncNowButton = modal.querySelector("#sync-now");
      const originalText = syncNowButton.textContent;
      syncNowButton.disabled = true;
      syncNowButton.textContent = "Working...";

      this.operationQueue.add(
        "manual-full-sync",
        async () => {
          await this.syncOrchestrator.performFullSync();
        },
        "high"
      );

      setTimeout(() => {
        syncNowButton.textContent = "Done!";
        setTimeout(() => {
          syncNowButton.textContent = originalText;
          syncNowButton.disabled = false;
        }, 2000);
      }, 1000);
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

        const backups = await this.backupService.loadBackupList();
        backupList.innerHTML = "";
        backupList.disabled = false;

        if (backups.length === 0) {
          const option = document.createElement("option");
          option.value = "";
          option.text = "No backups found";
          backupList.appendChild(option);
        } else {
          backups.forEach((backup) => {
            const option = document.createElement("option");
            option.value = backup.key;
            const size = this.formatFileSize(backup.size || 0);
            const date = new Date(backup.modified).toLocaleString();
            const formatLabel =
              backup.format === "chunked" ? ` [${backup.chunks} chunks]` : "";
            option.text = `${
              backup.displayName || backup.name
            } - ${size}${formatLabel} (${date})`;
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

      const isSnapshot = selectedValue.includes("s-");
      const isDailyBackup = selectedValue.includes("typingmind-backup-");
      const isChunkedBackup = selectedValue.endsWith("-metadata.json");
      const isMetadataFile = selectedValue === "metadata.json";
      const isItemsFile = selectedValue.startsWith("items/");

      if (downloadButton) {
        downloadButton.disabled = !selectedValue;
      }

      if (restoreButton) {
        const canRestore =
          selectedValue && (isSnapshot || isDailyBackup || isChunkedBackup);
        restoreButton.disabled = !canRestore;
      }

      if (deleteButton) {
        const isProtectedFile = !selectedValue || isMetadataFile || isItemsFile;
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
          downloadButton.disabled = true;
          downloadButton.textContent = "Downloading...";
          try {
            if (key.endsWith("-metadata.json")) {
              this.logger.log(
                "start",
                `Starting chunked backup download for ${key}`
              );
              const JSZip = await this.backupService.loadJSZip();
              const finalZip = new JSZip();

              const metadata = await this.s3Service.download(key, true);
              finalZip.file(key, JSON.stringify(metadata, null, 2));
              this.logger.log("info", "Added metadata file to zip.");

              if (metadata.chunkList && metadata.chunkList.length > 0) {
                let processedChunks = 0;
                for (const chunkInfo of metadata.chunkList) {
                  const chunkKey = chunkInfo.filename;
                  this.logger.log("info", `Processing chunk: ${chunkKey}`);
                  downloadButton.textContent = `Chunk ${processedChunks + 1}/${
                    metadata.chunkList.length
                  }`;
                  try {
                    const chunkJsonData =
                      await this.backupService.restoreFromZipBackup(
                        chunkKey,
                        this.cryptoService
                      );
                    const chunkJsonFilename = chunkKey.replace(".zip", ".json");
                    finalZip.file(
                      chunkJsonFilename,
                      JSON.stringify(chunkJsonData, null, 2)
                    );
                    this.logger.log(
                      "success",
                      `Added chunk ${chunkKey} to zip.`
                    );
                  } catch (chunkError) {
                    this.logger.log(
                      "error",
                      `Failed to process chunk ${chunkKey}`,
                      chunkError
                    );
                    finalZip.file(
                      `${chunkKey}.error.txt`,
                      `Failed to process this chunk: ${chunkError.message}`
                    );
                  }
                  processedChunks++;
                }
              }

              downloadButton.textContent = "Zipping...";
              const zipBlob = await finalZip.generateAsync({ type: "blob" });
              const finalZipFilename = key.replace(
                "-metadata.json",
                "-decrypted-package.zip"
              );
              this.downloadFile(finalZipFilename, zipBlob);
              downloadButton.textContent = "Downloaded!";
            } else {
              const backup = await this.s3Service.downloadRaw(key);
              if (backup) {
                await this.handleBackupDownload(backup, key);
                downloadButton.textContent = "Downloaded!";
              }
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
              const success = await this.backupService.restoreFromBackup(
                key,
                this.cryptoService
              );
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
          const JSZip = await this.backupService.loadJSZip();
          try {
            this.logger.log("info", "Attempting to download as V3 backup.");
            const decryptedZipBytes = await this.cryptoService.decryptBytes(
              backupData
            );
            const zip = await JSZip.loadAsync(decryptedZipBytes);
            const jsonFile = Object.keys(zip.files).find((f) =>
              f.endsWith(".json")
            );
            if (!jsonFile)
              throw new Error("No JSON file found in V3 ZIP backup");
            const jsonContent = await zip.file(jsonFile).async("string");
            content = JSON.stringify(JSON.parse(jsonContent), null, 2);
          } catch (v3Error) {
            this.logger.log(
              "warn",
              "V3 download failed, trying V2 format.",
              v3Error.message
            );
            const zip = await JSZip.loadAsync(backupData);
            const jsonFile = Object.keys(zip.files).find((f) =>
              f.endsWith(".json")
            );
            if (!jsonFile)
              throw new Error("No JSON file found in V2 ZIP backup");
            const encryptedJsonString = await zip
              .file(jsonFile)
              .async("string");
            const parsedData = JSON.parse(encryptedJsonString);
            if (!parsedData.iv || !parsedData.encrypted) {
              throw new Error("Invalid V2 legacy backup format.");
            }
            const encryptionKey = this.config.get("encryptionKey");
            const cryptoKey = await this.cryptoService.deriveKey(encryptionKey);
            const iv = Uint8Array.from(atob(parsedData.iv), (c) =>
              c.charCodeAt(0)
            );
            const encrypted = Uint8Array.from(atob(parsedData.encrypted), (c) =>
              c.charCodeAt(0)
            );
            const decrypted = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv },
              cryptoKey,
              encrypted
            );
            const decryptedJson = JSON.parse(
              new TextDecoder().decode(decrypted)
            );
            content = JSON.stringify(decryptedJson, null, 2);
          }
        } else if (
          key.startsWith("s-") ||
          key.startsWith("typingmind-backup-")
        ) {
          try {
            const decryptedContent = await this.cryptoService.decrypt(
              backupData
            );
            content = JSON.stringify(decryptedContent, null, 2);
          } catch (decryptError) {
            this.logger.log(
              "warn",
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
              this.logger.log(
                "warn",
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
        this.logger.log(
          "error",
          "Failed to process backup for download, providing raw file.",
          error.message
        );
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
    async loadSyncDiagnostics(modal) {
      const diagnosticsBody = modal.querySelector("#sync-diagnostics-body");
      if (!diagnosticsBody) return;
      const overallStatusEl = modal.querySelector("#sync-overall-status");
      const summaryEl = modal.querySelector("#sync-diagnostics-summary");

      const setContent = (html) => {
        diagnosticsBody.innerHTML = html;
      };

      if (!this.config.isConfigured()) {
        setContent(
          '<tr><td colspan="3" class="text-center py-2 text-zinc-500">AWS Not Configured</td></tr>'
        );
        if (overallStatusEl) overallStatusEl.textContent = "⚙️";
        if (summaryEl) summaryEl.textContent = "Setup required";
        return;
      }

      if (overallStatusEl) {
        overallStatusEl.textContent = "🔄";
      }

      try {
        // Get local items count
        const localItems = await this.dataService.getAllItems();
        const localCount = localItems.length;
        const chatItems = localItems.filter((item) =>
          item.id.startsWith("CHAT_")
        ).length;
        const otherItems = localCount - chatItems;

        // Get metadata count
        const metadataCount = Object.keys(
          this.syncOrchestrator.metadata.items || {}
        ).length;
        const metadataDeleted = Object.values(
          this.syncOrchestrator.metadata.items || {}
        ).filter((item) => item.deleted).length;
        const metadataActive = metadataCount - metadataDeleted;

        // Get cloud metadata
        const cloudMetadata = await this.syncOrchestrator.getCloudMetadata();
        const cloudCount = Object.keys(cloudMetadata.items || {}).length;
        const cloudDeleted = Object.values(cloudMetadata.items || {}).filter(
          (item) => item.deleted
        ).length;
        const cloudActive = cloudCount - cloudDeleted;

        // Get sync timestamps
        const localLastSync = localStorage.getItem("tcs_last-cloud-sync");
        const cloudLastSync = cloudMetadata.lastSync || 0;
        const hasCloudChanges = cloudLastSync > parseInt(localLastSync || "0");

        // Get cloud chat items count
        const cloudChatItems = Object.keys(cloudMetadata.items || {}).filter(
          (id) => id.startsWith("CHAT_") && !cloudMetadata.items[id].deleted
        ).length;

        // Generate table rows
        const rows = [
          {
            type: "📱 Local Items",
            count: localCount,
            status: localCount > 0 ? "✅" : "⚠️",
          },
          {
            type: "💬 Chat Sync",
            count: `${chatItems} ⟷ ${cloudChatItems}`,
            status: chatItems === cloudChatItems ? "✅" : "⚠️",
          },
          {
            type: "📋 Local Metadata",
            count: metadataActive,
            status: metadataActive === localCount ? "✅" : "⚠️",
          },
          {
            type: "☁️ Cloud Items",
            count: cloudActive,
            status: cloudActive > 0 ? "✅" : "⚠️",
          },
          {
            type: "🔄 Sync Status",
            count: hasCloudChanges ? "Pending" : "Current",
            status: hasCloudChanges ? "🟡" : "✅",
          },
        ];

        const tableHTML = rows
          .map(
            (row) => `
          <tr class="border-b border-zinc-700 hover:bg-zinc-700/30">
            <td class="py-1 px-2">${row.type}</td>
            <td class="text-right py-1 px-2">${row.count}</td>
            <td class="text-center py-1 px-2">${row.status}</td>
          </tr>
        `
          )
          .join("");

        // Calculate overall status
        const hasIssues =
          localCount !== metadataActive ||
          localCount !== cloudActive ||
          chatItems !== cloudChatItems;
        const overallStatus = hasIssues ? "⚠️" : "✅";
        const summaryText = hasIssues ? "Issues detected" : "All systems OK";

        // Update header status
        if (overallStatusEl) overallStatusEl.textContent = overallStatus;
        if (summaryEl) summaryEl.textContent = summaryText;

        // Add warning row if there are mismatches
        let warningRow = "";
        if (hasIssues) {
          warningRow = `
            <tr class="bg-orange-900/20 border-b border-orange-600">
              <td class="py-1 px-2 text-orange-300">⚠️ Mismatch Detected</td>
              <td class="text-right py-1 px-2 text-orange-300">Check README</td>
              <td class="text-center py-1 px-2">🔧</td>
            </tr>
          `;
        }

        setContent(tableHTML + warningRow);
      } catch (error) {
        console.error("Failed to load sync diagnostics:", error);
        if (diagnosticsBody) {
          setContent(
            '<tr><td colspan="3" class="text-center py-2 text-red-400">Error loading diagnostics</td></tr>'
          );
        }
        if (overallStatusEl) overallStatusEl.textContent = "❌";
        if (summaryEl) summaryEl.textContent = "Error";
      }
    }
    setupDiagnosticsToggle(modal) {
      const header = modal.querySelector("#sync-diagnostics-header");
      const content = modal.querySelector("#sync-diagnostics-content");
      const chevron = modal.querySelector("#sync-diagnostics-chevron");

      if (!header || !content || !chevron) return;

      const setVisibility = (expanded) => {
        if (expanded) {
          content.classList.remove("hidden");
          chevron.style.transform = "rotate(180deg)";
        } else {
          content.classList.add("hidden");
          chevron.style.transform = "rotate(0deg)";
        }
      };

      setVisibility(this.diagnosticsExpanded);

      const toggleDiagnostics = () => {
        this.diagnosticsExpanded = !this.diagnosticsExpanded;
        setVisibility(this.diagnosticsExpanded);
      };

      const clickHandler = toggleDiagnostics;
      const touchHandler = (e) => {
        e.preventDefault();
        toggleDiagnostics();
      };

      header.addEventListener("click", clickHandler);
      header.addEventListener("touchend", touchHandler);

      // Add cleanup callback
      this.modalCleanupCallbacks.push(() => {
        if (header) {
          header.removeEventListener("click", clickHandler);
          header.removeEventListener("touchend", touchHandler);
        }
      });
    }
    closeModal(overlay) {
      if (this.diagnosticsInterval) {
        clearInterval(this.diagnosticsInterval);
        this.diagnosticsInterval = null;
      }
      this.diagnosticsExpanded = false;
      this.modalCleanupCallbacks.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          this.logger.log(
            "warning",
            "Error during modal cleanup",
            error.message
          );
        }
      });
      this.modalCleanupCallbacks = [];
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
      this.config.reloadExclusions();
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
      const saveButton = document.getElementById("save-settings");
      const actionMsg = document.getElementById("action-msg");
      saveButton.disabled = true;
      saveButton.textContent = "Verifying...";
      actionMsg.textContent = "Verifying AWS credentials...";
      actionMsg.style.color = "#3b82f6";
      try {
        const tempConfigManager = {
          config: { ...this.config.config, ...newConfig },
          get: function (key) {
            return this.config[key];
          },
          isConfigured: () => true,
        };
        const tempS3Service = new S3Service(
          tempConfigManager,
          this.cryptoService,
          this.logger
        );
        await tempS3Service.initialize();
        await tempS3Service.list("");
        actionMsg.textContent =
          "✅ Credentials verified! Saving configuration...";
        actionMsg.style.color = "#22c55e";
        Object.keys(newConfig).forEach((key) =>
          this.config.set(key, newConfig[key])
        );
        this.config.save();
        if (!this.noSyncMode) {
          this.operationQueue.add(
            "save-and-sync",
            async () => {
              await this.s3Service.initialize();
              await this.syncOrchestrator.performFullSync();
              this.startAutoSync();
              this.updateSyncStatus("success");
              this.logger.log(
                "success",
                "Configuration saved and sync completed"
              );
            },
            "high"
          );
        } else {
          this.operationQueue.add(
            "save-config-nosync",
            async () => {
              await this.s3Service.initialize();
              this.logger.log(
                "success",
                "Configuration saved (NoSync mode - only snapshot available)"
              );
            },
            "high"
          );
        }
        setTimeout(() => {
          this.closeModal(overlay);
        }, 1500);
      } catch (error) {
        this.logger.log("error", "AWS credential verification failed", error);
        let errorMessage =
          "Verification failed. Please check your credentials and bucket permissions.";
        if (error.code === "NoSuchBucket") {
          errorMessage =
            "Verification failed: The specified bucket does not exist.";
        } else if (
          error.code === "InvalidAccessKeyId" ||
          error.code === "SignatureDoesNotMatch"
        ) {
          errorMessage =
            "Verification failed: Invalid Access Key or Secret Key.";
        } else if (error.code === "AccessDenied") {
          errorMessage =
            "Verification failed: Access Denied. Ensure the key has permissions to list the bucket.";
        }
        actionMsg.textContent = `❌ ${errorMessage}`;
        actionMsg.style.color = "#ef4444";
        saveButton.disabled = false;
        saveButton.textContent = "Save";
      }
    }
    async createSnapshot() {
      if (!this.isSnapshotAvailable()) {
        alert(
          "⚠️ Snapshot Unavailable\n\nSnapshots require AWS configuration. Please configure the following mandatory fields:\n• AWS Bucket Name\n• AWS Region\n• AWS Access Key\n• AWS Secret Key\n• Encryption Key"
        );
        return;
      }

      const name = prompt("Enter snapshot name:");
      if (!name) return;

      const modal = document.querySelector(".cloud-sync-modal");
      const snapshotButton = modal?.querySelector("#create-snapshot");

      if (snapshotButton) {
        const originalText = snapshotButton.textContent;
        snapshotButton.disabled = true;
        snapshotButton.textContent = "In Progress...";

        try {
          await this.backupService.createSnapshot(name);
          snapshotButton.textContent = "Success!";

          await this.loadBackupList(modal);

          setTimeout(() => {
            snapshotButton.textContent = originalText;
            snapshotButton.disabled = false;
          }, 2000);

          alert("Snapshot created successfully!");
        } catch (error) {
          this.logger.log("error", "Failed to create snapshot", error.message);
          snapshotButton.textContent = "Failed";
          setTimeout(() => {
            snapshotButton.textContent = originalText;
            snapshotButton.disabled = false;
          }, 2000);
          alert("Failed to create snapshot: " + error.message);
        }
      } else {
        try {
          await this.backupService.createSnapshot(name);
          alert("Snapshot created successfully!");
        } catch (error) {
          this.logger.log("error", "Failed to create snapshot", error.message);
          alert("Failed to create snapshot: " + error.message);
        }
      }
    }
    async performV2toV3Migration() {
      const localMigrationFlag = "tcs_localMigrated";
      if (localStorage.getItem(localMigrationFlag) === "true") {
        //this.logger.log(
        //  "info",
        //  "Local V2 to V3 migration already completed, skipping"
        //);
        return;
      }
      const v2Keys = [
        "aws-bucket",
        "aws-access-key",
        "aws-secret-key",
        "aws-region",
        "aws-endpoint",
        "encryption-key",
        "sync-interval",
        "chat-sync-metadata",
        "last-cloud-sync",
        "sync-mode",
      ];
      const hasV2Keys = v2Keys.some(
        (key) => localStorage.getItem(key) !== null
      );
      if (!hasV2Keys) {
        this.logger.log(
          "info",
          "No v2 keys found, skipping migration (new V3 installation)"
        );
        localStorage.setItem(localMigrationFlag, "true");
        return;
      }
      this.logger.log("start", "V2 keys detected, starting V2 to V3 migration");
      try {
        await this.migrateStorageKeys();
        this.config.config = this.config.loadConfig();
        this.logger.log("info", "Reloaded configuration with migrated keys");
        await this.cleanupAndFreshSync();
        localStorage.setItem(localMigrationFlag, "true");
        this.logger.log("success", "V2 to V3 migration completed successfully");
      } catch (error) {
        this.logger.log("error", "V2 to V3 migration failed", error.message);
      }
    }

    async migrateStorageKeys() {
      this.logger.log("info", "Migrating v2 storage keys to V3 format");
      const oldToNewKeyMap = {
        "aws-bucket": "tcs_aws_bucketname",
        "aws-access-key": "tcs_aws_accesskey",
        "aws-secret-key": "tcs_aws_secretkey",
        "aws-region": "tcs_aws_region",
        "aws-endpoint": "tcs_aws_endpoint",
        "encryption-key": "tcs_encryptionkey",
        "sync-interval": "tcs_syncinterval",
      };
      const migrationBackup = {};
      let migratedCount = 0;
      Object.entries(oldToNewKeyMap).forEach(([oldKey, newKey]) => {
        const value = localStorage.getItem(oldKey);
        if (value) {
          migrationBackup[oldKey] = value;
          localStorage.setItem(newKey, value);
          migratedCount++;
          this.logger.log("info", `Migrated ${oldKey} → ${newKey}`);
        }
      });
      if (migratedCount > 0) {
        localStorage.setItem(
          "tcs_migrationBackup",
          JSON.stringify(migrationBackup)
        );
        this.logger.log(
          "success",
          `Successfully migrated ${migratedCount} configuration keys`
        );
      } else {
        this.logger.log("info", "No v2 configuration keys found to migrate");
      }
    }

    async cleanupAndFreshSync() {
      this.logger.log("info", "Cleaning up v2 metadata and obsolete keys");
      const keysToRemove = [
        "chat-sync-metadata",
        "last-cloud-sync",
        "last-daily-backup",
        "sync-mode",
        "sync-exclusions",
        "aws-bucket",
        "aws-access-key",
        "aws-secret-key",
        "aws-region",
        "aws-endpoint",
        "encryption-key",
        "sync-interval",
      ];
      let removedCount = 0;
      keysToRemove.forEach((key) => {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          removedCount++;
        }
      });
      if (removedCount > 0) {
        this.logger.log(
          "success",
          `Cleaned up ${removedCount} obsolete keys from localStorage`
        );
      }
      if (this.config.isConfigured()) {
        try {
          await this.s3Service.initialize();
          const needsCloudCleanup = await this.checkIfCloudNeedsV2Cleanup();
          if (!needsCloudCleanup) {
            this.logger.log(
              "info",
              "Cloud already in V3 format or clean, skipping cloud cleanup"
            );
            await this.syncOrchestrator.performFullSync();
            return;
          }
          this.logger.log(
            "info",
            "V2 data detected in cloud, performing cleanup and fresh sync"
          );
          try {
            await this.s3Service.delete("metadata.json");
            this.logger.log("info", "Removed old cloud metadata.json");
          } catch (error) {
            if (error.code !== "NoSuchKey" && error.statusCode !== 404) {
              this.logger.log(
                "warning",
                "Failed to delete old metadata.json",
                error.message
              );
            }
          }
          try {
            const items = await this.s3Service.list("items/");
            if (items.length > 0) {
              const deletePromises = items.map((item) =>
                this.s3Service.delete(item.Key)
              );
              await Promise.allSettled(deletePromises);
              this.logger.log(
                "success",
                `Cleaned up ${items.length} items from cloud`
              );
            }
          } catch (error) {
            this.logger.log(
              "warning",
              "Failed to clean items folder",
              error.message
            );
          }
          const v2Folders = ["chats/", "settings/"];
          for (const folder of v2Folders) {
            try {
              const folderItems = await this.s3Service.list(folder);
              if (folderItems.length > 0) {
                const deletePromises = folderItems.map((item) =>
                  this.s3Service.delete(item.Key)
                );
                await Promise.allSettled(deletePromises);
                this.logger.log(
                  "success",
                  `Cleaned up ${folderItems.length} items from ${folder}`
                );
              }
            } catch (error) {
              this.logger.log(
                "warning",
                `Failed to clean ${folder}`,
                error.message
              );
            }
          }
          this.logger.log("info", "Performing fresh initial sync");
          await this.syncOrchestrator.createInitialSync();
          this.logger.log("success", "Fresh sync completed successfully");
        } catch (error) {
          this.logger.log(
            "warning",
            "Cloud cleanup had issues, but migration will continue",
            error.message
          );
        }
      } else {
        this.logger.log("info", "AWS not configured, skipping cloud cleanup");
      }
    }
    async checkIfCloudNeedsV2Cleanup() {
      try {
        const v2Folders = ["chats/", "settings/"];
        for (const folder of v2Folders) {
          const items = await this.s3Service.list(folder);
          if (items.length > 0) {
            this.logger.log("info", `Found V2 data in ${folder}`);
            return true;
          }
        }
        try {
          const metadata = await this.s3Service.download("metadata.json", true);
          if (
            metadata &&
            metadata.chats &&
            typeof metadata.chats === "object"
          ) {
            this.logger.log("info", "Found V2 metadata.json format");
            return true;
          }
        } catch (error) {
          if (error.code !== "NoSuchKey" && error.statusCode !== 404) {
            this.logger.log(
              "warning",
              "Error checking metadata.json",
              error.message
            );
          }
        }
        this.logger.log("info", "No V2 data found in cloud");
        return false;
      } catch (error) {
        this.logger.log(
          "warning",
          "Error checking for V2 cloud data",
          error.message
        );
        return false;
      }
    }
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);

      const interval = Math.max(this.config.get("syncInterval") * 1000, 15000);

      this.autoSyncInterval = setInterval(async () => {
        if (
          this.config.isConfigured() &&
          !this.syncOrchestrator.syncInProgress
        ) {
          try {
            await this.syncOrchestrator.performFullSync();
          } catch (error) {
            this.logger.log("error", "Auto-sync failed", error.message);
          }
        }
      }, interval);

      this.logger.log("info", "Auto-sync started");
    }
    cleanupOldTombstones() {
      const now = Date.now();
      const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
      let cleanupCount = 0;

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("tcs_tombstone_")) {
          try {
            const tombstone = JSON.parse(localStorage.getItem(key));
            if (
              tombstone.deleted &&
              now - tombstone.deleted > tombstoneRetentionPeriod
            ) {
              localStorage.removeItem(key);
              cleanupCount++;
            }
          } catch {
            localStorage.removeItem(key);
            cleanupCount++;
          }
        }
      }

      for (const [itemId, metadata] of Object.entries(this.metadata.items)) {
        if (
          metadata.deleted &&
          now - metadata.deleted > tombstoneRetentionPeriod
        ) {
          delete this.metadata.items[itemId];
          cleanupCount++;
        }
      }

      if (cleanupCount > 0) {
        this.saveMetadata();
        this.logger.log("info", `🧹 Cleaned up ${cleanupCount} old tombstones`);
      }

      return cleanupCount;
    }
    async getCloudMetadata() {
      try {
        const cloudMetadata = await this.s3Service.download(
          "metadata.json",
          true
        );
        if (!cloudMetadata || typeof cloudMetadata !== "object") {
          return { lastSync: 0, items: {} };
        }
        if (!cloudMetadata.items) {
          cloudMetadata.items = {};
        }
        return cloudMetadata;
      } catch (error) {
        if (error.code === "NoSuchKey" || error.statusCode === 404) {
          return { lastSync: 0, items: {} };
        }
        throw error;
      }
    }
    cleanup() {
      this.logger.log("info", "🧹 Starting comprehensive cleanup");

      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }

      this.modalCleanupCallbacks.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn("Modal cleanup error:", error);
        }
      });
      this.modalCleanupCallbacks = [];

      this.eventListeners.forEach(({ element, event, handler }) => {
        try {
          element.removeEventListener(event, handler);
        } catch (error) {
          console.warn("Event listener cleanup error:", error);
        }
      });
      this.eventListeners = [];

      const existingModal = document.querySelector(".cloud-sync-modal");
      if (existingModal) {
        existingModal.closest(".modal-overlay")?.remove();
      }

      if (this.operationQueue) {
        this.operationQueue.cleanup();
      }

      if (this.dataService) {
        this.dataService.cleanup();
      }

      if (this.cryptoService) {
        this.cryptoService.cleanup();
      }

      if (this.syncOrchestrator) {
        this.syncOrchestrator.cleanup();
      }

      this.logger.log("success", "✅ Cleanup completed");
      this.config = null;
      this.dataService = null;
      this.cryptoService = null;
      this.s3Service = null;
      this.syncOrchestrator = null;
      this.backupService = null;
      this.operationQueue = null;
      this.logger = null;
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
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      overflow-y: auto;
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
      width: 100%;
      max-width: 32rem;
      background-color: rgb(39, 39, 42);
      color: white;
      border-radius: 0.5rem;
      padding: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
    }
    
    .cloud-sync-modal input,
    .cloud-sync-modal select {
      background-color: rgb(63, 63, 70);
      border: 1px solid rgb(82, 82, 91);
      color: white;
    }
    
    .cloud-sync-modal input:focus,
    .cloud-sync-modal select:focus {
      border-color: rgb(59, 130, 246);
      outline: none;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
    .cloud-sync-modal button:disabled {
      background-color: rgb(82, 82, 91);
      cursor: not-allowed;
      opacity: 0.5;
    }
    
    .cloud-sync-modal .bg-zinc-800 {
      border: 1px solid rgb(82, 82, 91);
    }
    
    .cloud-sync-modal input[type="checkbox"] {
      accent-color: rgb(59, 130, 246);
    }
    
    .cloud-sync-modal input[type="checkbox"]:checked {
      background-color: rgb(59, 130, 246);
      border-color: rgb(59, 130, 246);
    }
    
    #sync-diagnostics-table {
      font-size: 0.75rem;
    }
    
    #sync-diagnostics-table th {
      background-color: rgb(82, 82, 91);
      font-weight: 600;
    }
    
    #sync-diagnostics-table tr:hover {
      background-color: rgba(63, 63, 70, 0.5);
    }
    
    #sync-diagnostics-table .bg-orange-900\/20 {
      background-color: rgba(194, 65, 12, 0.2);
    }
    
    #sync-diagnostics-header {
      padding: 0.5rem;
      margin: -0.5rem;
      border-radius: 0.375rem;
      transition: background-color 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      min-height: 44px;
      display: flex;
      align-items: center;
    }
    
    #sync-diagnostics-header:hover {
      background-color: rgba(63, 63, 70, 0.5);
    }
    
    #sync-diagnostics-header:active {
      background-color: rgba(63, 63, 70, 0.8);
    }
    
    #sync-diagnostics-chevron {
      transition: transform 0.2s ease;
    }
    
    #sync-diagnostics-content {
      animation: slideDown 0.2s ease-out;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        max-height: 0;
      }
      to {
        opacity: 1;
        max-height: 300px;
      }
    }
    
    @media (max-width: 640px) {
      #sync-diagnostics-table {
        font-size: 0.7rem;
      }
      
      #sync-diagnostics-table th,
      #sync-diagnostics-table td {
        padding: 0.5rem 0.25rem;
      }
      
      .cloud-sync-modal {
        margin: 0.5rem;
        max-height: 90vh;
        overflow-y: auto;
      }
    }
  `;
  document.head.appendChild(styleSheet);

  const app = new CloudSyncApp();
  app.initialize();
  window.cloudSyncApp = app;

  const cleanupHandler = () => {
    if (app && app.cleanup) {
      try {
        app.cleanup();
      } catch (error) {
        console.warn("Cleanup error:", error);
      }
    }
  };

  window.addEventListener("beforeunload", cleanupHandler);
  window.addEventListener("unload", cleanupHandler);
  window.addEventListener("pagehide", cleanupHandler);

  window.createTombstone = (itemId, type, source = "manual") => {
    if (app && app.dataService) {
      return app.dataService.createTombstone(itemId, type, source);
    }
    return null;
  };

  window.getTombstones = () => {
    if (app && app.dataService) {
      return Array.from(app.dataService.getAllTombstones().entries());
    }
    return [];
  };

  window.getMemoryStats = () => {
    if (app) {
      return {
        knownItems: app.dataService?.knownItems?.size || 0,
        operationQueue: app.operationQueue?.size() || 0,
        eventListeners: app.eventListeners?.length || 0,
        modalCallbacks: app.modalCleanupCallbacks?.length || 0,
      };
    }
    return {};
  };

  window.estimateBackupSize = async () => {
    if (app && app.backupService) {
      const size = await app.backupService.estimateDataSize();
      const chunkLimit = app.backupService.chunkSizeLimit;
      const willUseChunks = size > chunkLimit;
      return {
        estimatedSize: size,
        formattedSize: app.backupService.formatFileSize(size),
        chunkLimit: chunkLimit,
        formattedChunkLimit: app.backupService.formatFileSize(chunkLimit),
        willUseChunks: willUseChunks,
        backupMethod: willUseChunks ? "chunked" : "simple",
        compressionNote:
          "Size shown is before ZIP compression (expect ~70% reduction)",
      };
    }
    return { error: "Backup service not available" };
  };
}

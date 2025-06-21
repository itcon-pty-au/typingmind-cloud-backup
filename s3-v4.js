/*TypingMind Cloud Sync v4 by ITCON, AU
-------------------------
Features:
- Extensible provider architecture (S3, Google Drive, etc.)
- Sync typingmind database with a cloud storage provider
- Snapshots on demand
- Automatic daily backups
- Backup management in Extension config UI
- Detailed logging in console
- Memory-efficient data processing
*/
if (window.typingMindCloudSync) {
  console.log("TypingMind Cloud Sync already loaded");
} else {
  window.typingMindCloudSync = true;

  /**
   * A generic async retry utility with exponential backoff.
   * @param {Function} operation - The async function to execute.
   * @param {object} options - Configuration for the retry logic.
   * @param {number} [options.maxRetries=3] - Maximum number of retries.
   * @param {number} [options.delay=1000] - Initial delay in ms.
   * @param {Function} [options.isRetryable] - A function that takes an error and returns true if it should be retried.
   * @param {Function} [options.onRetry] - A function called before a retry attempt.
   */
  async function retryAsync(operation, options = {}) {
    const {
      maxRetries = 3,
      delay = 1000,
      isRetryable = () => true,
      onRetry = () => {},
    } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries || !isRetryable(error)) {
          throw error;
        }
        const retryDelay = Math.min(
          delay * Math.pow(2, attempt) + Math.random() * 1000,
          30000
        );
        onRetry(error, attempt + 1, retryDelay);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
    throw lastError;
  }

  class ConfigManager {
    constructor() {
      this.PEPPER = "tcs-v3-pepper-!@#$%^&*()";
      this.config = this.loadConfig();
      this.exclusions = this.loadExclusions();
    }
    _obfuscate(str, key) {
      if (!str || !key) return str;
      const combinedKey = key + this.PEPPER;
      let output = "";
      for (let i = 0; i < str.length; i++) {
        const charCode =
          str.charCodeAt(i) ^ combinedKey.charCodeAt(i % combinedKey.length);
        output += String.fromCharCode(charCode);
      }
      return btoa(output);
    }
    _deobfuscate(b64str, key) {
      if (!b64str || !key) return b64str;
      const combinedKey = key + this.PEPPER;
      let output = "";
      const decodedStr = atob(b64str);
      for (let i = 0; i < decodedStr.length; i++) {
        const charCode =
          decodedStr.charCodeAt(i) ^
          combinedKey.charCodeAt(i % combinedKey.length);
        output += String.fromCharCode(charCode);
      }
      return output;
    }
    loadConfig() {
      const defaults = {
        storageType: "s3",
        syncInterval: 15,
        bucketName: "",
        region: "",
        accessKey: "",
        secretKey: "",
        endpoint: "",
        encryptionKey: "",
        googleClientId: "",
      };
      const stored = {};
      const encryptionKey = localStorage.getItem("tcs_encryptionkey") || "";

      const keyMap = {
        storageType: "tcs_storagetype",
        syncInterval: "tcs_aws_syncinterval",
        bucketName: "tcs_aws_bucketname",
        region: "tcs_aws_region",
        accessKey: "tcs_aws_accesskey",
        secretKey: "tcs_aws_secretkey",
        endpoint: "tcs_aws_endpoint",
        encryptionKey: "tcs_encryptionkey",
        googleClientId: "tcs_google_clientid",
      };

      Object.keys(defaults).forEach((key) => {
        const storageKey = keyMap[key];
        if (!storageKey) return;

        let value = localStorage.getItem(storageKey);
        if (
          (key === "accessKey" || key === "secretKey") &&
          value?.startsWith("enc::")
        ) {
          if (encryptionKey) {
            try {
              value = this._deobfuscate(value.substring(5), encryptionKey);
            } catch (e) {
              console.warn(
                `[TCS] Could not decrypt key "${key}". It might be corrupted or the encryption key is wrong.`
              );
            }
          } else {
            console.warn(
              `[TCS] Found encrypted key "${key}" but no encryption key is configured.`
            );
          }
        }

        if (value !== null) {
          stored[key] = key === "syncInterval" ? parseInt(value) || 15 : value;
        }
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
        "tcs_storagetype",
        "tcs_aws_bucketname",
        "tcs_aws_accesskey",
        "tcs_aws_secretkey",
        "tcs_aws_region",
        "tcs_aws_endpoint",
        "tcs_google_clientid",
        "tcs_google_access_token",
        "tcs_google_token_expiry",
        "gsi_client_id",
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
      const encryptionKey = this.config.encryptionKey;
      const keyMap = {
        storageType: "tcs_storagetype",
        syncInterval: "tcs_aws_syncinterval",
        bucketName: "tcs_aws_bucketname",
        region: "tcs_aws_region",
        accessKey: "tcs_aws_accesskey",
        secretKey: "tcs_aws_secretkey",
        endpoint: "tcs_aws_endpoint",
        encryptionKey: "tcs_encryptionkey",
        googleClientId: "tcs_google_clientid",
      };

      Object.keys(this.config).forEach((key) => {
        const storageKey = keyMap[key];
        if (!storageKey) return;

        let valueToStore = this.config[key]?.toString() || "";

        if (
          (key === "accessKey" || key === "secretKey") &&
          valueToStore &&
          encryptionKey
        ) {
          valueToStore = "enc::" + this._obfuscate(valueToStore, encryptionKey);
        }
        localStorage.setItem(storageKey, valueToStore);
      });
    }
    shouldExclude(key) {
      return (
        this.exclusions.includes(key) ||
        key.startsWith("tcs_") ||
        key.startsWith("gsi_") ||
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
      script.src = "https://cdn.jsdelivr.net/npm/eruda@3.0.1/eruda.min.js";
      script.onload = () => {
        window.eruda?.init();
      };
      document.head.appendChild(script);
    }
    destroyEruda() {
      window.eruda?.destroy();
      document.getElementById("eruda-script")?.remove();
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
      this.streamBatchSize = 1000;
      this.memoryThreshold = 100 * 1024 * 1024;
      this.throttleDelay = 10;
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
    async estimateDataSize() {
      let totalSize = 0;
      let itemCount = 0;
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
              try {
                const itemSize = JSON.stringify(value).length * 2;
                totalSize += itemSize;
                itemCount++;
              } catch (e) {
                this.logger.log("warning", `Error estimating size for ${key}`);
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
          const value = localStorage.getItem(key);
          if (value !== null) {
            totalSize += value.length * 2;
            itemCount++;
          }
        }
      }
      return { totalSize, itemCount };
    }
    async *streamAllItems() {
      const batchSize = this.streamBatchSize;
      let batch = [];
      let batchSize_bytes = 0;
      const processItem = (item) => {
        const estimatedSize = this.estimateItemSize(item.data);
        if (
          batchSize_bytes + estimatedSize > this.memoryThreshold &&
          batch.length > 0
        ) {
          const currentBatch = [...batch];
          batch = [item];
          batchSize_bytes = estimatedSize;
          return currentBatch;
        }
        batch.push(item);
        batchSize_bytes += estimatedSize;
        if (batch.length >= batchSize) {
          const currentBatch = [...batch];
          batch = [];
          batchSize_bytes = 0;
          return currentBatch;
        }
        return null;
      };
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
              const item = { id: key, data: value, type: "idb" };
              const batchToYield = processItem(item);
              if (batchToYield) {
                this.streamYield(batchToYield);
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
          const value = localStorage.getItem(key);
          if (value !== null) {
            const item = { id: key, data: { key, value }, type: "ls" };
            const batchToYield = processItem(item);
            if (batchToYield) {
              yield batchToYield;
            }
          }
        }
      }
      if (batch.length > 0) {
        yield batch;
      }
    }
    streamYield = null;
    async *streamAllItemsInternal() {
      const batchSize = this.streamBatchSize;
      let batch = [];
      let batchSize_bytes = 0;
      let db = null;
      let transaction = null;
      let pendingBatches = [];
      let currentBatchIndex = 0;
      try {
        const processItem = (item) => {
          try {
            const estimatedSize = this.estimateItemSize(item.data);
            if (
              batchSize_bytes + estimatedSize > this.memoryThreshold &&
              batch.length > 0
            ) {
              const currentBatch = [...batch];
              batch = [item];
              batchSize_bytes = estimatedSize;
              return currentBatch;
            }
            batch.push(item);
            batchSize_bytes += estimatedSize;
            if (batch.length >= batchSize) {
              const currentBatch = [...batch];
              batch = [];
              batchSize_bytes = 0;
              return currentBatch;
            }
            return null;
          } catch (error) {
            this.logger.log(
              "warning",
              `Error processing item: ${error.message}`
            );
            return null;
          }
        };
        db = await this.getDB();
        transaction = db.transaction(["keyval"], "readonly");
        const store = transaction.objectStore("keyval");
        let idbProcessed = 0;
        await new Promise((resolve, reject) => {
          const request = store.openCursor();
          request.onsuccess = (event) => {
            try {
              const cursor = event.target.result;
              if (cursor) {
                const key = cursor.key;
                const value = cursor.value;
                if (
                  typeof key === "string" &&
                  value !== undefined &&
                  !this.config.shouldExclude(key)
                ) {
                  const item = { id: key, data: value, type: "idb" };
                  const batchToYield = processItem(item);
                  if (batchToYield) {
                    pendingBatches.push(batchToYield);
                    if (pendingBatches.length >= 10) {
                      this.logger.log(
                        "warning",
                        `Large number of pending batches (${pendingBatches.length}), potential memory issue`
                      );
                    }
                  }
                  idbProcessed++;
                  if (idbProcessed % 5000 === 0) {
                    this.logger.log(
                      "info",
                      `Processed ${idbProcessed} IndexedDB items`
                    );
                  }
                }
                cursor.continue();
              } else {
                resolve();
              }
            } catch (error) {
              this.logger.log(
                "error",
                `Error in cursor processing: ${error.message}`
              );
              reject(error);
            }
          };
          request.onerror = () => {
            this.logger.log("error", "IndexedDB cursor error");
            reject(request.error);
          };
        });
        for (let i = 0; i < pendingBatches.length; i++) {
          yield pendingBatches[i];
          pendingBatches[i] = null;
          currentBatchIndex = i + 1;
          if (i % 5 === 0) {
            await this.forceGarbageCollection();
          }
        }
        pendingBatches = null;
        let lsProcessed = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && !this.config.shouldExclude(key)) {
            const value = localStorage.getItem(key);
            if (value !== null) {
              const item = { id: key, data: { key, value }, type: "ls" };
              const batchToYield = processItem(item);
              if (batchToYield) {
                yield batchToYield;
                await this.forceGarbageCollection();
              }
              lsProcessed++;
              if (lsProcessed % 1000 === 0) {
                this.logger.log(
                  "info",
                  `Processed ${lsProcessed} localStorage items`
                );
              }
            }
          }
        }
        if (batch && batch.length > 0) {
          yield batch;
          await this.forceGarbageCollection();
        }
      } catch (error) {
        this.logger.log(
          "error",
          `Error in streamAllItemsInternal: ${error.message}`
        );
        throw error;
      } finally {
        try {
          if (pendingBatches) {
            for (let i = currentBatchIndex; i < pendingBatches.length; i++) {
              pendingBatches[i] = null;
            }
            pendingBatches = null;
          }
          batch = null;
          transaction = null;
          db = null;
          await this.forceGarbageCollection();
        } catch (cleanupError) {
          this.logger.log("warning", `Cleanup error: ${cleanupError.message}`);
        }
      }
    }
    async getAllItemsEfficient() {
      const { totalSize } = await this.estimateDataSize();
      if (totalSize > this.memoryThreshold) {
        this.logger.log(
          "info",
          `Large dataset detected (${this.formatSize(
            totalSize
          )}), using memory-efficient processing`
        );
        return this.streamAllItemsInternal();
      } else {
        this.logger.log(
          "info",
          `Small dataset (${this.formatSize(
            totalSize
          )}), using standard loading`
        );
        return [await this.getAllItems()];
      }
    }
    estimateItemSize(data) {
      if (typeof data === "string") return data.length * 2;
      if (data && typeof data === "object") {
        return Object.keys(data).length * 50;
      }
      return 1000;
    }
    formatSize(bytes) {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
    async forceGarbageCollection() {
      if (window?.gc) {
        window.gc();
      } else if (typeof global !== "undefined" && global?.gc) {
        global.gc();
      }
      await new Promise((resolve) => setTimeout(resolve, this.throttleDelay));
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
      });
      return Array.from(items.values());
    }
    async getAllItemKeys() {
      const itemKeys = new Set();
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
        const itemId = itemKey || item?.id;
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
      if (existingItem?.deleted) {
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
      this.operationQueue?.add(
        `tombstone-sync-${itemId}`,
        () => this.syncTombstone(itemId),
        "high"
      );
      return tombstone;
    }
    getTombstoneFromStorage(itemId) {
      try {
        const storageKey = `tcs_tombstone_${itemId}`;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const tombstone = JSON.parse(stored);
          return tombstone;
        } else {
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
        localStorage.setItem(storageKey, JSON.stringify(tombstone));
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
        if (key?.startsWith("tcs_tombstone_")) {
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
      if (window.cloudSyncApp?.syncOrchestrator) {
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
      this.logger?.log("info", "🧹 DataService cleanup starting");
      try {
        if (this.dbPromise) {
          this.dbPromise
            .then((db) => {
              if (db) {
                db.close();
                this.logger?.log("info", "✅ IndexedDB connection closed");
              }
            })
            .catch((error) => {
              this.logger?.log(
                "warning",
                `IndexedDB close error: ${error.message}`
              );
            });
        }
        this.dbPromise = null;
        this.streamYield = null;
        this.config = null;
        this.operationQueue = null;
        if (this.forceGarbageCollection) {
          this.forceGarbageCollection().catch(() => {});
        }
        this.logger?.log("success", "✅ DataService cleanup completed");
        this.logger = null;
      } catch (error) {
        console.warn("DataService cleanup error:", error);
      }
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
      this.logger?.log("info", "🧹 CryptoService cleanup starting");
      try {
        if (this.keyCache) {
          this.keyCache.clear();
        }
        this.keyCache = null;
        this.lastCacheCleanup = 0;
        this.config = null;
        this.logger?.log("success", "✅ CryptoService cleanup completed");
        this.logger = null;
      } catch (error) {
        console.warn("CryptoService cleanup error:", error);
      }
    }
  }
/*TypingMind Cloud Sync v4.2 by ITCON, AU
Edited by Enjoy for the attachment support
-------------------------
Features:
- Extensible provider architecture (S3, Google Drive, etc.)
- Sync typingmind database with a cloud storage provider
- Snapshots on demand
- Automatic daily backups
- Backup management in Extension config UI
- Detailed logging in console
- Memory-efficient data processing
- Attachment Sync and backup support (by Enjoy)
*/
// ===== TCS BUILD VERSION =====
const TCS_BUILD_VERSION = "2025-12-28.4";
console.log("[TCS] cloudsync-fixed.js build", TCS_BUILD_VERSION);
// =============================
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
        "tcs_autosync_enabled",
        "referrer",
        "TM_useLastVerifiedToken",
        "TM_useStateUpdateHistory",
        "INSTANCE_ID",
        "eruda-console",
        "TM_useExtensionURLs",
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
      const always =
        key.startsWith("tcs_") && !key.startsWith("tcs_tombstone_");
      return (
        this.exclusions.includes(key) ||
        always ||
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
      let excludedItemCount = 0;
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
            } else if (typeof key === "string") {
              excludedItemCount++;
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
        } else if (key) {
          excludedItemCount++;
        }
      }
      return { totalSize, itemCount, excludedItemCount };
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
          request.onsuccess = async (event) => {
            try {
              const cursor = event.target.result;
              if (cursor) {
                const key = cursor.key;
                const value = cursor.value;
                if (value instanceof Blob) {
                  const item = {
                    id:   key,
                    data: value,                 
                    type: "blob",
                    blobType: value.type,
                    size: value.size,
                  };
                  const batchToYield = processItem(item);
                  if (batchToYield) pendingBatches.push(batchToYield);
                  cursor.continue();
                  return;
                }

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
      if (data instanceof Blob) return data.size;          
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
      } else if (type === "blob") {
      const db = await this.getDB();
      const tx = db.transaction(["keyval"], "readonly");
      const store = tx.objectStore("keyval");
      return new Promise(res => {
          const req = store.get(itemId);
          req.onsuccess = () => res(req.result || null);
          req.onerror   = () => res(null);
      });
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
      } else if (type === "blob") {
        const blob = new Blob([item], {
          type: item.blobType || "application/octet-stream",
        });
        return this.saveItem(blob, "idb", itemKey);
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
      this.largeArrayKeys = ["TM_useUserCharacters"];
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
    _createJsonStreamForArray(array) {
      let i = 0;
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("["));
        },
        pull(controller) {
          if (i >= array.length) {
            controller.enqueue(encoder.encode("]"));
            controller.close();
            return;
          }

          try {
            const chunk = JSON.stringify(array[i]);
            if (i < array.length - 1) {
              controller.enqueue(encoder.encode(chunk + ","));
            } else {
              controller.enqueue(encoder.encode(chunk));
            }
            i++;
          } catch (e) {
            this.logger.log(
              "error",
              `Streaming serialization failed for element ${i}`,
              e
            );
            controller.error(e);
          }
        },
      });
    }
    async encrypt(data, key = null) {
      const encryptionKey = this.config.get("encryptionKey");
      if (!encryptionKey) throw new Error("No encryption key configured");

      const cryptoKey = await this.deriveKey(encryptionKey);
      let dataStream;

      if (key && this.largeArrayKeys.includes(key) && Array.isArray(data)) {
        this.logger.log(
          "info",
          `Using streaming serialization for large array: ${key}`
        );
        dataStream = this._createJsonStreamForArray(data);
      } else {
        const encodedData = new TextEncoder().encode(JSON.stringify(data));
        dataStream = new Blob([encodedData]).stream();
      }

      let processedStream = dataStream;
      try {
        if (window.CompressionStream) {
          processedStream = dataStream.pipeThrough(
            new CompressionStream("deflate-raw")
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

      const finalData = new Uint8Array(
        await new Response(processedStream).arrayBuffer()
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        finalData
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
  class IStorageProvider {
    constructor(configManager, cryptoService, logger) {
      if (this.constructor === IStorageProvider) {
        throw new Error("Cannot instantiate abstract class IStorageProvider.");
      }
      this.config = configManager;
      this.crypto = cryptoService;
      this.logger = logger;
    }

    static get displayName() {
      return "Unnamed Provider";
    }

    /**
     * Returns the HTML and event setup logic for this provider's config UI.
     * @returns {{html: string, setupEventListeners: function(HTMLElement, IStorageProvider, ConfigManager, Logger): void}}
     */
    static getConfigurationUI() {
      return {
        html: '<p class="text-zinc-400">This provider has no specific configuration.</p>',
        setupEventListeners: () => {},
      };
    }

    async delete(key) {
      throw new Error("Method 'delete()' must be implemented.");
    }

    async deleteFolder(folderPath) {
      throw new Error("Method 'deleteFolder()' must be implemented.");
    }

    isConfigured() {
      throw new Error("Method 'isConfigured()' must be implemented.");
    }

    async initialize() {
      throw new Error("Method 'initialize()' must be implemented.");
    }

    async handleAuthentication() {
      this.logger.log(
        "info",
        `${this.constructor.name} does not require interactive authentication.`
      );
      return Promise.resolve();
    }

    async upload(key, data, isMetadata = false) {
      throw new Error("Method 'upload()' must be implemented.");
    }

    async download(key, isMetadata = false) {
      throw new Error("Method 'download()' must be implemented.");
    }

    async delete(key) {
      throw new Error("Method 'delete()' must be implemented.");
    }

    async list(prefix = "") {
      throw new Error("Method 'list()' must be implemented.");
    }

    async downloadWithResponse(key) {
      throw new Error("Method 'downloadWithResponse()' must be implemented.");
    }

    async copyObject(sourceKey, destinationKey) {
      throw new Error("Method 'copyObject()' must be implemented.");
    }

    async verify() {
      this.logger.log(
        "info",
        `Verifying connection for ${this.constructor.name}...`
      );
      await this.list("");
      this.logger.log(
        "success",
        `Connection for ${this.constructor.name} verified.`
      );
    }

    async ensurePathExists(path) {
      throw new Error("Method 'ensurePathExists()' must be implemented.");
    }
  }

  class S3Service extends IStorageProvider {
    constructor(configManager, cryptoService, logger) {
      super(configManager, cryptoService, logger);
      this.client = null;
      this.sdkLoaded = false;
    }

    static get displayName() {
      return "Amazon S3 (or S3-Compatible)";
    }

    static getConfigurationUI() {
      const html = `
        <div class="space-y-2">
          <div class="flex space-x-4">
            <div class="w-2/3">
              <label for="aws-bucket" class="block text-sm font-medium text-zinc-300">Bucket Name <span class="text-red-400">*</span></label>
              <input id="aws-bucket" name="aws-bucket" type="text" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
            </div>
            <div class="w-1/3">
              <label for="aws-region" class="block text-sm font-medium text-zinc-300">Region <span class="text-red-400">*</span></label>
              <input id="aws-region" name="aws-region" type="text" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
            </div>
          </div>
          <div>
            <label for="aws-access-key" class="block text-sm font-medium text-zinc-300">Access Key <span class="text-red-400">*</span></label>
            <input id="aws-access-key" name="aws-access-key" type="password" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
          </div>
          <div>
            <label for="aws-secret-key" class="block text-sm font-medium text-zinc-300">Secret Key <span class="text-red-400">*</span></label>
            <input id="aws-secret-key" name="aws-secret-key" type="password" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
          </div>
          <div>
            <label for="aws-endpoint" class="block text-sm font-medium text-zinc-300">S3 Compatible Storage Endpoint</label>
            <input id="aws-endpoint" name="aws-endpoint" type="text" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off">
          </div>
        </div>
      `;

      const setupEventListeners = (container, providerInstance, config) => {
        container.querySelector("#aws-bucket").value =
          config.get("bucketName") || "";
        container.querySelector("#aws-region").value =
          config.get("region") || "";
        container.querySelector("#aws-access-key").value =
          config.get("accessKey") || "";
        container.querySelector("#aws-secret-key").value =
          config.get("secretKey") || "";
        container.querySelector("#aws-endpoint").value =
          config.get("endpoint") || "";
      };

      return { html, setupEventListeners };
    }

    isConfigured() {
      return !!(
        this.config.get("accessKey") &&
        this.config.get("secretKey") &&
        this.config.get("region") &&
        this.config.get("bucketName")
      );
    }

    async initialize() {
      if (!this.isConfigured()) throw new Error("AWS configuration incomplete");
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
    }
    async loadSDK() {
      if (this.sdkLoaded || window.AWS) {
        this.sdkLoaded = true;
        return;
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.1692.0.min.js";
        script.onload = () => {
          this.sdkLoaded = true;
          resolve();
        };
        script.onerror = () => reject(new Error("Failed to load AWS SDK"));
        document.head.appendChild(script);
      });
    }

    /**
     * Enhanced error information extraction for AWS SDK errors
     * @param {Error} error - The AWS SDK error object
     * @returns {string} - A detailed error description
     */
    extractErrorDetails(error) {
      if (!error) return "Unknown error";
      const details = [];
      if (error.message) {
        details.push(`Message: ${error.message}`);
      }
      if (error.code) {
        details.push(`Code: ${error.code}`);
      }
      if (error.statusCode) {
        details.push(`Status: ${error.statusCode}`);
      }
      if (error.requestId) {
        details.push(`RequestId: ${error.requestId}`);
      }
      if (error.extendedRequestId) {
        details.push(`ExtRequestId: ${error.extendedRequestId}`);
      }
      if (error.region) {
        details.push(`Region: ${error.region}`);
      }
      if (error.serviceName) {
        details.push(`Service: ${error.serviceName}`);
      }
      if (error.operationName) {
        details.push(`Operation: ${error.operationName}`);
      }
      if (error.retryable !== undefined) {
        details.push(`Retryable: ${error.retryable}`);
      }
      if (error.time) {
        details.push(`Time: ${error.time}`);
      }
      if (error.headers) {
        const relevantHeaders = [
          "x-amz-request-id",
          "x-amz-id-2",
          "x-amz-bucket-region",
        ];
        relevantHeaders.forEach((header) => {
          if (error.headers[header]) {
            details.push(`${header}: ${error.headers[header]}`);
          }
        });
      }
      if (error.networkError) {
        details.push(
          `Network: ${error.networkError.message || error.networkError}`
        );
      }
      if (error.originalError && error.originalError !== error) {
        details.push(
          `Original: ${error.originalError.message || error.originalError}`
        );
      }
      if (details.length === 0) {
        const fallbackProps = ["name", "type", "errorType", "errorMessage"];
        for (const prop of fallbackProps) {
          if (error[prop]) {
            details.push(`${prop}: ${error[prop]}`);
            break;
          }
        }
      }
      if (details.length === 0) {
        try {
          const errorStr = JSON.stringify(error, null, 2);
          if (errorStr && errorStr !== "{}") {
            details.push(`Raw: ${errorStr}`);
          } else {
            details.push(
              `Type: ${typeof error}, Constructor: ${
                error.constructor?.name || "Unknown"
              }`
            );
          }
        } catch (stringifyError) {
          details.push(`Unstringifiable error of type: ${typeof error}`);
        }
      }
      return details.length > 0 ? details.join(" | ") : "Unknown AWS error";
    }

    async upload(key, data, isMetadata = false, itemKey = null) {
      return retryAsync(
        async () => {
          try {
            const isAttachment = key.startsWith("attachments/");
            const body = isMetadata
              ? JSON.stringify(data)
              : key.startsWith("attachments/")
              ? await this.crypto.encryptBytes(data) 
              : await this.crypto.encrypt(data, itemKey || key); 

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
            this.logger.log("success", `Uploaded ${key}`, {
              ETag: result.ETag,
            });
            return result;
          } catch (error) {
            this.logger.log(
              "error",
              `Failed to upload ${key}: ${this.extractErrorDetails(error)}`
            );
            throw error;
          }
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
          onRetry: (error, attempt) => {
            this.logger.log(
              "warning",
              `[S3 Upload] Retry ${attempt}/${3} - ${this.extractErrorDetails(
                error
              )}`
            );
          },
        }
      );
    }

    async uploadRaw(key, data) {
      return retryAsync(
        async () => {
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
              `Failed to upload raw ${key}: ${this.extractErrorDetails(error)}`
            );
            throw error;
          }
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
        }
      );
    }
async download(key, isMetadata = false) {
  return retryAsync(
    async () => {
      const isAttachment = key.startsWith("attachments/"); 

      const result = await this.client
        .getObject({ Bucket: this.config.get("bucketName"), Key: key })
        .promise();
      
      const bodyBytes = new Uint8Array(result.Body);

      if (isMetadata) {
        // Use TextDecoder to properly convert Uint8Array to string
        const jsonString = new TextDecoder().decode(bodyBytes).trim();
        // Validate JSON before parsing
        if (!jsonString || jsonString.length === 0) {
          throw new Error('Empty JSON data received');
        }
        try {
          return JSON.parse(jsonString);
        } catch (parseError) {
          // Log the problematic data for debugging
          console.error(`Failed to parse JSON for key: ${key}`);
          console.error(`First 100 chars: ${jsonString.substring(0, 100)}`);
          throw new Error(`Invalid JSON data in ${key}: ${parseError.message}`);
        }
      } else if (isAttachment) {
        return await this.crypto.decryptBytes(bodyBytes);
      } else {
        return await this.crypto.decrypt(bodyBytes);
      }
    },
    {
      isRetryable: (error) =>
        !(error.code === "NoSuchKey" || error.statusCode === 404),
    }
  );
}
    async downloadRaw(key) {
      return retryAsync(
        async () => {
          const result = await this.client
            .getObject({ Bucket: this.config.get("bucketName"), Key: key })
            .promise();
          return new Uint8Array(result.Body);
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
        }
      );
    }
    async delete(key) {
      return retryAsync(
        async () => {
          await this.client
            .deleteObject({ Bucket: this.config.get("bucketName"), Key: key })
            .promise();
          this.logger.log("success", `Deleted ${key}`);
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
        }
      );
    }

    async deleteFolder(folderPath) {
      return retryAsync(async () => {
        const prefix = folderPath.endsWith("/") ? folderPath : folderPath + "/";
        this.logger.log(
          "info",
          `[S3] Deleting all objects with prefix: ${prefix}`
        );

        const objectsToDelete = await this.list(prefix);
        if (objectsToDelete.length === 0) {
          this.logger.log(
            "info",
            `[S3] No objects found for prefix ${prefix} to delete.`
          );
          return;
        }

        const keysToDelete = objectsToDelete.map((obj) => ({ Key: obj.Key }));
        const bucketName = this.config.get("bucketName");

        const chunks = [];
        for (let i = 0; i < keysToDelete.length; i += 1000) {
          chunks.push(keysToDelete.slice(i, i + 1000));
        }

        for (const chunk of chunks) {
          const params = {
            Bucket: bucketName,
            Delete: { Objects: chunk },
          };
          const result = await this.client.deleteObjects(params).promise();
          if (result.Errors && result.Errors.length > 0) {
            this.logger.log(
              "error",
              "[S3] Errors during batch deletion",
              result.Errors
            );
            throw new Error(`S3 deletion error: ${result.Errors[0].Message}`);
          }
        }
        this.logger.log(
          "success",
          `[S3] Deleted ${keysToDelete.length} objects for folder: ${folderPath}`
        );
      });
    }

    async list(prefix = "") {
      return retryAsync(
        async () => {
          const allContents = [];
          let continuationToken = undefined;
          this.logger.log(
            "info",
            `[S3Service] Starting paginated list for prefix: "${prefix}"`
          );
          do {
            const params = {
              Bucket: this.config.get("bucketName"),
              Prefix: prefix,
              ContinuationToken: continuationToken,
            };
            const result = await this.client.listObjectsV2(params).promise();
            if (result.Contents) {
              allContents.push(...result.Contents);
            }
            this.logger.log(
              "info",
              `[S3Service] Fetched page with ${
                result.Contents?.length || 0
              } items. Total so far: ${allContents.length}. IsTruncated: ${
                result.IsTruncated
              }`
            );
            if (result.IsTruncated) {
              continuationToken = result.NextContinuationToken;
            } else {
              continuationToken = undefined;
            }
          } while (continuationToken);
          this.logger.log(
            "success",
            `[S3Service] Paginated list complete. Total objects found: ${allContents.length}`
          );
          return allContents;
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
        }
      );
    }
    async downloadWithResponse(key) {
      return retryAsync(
        async () => {
          const result = await this.client
            .getObject({ Bucket: this.config.get("bucketName"), Key: key })
            .promise();
          return result;
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
        }
      );
    }
    async copyObject(sourceKey, destinationKey) {
      return retryAsync(
        async () => {
          const result = await this.client
            .copyObject({
              Bucket: this.config.get("bucketName"),
              CopySource: `${this.config.get("bucketName")}/${sourceKey}`,
              Key: destinationKey,
            })
            .promise();
          this.logger.log("success", `Copied ${sourceKey} → ${destinationKey}`);
          return result;
        },
        {
          isRetryable: (error) =>
            !(error.code === "NoSuchKey" || error.statusCode === 404),
        }
      );
    }

    async ensurePathExists(path) {
      return Promise.resolve();
    }
  }

  class GoogleDriveService extends IStorageProvider {
    constructor(configManager, cryptoService, logger) {
      super(configManager, cryptoService, logger);
      this.DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.file";
      this.APP_FOLDER_NAME = "TypingMind-Cloud-Sync";
      this.gapiReady = false;
      this.gisReady = false;
      this.tokenClient = null;
      this.pathIdCache = new Map();
      this.pathCreationPromises = new Map();
    }

    static get displayName() {
      return "Google Drive";
    }

    static getConfigurationUI() {
      const html = `
        <div class="space-y-2">
          <div>
            <label for="google-client-id" class="block text-sm font-medium text-zinc-300">Google Cloud Client ID <span class="text-red-400">*</span></label>
            <input id="google-client-id" name="google-client-id" type="text" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
          </div>
          <div class="pt-1">
            <button id="google-auth-btn" class="w-full inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">Sign in with Google</button>
            <div id="google-auth-status" class="text-xs text-center text-zinc-400 pt-2"></div>
          </div>
          
          <!-- NEW: Help Guide Section -->
          <div class="pt-2 text-center">
            <span id="toggle-google-guide" class="text-xs text-blue-400 hover:text-blue-300 hover:underline cursor-pointer">How to get a Google Client ID?</span>
          </div>
          <div id="google-guide-content" class="hidden mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg max-h-48 overflow-y-auto text-xs text-zinc-300">
            <p class="font-bold mb-2">Follow these steps to create your own Client ID:</p>
            <ol class="list-decimal list-inside space-y-2">
              <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Google Cloud Console</a> and create a new project (or select an existing one).</li>
              <li>In the search bar, find and enable the <strong>"Google Drive API"</strong> for your project.</li>
              <li>Go to "APIs & Services" > <strong>"OAuth consent screen"</strong>.
                <ul class="list-disc list-inside pl-4 mt-1 space-y-1">
                  <li>Choose User Type: <strong>External</strong>.</li>
                  <li>Fill in the required app name (e.g., "My TypingMind Sync"), user support email, and developer contact.</li>
                  <li>Click "Save and Continue" through the "Scopes" and "Test Users" sections. You don't need to add anything here.</li>
                  <li>Finally, click "Back to Dashboard" and <strong>"Publish App"</strong> to make it available for your own use.</li>
                </ul>
              </li>
              <li>Go to "APIs & Services" > <strong>"Credentials"</strong>.</li>
              <li>Click <strong>"+ Create Credentials"</strong> and select <strong>"OAuth client ID"</strong>.</li>
              <li>For Application type, select <strong>"Web application"</strong>.</li>
              <li>Under <strong>"Authorized JavaScript origins"</strong>, click "+ Add URI".
                  <br>
                  <strong class="text-amber-300">IMPORTANT:</strong> You MUST add the URL you use to access TypingMind. For example:
                  <ul class="list-disc list-inside pl-4 mt-1">
                    <li>If you use the official web app: <code class="bg-zinc-700 p-1 rounded">https://www.typingmind.com</code></li>
                    <li>If you self-host: <code class="bg-zinc-700 p-1 rounded">http://localhost:3000</code> (or your custom domain)</li>
                  </ul>
              </li>
              <li>Click "Create". A modal will appear with your <strong>Client ID</strong>. Copy it and paste it into the field above.</li>
            </ol>
          </div>
        </div>
      `;

      const setupEventListeners = (
        container,
        providerInstance,
        config,
        logger
      ) => {
        container.querySelector("#google-client-id").value =
          config.get("googleClientId") || "";

        const googleAuthBtn = container.querySelector("#google-auth-btn");
        const googleAuthStatus = container.querySelector("#google-auth-status");
        const googleClientIdInput =
          container.querySelector("#google-client-id");

        const toggleGuideLink = container.querySelector("#toggle-google-guide");
        const guideContent = container.querySelector("#google-guide-content");

        toggleGuideLink.addEventListener("click", () => {
          guideContent.classList.toggle("hidden");
        });

        const updateAuthButtonState = () => {
          googleAuthBtn.disabled = !googleClientIdInput.value.trim();
          if (
            providerInstance &&
            providerInstance.isConfigured() &&
            window.gapi?.client.getToken()
          ) {
            googleAuthStatus.textContent = "Status: Signed in.";
            googleAuthStatus.style.color = "#22c55e";
          } else {
            googleAuthStatus.textContent = providerInstance?.isConfigured()
              ? "Status: Not signed in."
              : "Status: Client ID required.";
            googleAuthStatus.style.color = "";
          }
        };

        const handleGoogleAuth = async () => {
          const clientId = googleClientIdInput.value.trim();
          if (!clientId) {
            alert("Please enter a Google Client ID first.");
            return;
          }
          config.set("googleClientId", clientId);

          try {
            googleAuthBtn.disabled = true;
            googleAuthBtn.textContent = "Authenticating...";
            googleAuthStatus.textContent =
              "Please follow the Google sign-in prompt...";

            const tempProvider = new GoogleDriveService(
              config,
              providerInstance.crypto,
              logger
            );
            await tempProvider.initialize();
            await tempProvider.handleAuthentication();

            googleAuthStatus.textContent =
              "✅ Authentication successful! Please Save & Verify.";
            googleAuthStatus.style.color = "#22c55e";
            googleAuthBtn.textContent = "Re-authenticate";
          } catch (error) {
            logger.log("error", "Google authentication failed", error);
            googleAuthStatus.textContent = `❌ Auth failed: ${error.message}`;
            googleAuthStatus.style.color = "#ef4444";
            googleAuthBtn.textContent = "Sign in with Google";
          } finally {
            googleAuthBtn.disabled = false;
          }
        };

        googleAuthBtn.addEventListener("click", handleGoogleAuth);
        googleClientIdInput.addEventListener("input", updateAuthButtonState);
        updateAuthButtonState();
      };

      return { html, setupEventListeners };
    }

    _isAuthError(error) {
      const apiError = error.result?.error || error.error || {};
      if (apiError.code === 401 || apiError.status === "UNAUTHENTICATED") {
        return true;
      }
      if (error.status === 401) {
        return true;
      }
      if (apiError.message?.toLowerCase().includes("invalid credentials")) {
        return true;
      }
      return false;
    }

    _isRateLimitError(error) {
      const apiError = error.result?.error || error.error || {};
      return (
        apiError.code === 403 &&
        apiError.message?.toLowerCase().includes("rate limit")
      );
    }

    _operationWithRetry(operation) {
      return retryAsync(operation, {
        maxRetries: 5,
        delay: 1000,
        isRetryable: (error) => {
          if (this._isAuthError(error)) {
            this.logger.log(
              "error",
              "Google Drive authentication token expired or invalid."
            );
            localStorage.removeItem("tcs_google_access_token");
            if (gapi?.client) gapi.client.setToken(null);

            window.cloudSyncApp?.handleExpiredToken();

            return false;
          }
          return this._isRateLimitError(error);
        },
        onRetry: (error, attempt, delay) => {
          this.logger.log(
            "warning",
            `[Google Drive] Rate limit exceeded. Retrying in ${Math.round(
              delay / 1000
            )}s... (Attempt ${attempt}/5)`
          );
        },
      });
    }

    async _deleteFolderIfExists(path) {
      return this._operationWithRetry(async () => {
        const folderId = await this._getPathId(path, false);

        if (folderId) {
          this.logger.log(
            "info",
            `[Google Drive] Deleting existing backup folder to prevent duplication: "${path}"`
          );
          await gapi.client.drive.files.delete({
            fileId: folderId,
          });

          const keysToDelete = [];
          for (const key of this.pathIdCache.keys()) {
            if (key === path || key.startsWith(path + "/")) {
              keysToDelete.push(key);
            }
          }
          for (const key of this.pathCreationPromises.keys()) {
            if (key === path || key.startsWith(path + "/")) {
              if (!keysToDelete.includes(key)) {
                keysToDelete.push(key);
              }
            }
          }

          keysToDelete.forEach((key) => {
            this.pathIdCache.delete(key);
            this.pathCreationPromises.delete(key);
          });

          this.pathIdCache.clear();
          this.pathCreationPromises.clear();

          this.logger.log(
            "info",
            `[Google Drive] Cleared ${keysToDelete.length} cache/promise entries for path: "${path}"`
          );
        }
      });
    }

    isConfigured() {
      return !!this.config.get("googleClientId");
    }

    async initialize() {
      if (!this.isConfigured())
        throw new Error("Google Drive configuration incomplete");
      await this._loadGapiAndGis();

      await new Promise((resolve) => gapi.load("client", resolve));

      await gapi.client.load(
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
      );

      await gapi.client.init({});

      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.config.get("googleClientId"),
        scope: this.DRIVE_SCOPES,
        callback: () => {},
      });

      const storedToken = localStorage.getItem("tcs_google_access_token");
      if (storedToken) {
        try {
          const token = JSON.parse(storedToken);
          const isExpired =
            Date.now() > token.iat + token.expires_in * 1000 - 5 * 60 * 1000;

          if (!isExpired) {
            gapi.client.setToken(token);
            this.logger.log(
              "info",
              "Successfully restored Google Drive session from storage."
            );
          } else {
            this.logger.log(
              "info",
              "Google Drive token from storage has expired."
            );
            localStorage.removeItem("tcs_google_access_token");
          }
        } catch (e) {
          this.logger.log("error", "Failed to parse stored Google token", e);
          localStorage.removeItem("tcs_google_access_token");
        }
      }
    }

    _storeToken(tokenResponse) {
      if (!tokenResponse.access_token) return;

      const tokenToStore = { ...tokenResponse, iat: Date.now() };

      localStorage.setItem(
        "tcs_google_access_token",
        JSON.stringify(tokenToStore)
      );
      this.logger.log("success", "Google Drive token stored successfully.");
    }

    async _loadScript(id, src) {
      if (document.getElementById(id)) return;
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async _loadGapiAndGis() {
      if (this.gapiReady && this.gisReady) return;
      await this._loadScript(
        "gapi-client-script",
        "https://apis.google.com/js/api.js"
      );
      await this._loadScript(
        "gis-client-script",
        "https://accounts.google.com/gsi/client"
      );
      this.gapiReady = true;
      this.gisReady = true;
    }

    async handleAuthentication(options = { interactive: false }) {
      if (!this.isConfigured() || !this.tokenClient) {
        throw new Error("Google Drive is not configured or initialized.");
      }

      const token = gapi.client.getToken();

      if (token?.access_token) {
        const isExpired =
          Date.now() > token.iat + token.expires_in * 1000 - 5 * 60 * 1000;
        if (!isExpired) {
          return Promise.resolve();
        }
        this.logger.log(
          "info",
          "Access token is expired, attempting silent refresh."
        );
      }

      return new Promise((resolve, reject) => {
        const callback = (tokenResponse) => {
          if (tokenResponse.error) {
            this.logger.log("error", "Google Auth Error", tokenResponse);
            if (options.interactive) {
              reject(
                new Error(
                  tokenResponse.error_description || "Authentication failed."
                )
              );
            } else {
              this.logger.log(
                "warning",
                "Silent token refresh failed. User interaction will be required."
              );
              resolve();
            }
            return;
          }

          this._storeToken(tokenResponse);
          this.logger.log("success", "Google Drive authentication successful.");
          resolve();
        };

        this.tokenClient.callback = callback;
        const prompt = options.interactive ? "consent" : "";
        this.tokenClient.requestAccessToken({ prompt: prompt });
      });
    }

    async _getAppFolderId() {
      return this._operationWithRetry(async () => {
        if (this.pathIdCache.has(this.APP_FOLDER_NAME)) {
          return this.pathIdCache.get(this.APP_FOLDER_NAME);
        }

        const response = await gapi.client.drive.files.list({
          q: `mimeType='application/vnd.google-apps.folder' and name='${this.APP_FOLDER_NAME}' and trashed=false`,
          fields: "files(id, name)",
          spaces: "drive",
        });

        if (response.result.error) throw response;

        if (response.result.files.length > 0) {
          const folderId = response.result.files[0].id;
          this.pathIdCache.set(this.APP_FOLDER_NAME, folderId);
          return folderId;
        } else {
          this.logger.log(
            "info",
            `App folder '${this.APP_FOLDER_NAME}' not found, creating it.`
          );
          const fileMetadata = {
            name: this.APP_FOLDER_NAME,
            mimeType: "application/vnd.google-apps.folder",
          };
          const createResponse = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: "id",
          });

          if (createResponse.result.error) throw createResponse;

          const folderId = createResponse.result.id;
          this.pathIdCache.set(this.APP_FOLDER_NAME, folderId);
          return folderId;
        }
      });
    }

    async _getPathId(path, createIfNotExists = false) {
      if (this.pathIdCache.has(path)) {
        return this.pathIdCache.get(path);
      }

      if (this.pathCreationPromises.has(path)) {
        this.logger.log(
          "info",
          `[Google Drive] Awaiting in-flight creation for path: "${path}"`
        );
        return this.pathCreationPromises.get(path);
      }

      const promise = this._operationWithRetry(async () => {
        if (this.pathIdCache.has(path)) return this.pathIdCache.get(path);

        const parts = path.split("/").filter((p) => p);
        let parentId = await this._getAppFolderId();
        let currentPath = this.APP_FOLDER_NAME;

        for (const part of parts) {
          currentPath += `/${part}`;
          if (this.pathIdCache.has(currentPath)) {
            parentId = this.pathIdCache.get(currentPath);
            continue;
          }

          const response = await gapi.client.drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${part}' and '${parentId}' in parents and trashed=false`,
            fields: "files(id)",
            spaces: "drive",
          });

          if (response.result.error) throw response;

          if (response.result.files.length > 0) {
            parentId = response.result.files[0].id;
            this.pathIdCache.set(currentPath, parentId);
          } else if (createIfNotExists) {
            this.logger.log(
              "info",
              `Creating folder '${part}' inside parent ID ${parentId}.`
            );
            const fileMetadata = {
              name: part,
              mimeType: "application/vnd.google-apps.folder",
              parents: [parentId],
            };
            const createResponse = await gapi.client.drive.files.create({
              resource: fileMetadata,
              fields: "id",
            });
            if (createResponse.result.error) throw createResponse;
            parentId = createResponse.result.id;
            this.pathIdCache.set(currentPath, parentId);
          } else {
            return null;
          }
        }
        return parentId;
      });

      this.pathCreationPromises.set(path, promise);

      try {
        const pathId = await promise;
        if (pathId) {
          this.pathIdCache.set(path, pathId);
        }
        return pathId;
      } finally {
        this.pathCreationPromises.delete(path);
      }
    }

    async _getFileMetadata(path) {
      return this._operationWithRetry(async () => {
        const parts = path.split("/").filter((p) => p);
        const filename = parts.pop();
        const folderPath = parts.join("/");

        const parentId = await this._getPathId(folderPath);
        if (!parentId) return null;

        const queryParams = new URLSearchParams({
          q: `name='${filename}' and '${parentId}' in parents and trashed=false`,
          fields: "files(id, name, size, modifiedTime)",
          spaces: "drive",
        });

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
          {
            method: "GET",
            headers: new Headers({
              Authorization: "Bearer " + gapi.client.getToken().access_token,
            }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.json();
          this.logger.log(
            "error",
            `Google Drive file list failed for ${path}`,
            errorBody
          );
          throw errorBody;
        }

        const result = await response.json();
        return result.files.length > 0 ? result.files[0] : null;
      });
    }

    async upload(key, data, isMetadata = false, itemKey = null) {
      return this._operationWithRetry(async () => {
        await this.handleAuthentication();
        const parts = key.split("/").filter((p) => p);
        const filename = parts.pop();
        const folderPath = parts.join("/");

        const parentId = await this._getPathId(folderPath, true);
        const existingFile = await this._getFileMetadata(key);

        const body = isMetadata
          ? JSON.stringify(data)
          : key.startsWith("attachments/")
            ? await this.crypto.encryptBytes(data) 
            : await this.crypto.encrypt(data, itemKey || key); 
        const blob = new Blob([body], {
          type: isMetadata ? "application/json" : "application/octet-stream",
        });

        const metadata = {
          name: filename,
          mimeType: isMetadata
            ? "application/json"
            : "application/octet-stream",
        };
        if (!existingFile) {
          metadata.parents = [parentId];
        }

        const formData = new FormData();
        formData.append(
          "metadata",
          new Blob([JSON.stringify(metadata)], { type: "application/json" })
        );
        formData.append("file", blob);

        const uploadUrl = existingFile
          ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
          : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

        const method = existingFile ? "PATCH" : "POST";

        const response = await fetch(uploadUrl, {
          method: method,
          headers: new Headers({
            Authorization: "Bearer " + gapi.client.getToken().access_token,
          }),
          body: formData,
        });

        const result = await response.json();
        if (result.error) {
          this.logger.log(
            "error",
            `Google Drive upload failed for ${key}`,
            result.error
          );
          throw result;
        }

        const etag = response.headers.get("ETag") || result.etag;

        this.logger.log("success", `Uploaded ${key} to Google Drive`, {
          ETag: etag,
        });
        return { ETag: etag, ...result };
      });
    }

    async download(key, isMetadata = false) {
      return this._operationWithRetry(async () => {
        await this.handleAuthentication();
        const file = await this._getFileMetadata(key);
        if (!file) {
          const error = new Error(`File not found in Google Drive: ${key}`);
          error.code = "NoSuchKey";
          error.statusCode = 404;
          throw error;
        }

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            method: "GET",
            headers: new Headers({
              Authorization: "Bearer " + gapi.client.getToken().access_token,
            }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.json();
          this.logger.log(
            "error",
            `Google Drive download failed for ${key}`,
            errorBody
          );
          throw errorBody;
        }

        if (isMetadata) {
          return await response.json();
        } else {
          const isAttachment = key.startsWith("attachments/"); 
      const encryptedBuffer = await response.arrayBuffer();
      const bodyBytes = new Uint8Array(encryptedBuffer);

      if (isAttachment) {
          return await this.crypto.decryptBytes(bodyBytes);
      } else {
          return await this.crypto.decrypt(bodyBytes);
      }
    }
      });
    }

    async delete(key) {
      return this._operationWithRetry(async () => {
        await this.handleAuthentication();
        const file = await this._getFileMetadata(key);
        if (!file) {
          this.logger.log("warning", `File to delete not found: ${key}`);
          return;
        }

        const response = await gapi.client.drive.files.delete({
          fileId: file.id,
        });
        if (
          response.result &&
          typeof response.result === "object" &&
          Object.keys(response.result).length > 0
        ) {
        } else if (response.status >= 400) {
          throw {
            result: {
              error: response.body
                ? JSON.parse(response.body)
                : { message: "Delete failed" },
            },
          };
        }

        this.logger.log("success", `Deleted ${key} from Google Drive.`);
      });
    }

    async deleteFolder(folderPath) {
      return this._operationWithRetry(async () => {
        this.logger.log(
          "info",
          `[Google Drive] Deleting folder: ${folderPath}`
        );

        const folderId = await this._getPathId(folderPath, false);

        if (!folderId) {
          this.logger.log(
            "warning",
            `[Google Drive] Folder to delete not found: ${folderPath}`
          );
          return;
        }

        await gapi.client.drive.files.delete({
          fileId: folderId,
        });

        const keysToClear = Array.from(this.pathIdCache.keys()).filter(
          (key) => key === folderPath || key.startsWith(folderPath + "/")
        );

        keysToClear.forEach((key) => {
          this.pathIdCache.delete(key);
          this.pathCreationPromises.delete(key);
        });

        this.logger.log(
          "success",
          `[Google Drive] Deleted folder ${folderPath} and cleared ${keysToClear.length} cache entries.`
        );
      });
    }

    async list(prefix = "") {
      return this._operationWithRetry(async () => {
        await this.handleAuthentication();
        const parentId = await this._getPathId(prefix);
        if (!parentId) return [];

        let pageToken = null;
        const allFiles = [];
        do {
          const response = await gapi.client.drive.files.list({
            q: `'${parentId}' in parents and trashed=false`,
            fields: "nextPageToken, files(id, name, size, modifiedTime)",
            spaces: "drive",
            pageSize: 1000,
            pageToken: pageToken,
          });

          if (response.result.error) throw response;

          allFiles.push(...response.result.files);
          pageToken = response.result.nextPageToken;
        } while (pageToken);

        return allFiles.map((file) => ({
          Key: `${prefix}${file.name}`,
          LastModified: new Date(file.modifiedTime),
          Size: file.size,
        }));
      });
    }

    async downloadWithResponse(key) {
      return this._operationWithRetry(async () => {
        await this.handleAuthentication();
        const file = await this._getFileMetadata(key);
        if (!file) {
          const error = new Error(`File not found in Google Drive: ${key}`);
          error.code = "NoSuchKey";
          error.statusCode = 404;
          throw error;
        }

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            method: "GET",
            headers: new Headers({
              Authorization: "Bearer " + gapi.client.getToken().access_token,
            }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.json();
          this.logger.log(
            "error",
            `Google Drive download failed for ${key}`,
            errorBody
          );
          throw errorBody;
        }

        const etag = response.headers.get("ETag");
        const body = await response.text();

        return {
          Body: body,
          ...file,
          ETag: file.modifiedTime,
        };
      });
    }

    async copyObject(sourceKey, destinationKey) {
      return this._operationWithRetry(async () => {
        await this.handleAuthentication();
        const sourceFile = await this._getFileMetadata(sourceKey);
        if (!sourceFile) throw new Error(`Source file not found: ${sourceKey}`);

        const destParts = destinationKey.split("/").filter((p) => p);
        const destFilename = destParts.pop();
        const destFolderPath = destParts.join("/");

        const destParentId = await this._getPathId(destFolderPath, true);

        const copyMetadata = {
          name: destFilename,
          parents: [destParentId],
        };

        const response = await gapi.client.drive.files.copy({
          fileId: sourceFile.id,
          resource: copyMetadata,
        });

        if (response.result.error) throw response;

        this.logger.log("success", `Copied ${sourceKey} → ${destinationKey}`);
        return response.result;
      });
    }

    async verify() {
      this.logger.log("info", "Verifying Google Drive connection...");
      await this.handleAuthentication({ interactive: true });
      await this._getAppFolderId();
      this.logger.log("success", "Google Drive connection verified.");
    }

    async ensurePathExists(path) {
      this.logger.log("info", `[Google Drive] Ensuring path exists: "${path}"`);
      await this._getPathId(path, true);
      this.logger.log("info", `[Google Drive] Path confirmed: "${path}"`);
    }
  }

  class SyncOrchestrator {
    constructor(
      configManager,
      dataService,
      storageService,
      logger,
      operationQueue = null
    ) {
      this.config = configManager;
      this.dataService = dataService;
      this.storageService = storageService;
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


    /**
     * Creates a lightweight, stable fingerprint for TypingMind chat objects.
     * This avoids JSON-stringifying large chats (which can be slow and memory-heavy),
     * while still detecting in-chat message updates reliably.
     */
    getChatFingerprint(chat) {
      try {
        if (!chat || typeof chat !== "object") return "0";
        const updatedAt =
          chat.updatedAt || chat.updated_at || chat.lastUpdated || chat.modifiedAt || "";

        // Common shapes: { messages: [...] } or nested { chat: { messages: [...] } } or { conversation: { messages: [...] } }
        const messages =
          (Array.isArray(chat.messages) && chat.messages) ||
          (Array.isArray(chat.chat?.messages) && chat.chat.messages) ||
          (Array.isArray(chat.conversation?.messages) && chat.conversation.messages) ||
          (Array.isArray(chat.data?.messages) && chat.data.messages) ||
          null;

        let msgCount = 0;
        let lastMsgId = "";
        let lastMsgTs = "";
        if (messages) {
          msgCount = messages.length;
          const last = messages[msgCount - 1];
          if (last && typeof last === "object") {
            lastMsgId = last.id || last.messageId || last.uuid || "";
            lastMsgTs =
              last.updatedAt ||
              last.updated_at ||
              last.createdAt ||
              last.created_at ||
              last.timestamp ||
              "";
          }
        } else {
          // Fallback: attempt to use any obvious counters / pointers that are typically small.
          msgCount = chat.messageCount || chat.messagesCount || chat.turns || 0;
          lastMsgId =
            chat.lastMessageId || chat.lastMsgId || chat.last_message_id || "";
          lastMsgTs =
            chat.lastMessageAt || chat.lastMsgAt || chat.last_message_at || "";
        }

        return [
          String(updatedAt),
          String(msgCount),
          String(lastMsgId),
          String(lastMsgTs),
        ].join("|");
      } catch {
        return "0";
      }
    }

    /**
     * Detects changes between local storage and the last known sync state.
     * This uses a combined strategy:
     * - For CHAT items (key starts with 'CHAT_'): Uses the `updatedAt` timestamp for fast, memory-safe change detection.
     * - For all other items: Uses the original `size`-based comparison.
     * This prevents memory crashes caused by stringifying large chat objects.
     */
    async detectChanges() {
      const changedItems = [];
      const now = Date.now();
      const localItemKeys = await this.dataService.getAllItemKeys();

      this.logger.log(
        "info",
        "🔍 Gathering all local item keys for change detection."
      );
      this.logger.log("info", `Found ${localItemKeys.size} local item keys.`);

      const { totalSize } = await this.dataService.estimateDataSize();
      const itemsIterator = this.dataService.streamAllItemsInternal();

      for await (const batch of itemsIterator) {
        for (const item of batch) {
          const key = item.id;
          if (typeof key !== "string" || !key) {
            continue;
          }

          // Respect configured exclusions to avoid syncing transient/internal keys (can cause excessive metadata uploads)
          if (
            this.config &&
            typeof this.config.shouldExclude === "function" &&
            this.config.shouldExclude(key)
          ) {
            continue;
          }

          const value = item.data;
          const existingItem = this.metadata.items[key];

          if (existingItem?.deleted) {
            continue;
          }

          let hasChanged = false;
          let changeReason = "unknown";
          let itemLastModified;
          let currentSize = 0;

          if (
            key.startsWith("CHAT_") &&
            item.type === "idb"
          ) {
            const rawUpdatedAt =
              value.updatedAt || value.updated_at || value.lastUpdated || value.modifiedAt;
            const rawLastModifiedFromMetadata = existingItem?.lastModified;

            const getNumericTimestamp = (dateValue) => {
              if (typeof dateValue === "number") return dateValue;
              if (!dateValue) return 0;
              const timestamp = new Date(dateValue).getTime();
              return isNaN(timestamp) ? 0 : timestamp;
            };

            const currentTimestamp = getNumericTimestamp(rawUpdatedAt);
            const lastKnownTimestamp = getNumericTimestamp(rawLastModifiedFromMetadata);

            const currentFingerprint = this.getChatFingerprint(value);
            const lastKnownFingerprint = existingItem?.chatFingerprint || "";

            // Prefer timestamp when available; otherwise use fingerprint.
            itemLastModified = currentTimestamp || (existingItem?.lastModified || 0);

            if (!existingItem) {
              hasChanged = true;
              changeReason = "new-chat";
            } else if (currentTimestamp && currentTimestamp > lastKnownTimestamp) {
              hasChanged = true;
              changeReason = "timestamp";
            } else if (currentFingerprint && currentFingerprint !== lastKnownFingerprint) {
              hasChanged = true;
              changeReason = "fingerprint";
            } else if (!existingItem.synced || existingItem.synced === 0) {
             hasChanged = true;
             changeReason = "never-synced-chat";

             // optional, aber sinnvoll: erzwingt Pull über lastModified
             itemLastModified = now;
            }
          } else {
            currentSize =
  value instanceof Uint8Array || value instanceof Blob
    ? (value.size || value.length)
    : this.getItemSize(value);
            itemLastModified = existingItem?.lastModified || 0;

            if (!existingItem) {
              hasChanged = true;
              changeReason = "new";
            } else if (currentSize !== existingItem.size) {
              hasChanged = true;
              changeReason = "size";
              itemLastModified = now;
            } else if (!existingItem.synced || existingItem.synced === 0) {
              hasChanged = true;
              changeReason = "never-synced";
            }
          }

          if (hasChanged) {
            const change = {
              id: key,
              type: item.type,
              lastModified: itemLastModified,
              reason: changeReason,
            };
            if (key.startsWith("CHAT_") && item.type === "idb") {
              change.chatFingerprint = this.getChatFingerprint(value);
            }
            if (item.type === 'blob' && value instanceof Blob) {
            change.blobType = value.type || '';
            }
            if (currentSize > 0) {
              change.size = currentSize;
            }
            changedItems.push(change);
          }
        }
      }

      for (const [itemId, metadata] of Object.entries(this.metadata.items)) {
        if (metadata.deleted && metadata.deleted > (metadata.synced || 0)) {
          if (
            !changedItems.some(
              (item) => item.id === itemId && item.reason === "tombstone"
            )
          ) {
            changedItems.push({
              id: itemId,
              type: metadata.type,
              deleted: metadata.deleted,
              tombstoneVersion: metadata.tombstoneVersion || 1,
              reason: "tombstone",
            });
          }
        }
      }

      this.logger.log(
        "info",
        "🔍 Checking for items deleted locally by comparing metadata against actual keys..."
      );
      let newlyDeletedCount = 0;
      for (const itemId in this.metadata.items) {
        const metadataItem = this.metadata.items[itemId];

        if (!localItemKeys.has(itemId) && !metadataItem.deleted) {
          this.logger.log(
            "info",
            `⚰️ Detected locally deleted item: ${itemId}. Creating tombstone.`
          );

          changedItems.push({
            id: itemId,
            type: metadataItem.type || "idb",
            deleted: Date.now(),
            tombstoneVersion: (metadataItem.tombstoneVersion || 0) + 1,
            reason: "detected-deletion",
          });
          newlyDeletedCount++;
        }
      }
      if (newlyDeletedCount > 0) {
        this.logger.log(
          "success",
          `✅ Found ${newlyDeletedCount} newly deleted item(s) to be synced to the cloud.`
        );
      }

      return { changedItems, hasChanges: changedItems.length > 0 };
    }

    /**
     * Syncs detected changes up to the S3 cloud.
     * After uploading an item, it updates the local metadata:
     * - For CHAT items, it stores the `lastModified` timestamp.
     * - For other items, it stores the `size`.
     */
    async syncToCloud() {
      if (this.syncInProgress) {
        this.logger.log("skip", "Sync to cloud already in progress");
        return;
      }
      this.syncInProgress = true;
      try {
        const { changedItems } = await this.detectChanges();
        if (changedItems.length === 0) {
          this.logger.log("info", "No local items to sync to cloud");
          this.syncInProgress = false;
          return;
        }

        this.logger.log(
          "start",
          `Syncing ${changedItems.length} changed items to cloud...`
        );

        const cloudMetadata = await this.getCloudMetadata();
        let itemsSynced = 0;

        const uploadPromises = changedItems.map(async (item) => {
          const cloudItem = cloudMetadata.items[item.id];
          if (
            cloudItem &&
            !item.deleted &&
            (cloudItem.lastModified || 0) > (item.lastModified || 0)
          ) {
            this.logger.log(
              "skip",
              `Skipping upload for ${item.id}, cloud version is newer.`
            );
            this.metadata.items[item.id] = { ...cloudItem };
            return;
          }

          try {
            if (item.deleted || item.reason === "tombstone") {
              const timestamp = Date.now();
              const tombstoneData = {
                deleted: item.deleted || timestamp,
                type: item.type,
                tombstoneVersion: item.tombstoneVersion || 1,
                synced: timestamp,
              };
              this.metadata.items[item.id] = tombstoneData;
              cloudMetadata.items[item.id] = { ...tombstoneData };
              itemsSynced++;
              this.logger.log(
                "info",
                `🗑️ Synced tombstone for "${item.id}" to cloud.`
              );
            } else {
              let data  = await this.dataService.getItem(item.id, item.type);
              const mime = (item.type === 'blob' && data instanceof Blob)
                ? data.type
                : (item.blobType || '');
             if (item.type === "blob" && data instanceof Blob) {
  data = new Uint8Array(await data.arrayBuffer());
}
              if (data) {
                const path =
                  item.type === "blob"
                    ? `attachments/${item.id}.bin`   
                    : `items/${item.id}.json`;

                await this.storageService.upload(path, data, false, item.id);

                const newMetadataEntry = {
                  synced: Date.now(),
                  type: item.type,
                  lastModified: item.lastModified,
                };

                if (item.id.startsWith("CHAT_") && item.type === "idb") {
                  newMetadataEntry.chatFingerprint = item.chatFingerprint || this.getChatFingerprint(data);
                }

                if (item.type === "blob") {         
                    newMetadataEntry.blobType = mime;                 
                    newMetadataEntry.size     = data.length ||        
                                                item.size  || 0;
                } else if (!item.id.startsWith("CHAT_")) {
                    newMetadataEntry.size = item.size || this.getItemSize(data);
                }

                this.metadata.items[item.id] = newMetadataEntry;
                cloudMetadata.items[item.id] = { ...newMetadataEntry };

                itemsSynced++;
                this.logger.log(
                  "info",
                  `Synced key "${item.id}" to cloud (reason: ${item.reason}).`
                );
              }
            }
          } catch (error) {
            this.logger.log(
              "error",
              `Failed to sync key "${item.id}": ${error.message}`
            );
            throw error;
          }
        });

        await Promise.allSettled(uploadPromises);

        if (itemsSynced > 0) {
          cloudMetadata.lastSync = Date.now();
          await this.storageService.upload(
            "metadata.json",
            cloudMetadata,
            true
          );
          this.metadata.lastSync = cloudMetadata.lastSync;
          this.setLastCloudSync(cloudMetadata.lastSync);
          this.saveMetadata();
          await this.updateSyncDiagnosticsCache();
          this.logger.log(
            "success",
            `Sync to cloud completed - ${itemsSynced} items processed.`
          );
        } else {
          this.logger.log(
            "info",
            "Sync to cloud finished, but no new items were uploaded."
          );
        }
      } catch (error) {
        this.logger.log(
          "error",
          "An error occurred during syncToCloud",
          error.message
        );
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
      await this.storageService.upload("metadata.json", cloudMetadata, true);
      this.saveMetadata();
      await this.updateSyncDiagnosticsCache();
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
        let metadataWasPurged = false;
        let purgedCount = 0;
        for (const itemId in cloudMetadata.items) {
            if (this.config.shouldExclude(itemId)) {
                delete cloudMetadata.items[itemId];
                purgedCount++;
            }
        }
        if (purgedCount > 0) {
            this.logger.log('warning', `Purged ${purgedCount} newly excluded item(s) from cloud metadata to resolve conflicts.`);
            metadataWasPurged = true;
        }

        const lastMetadataETag = localStorage.getItem("tcs_metadata_etag");
        const hasCloudChanges = cloudMetadataETag !== lastMetadataETag;
        const cloudLastSync = cloudMetadata.lastSync || 0;
        const cloudActiveCount = Object.values(cloudMetadata.items || {}).filter(item => !item.deleted).length;
        const localActiveCount = Object.values(this.metadata.items || {}).filter(item => !item.deleted).length;

        if (!hasCloudChanges && cloudActiveCount === localActiveCount && !metadataWasPurged){
          this.logger.log(
            "info",
            "No cloud changes detected and item count is consistent - skipping item downloads"
          );
          this.metadata.lastSync = cloudLastSync;
          this.setLastCloudSync(cloudLastSync);
          this.saveMetadata();
          this.logger.log("success", "Sync from cloud completed (no changes)");
          return;
        }

        if (hasCloudChanges) {
          this.logger.log(
            "info",
            `Cloud changes detected (ETag mismatch) - proceeding with full sync`
          );
        } else if (metadataWasPurged) {
          this.logger.log(
            "info",
            `Metadata was purged of excluded items - proceeding to save cleaned state.`
          );
        } else {
          this.logger.log(
            "warning",
            `Inconsistency detected! Cloud has ${cloudActiveCount} active items, local has ${localActiveCount}. Forcing full sync.`
          );
        }

        const debugEnabled =
          new URLSearchParams(window.location.search).get("log") === "true";
        if (debugEnabled && cloudMetadata?.items) {
          const cloudItems = Object.keys(cloudMetadata.items);
          const cloudDeleted = cloudItems.filter(
            (id) => cloudMetadata.items[id].deleted
          ).length;
          const cloudActive = cloudItems.length - cloudDeleted;
          console.log(
            `📊 Cloud Metadata Stats: Total=${cloudItems.length}, Active=${cloudActive}, Deleted=${cloudDeleted}`
          );
        }

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
              const localMetadataVersion = localItem?.deleted
                ? localItem.tombstoneVersion || 1
                : 0;
              const localStorageVersion = localTombstone?.tombstoneVersion || 0;
              const localVersion = Math.max(
                localMetadataVersion,
                localStorageVersion
              );
              return cloudVersion > localVersion;
            }
            if (localItem?.deleted) {
              return (cloudItem.lastModified || 0) > localItem.deleted;
            }
            if (!localItem) {
              return true;
            }
            // SAUBERER CHAT-SPEZIALFALL:
            // Wenn es ein Chat ist und sich der Fingerprint unterscheidet, immer herunterladen.
            if (key.startsWith("CHAT_")) {
              const cloudFp = cloudItem.chatFingerprint || "";
              const localFp = localItem?.chatFingerprint || "";
              if (cloudFp && cloudFp !== localFp) {
                return true;
              }
            }

            // Fallback: Timestamp-Vergleich
            const cloudTimestamp = new Date(
              cloudItem.lastModified || 0
            ).getTime();
            const localTimestamp = new Date(
              localItem.lastModified || 0
            ).getTime();
            return cloudTimestamp > localTimestamp;

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
            } else {
              const path = cloudItem.type === "blob"
                ? `attachments/${key}.bin`
                : `items/${key}.json`;
        
              const data = await this.storageService.download(path);

              if (data) {
                if (cloudItem.type === "blob") {
                  data.blobType = cloudItem.blobType || '';
                  await this.dataService.saveItem(data, "blob", key);       
                } else {
                  await this.dataService.saveItem(data, cloudItem.type, key);
                }
                this.logger.log("info", `Synced key "${key}" from cloud`);
              }
            }
          }
        );
        await Promise.allSettled(downloadPromises);
        this.metadata = cloudMetadata;
        this.metadata.lastSync = cloudLastSync;
        this.setLastCloudSync(cloudLastSync);
        localStorage.setItem("tcs_metadata_etag", cloudMetadataETag);
        this.saveMetadata();
        await this.updateSyncDiagnosticsCache();
        this.logger.log("success", "Sync from cloud completed");
        return metadataWasPurged;
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
        if (this.storageService instanceof GoogleDriveService) {
          await this.storageService._getPathId("items", true);
        }

        const allItemsIterator = await this.dataService.getAllItemsEfficient();
        const { itemCount } = await this.dataService.estimateDataSize();

        if (itemCount === 0) {
          this.logger.log(
            "info",
            "Initial sync found no local items to upload."
          );
          return;
        }

        this.logger.log(
          "info",
          `[Initial Sync] Attempting to upload ${itemCount} items.`
        );

        const cloudMetadata = { lastSync: 0, items: {} };
        let uploadedCount = 0;
        const now = Date.now();

        for await (const batch of allItemsIterator) {
          const uploadPromises = batch.map(async (item) => {
            if (item.deleted || item.reason === "tombstone") {
              const tombstoneData = {
                deleted: item.deleted || now,
                deletedAt: item.deleted || now,
                type: item.type,
                tombstoneVersion: item.tombstoneVersion || 1,
                synced: now,
              };
              return {
                id: item.id,
                metadata: tombstoneData,
                isTombstone: true,
              };
            } else {
              await this.storageService.upload(
                `items/${item.id}.json`,
                item.data,
                false,
                item.id
              );
              const newMetadataEntry = {
                synced: now,
                type: item.type,
              };

              if (
                item.id.startsWith("CHAT_") &&
                item.type === "idb" &&
                item.data?.updatedAt
              ) {
                newMetadataEntry.lastModified = item.data.updatedAt;
                newMetadataEntry.chatFingerprint = this.getChatFingerprint(item.data);
              } else {
                newMetadataEntry.size = this.getItemSize(item.data);
                newMetadataEntry.lastModified = now;
              }
              return { id: item.id, metadata: newMetadataEntry };
            }
          });

          const results = await Promise.allSettled(uploadPromises);

          results.forEach((result) => {
            if (result.status === "fulfilled" && result.value) {
              const { id, metadata, isTombstone } = result.value;
              this.metadata.items[id] = metadata;
              cloudMetadata.items[id] = { ...metadata };
              if (!isTombstone) {
                uploadedCount++;
              }
            }
          });
          this.logger.log(
            `[Initial Sync] Processed batch. Total uploaded: ${uploadedCount}/${itemCount}`
          );
        }

        if (Object.keys(cloudMetadata.items).length > 0) {
          cloudMetadata.lastSync = Date.now();
          await this.storageService.upload(
            "metadata.json",
            cloudMetadata,
            true
          );
          this.metadata.lastSync = cloudMetadata.lastSync;
          this.setLastCloudSync(cloudMetadata.lastSync);
          this.saveMetadata();
          await this.updateSyncDiagnosticsCache();
        }

        this.logger.log(
          "success",
          `Initial sync completed - ${uploadedCount} of ${itemCount} items processed.`
        );
      } catch (error) {
        this.logger.log("error", "Failed to create initial sync", error);
        throw error;
      }
    }
    async performFullSync() {
      if (!this.storageService || !this.storageService.isConfigured()) {
        this.logger.log(
          "skip",
          "Storage provider not configured, skipping full sync."
        );
        return;
      }

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
      const metadataWasPurged =await this.syncFromCloud();

      if (metadataWasPurged) {
          this.logger.log('info', 'Metadata was purged. Forcing an upload to make the fix permanent in the cloud.');
          await this.storageService.upload("metadata.json", this.metadata, true);
          localStorage.setItem("tcs_metadata_etag", "");
      }

      const cloudMetadata = await this.getCloudMetadata();
      const localMetadataEmpty =
        Object.keys(this.metadata.items || {}).length === 0;
      const cloudMetadataEmpty =
        Object.keys(cloudMetadata.items || {}).length === 0;
      if (cloudMetadataEmpty) {
        const { itemCount } = await this.dataService.estimateDataSize();
        if (itemCount > 0) {
          this.logger.log(
            "info",
            `🚀 Fresh cloud setup detected: ${itemCount} local items found with empty cloud metadata. Triggering initial sync.`
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
        const localCleaned = await this.cleanupOldTombstones();
        const cloudCleaned = await this.cleanupCloudTombstones();
        localStorage.setItem("tcs_last-tombstone-cleanup", now.toString());
        if (localCleaned > 0 || cloudCleaned > 0) {
          this.logger.log(
            "success",
            `Tombstone cleanup completed: ${localCleaned} local, ${cloudCleaned} cloud`
          );
        }
      }
      await this.updateSyncDiagnosticsCache();
    }
    async initializeLocalMetadata() {
      const isEmptyMetadata =
        Object.keys(this.metadata.items || {}).length === 0;
      if (!isEmptyMetadata) {
        return;
      }
      this.logger.log(
        "start",
        "🔧 Initializing local metadata from database contents"
      );
      const { totalSize } = await this.dataService.estimateDataSize();
      const useStreaming = totalSize > this.dataService.memoryThreshold;
      const tombstones = this.dataService.getAllTombstones();
      let itemCount = 0;
      let tombstoneCount = 0;
      this.logger.log(
        "info",
        `Using memory-efficient metadata initialization (dataset: ${this.dataService.formatSize(
          totalSize
        )})`
      );

      for await (const batch of this.dataService.streamAllItemsInternal()) {
        for (const item of batch) {
          if (item.id && item.data) {
            const key = item.id;
            const baseEntry = {
              synced: 0,
              type: item.type,
              size: this.getItemSize(item.data),
              lastModified: 0,
            };
            if (key.startsWith("CHAT_") && item.type === "idb") {
              baseEntry.lastModified = item.data?.updatedAt || 0;
              baseEntry.chatFingerprint = this.getChatFingerprint(item.data);
            }
            this.metadata.items[key] = baseEntry;
            itemCount++;
          }
        }
        if (itemCount % 1000 === 0) {
          this.logger.log(
            "info",
            `Processed ${itemCount} items for metadata initialization`
          );
          await new Promise((resolve) => setTimeout(resolve, 10));
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
        await this.updateSyncDiagnosticsCache();
        this.logger.log(
          "success",
          `✅ Local metadata initialized: ${itemCount} items, ${tombstoneCount} tombstones`
        );
      } else {
        this.logger.log("info", "No local items found to initialize metadata");
      }
      if (this.storageService && this.storageService.isConfigured()) {
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
                const data = await this.storageService.download(
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
            await this.updateSyncDiagnosticsCache();
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
        if (cloudMetadata?.items) {
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
            await this.storageService.upload(
              "metadata.json",
              cloudMetadata,
              true
            );
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

    async cleanupOldTombstones() {
      const now = Date.now();
      const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
      let cleanupCount = 0;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith("tcs_tombstone_")) {
          try {
            const tombstone = JSON.parse(localStorage.getItem(key));
            if (
              tombstone?.deleted &&
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
          metadata?.deleted &&
          now - metadata.deleted > tombstoneRetentionPeriod
        ) {
          delete this.metadata.items[itemId];
          cleanupCount++;
        }
      }
      if (cleanupCount > 0) {
        this.saveMetadata();
        await this.updateSyncDiagnosticsCache();
        this.logger.log("info", `🧹 Cleaned up ${cleanupCount} old tombstones`);
      }
      return cleanupCount;
    }
    async getCloudMetadataWithETag() {
      if (!this.storageService) {
        return { metadata: { lastSync: 0, items: {} }, etag: null };
      }
      try {
        const result = await this.storageService.downloadWithResponse(
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
        if (
          error.result &&
          error.result.error &&
          error.result.error.code === 404
        ) {
          return { metadata: { lastSync: 0, items: {} }, etag: null };
        }
        throw error;
      }
    }
    async getCloudMetadata() {
      const { metadata } = await this.getCloudMetadataWithETag();
      return metadata;
    }
    async getSyncDiagnostics() {
      try {
        const { totalSize, itemCount, excludedItemCount } =
          await this.dataService.estimateDataSize();
        const localCount = itemCount;
        let chatItems = 0;
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          for (const item of batch) {
            if (item.id.startsWith("CHAT_")) {
              chatItems++;
            }
          }
        }

        const metadataCount = Object.keys(this.metadata.items || {}).length;
        const metadataDeleted = Object.values(this.metadata.items || {}).filter(
          (item) => item.deleted
        ).length;
        const metadataActive = metadataCount - metadataDeleted;

        const cloudMetadata = await this.getCloudMetadata();
        const cloudCount = Object.keys(cloudMetadata.items || {}).length;
        const cloudDeleted = Object.values(cloudMetadata.items || {}).filter(
          (item) => item.deleted
        ).length;
        const cloudActive = cloudCount - cloudDeleted;
        const cloudChatItems = Object.keys(cloudMetadata.items || {}).filter(
          (id) => id.startsWith("CHAT_") && !cloudMetadata.items[id].deleted
        ).length;

        const hasIssues =
          localCount !== metadataActive ||
          metadataActive !== cloudActive ||
          chatItems !== cloudChatItems;

        const overallStatus = hasIssues ? "⚠️" : "✅";
        const lastUpdated = new Date().toLocaleTimeString();
        const summary = `Updated: ${lastUpdated}`;

        const details = [
          { type: "📱 Local Items", count: localCount },
          { type: "📋 Local Metadata", count: metadataActive },
          { type: "☁️ Cloud Metadata", count: cloudActive },
          { type: "💬 Chat Sync", count: `${chatItems} ⟷ ${cloudChatItems}` },
          { type: "⏭️ Skipped Items", count: excludedItemCount },
        ];

        const diagnosticsData = {
          timestamp: Date.now(),
          localItems: localCount,
          localMetadata: metadataActive,
          cloudMetadata: cloudActive,
          chatSyncLocal: chatItems,
          chatSyncCloud: cloudChatItems,
          excludedItemCount: excludedItemCount,
        };
        localStorage.setItem(
          "tcs_sync_diagnostics",
          JSON.stringify(diagnosticsData)
        );

        return { overallStatus, summary, details };
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to get sync diagnostics",
          error.message
        );
        return {
          overallStatus: "❌",
          summary: "Error fetching diagnostics",
          details: [],
        };
      }
    }
    async updateSyncDiagnosticsCache() {
      // Throttle diagnostics cache refresh: this is called frequently by auto-sync,
      // but it triggers cloud metadata reads and full local scans. Limit to once per 5 minutes.
      const _now = Date.now();
      const _last = Number(localStorage.getItem("tcs_sync_diag_last_update") || "0");
      const _minInterval = 5 * 60 * 1000;
      if (_last && _now - _last < _minInterval) {
        return;
      }
      localStorage.setItem("tcs_sync_diag_last_update", String(_now));
      try {
        const { totalSize, itemCount, excludedItemCount } =
          await this.dataService.estimateDataSize();
        const localCount = itemCount;
        let chatItems = 0;
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          for (const item of batch) {
            if (item.id.startsWith("CHAT_")) {
              chatItems++;
            }
          }
        }
        const metadataCount = Object.keys(this.metadata.items || {}).length;
        const metadataDeleted = Object.values(this.metadata.items || {}).filter(
          (item) => item.deleted
        ).length;
        const metadataActive = metadataCount - metadataDeleted;
        const cloudMetadata = await this.getCloudMetadata();
        const cloudCount = Object.keys(cloudMetadata.items || {}).length;
        const cloudDeleted = Object.values(cloudMetadata.items || {}).filter(
          (item) => item.deleted
        ).length;
        const cloudActive = cloudCount - cloudDeleted;
        const cloudChatItems = Object.keys(cloudMetadata.items || {}).filter(
          (id) => id.startsWith("CHAT_") && !cloudMetadata.items[id].deleted
        ).length;
        const diagnosticsData = {
          timestamp: Date.now(),
          localItems: localCount,
          localMetadata: metadataActive,
          cloudMetadata: cloudActive,
          chatSyncLocal: chatItems,
          chatSyncCloud: cloudChatItems,
          excludedItemCount: excludedItemCount,
        };
        localStorage.setItem(
          "tcs_sync_diagnostics",
          JSON.stringify(diagnosticsData)
        );
        this.logger.log("info", "📊 Sync diagnostics cache updated", {
          localItems: diagnosticsData.localItems,
          cloudItems: diagnosticsData.cloudMetadata,
          chatSync: `${diagnosticsData.chatSyncLocal}/${diagnosticsData.chatSyncCloud}`,
          timestamp: new Date(diagnosticsData.timestamp).toLocaleTimeString(),
        });
      } catch (error) {
        this.logger.log(
          "warning",
          "Failed to update sync diagnostics cache",
          error.message
        );
      }
    }
    async forceExportToCloud() {
      this.logger.log(
        "warning",
        "⚠️ User initiated Force Export. Cloud will be overwritten."
      );
      this.syncInProgress = true;
      try {
        const localKeys = await this.dataService.getAllItemKeys();
        const cloudObjects = await this.storageService.list("items/");
        const cloudKeys = new Set(
          cloudObjects.map((obj) =>
            obj.Key.replace(/^items\/(.*)\.json$/, "$1")
          )
        );
        this.logger.log(
          "info",
          `[Force Export] Found ${localKeys.size} local items and ${cloudKeys.size} cloud items.`
        );

        this.logger.log("start", "[Force Export] Uploading all local items...");
        let uploadedCount = 0;
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          const uploadPromises = batch.map((item) =>
            this.storageService.upload(`items/${item.id}.json`, item.data)
          );
          await Promise.allSettled(uploadPromises);
          uploadedCount += batch.length;
          this.logger.log(
            "info",
            `[Force Export] Uploaded batch. Total: ${uploadedCount}/${localKeys.size}`
          );
        }
        this.logger.log("success", "[Force Export] All local items uploaded.");

        const keysToDelete = [...cloudKeys].filter(
          (key) => !localKeys.has(key)
        );
        if (keysToDelete.length > 0) {
          this.logger.log(
            "start",
            `[Force Export] Deleting ${keysToDelete.length} extraneous cloud items...`
          );
          const deletePromises = keysToDelete.map((key) =>
            this.storageService.delete(`items/${key}.json`)
          );
          await Promise.allSettled(deletePromises);
          this.logger.log("success", "[Force Export] Cloud cleanup complete.");
        }

        this.logger.log(
          "start",
          "[Force Export] Rebuilding and uploading new metadata..."
        );
        const newMetadata = { lastSync: Date.now(), items: {} };
        const now = Date.now();
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          for (const item of batch) {
            const metadataEntry = {
              synced: now,
              type: item.type,
            };
            if (
              item.id.startsWith("CHAT_") &&
              item.type === "idb" &&
              item.data?.updatedAt
            ) {
              metadataEntry.lastModified = item.data.updatedAt;
              metadataEntry.chatFingerprint = this.getChatFingerprint(item.data);
            } else {
              metadataEntry.size = this.getItemSize(item.data);
              metadataEntry.lastModified = now;
            }
            newMetadata.items[item.id] = metadataEntry;
          }
        }
        await this.storageService.upload("metadata.json", newMetadata, true);

        this.metadata = newMetadata;
        this.saveMetadata();
        localStorage.removeItem("tcs_metadata_etag");
        this.setLastCloudSync(newMetadata.lastSync);
        this.logger.log(
          "success",
          "✅ [Force Export] Operation completed successfully."
        );
      } catch (error) {
        this.logger.log(
          "error",
          "❌ [Force Export] An error occurred during the operation.",
          error
        );
        throw error;
      } finally {
        this.syncInProgress = false;
        await this.updateSyncDiagnosticsCache();
      }
    }

    async forceImportFromCloud() {
      this.logger.log(
        "warning",
        "⚠️ User initiated Force Import. Local data will be overwritten."
      );
      this.syncInProgress = true;
      try {
        const cloudMetadata = await this.getCloudMetadata();
        if (Object.keys(cloudMetadata.items).length === 0) {
          this.logger.log(
            "warning",
            "[Force Import] Cloud metadata is empty. Aborting to prevent data loss."
          );
          throw new Error("Cloud contains no data; import aborted.");
        }
        const cloudKeys = new Set(Object.keys(cloudMetadata.items));
        const localKeys = await this.dataService.getAllItemKeys();
        this.logger.log(
          "info",
          `[Force Import] Found ${cloudKeys.size} items in cloud and ${localKeys.size} items locally.`
        );

        const keysToDelete = [...localKeys].filter(
          (key) => !cloudKeys.has(key)
        );
        if (keysToDelete.length > 0) {
          this.logger.log(
            "start",
            `[Force Import] Deleting ${keysToDelete.length} extraneous local items...`
          );
          const deletePromises = [];
          for (const key of keysToDelete) {
            const item = (await this.dataService.getItem(key, "idb"))
              ? { type: "idb" }
              : { type: "ls" };
            deletePromises.push(this.dataService.performDelete(key, item.type));
          }
          await Promise.allSettled(deletePromises);
          this.logger.log("success", "[Force Import] Local cleanup complete.");
        }

        this.logger.log(
          "start",
          `[Force Import] Applying ${cloudKeys.size} cloud items locally...`
        );
        const allCloudItems = Object.entries(cloudMetadata.items);
        const concurrency = 20;
        for (let i = 0; i < allCloudItems.length; i += concurrency) {
          const batch = allCloudItems.slice(i, i + concurrency);
          const downloadPromises = batch.map(async ([key, cloudItem]) => {
            if (cloudItem.deleted) {
              await this.dataService.performDelete(key, cloudItem.type);
            } else {
              const data = await this.storageService.download(
                `items/${key}.json`
              );
              await this.dataService.saveItem(data, cloudItem.type, key);
            }
          });
          await Promise.allSettled(downloadPromises);
          this.logger.log(
            "info",
            `[Force Import] Processed batch. Total: ${i + batch.length}/${
              allCloudItems.length
            }`
          );
        }
        this.logger.log(
          "success",
          "[Force Import] All cloud items applied locally."
        );

        this.metadata = cloudMetadata;
        this.saveMetadata();
        localStorage.removeItem("tcs_metadata_etag");
        this.setLastCloudSync(cloudMetadata.lastSync);
        this.logger.log(
          "success",
          "✅ [Force Import] Operation completed successfully. Page will reload."
        );
      } catch (error) {
        this.logger.log(
          "error",
          "❌ [Force Import] An error occurred during the operation.",
          error
        );
        throw error;
      } finally {
        this.syncInProgress = false;
        await this.updateSyncDiagnosticsCache();
      }
    }
    cleanup() {
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
      this.syncInProgress = false;
      this.config = null;
      this.dataService = null;
      this.storageService = null;
      this.logger = null;
      this.operationQueue = null;
      this.metadata = null;
    }
  }

  class BackupService {
    constructor(dataService, storageService, logger) {
      this.dataService = dataService;
      this.storageService = storageService;
      this.logger = logger;
      this.BACKUP_INDEX_KEY = "backups/manifest-index.json";
      // Re-entrancy / cross-trigger guards for daily backup
      this._dailyBackupRunning = false;
      this.DAILY_BACKUP_LOCK_KEY = "tcs_daily_backup_lock";
    }

    // UTC date as YYYYMMDD (cross-device stable)
    _getUtcDateString() {
      return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    }

    async _hasDailyBackupForTodayUtc() {
      const today = this._getUtcDateString();
      const index = (await this._getBackupIndex()) || [];
      return index.some(
        (m) =>
          m &&
          m.type === "daily-backup" &&
          m.backupFolder &&
          typeof m.backupFolder === "string" &&
          m.backupFolder.endsWith(today)
      );
    }


    async createSnapshot(name) {
      this.logger.log("start", `Creating server-side snapshot: ${name}`);
      try {
        await this.ensureSyncIsCurrent();
        return await this.createServerSideSnapshot(name);
      } catch (error) {
        this.logger.log(
          "error",
          "Server-side snapshot creation failed",
          error.message
        );
        throw error;
      }
    }

    async checkAndPerformDailyBackup() {
      if (!this.storageService || !this.storageService.isConfigured()) {
        this.logger.log(
          "skip",
          "Storage provider not configured, skipping daily backup."
        );
        return false;
      }

      // Throttle: avoid checking the cloud manifest on every auto-sync tick.
      // We retry at most every 30 minutes until the backup is confirmed/performed for the current UTC day.
      const nowMs = Date.now();
      const todayUtc = this._getUtcDateString();
      const lastAttemptDay = localStorage.getItem("tcs_daily_backup_attempt_day") || "";
      const lastAttemptMs = Number(localStorage.getItem("tcs_daily_backup_attempt_ms") || "0");
      const attemptCooldownMs = 30 * 60 * 1000; // 30 minutes
      if (lastAttemptDay === todayUtc && lastAttemptMs && nowMs - lastAttemptMs < attemptCooldownMs) {
        this.logger.log("skip", "Daily backup check throttled (cooldown active).");
        return false;
      }
      localStorage.setItem("tcs_daily_backup_attempt_day", todayUtc);
      localStorage.setItem("tcs_daily_backup_attempt_ms", String(nowMs));

      // In-tab re-entrancy guard (prevents parallel runs during app start).
      if (this._dailyBackupRunning) {
        this.logger.log("skip", "Daily backup already running, skipping.");
        return false;
      }

      // Same-device lock (prevents multiple triggers/tabs from starting the backup concurrently).
      const lockNowMs = Date.now();
      const lockTtlMs = 30 * 60 * 1000; // 30 minutes
      const lastLock = Number(localStorage.getItem(this.DAILY_BACKUP_LOCK_KEY) || "0");
      if (lastLock && lockNowMs - lastLock < lockTtlMs) {
        this.logger.log("skip", "Daily backup lock active, skipping.");
        return false;
      }

      // Set lock early (do not wait for completion) to avoid request storms.
      localStorage.setItem(this.DAILY_BACKUP_LOCK_KEY, String(lockNowMs));
      this._dailyBackupRunning = true;

      try {
        // Variant B: global once-per-day (cross-device) using the cloud manifest index.
        const alreadyDoneInCloud = await this._hasDailyBackupForTodayUtc();
        if (alreadyDoneInCloud) {
          this.logger.log("info", "Daily backup already exists in cloud for today (UTC).");
          return false;
        }

        this.logger.log("info", "Starting daily backup...");
        await this.performDailyBackup();

        // Keep a local marker for diagnostics (cloud is the source of truth).
        localStorage.setItem("tcs_last-daily-backup", this._getUtcDateString());

        this.logger.log("success", "Daily backup completed");
        return true;
      } finally {
        localStorage.removeItem(this.DAILY_BACKUP_LOCK_KEY);
        this._dailyBackupRunning = false;
      }
    }

    async performDailyBackup() {
      this.logger.log("info", "Starting daily backup (export-style upload)");
      try {
        await this.ensureSyncIsCurrent();
        // NOTE:
        // Cloudflare R2 (and other S3-compatible backends) may accept CopyObject
        // requests but still produce 0-byte destination objects.
        // To ensure reliable daily backups, we use the same strategy as the UI
        // "Export" path: serialize from local data and upload via PUT.
        return await this.createDailyBackupFromLocalExport();
      } catch (error) {
        this.logger.log(
          "error",
          "Daily backup failed",
          error.message
        );
        throw error;
      }
    }

    async ensureSyncIsCurrent() {
      this.logger.log("info", "Ensuring sync is current before backup");
      const orchestrator = window.cloudSyncApp?.syncOrchestrator;
      if (orchestrator && !orchestrator.syncInProgress) {
        try {
          await orchestrator.performFullSync();
          this.logger.log("success", "Sync completed before backup");
        } catch (error) {
          this.logger.log(
            "warning",
            `Pre-backup sync failed: ${error.message}, proceeding with backup anyway`
          );
        }
      } else {
        this.logger.log(
          "info",
          "Sync already in progress or not available, proceeding with backup"
        );
      }
    }

    /**
     * Daily backup implementation that mirrors the UI "Export" path.
     *
     * Rationale:
     * - Server-side copy operations (CopyObject) can create 0-byte objects on
     *   some S3-compatible backends (notably Cloudflare R2).
     * - Export-style backups serialize from local data and upload via PUT,
     *   yielding deterministic, content-correct backup objects.
     */
    async createDailyBackupFromLocalExport() {
      const dateString = this._getUtcDateString();
      const backupFolder = `backups/typingmind-backup-${dateString}`;

      // For providers that model folders explicitly (e.g. Google Drive), remove
      // the existing daily backup folder to ensure a clean, deterministic run.
      if (this.storageService instanceof GoogleDriveService) {
        await this.storageService._deleteFolderIfExists(backupFolder);
      }

      this.logger.log(
        "info",
        `Creating daily backup via upload: ${backupFolder} (local export snapshot)`
      );

      const itemsDestinationPath = `${backupFolder}/items`;
      await this.storageService.ensurePathExists(itemsDestinationPath);

      const orchestrator = window.cloudSyncApp?.syncOrchestrator;
      const now = Date.now();
      let uploadedItems = 0;
      let totalItems = 0;

      try {
        // Upload all items from local storage into the backup folder.
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          totalItems += batch.length;

          const uploadPromises = batch.map(async (item) => {
            const key = `${backupFolder}/items/${item.id}.json`;
            await this.storageService.upload(key, item.data);
          });
          const results = await Promise.allSettled(uploadPromises);
          uploadedItems += results.filter((r) => r.status === "fulfilled").length;

          if (uploadedItems % 200 === 0) {
            this.logger.log(
              "info",
              `Daily backup upload progress: ${uploadedItems}/${totalItems}`
            );
          }
        }

        // Build a metadata snapshot for the backup (same semantics as Force Export).
        const backupMetadata = { lastSync: now, items: {} };
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          for (const item of batch) {
            const metadataEntry = {
              synced: now,
              type: item.type,
            };

            // Prefer orchestrator helpers for fidelity (fingerprint/size).
            if (
              orchestrator &&
              item.id.startsWith("CHAT_") &&
              item.type === "idb" &&
              item.data?.updatedAt
            ) {
              metadataEntry.lastModified = item.data.updatedAt;
              if (typeof orchestrator.getChatFingerprint === "function") {
                metadataEntry.chatFingerprint = orchestrator.getChatFingerprint(
                  item.data
                );
              }
            } else {
              if (orchestrator && typeof orchestrator.getItemSize === "function") {
                metadataEntry.size = orchestrator.getItemSize(item.data);
              }
              metadataEntry.lastModified = now;
            }

            backupMetadata.items[item.id] = metadataEntry;
          }
        }

        await this.storageService.upload(
          `${backupFolder}/metadata.json`,
          backupMetadata,
          true
        );

        const manifest = {
          type: "daily-backup",
          name: "daily-auto",
          created: now,
          totalItems: totalItems,
          copiedItems: uploadedItems,
          format: "export-upload",
          version: "3.1",
          backupFolder: backupFolder,
        };

        await this.storageService.upload(
          `${backupFolder}/backup-manifest.json`,
          manifest,
          true
        );
        await this._addOrUpdateBackupInIndex(manifest);

        this.logger.log(
          "success",
          `Daily backup created via upload: ${backupFolder} (${uploadedItems}/${totalItems} items uploaded)`
        );

        await this.cleanupOldBackups();
        return true;
      } catch (error) {
        const errorMessage =
          error.result?.error?.message ||
          error.message ||
          JSON.stringify(error);
        this.logger.log("error", `Daily backup via upload failed: ${errorMessage}`);
        throw error;
      }
    }

    async createServerSideSnapshot(name) {
      this.logger.log(
        "info",
        "Creating server-side snapshot using provider's copy operations"
      );
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "");
      const backupFolder = `backups/s-${name.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${timestamp}`;

      if (this.storageService instanceof GoogleDriveService) {
        await this.storageService._deleteFolderIfExists(backupFolder);
      }

      try {
        const itemsDestinationPath = `${backupFolder}/items`;
        this.logger.log(
          "info",
          `Pre-creating backup path: "${itemsDestinationPath}"`
        );
        await this.storageService.ensurePathExists(itemsDestinationPath);
        this.logger.log("success", "Backup path created successfully.");

        const itemsList = await this.storageService.list("items/");
        this.logger.log(
          "info",
          `Found ${itemsList.length} items to backup via server-side copy`
        );

        let copiedItems = 0;
        const itemsToProcess = itemsList.filter(
          (item) => item.Key && item.Key.startsWith("items/")
        );

        const concurrency = 20;
        for (let i = 0; i < itemsToProcess.length; i += concurrency) {
          const batch = itemsToProcess.slice(i, i + concurrency);
          const copyPromises = batch.map(async (item) => {
            try {
              const destinationKey = `${backupFolder}/${item.Key}`;
              await this.storageService.copyObject(item.Key, destinationKey);
              return { success: true, key: item.Key };
            } catch (copyError) {
              const errorMessage =
                copyError.result?.error?.message ||
                copyError.message ||
                JSON.stringify(copyError);
              this.logger.log(
                "warning",
                `Failed to copy item ${item.Key}: ${errorMessage}`
              );
              return { success: false, key: item.Key, error: errorMessage };
            }
          });

          const batchResults = await Promise.allSettled(copyPromises);
          const successfulCopies = batchResults.filter(
            (result) => result.status === "fulfilled" && result.value?.success
          ).length;
          copiedItems += successfulCopies;

          if (
            copiedItems % 200 === 0 ||
            i + concurrency >= itemsToProcess.length
          ) {
            this.logger.log(
              "info",
              `Server-side copied ${copiedItems}/${itemsToProcess.length} items`
            );
          }
        }

        try {
          const metadataDestination = `${backupFolder}/metadata.json`;
          await this.storageService.copyObject(
            "metadata.json",
            metadataDestination
          );
          this.logger.log(
            "info",
            "Server-side copied metadata.json to snapshot"
          );
        } catch (metadataError) {
          this.logger.log(
            "warning",
            `Failed to copy metadata: ${metadataError.message}`
          );
        }

        const manifest = {
          type: "server-side-snapshot",
          name: name,
          created: Date.now(),
          totalItems: itemsToProcess.length,
          copiedItems: copiedItems,
          format: "server-side",
          version: "3.0",
          backupFolder: backupFolder,
        };

        await this.storageService.upload(
          `${backupFolder}/backup-manifest.json`,
          manifest,
          true
        );
        await this._addOrUpdateBackupInIndex(manifest);

        this.logger.log(
          "success",
          `Server-side snapshot created: ${backupFolder} (${copiedItems} items copied)`
        );
        return true;
      } catch (error) {
        const errorMessage =
          error.result?.error?.message ||
          error.message ||
          JSON.stringify(error);
        this.logger.log(
          "error",
          `Server-side snapshot failed: ${errorMessage}`
        );
        throw error;
      }
    }

    async createServerSideDailyBackup() {
      this.logger.log(
        "info",
        "Creating server-side daily backup using provider's copy operations"
      );
      const today = new Date();
      const dateString = `${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const backupFolder = `backups/typingmind-backup-${dateString}`;

      if (this.storageService instanceof GoogleDriveService) {
        await this.storageService._deleteFolderIfExists(backupFolder);
      }

      try {
        const itemsDestinationPath = `${backupFolder}/items`;
        this.logger.log(
          "info",
          `Pre-creating backup path: "${itemsDestinationPath}"`
        );
        await this.storageService.ensurePathExists(itemsDestinationPath);
        this.logger.log("success", "Backup path created successfully.");

        const itemsList = await this.storageService.list("items/");
        this.logger.log(
          "info",
          `Found ${itemsList.length} items for server-side daily backup`
        );

        let copiedItems = 0;
        const itemsToProcess = itemsList.filter(
          (item) => item.Key && item.Key.startsWith("items/")
        );

        const concurrency = 20;
        for (let i = 0; i < itemsToProcess.length; i += concurrency) {
          const batch = itemsToProcess.slice(i, i + concurrency);
          const copyPromises = batch.map(async (item) => {
            try {
              const destinationKey = `${backupFolder}/${item.Key}`;
              await this.storageService.copyObject(item.Key, destinationKey);
              return { success: true, key: item.Key };
            } catch (copyError) {
              const errorMessage =
                copyError.result?.error?.message ||
                copyError.message ||
                JSON.stringify(copyError);
              this.logger.log(
                "warning",
                `Failed to copy item ${item.Key}: ${errorMessage}`
              );
              return { success: false, key: item.Key, error: errorMessage };
            }
          });

          const batchResults = await Promise.allSettled(copyPromises);
          const successfulCopies = batchResults.filter(
            (result) => result.status === "fulfilled" && result.value?.success
          ).length;
          copiedItems += successfulCopies;

          if (
            copiedItems % 200 === 0 ||
            i + concurrency >= itemsToProcess.length
          ) {
            this.logger.log(
              "info",
              `Daily backup: server-side copied ${copiedItems}/${itemsToProcess.length} items`
            );
          }
        }

        try {
          const metadataDestination = `${backupFolder}/metadata.json`;
          await this.storageService.copyObject(
            "metadata.json",
            metadataDestination
          );
          this.logger.log(
            "info",
            "Server-side copied metadata.json to daily backup"
          );
        } catch (metadataError) {
          this.logger.log(
            "warning",
            `Failed to copy metadata to daily backup: ${metadataError.message}`
          );
        }

        const manifest = {
          type: "server-side-daily-backup",
          name: "daily-auto",
          created: Date.now(),
          totalItems: itemsToProcess.length,
          copiedItems: copiedItems,
          format: "server-side",
          version: "3.0",
          backupFolder: backupFolder,
        };

        await this.storageService.upload(
          `${backupFolder}/backup-manifest.json`,
          manifest,
          true
        );
        await this._addOrUpdateBackupInIndex(manifest);

        this.logger.log(
          "success",
          `Server-side daily backup created: ${backupFolder} (${copiedItems} items copied)`
        );
        await this.cleanupOldBackups();
        return true;
      } catch (error) {
        const errorMessage =
          error.result?.error?.message ||
          error.message ||
          JSON.stringify(error);
        this.logger.log(
          "error",
          `Server-side daily backup failed: ${errorMessage}`
        );
        throw error;
      }
    }

    /**
     * Reliable daily backup implementation.
     *
     * Instead of server-side CopyObject operations (which can result in 0-byte
     * objects on some S3-compatible providers like Cloudflare R2), this method
     * performs an "export-style" backup:
     *   - reads local data via DataService
     *   - uploads each item to the daily backup folder via PUT
     *   - rebuilds a consistent metadata.json and uploads it to the backup folder
     */
    async createDailyBackupFromLocalExport() {
      this.logger.log(
        "info",
        "Creating daily backup via export-style uploads (robust mode)"
      );

      const today = new Date();
      const dateString = `${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const backupFolder = `backups/typingmind-backup-${dateString}`;

      // For Google Drive we replace the folder to keep behavior consistent
      if (this.storageService instanceof GoogleDriveService) {
        await this.storageService._deleteFolderIfExists(backupFolder);
      }

      const orchestrator = window.cloudSyncApp?.syncOrchestrator;
      if (!orchestrator) {
        throw new Error(
          "Sync orchestrator not available. Cannot create export-style backup."
        );
      }

      try {
        const itemsDestinationPath = `${backupFolder}/items`;
        this.logger.log(
          "info",
          `Pre-creating backup path: "${itemsDestinationPath}"`
        );
        await this.storageService.ensurePathExists(itemsDestinationPath);
        this.logger.log("success", "Backup path created successfully.");

        // Upload items from local storage
        let totalLocalItems = 0;
        try {
          const localKeys = await this.dataService.getAllItemKeys();
          totalLocalItems = localKeys?.size || 0;
        } catch (_) {
          // Non-critical. We'll compute totals from stream as we go.
        }

        this.logger.log(
          "start",
          `Uploading local items to daily backup...$${
            totalLocalItems ? ` (estimated ${totalLocalItems})` : ""
          }`
        );

        let uploadedItems = 0;
        const concurrency = 20;

        for await (const batch of this.dataService.streamAllItemsInternal()) {
          // Concurrency-limited uploads per batch
          for (let i = 0; i < batch.length; i += concurrency) {
            const slice = batch.slice(i, i + concurrency);
            const uploadPromises = slice.map(async (item) => {
              const key = `${backupFolder}/items/${item.id}.json`;
              await this.storageService.upload(key, item.data);
              return true;
            });
            await Promise.allSettled(uploadPromises);
            uploadedItems += slice.length;
          }

          if (uploadedItems % 200 === 0) {
            this.logger.log(
              "info",
              `Daily backup: uploaded ${uploadedItems}$${
                totalLocalItems ? `/${totalLocalItems}` : ""
              } items`
            );
          }
        }

        this.logger.log(
          "success",
          `Daily backup: uploaded ${uploadedItems} items successfully.`
        );

        // Rebuild metadata.json consistent with local state
        this.logger.log(
          "start",
          "Rebuilding metadata.json for daily backup..."
        );
        const newMetadata = { lastSync: Date.now(), items: {} };
        const now = Date.now();
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          for (const item of batch) {
            const metadataEntry = {
              synced: now,
              type: item.type,
            };
            if (
              item.id.startsWith("CHAT_") &&
              item.type === "idb" &&
              item.data?.updatedAt
            ) {
              metadataEntry.lastModified = item.data.updatedAt;
              metadataEntry.chatFingerprint = orchestrator.getChatFingerprint(
                item.data
              );
            } else {
              metadataEntry.size = orchestrator.getItemSize(item.data);
              metadataEntry.lastModified = now;
            }
            newMetadata.items[item.id] = metadataEntry;
          }
        }

        await this.storageService.upload(
          `${backupFolder}/metadata.json`,
          newMetadata,
          true
        );
        this.logger.log("success", "metadata.json uploaded to daily backup");

        const manifest = {
          type: "daily-backup",
          name: "daily-auto",
          created: Date.now(),
          totalItems: uploadedItems,
          copiedItems: uploadedItems,
          format: "export-style",
          version: "3.1",
          backupFolder: backupFolder,
        };

        await this.storageService.upload(
          `${backupFolder}/backup-manifest.json`,
          manifest,
          true
        );
        await this._addOrUpdateBackupInIndex(manifest);

        this.logger.log(
          "success",
          `Daily backup created: ${backupFolder} (${uploadedItems} items uploaded)`
        );

        await this.cleanupOldBackups();
        return true;
      } catch (error) {
        const errorMessage =
          error.result?.error?.message ||
          error.message ||
          JSON.stringify(error);
        this.logger.log(
          "error",
          `Daily backup (export-style) failed: ${errorMessage}`
        );
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

    async _getBackupIndex() {
      try {
        const index = await this.storageService.download(
          this.BACKUP_INDEX_KEY,
          true
        );
        return Array.isArray(index) ? index : [];
      } catch (error) {
        if (error.code === "NoSuchKey" || error.statusCode === 404) {
          this.logger.log("info", "Backup index not found, will create it.");
          return null;
        }
        // Handle corrupted JSON gracefully
        if (error.message && error.message.includes('Invalid JSON')) {
          this.logger.log("warn", "Backup index is corrupted, will rebuild it.");
          // Try to delete the corrupted index
          try {
            await this.storageService.delete(this.BACKUP_INDEX_KEY);
            this.logger.log("info", "Corrupted backup index deleted.");
          } catch (deleteError) {
            this.logger.log("warn", "Could not delete corrupted index", deleteError);
          }
          return null;
        }
        throw error;
      }
    }

    async _addOrUpdateBackupInIndex(newManifest) {
      try {
        let index = (await this._getBackupIndex()) || [];
        const filteredIndex = index.filter(
          (m) => m.backupFolder !== newManifest.backupFolder
        );
        filteredIndex.push(newManifest);
        await this.storageService.upload(
          this.BACKUP_INDEX_KEY,
          filteredIndex,
          true
        );
        this.logger.log("info", "Backup index updated with new backup.");
      } catch (error) {
        this.logger.log(
          "warning",
          "Could not update backup index. It may be rebuilt on next load.",
          error
        );
      }
    }

    async _removeBackupFromIndex(manifestKey) {
      try {
        let index = await this._getBackupIndex();
        if (index === null) return;
        const backupFolderToDelete = manifestKey.replace(
          "/backup-manifest.json",
          ""
        );
        const updatedIndex = index.filter(
          (m) => m.backupFolder !== backupFolderToDelete
        );
        if (updatedIndex.length < index.length) {
          await this.storageService.upload(
            this.BACKUP_INDEX_KEY,
            updatedIndex,
            true
          );
          this.logger.log("info", "Backup index updated after deletion.");
        }
      } catch (error) {
        this.logger.log(
          "warning",
          "Could not update backup index after deletion.",
          error
        );
      }
    }

    async loadBackupList() {
      try {
        let manifests = await this._getBackupIndex();

        if (manifests === null) {
          this.logger.log(
            "info",
            "Performing one-time scan to build backup index. This may take a moment."
          );
          const objects = await this.storageService.list("backups/");
          const manifestPromises = [];

          if (this.storageService instanceof GoogleDriveService) {
            for (const folder of objects) {
              const manifestKey = `${folder.Key}/backup-manifest.json`;
              manifestPromises.push(
                this.storageService
                  .download(manifestKey, true)
                  .catch(() => null)
              );
            }
          } else {
            for (const obj of objects) {
              if (obj.Key.endsWith("/backup-manifest.json")) {
                manifestPromises.push(
                  this.storageService.download(obj.Key, true).catch(() => null)
                );
              }
            }
          }
          const downloadedManifests = (
            await Promise.all(manifestPromises)
          ).filter(Boolean);
          await this.storageService.upload(
            this.BACKUP_INDEX_KEY,
            downloadedManifests,
            true
          );
          this.logger.log("success", "Backup index created from full scan.");
          manifests = downloadedManifests;
        }

        const backups = [];
        for (const manifest of manifests) {
          if (manifest && manifest.backupFolder) {
            const backupFolder = manifest.backupFolder;
            const backupName = backupFolder.replace("backups/", "");
            const backupType = this.getBackupType(backupName);
            backups.push({
              key: `${backupFolder}/backup-manifest.json`,
              name: backupName,
              displayName: backupName,
              modified: new Date(manifest.created),
              format: "server-side",
              totalItems: manifest.totalItems,
              copiedItems: manifest.copiedItems,
              type: backupType,
              backupFolder: backupFolder,
              sortOrder: backupType === "snapshot" ? 1 : 2,
            });
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

    async restoreFromBackup(key) {
      this.logger.log("start", `Restoring from backup: ${key}`);
      try {
        if (key.endsWith("/backup-manifest.json")) {
          return await this.restoreFromServerSideBackup(key);
        } else {
          this.logger.log(
            "error",
            "Invalid or unsupported backup format selected for restore."
          );
          throw new Error("Unsupported backup format");
        }
      } catch (error) {
        this.logger.log("error", "Backup restoration failed", error.message);
        throw error;
      }
    }

    async restoreFromServerSideBackup(manifestKey) {
      this.logger.log("info", "Restoring from server-side backup format");

      try {
        const manifest = await this.storageService.download(manifestKey, true);
        if (!manifest || manifest.format !== "server-side") {
          throw new Error("Invalid server-side backup manifest");
        }

        const backupFolder = manifest.backupFolder;
        this.logger.log(
          "info",
          `Restoring server-side backup: ${manifest.name} (${manifest.totalItems} items)`
        );

        const backupFiles = await this.storageService.list(backupFolder + "/");
        const itemFiles = backupFiles.filter(
          (file) =>
            file.Key.startsWith(backupFolder + "/items/") &&
            file.Key.endsWith(".json")
        );

        this.logger.log(
          "info",
          `Found ${itemFiles.length} items to restore via provider copy`
        );
        this.logger.log(
          "warning",
          "⚠️ CRITICAL: This will overwrite ALL cloud data."
        );

        let restoredCount = 0;
        const concurrency = 20;

        for (let i = 0; i < itemFiles.length; i += concurrency) {
          const batch = itemFiles.slice(i, i + concurrency);
          const copyPromises = batch.map(async (file) => {
            try {
              const itemFilename = file.Key.replace(backupFolder + "/", "");
              await this.storageService.copyObject(file.Key, itemFilename);
              return { success: true, key: file.Key };
            } catch (copyError) {
              this.logger.log(
                "warning",
                `Failed to restore item ${file.Key}: ${copyError.message}`
              );
              return {
                success: false,
                key: file.Key,
                error: copyError.message,
              };
            }
          });

          const batchResults = await Promise.allSettled(copyPromises);
          const successfulRestores = batchResults.filter(
            (result) => result.status === "fulfilled" && result.value?.success
          ).length;
          restoredCount += successfulRestores;

          if (
            restoredCount % 200 === 0 ||
            i + concurrency >= itemFiles.length
          ) {
            this.logger.log(
              "info",
              `Server-side restored ${restoredCount}/${itemFiles.length} items`
            );
          }
        }

        const metadataFile = backupFiles.find(
          (file) => file.Key === backupFolder + "/metadata.json"
        );
        if (metadataFile) {
          try {
            await this.storageService.copyObject(
              metadataFile.Key,
              "metadata.json"
            );
            this.logger.log("info", "Server-side restored metadata.json");
          } catch (metadataError) {
            this.logger.log(
              "warning",
              `Failed to restore metadata: ${metadataError.message}`
            );
          }
        }

        this.logger.log(
          "start",
          "🧹 Starting local data reconciliation post-restore..."
        );

        const restoredCloudMetadata = await this.storageService.download(
          "metadata.json",
          true
        );
        const validCloudKeys = new Set(
          Object.keys(restoredCloudMetadata.items || {})
        );
        this.logger.log(
          "info",
          `Restored state contains ${validCloudKeys.size} valid items.`
        );

        const localItemsIterator = this.dataService.streamAllItemsInternal();
        let cleanedItemCount = 0;
        let deletionPromises = [];
        this.logger.log(
          "info",
          "Scanning local database for extraneous items..."
        );

        for await (const batch of localItemsIterator) {
          for (const localItem of batch) {
            if (!validCloudKeys.has(localItem.id)) {
              deletionPromises.push(
                this.dataService.performDelete(localItem.id, localItem.type)
              );
              cleanedItemCount++;
            }
          }
          if (deletionPromises.length > 50) {
            await Promise.all(deletionPromises);
            deletionPromises = [];
          }
        }
        if (deletionPromises.length > 0) {
          await Promise.all(deletionPromises);
        }

        if (cleanedItemCount > 0) {
          this.logger.log(
            "success",
            `✅ Successfully cleaned up ${cleanedItemCount} extraneous local items.`
          );
        } else {
          this.logger.log(
            "info",
            "✅ No extraneous local items found. Local DB is clean."
          );
        }

        localStorage.removeItem("tcs_local-metadata");
        localStorage.removeItem("tcs_last-cloud-sync");
        localStorage.removeItem("tcs_metadata_etag");

        this.logger.log(
          "success",
          `Server-side backup restore completed: ${restoredCount} items restored via provider copy`
        );
        this.logger.log(
          "success",
          "Page will reload in 3 seconds to sync restored data."
        );

        setTimeout(() => {
          window.location.reload();
        }, 3000);

        return true;
      } catch (error) {
        this.logger.log(
          "error",
          `Server-side backup restore failed: ${error.message}`
        );
        throw error;
      }
    }

    async cleanupOldBackups() {
      try {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        let deletedBackups = 0;

        const index = await this._getBackupIndex();
        if (!index) return;

        const remainingManifests = [];
        const manifestsToDelete = [];

        for (const manifest of index) {
          const isOld = new Date(manifest.created).getTime() < thirtyDaysAgo;
          if (isOld && manifest.type === "server-side-daily-backup") {
            manifestsToDelete.push(manifest);
          } else {
            remainingManifests.push(manifest);
          }
        }

        if (manifestsToDelete.length > 0) {
          for (const manifest of manifestsToDelete) {
            try {
              const backupFolder = manifest.backupFolder;
              await this.storageService.deleteFolder(backupFolder);
              deletedBackups++;
              this.logger.log(
                "info",
                `Cleaned up old daily backup: ${backupFolder}`
              );
            } catch (error) {
              this.logger.log(
                "warning",
                `Failed to cleanup backup folder: ${manifest.backupFolder}`
              );
              remainingManifests.push(manifest);
            }
          }

          await this.storageService.upload(
            this.BACKUP_INDEX_KEY,
            remainingManifests,
            true
          );
        }

        if (deletedBackups > 0) {
          this.logger.log(
            "success",
            `Cleaned up ${deletedBackups} old daily backups`
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
      this.logger?.log("info", "🧹 OperationQueue cleanup starting");
      try {
        this.clear();
        this.lastCleanup = 0;
        this.maxRetries = 0;
        this.maxQueueSize = 0;
        this.logger?.log("success", "✅ OperationQueue cleanup completed");
        this.logger = null;
      } catch (error) {
        console.warn("OperationQueue cleanup error:", error);
      }
    }
  }

  class LeaderElection {
    constructor(channelName, logger) {
      this.channelName = channelName;
      this.logger = logger;
      this.tabId = `tab_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      this.leaderId = null;
      this.isLeader = false;
      this.channel = null;
      this.heartbeatInterval = null;
      this.electionTimeout = null;
      this.leaderTimeout = null;
      this.onBecameLeaderCallback = () => {};
      this.onBecameFollowerCallback = () => {};
      this.HEARTBEAT_INTERVAL = 5000;
      this.FAST_LEADER_TIMEOUT = 12000;
      this.SLOW_LEADER_TIMEOUT = 70000;
      this.ELECTION_TIMEOUT = 100;
      this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
      try {
        if ("BroadcastChannel" in window) {
          this.channel = new BroadcastChannel(this.channelName);
          this.channel.onmessage = this.handleMessage.bind(this);
          document.addEventListener(
            "visibilitychange",
            this.visibilityChangeHandler
          );
        } else {
          this.logger.log(
            "warning",
            "BroadcastChannel not supported. Multi-tab sync will not be safe."
          );
          this.becomeLeader();
        }
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to create BroadcastChannel.",
          error.message
        );
      }
    }
    elect() {
      if (!this.channel) {
        this.becomeLeader();
        return;
      }
      this.logger.log(
        "info",
        `[LeaderElection] Tab ${this.tabId} starting election.`
      );
      this.clearElectionTimeout();
      this.postMessage({ type: "request-leader" });
      this.electionTimeout = setTimeout(() => {
        this.logger.log(
          "info",
          `[LeaderElection] No leader responded within ${this.ELECTION_TIMEOUT}ms.`
        );
        this.becomeLeader();
      }, this.ELECTION_TIMEOUT);
    }
    handleVisibilityChange() {
      if (document.visibilityState === "visible" && this.isLeader) {
        this.logger.log(
          "info",
          `[LeaderElection] Tab ${this.tabId} became visible and believes it's the leader. Re-running election to confirm.`
        );
        this.elect();
      }

      if (this.isLeader) {
        this.postMessage({
          type: "ping",
          id: this.tabId,
          visibilityState: document.visibilityState,
        });
      }
    }
    becomeLeader() {
      this.logger.log(
        "info",
        `[LeaderElection] 👑 Tab ${this.tabId} is now the LEADER.`
      );
      this.isLeader = true;
      this.leaderId = this.tabId;
      this.clearElectionTimeout();
      this.clearLeaderTimeout();
      if (this.channel) {
        this.postMessage({ type: "iam-leader", id: this.tabId });
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          this.postMessage({
            type: "ping",
            id: this.tabId,
            visibilityState: document.visibilityState,
          });
        }, this.HEARTBEAT_INTERVAL);
      }
      this.onBecameLeaderCallback();
    }
    becomeFollower(leaderId) {
      if (this.isLeader) {
        this.logger.log(
          "info",
          `[LeaderElection] 🚶‍♀️ Tab ${this.tabId} is now a FOLLOWER.`
        );
      }
      this.isLeader = false;
      this.leaderId = leaderId;
      this.clearElectionTimeout();
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      this.resetLeaderTimeout();
      this.onBecameFollowerCallback();
    }
    handleMessage(event) {
      const msg = event.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "request-leader":
          if (this.isLeader) {
            this.postMessage({ type: "pong", id: this.tabId });
          }
          break;
        case "iam-leader":
          if (msg.id !== this.tabId) {
            this.becomeFollower(msg.id);
          }
          break;
        case "leader-unloading":
          if (msg.id === this.leaderId) {
            this.logger.log(
              "info",
              `[LeaderElection] Leader ${msg.id} is unloading. Starting new election immediately.`
            );
            this.leaderId = null;
            this.elect();
          }
          break;
        case "pong":
          if (msg.id !== this.tabId) {
            this.becomeFollower(msg.id);
          }
          break;
        case "ping":
          if (msg.id !== this.tabId && msg.id === this.leaderId) {
            this.resetLeaderTimeout(msg.visibilityState);
          }
          break;
      }
    }
    resetLeaderTimeout(leaderVisibilityState = "visible") {
      this.clearLeaderTimeout();
      const timeout =
        leaderVisibilityState === "visible"
          ? this.FAST_LEADER_TIMEOUT
          : this.SLOW_LEADER_TIMEOUT;
      this.leaderTimeout = setTimeout(() => {
        this.logger.log(
          "warning",
          `[LeaderElection] Leader ${this.leaderId} timed out (state: ${leaderVisibilityState}). Starting new election.`
        );
        this.leaderId = null;
        this.elect();
      }, timeout);
    }
    clearElectionTimeout() {
      if (this.electionTimeout) {
        clearTimeout(this.electionTimeout);
        this.electionTimeout = null;
      }
    }
    clearLeaderTimeout() {
      if (this.leaderTimeout) {
        clearTimeout(this.leaderTimeout);
        this.leaderTimeout = null;
      }
    }
    postMessage(msg) {
      try {
        this.channel?.postMessage(msg);
      } catch (error) {
        this.logger.log(
          "error",
          "[LeaderElection] Failed to post message.",
          error.message
        );
      }
    }
    onBecameLeader(callback) {
      this.onBecameLeaderCallback = callback;
    }
    onBecameFollower(callback) {
      this.onBecameFollowerCallback = callback;
    }
    cleanup() {
      this.logger.log("info", "[LeaderElection] Cleaning up.");
      if (this.isLeader) {
        this.postMessage({ type: "leader-unloading", id: this.tabId });
      }
      if (this.channel) {
        this.channel.close();
        this.channel = null;
      }
      document.removeEventListener(
        "visibilitychange",
        this.visibilityChangeHandler
      );
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.clearElectionTimeout();
      this.clearLeaderTimeout();
    }
  }

  class CloudSyncApp {
    constructor() {
      this.footerHTML =
        '<span style="color:rgb(197, 192, 192);">Developed & Maintained by Thomas @ ITCON, AU</span> <br><a href="https://github.com/itcon-pty-au/typingmind-cloud-backup" target="_blank" rel="noopener noreferrer" style="color:rgb(197, 192, 192);">Github</a> | <a href="https://buymeacoffee.com/itcon" target="_blank" rel="noopener noreferrer" style="color: #fbbf24;">Buy me a coffee!</a>';
      this.logger = new Logger();
      this.config = new ConfigManager();
      this.operationQueue = new OperationQueue(this.logger);
      this.dataService = new DataService(
        this.config,
        this.logger,
        this.operationQueue
      );
      this.cryptoService = new CryptoService(this.config, this.logger);

      this.storageService = null;
      this.providerRegistry = new Map();

      this.syncOrchestrator = null;
      this.backupService = null;

      this.autoSyncInterval = null;
      this.eventListeners = [];
      this.modalCleanupCallbacks = [];
      this.noSyncMode = false;
      this.diagnosticsExpanded = false;
      this.backupsExpanded = false;
      this.providerExpanded = false;
      this.commonExpanded = false;
      this.hasShownTokenExpiryAlert = false;
      this.leaderElection = null;
      // Load auto-sync enabled state from localStorage (device-specific, not synced)
      this.autoSyncEnabled = this.getAutoSyncEnabled();
    }

    getAutoSyncEnabled() {
      const stored = localStorage.getItem('tcs_autosync_enabled');
      // Default to true (enabled) if not set
      return stored === null ? true : stored === 'true';
    }

    setAutoSyncEnabled(enabled) {
      this.autoSyncEnabled = enabled;
      localStorage.setItem('tcs_autosync_enabled', enabled.toString());
      this.logger.log('info', `Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
      
      if (enabled) {
        // Re-start auto-sync if it was disabled
        if (this.storageService?.isConfigured() && !this.noSyncMode) {
          this.startAutoSync();
        }
      } else {
        // Stop auto-sync
        if (this.autoSyncInterval) {
          clearInterval(this.autoSyncInterval);
          this.autoSyncInterval = null;
          this.logger.log('info', 'Auto-sync interval cleared');
        }
      }
    }

    setupAccordion(modal) {
      const sections = [
        "sync-diagnostics",
        "available-backups",
        "provider-settings",
        "common-settings",
        "tombstones",
      ];

      const setSectionState = (sectionName, expand) => {
        const content = modal.querySelector(`#${sectionName}-content`);
        const chevron = modal.querySelector(`#${sectionName}-chevron`);
        if (content && chevron) {
          if (expand) {
            content.classList.remove("hidden");
            chevron.style.transform = "rotate(180deg)";
          } else {
            content.classList.add("hidden");
            chevron.style.transform = "rotate(0deg)";
          }
        }
      };

      sections.forEach((sectionName) => {
        const header = modal.querySelector(`#${sectionName}-header`);
        if (header) {
          const clickHandler = () => {
            const isCurrentlyOpen = !modal
              .querySelector(`#${sectionName}-content`)
              .classList.contains("hidden");

            sections.forEach((s) => setSectionState(s, false));

            if (!isCurrentlyOpen) {
              setSectionState(sectionName, true);
            }
          };
          header.addEventListener("click", clickHandler);

          this.modalCleanupCallbacks.push(() => {
            header.removeEventListener("click", clickHandler);
          });
        }
      });

      if (
        !this.backupsExpanded &&
        !this.providerExpanded &&
        !this.commonExpanded
      ) {
        setSectionState("sync-diagnostics", true);
      }
    }

    registerProvider(typeName, providerClass) {
      if (
        !providerClass ||
        !(providerClass.prototype instanceof IStorageProvider)
      ) {
        this.logger.log(
          "error",
          `Attempted to register invalid provider: ${typeName}`
        );
        return;
      }
      this.providerRegistry.set(typeName, providerClass);
    }

    async initialize() {
      this.logger.log(
        "start",
        "Initializing TypingmindCloud Sync V4.2"
      );

      const urlParams = new URLSearchParams(window.location.search);
      this.noSyncMode =
        urlParams.get("nosync") === "true" || urlParams.has("nosync");

      const urlConfig = this.getConfigFromUrlParams();
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
        this.logger.log("info", "Applied and saved URL parameters to config.");
        this.removeConfigFromUrl();
      }

      const storageType = this.config.get("storageType") || "s3";
      this.logger.log("info", `Selected storage provider: ${storageType}`);

      try {
        const ProviderClass = this.providerRegistry.get(storageType);
        if (ProviderClass) {
          this.storageService = new ProviderClass(
            this.config,
            this.cryptoService,
            this.logger
          );
        } else {
          throw new Error(`Unsupported storage type: '${storageType}'`);
        }
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to instantiate storage provider.",
          error.message
        );
        this.updateSyncStatus("error");
        return;
      }

      this.syncOrchestrator = new SyncOrchestrator(
        this.config,
        this.dataService,
        this.storageService,
        this.logger,
        this.operationQueue
      );
      this.backupService = new BackupService(
        this.dataService,
        this.storageService,
        this.logger
      );

      this.leaderElection = new LeaderElection(
        "tcs-leader-election",
        this.logger
      );
      this.leaderElection.onBecameLeader(() => {
        this.logger.log(
          "info",
          "👑 This tab is now the leader. Starting background tasks."
        );
        this.runLeaderTasks();
      });
      this.leaderElection.onBecameFollower(() => {
        this.logger.log(
          "info",
          "🚶‍♀️ This tab is now a follower. Stopping background tasks."
        );
        if (this.autoSyncInterval) {
          clearInterval(this.autoSyncInterval);
          this.autoSyncInterval = null;
        }
      });

      await this.setupSyncButtonObserver();

      if (urlConfig.autoOpen || urlConfig.hasParams) {
        this.logger.log(
          "info",
          "Auto-opening sync modal due to URL parameters"
        );
        setTimeout(() => this.openSyncModal(), 1000);
      }

      if (this.noSyncMode) {
        this.logger.log(
          "info",
          "🚫 NoSync mode enabled - sync and backup tasks disabled."
        );
        if (this.storageService.isConfigured()) {
          try {
            await this.storageService.initialize();
          } catch (error) {
            this.logger.log(
              "error",
              `Storage service failed to initialize in NoSync mode: ${error.message}`
            );
          }
        }
      } else {
        if (this.storageService.isConfigured()) {
          try {
            await this.storageService.initialize();
            this.leaderElection.elect();
          } catch (error) {
            this.logger.log("error", "Initialization failed", error.message);
            this.updateSyncStatus("error");
          }
        } else {
          this.logger.log(
            "info",
            "Storage provider not configured. Running in limited capacity."
          );
          if (!this.checkMandatoryConfig()) {
            alert(
              "⚠️ Cloud Sync Configuration Required\n\nPlease click the Sync button to open settings and configure your chosen cloud provider, then reload the page."
            );
          }
        }
      }
    }

    handleExpiredToken() {
      this.updateSyncStatus("error");
      if (!this.hasShownTokenExpiryAlert) {
        this.hasShownTokenExpiryAlert = true;
        this.logger.log(
          "warning",
          "Google Drive session expired. User must re-authenticate."
        );
        setTimeout(() => {
          this.hasShownTokenExpiryAlert = false;
        }, 5 * 60 * 1000);
      }
    }

    checkMandatoryConfig() {
      const storageType = this.config.get("storageType");
      if (storageType === "s3") {
        return !!(
          this.config.get("bucketName") &&
          this.config.get("region") &&
          this.config.get("accessKey") &&
          this.config.get("secretKey") &&
          this.config.get("encryptionKey")
        );
      }
      if (storageType === "googleDrive") {
        return !!(
          this.config.get("googleClientId") && this.config.get("encryptionKey")
        );
      }
      return false;
    }

    isSnapshotAvailable() {
      return this.storageService && this.storageService.isConfigured();
    }

    getConfigFromUrlParams() {
      const urlParams = new URLSearchParams(window.location.search);
      const config = {};
      const autoOpen = urlParams.has("config") || urlParams.has("autoconfig");
      const paramMap = {
        storagetype: "storageType",
        bucket: "bucketName",
        bucketname: "bucketName",
        region: "region",
        accesskey: "accessKey",
        secretkey: "secretKey",
        endpoint: "endpoint",
        encryptionkey: "encryptionKey",
        syncinterval: "syncInterval",
        exclusions: "exclusions",
        googleclientid: "googleClientId",
      };
      let hasConfigParams = false;
      for (const [urlParam, configKey] of Object.entries(paramMap)) {
        const value = urlParams.get(urlParam);
        if (value !== null) {
          config[configKey] = value;
          hasConfigParams = true;
        }
      }
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
        "storagetype",
        "bucket",
        "bucketname",
        "region",
        "accesskey",
        "secretkey",
        "endpoint",
        "encryptionkey",
        "syncinterval",
        "exclusions",
        "googleclientid",
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

    async setupSyncButtonObserver() {
      if (this.insertSyncButton()) return;

      return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (this.insertSyncButton()) {
            observer.disconnect();
            resolve();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 10000);
      });
    }

    insertSyncButton() {
      if (document.querySelector('[data-element-id="workspace-tab-cloudsync"]'))
        return true;

      const chatButton = document.querySelector('button[data-element-id="workspace-tab-chat"]');
      if (!chatButton?.parentNode)
        return false;

      // Inject minimal CSS once (TypingMind may not provide Tailwind "dark:" variants on all pages)
      if (!document.getElementById("tcs-inline-style")) {
        const style = document.createElement("style");
        style.id = "tcs-inline-style";
        style.textContent = `
        /* Sync-Status-Punkt: immer sichtbar positioniert (oben rechts am Icon) */
        #sync-status-dot {
          position: absolute;
          top: -1px;
          right: -1px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #6b7280;
          display: none;
          z-index: 10;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.9); /* auf hellem Hintergrund sichtbar */
        }

        @media (prefers-color-scheme: dark) {
          #sync-status-dot {
            box-shadow: 0 0 0 2px rgba(0,0,0,0.55);
          }
        }

        /* Modal form controls: ensure readable values even when Tailwind dark: variants are inactive */
        .cloud-sync-modal input,
        .cloud-sync-modal select,
        .cloud-sync-modal textarea {
          background-color: #3f3f46 !important; /* zinc-700 */
          color: #ffffff !important;
          border-color: #52525b !important; /* zinc-600 */
        }
        .cloud-sync-modal input::placeholder,
        .cloud-sync-modal textarea::placeholder {
          color: #a1a1aa !important; /* zinc-400 */
        }
        .cloud-sync-modal label {
          color: #d4d4d8 !important; /* zinc-300 */
        }
        `;
        document.head.appendChild(style);
      }

      const button = document.createElement("button");
      button.setAttribute("data-element-id", "workspace-tab-cloudsync");

      // Wichtig: Layout 1:1 vom Chat-Tab übernehmen, damit Sidebar-Breite/Buttons unverändert bleiben
      button.className = "text-slate-900/70 sm:hover:bg-slate-900/20 dark:text-white/70 sm:dark:hover:bg-white/20 inline-flex rounded-xl px-0.5 py-1.5 flex-col justify-start items-center gap-1.5 flex-1 md:flex-none md:w-full min-w-[58px] md:min-w-0 h-12 md:min-h-[50px] md:h-fit shrink-0 transition-colors cursor-default focus:outline-0";

      // Sicherstellen, dass der Click wirklich als Button-Interaktion wirkt
      button.style.cursor = "pointer";

      // InnerHTML so nah wie möglich am originalen Tab-Aufbau halten
      button.innerHTML = `
        <div class="relative">
          <svg class="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
            <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 4.5A4.5 4.5 0 0114.5 9"/>
              <path d="M9 13.5A4.5 4.5 0 013.5 9"/>
              <polyline points="9,2.5 9,4.5 11,4.5"/>
              <polyline points="9,15.5 9,13.5 7,13.5"/>
            </g>
          </svg>
          <div id="sync-status-dot"></div>
        </div>
        <span class="font-normal mx-auto self-stretch text-center text-xs leading-4 md:leading-none w-full md:w-[51px]" style="hyphens: auto; word-break: break-word;">Sync</span>
      `;

      button.addEventListener("click", () => this.openSyncModal());
      chatButton.parentNode.insertBefore(button, chatButton.nextSibling);
      return true;
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
      const modeStatus = this.noSyncMode
        ? `<div class="mb-3 p-2 bg-orange-600 rounded-lg border border-orange-500">
             <div class="text-center text-sm font-medium">
               🚫 NoSync Mode Active - Only snapshot functionality available
             </div>
           </div>`
        : "";
      return `<div class="text-white text-left text-sm">
        <!-- Modal Header (Fixed) -->
        <div class="cloud-sync-modal-header">
          <div class="flex justify-between items-center gap-3">
            <h3 class="text-xl font-bold text-white">Cloud Sync</h3>
            <div class="flex items-center gap-2">
              <span class="text-sm text-zinc-400">Auto-Sync</span>
              <input type="checkbox" id="auto-sync-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer" ${this.autoSyncEnabled ? 'checked' : ''} ${this.noSyncMode ? 'disabled' : ''}>
            </div>
          </div>
          ${modeStatus}
        </div>
        
        <!-- Modal Content (Scrollable) -->
        <div class="cloud-sync-modal-content">
          <div class="space-y-3">

          <!-- Sync Diagnostics Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="sync-diagnostics-header">
              <div class="flex items-center gap-2">
                <label class="block text-sm font-medium text-zinc-300">Sync Diagnostics</label>
                <span id="sync-overall-status" class="text-lg">✅</span>
              </div>
              <div class="flex items-center gap-1">
                <svg id="sync-diagnostics-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="sync-diagnostics-content" class="overflow-x-auto hidden">
              <table id="sync-diagnostics-table" class="w-full text-xs text-zinc-300 border-collapse">
                <thead><tr class="border-b border-zinc-600"><th class="text-left py-1 px-2 font-medium">Type</th><th class="text-right py-1 px-2 font-medium">Count</th></tr></thead>
                <tbody id="sync-diagnostics-body"><tr><td colspan="2" class="text-center py-2 text-zinc-500">Loading...</td></tr></tbody>
              </table>
                <div class="flex items-center justify-between mt-3 pt-2 border-t border-zinc-700">
                  <div id="sync-diagnostics-last-sync" class="flex items-center gap-1.5 text-xs text-zinc-400" title="Last successful sync with cloud">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>Loading...</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <button id="force-import-btn" class="px-2 py-1 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed" title="Force Import from Cloud\nOverwrites local data with cloud data.">Import ↙</button>
                    <button id="force-export-btn" class="px-2 py-1 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed" title="Force Export to Cloud\nOverwrites cloud data with local data.">Export ↗</button>
                    <button id="sync-diagnostics-refresh" class="p-1.5 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors duration-200" title="Refresh diagnostics">
                      <svg id="refresh-icon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                      <svg id="checkmark-icon" class="w-4 h-4 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    </button>
                  </div>
              </div>
            </div>
          </div>

          <!-- Available Backups Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="available-backups-header">
              <label class="block text-sm font-medium text-zinc-300">Available Backups</label>
              <div class="flex items-center gap-1">
                <svg id="available-backups-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="available-backups-content" class="space-y-2 hidden">
              <div class="w-full">
                <select id="backup-files" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white">
                  <option value="">Please configure your provider first</option>
                </select>
              </div>
              <div class="flex justify-end gap-2">
                <button id="restore-backup-btn" class="px-2 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>Restore</button>
                <button id="delete-backup-btn" class="px-2 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>Delete</button>
              </div>
            </div>
          </div>

          <!-- Storage Provider Settings Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="provider-settings-header">
              <label class="block text-sm font-medium text-zinc-300">Storage Provider Settings</label>
              <div class="flex items-center gap-1">
                <svg id="provider-settings-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="provider-settings-content" class="space-y-3 hidden">
              <div>
                <label for="storage-type-select" class="block text-sm font-medium text-zinc-300">Storage Provider</label>
                <select id="storage-type-select" class="mt-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white">
                  <!-- Options will be populated by JavaScript -->
                </select>
              </div>
              <div id="provider-settings-container">
                <!-- Provider-specific UI will be injected here -->
              </div>
            </div>
          </div>

          <!-- Common Settings Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="common-settings-header">
              <label class="block text-sm font-medium text-zinc-300">Common Settings</label>
              <div class="flex items-center gap-1">
                <svg id="common-settings-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="common-settings-content" class="space-y-3 hidden">
              <div class="flex space-x-4">
                <div class="w-1/2">
                  <label for="sync-interval" class="block text-sm font-medium text-zinc-300">Sync Interval (sec)</label>
                  <input id="sync-interval" name="sync-interval" type="number" min="15" value="${this.config.get(
                    "syncInterval"
                  )}" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
                <div class="w-1/2">
                  <label for="encryption-key" class="block text-sm font-medium text-zinc-300">Encryption Key <span class="text-red-400">*</span></label>
                  <input id="encryption-key" name="encryption-key" type="password" value="${
                    this.config.get("encryptionKey") || ""
                  }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                </div>
              </div>
              <div>
                <label for="sync-exclusions" class="block text-sm font-medium text-zinc-300">Exclusions (Comma separated)</label>
                <input id="sync-exclusions" name="sync-exclusions" type="text" value="${
                  localStorage.getItem("tcs_sync-exclusions") || ""
                }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" placeholder="e.g., my-setting, another-setting" autocomplete="off">
              </div>
            </div>
          </div>

          <!-- Deleted Items (Tombstones) Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="tombstones-header">
              <label class="block text-sm font-medium text-zinc-300">Recently Deleted Items</label>
              <div class="flex items-center gap-1">
                <svg id="tombstones-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="tombstones-content" class="space-y-2 hidden">
              <div class="text-xs text-zinc-400 mb-2">Items deleted within the last 30 days are shown here. You can restore them or permanently delete them.</div>
              <div class="max-h-56 overflow-y-auto border border-zinc-700 rounded-md">
                <table class="w-full text-xs text-zinc-300">
                  <thead class="sticky top-0 bg-zinc-700">
                    <tr class="bg-zinc-700">
                      <th class="p-2 w-8 bg-zinc-700"><input type="checkbox" id="tombstone-select-all" class="h-4 w-4"></th>
                      <th class="p-2 text-left bg-zinc-700">Item</th>
                      <th class="p-2 text-left bg-zinc-700">Deleted Detected</th>
                      <th class="p-2 w-12 bg-zinc-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="tombstone-list-body">
                    <!-- Tombstone rows will be injected here by JavaScript -->
                  </tbody>
                </table>
              </div>
              <div class="flex justify-between items-center pt-2">
                <button id="undo-selected-btn" class="px-2 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled>Restore Selected</button>
                <button id="refresh-tombstones-btn" class="p-1.5 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-500 disabled:cursor-not-allowed transition-colors duration-200" title="Refresh list">
                  <svg id="tombstone-refresh-icon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  <svg id="tombstone-checkmark-icon" class="w-4 h-4 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Actions & Footer -->
          <div class="flex items-center justify-end mb-4 space-x-2 mt-4">
            <span class="text-sm text-zinc-400">Console Logging</span>
            <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
          </div>
          <div class="flex justify-between space-x-2 mt-4">
            <button id="save-settings" class="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">Save</button>
            <div class="flex space-x-2">
              <button id="sync-now" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-500 disabled:cursor-default transition-colors" ${
                this.noSyncMode ? "disabled" : ""
              }>${this.noSyncMode ? "Sync Off" : "Sync"}</button>
              <button id="create-snapshot" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors" ${
                !this.isSnapshotAvailable() ? "disabled" : ""
              }>Snapshot</button>
              <button id="close-modal" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">Close</button>
            </div>
          </div>
          <div class="text-center mt-4"><span id="last-sync-msg" class="text-zinc-400">${
            this.noSyncMode
              ? "NoSync Mode: Automatic sync operations disabled"
              : !this.autoSyncEnabled
              ? "Auto-Sync Disabled: Manual sync operations only"
              : ""
          }</span></div>
          <div id="action-msg" class="text-center text-zinc-400"></div>
        </div>
        
        <!-- Modal Footer (Fixed) -->
        <div class="cloud-sync-modal-footer">
          <div class="modal-footer text-center text-xs text-zinc-500">
            ${this.footerHTML}
          </div>
        </div>
      </div>`;
    }

    setupModalEventListeners(modal, overlay) {
      const closeModalHandler = () => this.closeModal(overlay);
      const saveSettingsHandler = () => this.saveSettings(modal);
      const createSnapshotHandler = () => this.createSnapshot();
      const handleSyncNowHandler = () => this.handleSyncNow(modal);
      const consoleLoggingHandler = (e) =>
        this.logger.setEnabled(e.target.checked);
      const autoSyncToggleHandler = (e) => {
        this.setAutoSyncEnabled(e.target.checked);
        // Update the status message
        const statusMsg = modal.querySelector('#last-sync-msg');
        if (statusMsg) {
          if (e.target.checked) {
            statusMsg.textContent = '';
          } else {
            statusMsg.textContent = 'Auto-Sync Disabled: Manual sync operations only';
          }
        }
      };

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
      modal
        .querySelector("#auto-sync-toggle")
        .addEventListener("change", autoSyncToggleHandler);

      this.setupAccordion(modal);

      const storageSelect = modal.querySelector("#storage-type-select");
      const providerUIContainer = modal.querySelector(
        "#provider-settings-container"
      );

      this.providerRegistry.forEach((providerClass, typeName) => {
        const option = document.createElement("option");
        option.value = typeName;
        option.textContent = providerClass.displayName;
        storageSelect.appendChild(option);
      });
      storageSelect.value = this.config.get("storageType") || "s3";

      const updateProviderUI = () => {
        const selectedType = storageSelect.value;
        const ProviderClass = this.providerRegistry.get(selectedType);

        if (ProviderClass) {
          const { html, setupEventListeners } =
            ProviderClass.getConfigurationUI();
          providerUIContainer.innerHTML = html;
          setupEventListeners(
            providerUIContainer,
            this.storageService,
            this.config,
            this.logger
          );
        } else {
          providerUIContainer.innerHTML = "";
        }

        const isConfigured = this.storageService?.isConfigured();
        modal.querySelector("#force-import-btn").disabled = !isConfigured;
        modal.querySelector("#force-export-btn").disabled = !isConfigured;
      };

      storageSelect.addEventListener("change", updateProviderUI);
      updateProviderUI();

      const forceExportBtn = modal.querySelector("#force-export-btn");
      const forceImportBtn = modal.querySelector("#force-import-btn");

      const handleForceExport = async () => {
        if (
          !confirm(
            "⚠️ WARNING: This will completely overwrite the data in your cloud storage with the data from THIS BROWSER.\n\nAny changes made on other devices that have not been synced here will be PERMANENTLY LOST.\n\nAre you sure you want to proceed?"
          )
        )
          return;
        const originalText = forceExportBtn.textContent;
        forceExportBtn.disabled = true;
        forceExportBtn.textContent = "Exporting...";
        try {
          await this.syncOrchestrator.forceExportToCloud();
          forceExportBtn.textContent = "Success!";
          alert("Force Export to Cloud completed successfully.");
        } catch (error) {
          forceExportBtn.textContent = "Failed";
          alert(`Force Export failed: ${error.message}`);
        } finally {
          setTimeout(() => {
            forceExportBtn.textContent = originalText;
            forceExportBtn.disabled = false;
            this.loadSyncDiagnostics(modal);
          }, 2000);
        }
      };

      const handleForceImport = async () => {
        if (
          !confirm(
            "⚠️ WARNING: This will completely overwrite the data in THIS BROWSER with the data from your cloud storage.\n\nAny local changes you have made that are not saved in the cloud will be PERMANENTLY LOST. This cannot be undone.\n\nAre you sure you want to proceed?"
          )
        )
          return;
        const originalText = forceImportBtn.textContent;
        forceImportBtn.disabled = true;
        forceImportBtn.textContent = "Importing...";
        try {
          await this.syncOrchestrator.forceImportFromCloud();
          alert(
            "Force Import from Cloud completed successfully. The page will now reload to apply the new data."
          );
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        } catch (error) {
          forceImportBtn.textContent = "Failed";
          alert(`Force Import failed: ${error.message}`);
          setTimeout(() => {
            forceImportBtn.textContent = originalText;
            forceImportBtn.disabled = false;
            this.loadSyncDiagnostics(modal);
          }, 2000);
        }
      };

      forceExportBtn.addEventListener("click", handleForceExport);
      forceImportBtn.addEventListener("click", handleForceImport);

      const tombstoneTableBody = modal.querySelector("#tombstone-list-body");
      const undoButton = modal.querySelector("#undo-selected-btn");
      const selectAllCheckbox = modal.querySelector("#tombstone-select-all");
      const refreshTombstonesBtn = modal.querySelector(
        "#refresh-tombstones-btn"
      );

      const handleTombstoneTableClick = async (e) => {
        const deleteButton = e.target.closest(".permanent-delete-btn");
        if (!deleteButton) return;

        const itemId = deleteButton.dataset.id;
        if (
          !confirm(
            `⚠️ PERMANENT DELETION\n\nAre you sure you want to permanently delete the item "${itemId}"?\n\nThis cannot be undone.`
          )
        ) {
          return;
        }

        this.logger.log("start", `Permanently deleting item: ${itemId}`);
        deleteButton.disabled = true;
        try {
          await this.storageService.delete(`items/${itemId}.json`);
          delete this.syncOrchestrator.metadata.items[itemId];
          await this.syncOrchestrator.performFullSync();

          this.logger.log("success", `Permanently deleted ${itemId}`);
          await this.loadTombstoneList(modal);
        } catch (error) {
          alert(`Failed to permanently delete item: ${error.message}`);
          this.logger.log(
            "error",
            `Permanent delete failed for ${itemId}`,
            error
          );
          deleteButton.disabled = false;
        }
      };

      const handleUndoClick = async () => {
        const selectedCheckboxes = Array.from(
          modal.querySelectorAll(".tombstone-checkbox:checked")
        );
        const itemIdsToRestore = selectedCheckboxes.map((cb) => cb.dataset.id);

        if (itemIdsToRestore.length === 0) return;

        this.logger.log("start", `Restoring ${itemIdsToRestore.length} items.`);
        undoButton.disabled = true;
        undoButton.textContent = "Restoring...";

        try {
          const restorePromises = itemIdsToRestore.map(async (itemId) => {
            const item = this.syncOrchestrator.metadata.items[itemId];
            if (item && item.deleted) {
              this.logger.log(
                "info",
                `Downloading data for restored item: ${itemId}`
              );
              const data = await this.storageService.download(
                `items/${itemId}.json`
              );
              await this.dataService.saveItem(data, item.type, itemId);
              delete item.deleted;
              delete item.deletedAt;
              delete item.tombstoneVersion;
              item.synced = 0;
            }
          });

          await Promise.all(restorePromises);

          await this.syncOrchestrator.syncToCloud();

          this.logger.log(
            "success",
            `Restored ${itemIdsToRestore.length} items successfully.`
          );
          undoButton.textContent = "Success!";
          undoButton.classList.add("is-success");
          await this.loadTombstoneList(modal);
          await this.loadSyncDiagnostics(modal);

          setTimeout(() => {
            undoButton.textContent = "Restore Selected";
            undoButton.classList.remove("is-success");
            updateRestoreButtonState();
          }, 2000);
        } catch (error) {
          alert(`Failed to restore items: ${error.message}`);
          this.logger.log("error", "Restore operation failed", error);
          undoButton.textContent = "Restore Selected";
          undoButton.disabled = false;
        }
      };

      const updateRestoreButtonState = () => {
        const selectedCount = modal.querySelectorAll(
          ".tombstone-checkbox:checked"
        ).length;
        undoButton.disabled = selectedCount === 0;
      };

      const handleTombstoneCheckboxChange = (e) => {
        if (e.target.classList.contains("tombstone-checkbox")) {
          updateRestoreButtonState();
        }
      };

      const handleSelectAll = () => {
        const checkboxes = modal.querySelectorAll(".tombstone-checkbox");
        checkboxes.forEach((cb) => (cb.checked = selectAllCheckbox.checked));
        updateRestoreButtonState();
      };

      const handleRefreshTombstones = (e) => {
          e.stopPropagation();

          const refreshButton = modal.querySelector("#refresh-tombstones-btn");
          const refreshIcon = modal.querySelector("#tombstone-refresh-icon");
          const checkmarkIcon = modal.querySelector("#tombstone-checkmark-icon");
          
          if (!refreshButton || !refreshIcon || !checkmarkIcon || refreshButton.disabled) return;

          this.loadTombstoneList(modal);

          refreshButton.disabled = true;
          refreshButton.classList.add("is-refreshing");
          refreshIcon.classList.add("hidden");
          checkmarkIcon.classList.remove("hidden");

          setTimeout(() => {
            refreshButton.classList.remove("is-refreshing");
            refreshIcon.classList.remove("hidden");
            checkmarkIcon.classList.add("hidden");
            refreshButton.disabled = false;
          }, 800);
      };

      if (tombstoneTableBody) {
        tombstoneTableBody.addEventListener("click", handleTombstoneTableClick);
        tombstoneTableBody.addEventListener(
          "change",
          handleTombstoneCheckboxChange
        );
      }
      if (undoButton) undoButton.addEventListener("click", handleUndoClick);
      if (selectAllCheckbox)
        selectAllCheckbox.addEventListener("change", handleSelectAll);
      if (refreshTombstonesBtn)
        refreshTombstonesBtn.addEventListener("click", handleRefreshTombstones);

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
        storageSelect.removeEventListener("change", updateProviderUI);
        forceExportBtn.removeEventListener("click", handleForceExport);
        forceImportBtn.removeEventListener("click", handleForceImport);

        if (tombstoneTableBody) {
          tombstoneTableBody.removeEventListener(
            "click",
            handleTombstoneTableClick
          );
          tombstoneTableBody.removeEventListener(
            "change",
            handleTombstoneCheckboxChange
          );
        }
        if (undoButton)
          undoButton.removeEventListener("click", handleUndoClick);
        if (selectAllCheckbox)
          selectAllCheckbox.removeEventListener("change", handleSelectAll);
        if (refreshTombstonesBtn)
          refreshTombstonesBtn.removeEventListener(
            "click",
            handleRefreshTombstones
          );
      });

      modal.querySelector("#console-logging-toggle").checked =
        this.logger.enabled;

      this.populateFormFromUrlParams(modal);
      if (this.isSnapshotAvailable()) {
        this.loadBackupList(modal);
        this.setupBackupListHandlers(modal);
        this.loadSyncDiagnostics(modal);
        this.setupDiagnosticsRefresh(modal);
        this.loadTombstoneList(modal);
      }
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
      const fieldMap = {
        storageType: "storage-type-select",
        bucketName: "aws-bucket",
        region: "aws-region",
        accessKey: "aws-access-key",
        secretKey: "aws-secret-key",
        endpoint: "aws-endpoint",
        encryptionKey: "encryption-key",
        syncInterval: "sync-interval",
        exclusions: "sync-exclusions",
        googleClientId: "google-client-id",
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
        const actionMsg = modal.querySelector("#action-msg");
        if (actionMsg) {
          actionMsg.textContent = `✨ Auto-populated ${populatedCount} field(s) from URL parameters`;
          actionMsg.style.color = "#22c55e";
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
          this.updateSyncStatus("syncing");
          try {
            await this.syncOrchestrator.performFullSync();
            this.updateSyncStatus("success");
          } catch (e) {
            this.updateSyncStatus("error");
            throw e;
          }
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
      const backupList = modal.querySelector("#backup-files");
      if (!backupList) return;
      backupList.innerHTML = '<option value="">Loading backups...</option>';
      backupList.disabled = true;

      if (!this.isSnapshotAvailable()) {
        backupList.innerHTML =
          '<option value="">Please configure your provider first</option>';
        backupList.disabled = false;
        return;
      }

      try {
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
            const total = backup.totalItems ?? "N/A";
            const copied = backup.copiedItems ?? total;
            const suffix = `(${copied}/${total})`;
            let prefix = "";
            if (backup.type === "snapshot") {
              prefix = "📸 ";
            } else if (backup.type === "daily") {
              prefix = "🗓️ ";
            }
            option.text = `${prefix}${
              backup.displayName || backup.name
            } ${suffix}`;
            backupList.appendChild(option);
          });
        }
        this.updateBackupButtonStates(modal);
        backupList.addEventListener("change", () =>
          this.updateBackupButtonStates(modal)
        );
      } catch (error) {
        console.error("Failed to load backup list:", error);
        backupList.innerHTML =
          '<option value="">Error loading backups</option>';
        backupList.disabled = false;
      }
    }

    updateBackupButtonStates(modal) {
      const backupList = modal.querySelector("#backup-files");
      const selectedValue = backupList.value || "";
      const restoreButton = modal.querySelector("#restore-backup-btn");
      const deleteButton = modal.querySelector("#delete-backup-btn");
      const isSnapshot = selectedValue.includes("s-");
      const isDailyBackup = selectedValue.includes("typingmind-backup-");
      const isChunkedBackup = selectedValue.endsWith("-metadata.json");
      const isMetadataFile = selectedValue === "metadata.json";
      const isItemsFile = selectedValue.startsWith("items/");
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
      const restoreButton = modal.querySelector("#restore-backup-btn");
      const deleteButton = modal.querySelector("#delete-backup-btn");
      const backupList = modal.querySelector("#backup-files");
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
              await this.deleteBackupWithChunks(key);
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

    async loadSyncDiagnostics(modal) {
      const diagnosticsBody = modal.querySelector("#sync-diagnostics-body");
      if (!diagnosticsBody) return;
      const overallStatusEl = modal.querySelector("#sync-overall-status");
      const summaryEl = modal.querySelector("#sync-diagnostics-summary");
      const lastSyncEl = modal.querySelector(
        "#sync-diagnostics-last-sync span"
      );
      const setContent = (html) => {
        diagnosticsBody.innerHTML = html;
      };

      if (!this.storageService || !this.storageService.isConfigured()) {
        setContent(
          '<tr><td colspan="2" class="text-center py-2 text-zinc-500">Provider Not Configured</td></tr>'
        );
        if (overallStatusEl) overallStatusEl.textContent = "⚙️";
        if (summaryEl) summaryEl.textContent = "Setup required";
        if (lastSyncEl) lastSyncEl.textContent = "N/A";
        return;
      }

      try {
        const lastSyncTimestamp = this.syncOrchestrator.getLastCloudSync();
        if (lastSyncEl) {
          if (lastSyncTimestamp > 0) {
            const date = new Date(lastSyncTimestamp);
            const day = date.getDate();
            const month = date.toLocaleString("default", { month: "short" });
            const hours = date.getHours().toString().padStart(2, "0");
            const minutes = date.getMinutes().toString().padStart(2, "0");
            lastSyncEl.textContent = `${day} ${month}, ${hours}:${minutes}`;
          } else {
            lastSyncEl.textContent = "Never";
          }
        }

        const diagnosticsData = localStorage.getItem("tcs_sync_diagnostics");
        if (!diagnosticsData) {
          setContent(
            '<tr><td colspan="2" class="text-center py-2 text-zinc-500">No diagnostics data available. Run a sync.</td></tr>'
          );
          if (overallStatusEl) overallStatusEl.textContent = "⚠️";
          if (summaryEl) summaryEl.textContent = "Waiting for first sync";
          return;
        }

        const data = JSON.parse(diagnosticsData);
        const rows = [
          {
            type: "📱 Local Items",
            count: data.localItems || 0,
          },
          {
            type: "📋 Local Metadata",
            count: data.localMetadata || 0,
          },
          {
            type: "☁️ Cloud Metadata",
            count: data.cloudMetadata || 0,
          },
          {
            type: "💬 Chat Sync",
            count: `${data.chatSyncLocal || 0} ⟷ ${data.chatSyncCloud || 0}`,
          },
          {
            type: "⏭️ Skipped Items",
            count: data.excludedItemCount || 0,
          },
        ];

        const tableHTML = rows
          .map(
            (row) => `
      <tr class="hover:bg-zinc-700/30">
        <td class="py-1 px-2">${row.type}</td>
        <td class="text-right py-1 px-2">${row.count}</td>
      </tr>
    `
          )
          .join("");

        const hasIssues =
          data.localItems !== data.localMetadata ||
          data.localMetadata !== data.cloudMetadata ||
          data.chatSyncLocal !== data.chatSyncCloud;

        const overallStatus = hasIssues ? "⚠️" : "✅";
        const lastUpdated = new Date(data.timestamp || 0).toLocaleTimeString();
        const summaryText = `Updated: ${lastUpdated}`;

        if (overallStatusEl) overallStatusEl.textContent = overallStatus;
        if (summaryEl) summaryEl.textContent = summaryText;
        setContent(tableHTML);
      } catch (error) {
        console.error("Failed to load sync diagnostics:", error);
        setContent(
          '<tr><td colspan="2" class="text-center py-2 text-red-400">Error loading diagnostics from storage</td></tr>'
        );
        if (overallStatusEl) overallStatusEl.textContent = "❌";
        if (summaryEl) summaryEl.textContent = "Error";
        if (lastSyncEl) lastSyncEl.textContent = "Error";
      }
    }

    setupDiagnosticsRefresh(modal) {
      const refreshButton = modal.querySelector("#sync-diagnostics-refresh");
      const refreshIcon = modal.querySelector("#refresh-icon");
      const checkmarkIcon = modal.querySelector("#checkmark-icon");

      if (!refreshButton || !refreshIcon || !checkmarkIcon) return;

      const refreshHandler = (e) => {
        e.stopPropagation();

        if (refreshButton.disabled) return;

        this.loadSyncDiagnostics(modal);

        refreshButton.disabled = true;
        refreshButton.classList.add("is-refreshing");
        refreshIcon.classList.add("hidden");
        checkmarkIcon.classList.remove("hidden");

        setTimeout(() => {
          refreshButton.classList.remove("is-refreshing");
          refreshIcon.classList.remove("hidden");
          checkmarkIcon.classList.add("hidden");
          refreshButton.disabled = false;
        }, 600);
      };

      refreshButton.addEventListener("click", refreshHandler);

      this.modalCleanupCallbacks.push(() => {
        if (refreshButton) {
          refreshButton.removeEventListener("click", refreshHandler);
        }
      });
    }

    closeModal(overlay) {
      this.diagnosticsExpanded = false;
      this.backupsExpanded = false;
      this.providerExpanded = false;
      this.commonExpanded = false;
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

    async saveSettings(modal) {
      const storageType = modal.querySelector("#storage-type-select").value;

      const newConfig = {
        storageType: storageType,
        syncInterval:
          parseInt(modal.querySelector("#sync-interval").value) || 15,
        encryptionKey: modal.querySelector("#encryption-key").value.trim(),
      };

      const providerContainer = modal.querySelector(
        "#provider-settings-container"
      );
      if (storageType === "s3") {
        newConfig.bucketName = providerContainer
          .querySelector("#aws-bucket")
          .value.trim();
        newConfig.region = providerContainer
          .querySelector("#aws-region")
          .value.trim();
        newConfig.accessKey = providerContainer
          .querySelector("#aws-access-key")
          .value.trim();
        newConfig.secretKey = providerContainer
          .querySelector("#aws-secret-key")
          .value.trim();
        newConfig.endpoint = providerContainer
          .querySelector("#aws-endpoint")
          .value.trim();
      } else if (storageType === "googleDrive") {
        newConfig.googleClientId = providerContainer
          .querySelector("#google-client-id")
          .value.trim();
      }

      const exclusions = modal.querySelector("#sync-exclusions").value;

      if (newConfig.syncInterval < 15) {
        alert("Sync interval must be at least 15 seconds");
        return;
      }
      if (!newConfig.encryptionKey) {
        alert("Encryption key is a mandatory shared setting.");
        return;
      }

      const saveButton = modal.querySelector("#save-settings");
      const actionMsg = modal.querySelector("#action-msg");
      saveButton.disabled = true;
      saveButton.textContent = "Verifying...";
      actionMsg.textContent = "Verifying provider credentials...";
      actionMsg.style.color = "#3b82f6";

      try {
        Object.keys(newConfig).forEach((key) =>
          this.config.set(key, newConfig[key])
        );
        localStorage.setItem("tcs_sync-exclusions", exclusions);
        this.config.reloadExclusions();

        const ProviderClass = this.providerRegistry.get(storageType);
        if (!ProviderClass) {
          throw new Error(`Cannot verify unknown storage type: ${storageType}`);
        }

        this.storageService = new ProviderClass(
          this.config,
          this.cryptoService,
          this.logger
        );

        if (!this.storageService.isConfigured()) {
          throw new Error(
            "Please fill in all required fields for the selected provider."
          );
        }

        await this.storageService.initialize();
        await this.storageService.verify();

        actionMsg.textContent =
          "✅ Credentials verified! Saving configuration...";
        actionMsg.style.color = "#22c55e";

        this.config.save();

        this.logger.log(
          "success",
          "Configuration saved. Reloading app to apply changes..."
        );
        actionMsg.textContent = "✅ Saved! Page will now reload.";

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        this.logger.log("error", "Credential verification failed", error);
        actionMsg.textContent = `❌ Verification failed: ${error.message}`;
        actionMsg.style.color = "#ef4444";
        saveButton.disabled = false;
        saveButton.textContent = "Save";
      }
    }

    async createSnapshot() {
      if (!this.isSnapshotAvailable()) {
        alert(
          "⚠️ Snapshot Unavailable\n\nPlease configure and save your storage provider settings first."
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

    async deleteBackupWithChunks(key) {
      this.logger.log("start", `Deleting backup with manifest key: ${key}`);
      if (!key.endsWith("/backup-manifest.json")) {
        this.logger.log(
          "error",
          `Invalid backup key format for deletion: ${key}`
        );
        throw new Error("Invalid backup key format.");
      }
      try {
        const backupFolder = key.replace("/backup-manifest.json", "");
        this.logger.log("info", `Deleting backup folder: ${backupFolder}`);
        await this.storageService.deleteFolder(backupFolder);
        await this.backupService._removeBackupFromIndex(key);
        this.logger.log(
          "success",
          `Successfully deleted server-side backup: ${backupFolder}`
        );
      } catch (error) {
        this.logger.log("error", `Failed to delete backup ${key}`, error);
        throw error;
      }
    }

    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      
      // Check if auto-sync is disabled
      if (!this.autoSyncEnabled) {
        this.logger.log('info', 'Auto-sync is disabled, skipping interval creation');
        return;
      }
      
      const interval = Math.max(this.config.get("syncInterval") * 1000, 15000);

      this.autoSyncInterval = setInterval(async () => {
        if (
          this.storageService &&
          this.storageService.isConfigured() &&
          !this.syncOrchestrator.syncInProgress
        ) {
          this.updateSyncStatus("syncing");
          try {
            // Always sync local changes first; daily backup is an additional safety net (not a substitute for sync).
            await this.syncOrchestrator.performFullSync();
            await this.backupService.checkAndPerformDailyBackup();

            this.updateSyncStatus("success");
          } catch (error) {
            this.logger.log(
              "error",
              "Auto-sync/backup cycle failed",
              error.message
            );
            this.updateSyncStatus("error");
          }
        }
      }, interval);

      this.logger.log("info", "Auto-sync and daily backup check started");
    }

    async getCloudMetadata() {
      return this.syncOrchestrator.getCloudMetadata();
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

      this.operationQueue?.cleanup();
      this.dataService?.cleanup();
      this.cryptoService?.cleanup();
      this.syncOrchestrator?.cleanup();

      this.logger.log("success", "✅ Cleanup completed");
      this.config = null;
      this.dataService = null;
      this.cryptoService = null;
      this.storageService = null;
      this.syncOrchestrator = null;
      this.backupService = null;
      this.operationQueue = null;
      this.logger = null;
      this.leaderElection?.cleanup();
      this.leaderElection = null;
    }

    async runLeaderTasks() {
      if (!this.noSyncMode && this.storageService.isConfigured()) {
        // Only run initial sync if auto-sync is enabled
        if (!this.autoSyncEnabled) {
          this.logger.log('info', 'Auto-sync is disabled, skipping initial sync on load');
          return;
        }
        
        this.updateSyncStatus("syncing");
        try {
          await this.syncOrchestrator.performFullSync();
          this.startAutoSync();

          this.updateSyncStatus("success");
          this.logger.log("success", "Cloud Sync initialized on leader tab.");
        } catch (error) {
          this.logger.log(
            "error",
            "Initial sync failed on leader tab",
            error.message
          );
          this.updateSyncStatus("error");
        }
      }
    }

async loadTombstoneList(modal) {
    const tableBody = modal.querySelector("#tombstone-list-body");
    const undoButton = modal.querySelector("#undo-selected-btn");
    if (!tableBody || !undoButton) return;

    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-zinc-500">Loading deleted items...</td></tr>';
    undoButton.disabled = true;

    if (!this.storageService || !this.storageService.isConfigured()) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-zinc-500">Provider Not Configured</td></tr>';
        return;
    }

    try {
        const tombstones = Object.entries(this.syncOrchestrator.metadata.items)
            .filter(([key, item]) => item.deleted)
            .sort((a, b) => b[1].deleted - a[1].deleted);

        if (tombstones.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-zinc-500">No recently deleted items found.</td></tr>';
            return;
        }

        tableBody.innerHTML = "";

        for (const [itemId, itemData] of tombstones) {
            const row = document.createElement("tr");
            row.className = "border-t border-zinc-700 hover:bg-zinc-700/50";
            
            row.innerHTML = `
                <td class="p-2 text-center"><input type="checkbox" class="tombstone-checkbox h-4 w-4" data-id="${itemId}"></td>
                <td class="p-2 font-mono">${itemId}</td>
                <td class="p-2">${new Date(itemData.deleted).toLocaleString()}</td>
                <td class="p-2 text-center">
                    <button class="permanent-delete-btn p-1 text-red-400 hover:text-red-300" data-id="${itemId}" title="Permanently Delete Now">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        }
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Error loading items: ${error.message}</td></tr>`;
        this.logger.log("error", "Failed to load tombstone list", error);
    }
}

  }
  const styleSheet = document.createElement("style");
  styleSheet.textContent =
    '.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1rem; overflow-y: auto; } #sync-status-dot { position: absolute; top: -0.15rem; right: -0.6rem; width: 0.625rem; height: 0.625rem; border-radius: 9999px; } .cloud-sync-modal { width: 100%; max-width: 32rem; max-height: 90vh; background-color: rgb(39, 39, 42); color: white; border-radius: 0.5rem; padding: 0; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; } .cloud-sync-modal > div { display: flex; flex-direction: column; height: 100%; } .cloud-sync-modal-header { padding: 1rem; padding-bottom: 0.75rem; flex-shrink: 0; } .cloud-sync-modal-content { padding: 0 1rem; flex: 1; overflow-y: auto; } .cloud-sync-modal-footer { padding: 1rem; padding-top: 0.75rem; flex-shrink: 0; } .cloud-sync-modal input, ...cloud-sync-modal select { background-color: rgb(63, 63, 70); border: 1px solid rgb(82, 82, 91); color: white; } .cloud-sync-modal input:focus, ...cloud-sync-modal select:focus { border-color: rgb(59, 130, 246); outline: none; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); } .cloud-sync-modal button:disabled { background-color: rgb(82, 82, 91); cursor: not-allowed; opacity: 0.5; } .cloud-sync-modal .bg-zinc-800 { border: 1px solid rgb(82, 82, 91); } .cloud-sync-modal input[type="checkbox"] { accent-color: rgb(59, 130, 246); } .cloud-sync-modal input[type="checkbox"]:checked { background-color: rgb(59, 130, 246); border-color: rgb(59, 130, 246); } #sync-diagnostics-table { font-size: 0.75rem; } #sync-diagnostics-table th { background-color: rgb(82, 82, 91); font-weight: 600; } #sync-diagnostics-table tr:hover { background-color: rgba(63, 63, 70, 0.5); } #sync-diagnostics-header { padding: 0.5rem; margin: -0.5rem; border-radius: 0.375rem; transition: background-color 0.2s ease; -webkit-tap-highlight-color: transparent; min-height: 44px; display: flex; align-items: center; } #sync-diagnostics-header:hover { background-color: rgba(63, 63, 70, 0.5); } #sync-diagnostics-header:active { background-color: rgba(63, 63, 70, 0.8); } #sync-diagnostics-chevron, #sync-diagnostics-refresh { transition: transform 0.3s ease; } #sync-diagnostics-content { animation: slideDown 0.2s ease-out; } @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 300px; } } @media (max-width: 640px) { #sync-diagnostics-table { font-size: 0.7rem; } #sync-diagnostics-table th, #sync-diagnostics-table td { padding: 0.5rem 0.25rem; } .cloud-sync-modal { margin: 0.5rem; } } .modal-footer a { color: #60a5fa; text-decoration: none; transition: color 0.2s ease-in-out; line-height: 3em;} .modal-footer a:hover { color: #93c5fd; text-decoration: underline; } #sync-diagnostics-refresh.is-refreshing { background-color: #16a34a; } #refresh-tombstones-btn.is-refreshing { background-color: #16a34a; } #undo-selected-btn:disabled.is-success { background-color: #16a34a; }';
  document.head.appendChild(styleSheet);
  const app = new CloudSyncApp();
  app.registerProvider("s3", S3Service);
  app.registerProvider("googleDrive", GoogleDriveService);
  app.initialize();
  window.cloudSyncApp = app;
  const cleanupHandler = () => {
    try {
      app?.cleanup();
    } catch (error) {
      console.warn("Cleanup error:", error);
    }
  };
  const visibilityChangeHandler = () => {
    if (document.hidden) {
      try {
        if (app?.operationQueue) {
          app.operationQueue.cleanupStaleOperations(Date.now());
        }
        if (app?.cryptoService) {
          app.cryptoService.cleanupKeyCache();
        }
      } catch (error) {
        console.warn("Visibility change cleanup error:", error);
      }
    }
  };
  window.addEventListener("beforeunload", cleanupHandler, { passive: true });
  window.addEventListener("unload", cleanupHandler, { passive: true });
  window.addEventListener("pagehide", cleanupHandler, { passive: true });
  document.addEventListener("visibilitychange", visibilityChangeHandler, {
    passive: true,
  });
  window.addEventListener(
    "error",
    (event) => {
      if (
        event.error?.message?.includes("memory") ||
        event.error?.message?.includes("heap")
      ) {
        console.warn(
          "🚨 Potential memory-related error detected:",
          event.error
        );
        window.forceMemoryCleanup?.();
      }
    },
    { passive: true }
  );
  window.createTombstone = (itemId, type, source = "manual") => {
    if (app?.dataService) {
      return app.dataService.createTombstone(itemId, type, source);
    }
    return null;
  };
  window.getTombstones = () => {
    if (app?.dataService) {
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
    if (app?.backupService && app?.dataService) {
      const { totalSize, itemCount } = await app.dataService.estimateDataSize();
      const chunkLimit = 100 * 1024 * 1024;
      const willUseChunks = totalSize > chunkLimit;
      const willUseStreaming = totalSize > app.dataService.memoryThreshold;
      return {
        estimatedSize: totalSize,
        formattedSize: app.dataService.formatSize(totalSize),
        itemCount: itemCount,
        chunkLimit: chunkLimit,
        formattedChunkLimit: app.dataService.formatSize(chunkLimit),
        memoryThreshold: app.dataService.memoryThreshold,
        formattedMemoryThreshold: app.dataService.formatSize(
          app.dataService.memoryThreshold
        ),
        willUseChunks: willUseChunks,
        willUseStreaming: willUseStreaming,
        backupMethod: "server-side",
        processingMethod: willUseStreaming ? "streaming" : "in-memory",
        compressionNote: "Size shown is before encryption/compression.",
      };
    }
    return { error: "Services not available" };
  };
  window.getMemoryDiagnostics = () => {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      performance: {},
      app: {},
      browser: {},
    };
    try {
      if (performance?.memory) {
        diagnostics.performance = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          usedHeapMB: Math.round(
            performance.memory.usedJSHeapSize / 1024 / 1024
          ),
          totalHeapMB: Math.round(
            performance.memory.totalJSHeapSize / 1024 / 1024
          ),
          limitHeapMB: Math.round(
            performance.memory.jsHeapSizeLimit / 1024 / 1024
          ),
          heapUsagePercent: Math.round(
            (performance.memory.usedJSHeapSize /
              performance.memory.jsHeapSizeLimit) *
              100
          ),
        };
      }
      if (app) {
        diagnostics.app = {
          hasDataService: !!app.dataService,
          hasCryptoService: !!app.cryptoService,
          hasStorageService: !!app.storageService,
          hasSyncOrchestrator: !!app.syncOrchestrator,
          hasBackupService: !!app.backupService,
          hasOperationQueue: !!app.operationQueue,
          operationQueueSize: app.operationQueue?.size() || 0,
          eventListenersCount: app.eventListeners?.length || 0,
          modalCallbacksCount: app.modalCleanupCallbacks?.length || 0,
          cryptoKeyCacheSize: app.cryptoService?.keyCache?.size || 0,
          syncInProgress: app.syncOrchestrator?.syncInProgress || false,
          autoSyncInterval: !!app.autoSyncInterval,
        };
      }
      diagnostics.browser = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        doNotTrack: navigator.doNotTrack,
      };
      if (window?.gc || (typeof global !== "undefined" && global?.gc)) {
        diagnostics.performance.gcAvailable = true;
      }
    } catch (error) {
      diagnostics.error = error.message;
    }
    return diagnostics;
  };
  window.forceMemoryCleanup = async () => {
    console.log("🧹 Starting forced memory cleanup...");
    try {
      if (app?.dataService?.forceGarbageCollection) {
        await app.dataService.forceGarbageCollection();
      }
      if (app?.cryptoService?.cleanupKeyCache) {
        app.cryptoService.cleanupKeyCache();
      }
      if (app?.operationQueue?.cleanupStaleOperations) {
        app.operationQueue.cleanupStaleOperations(Date.now());
      }
      const modal = document.querySelector(".cloud-sync-modal");
      if ((modal && !modal.style.display) || modal.style.display !== "none") {
        console.log("Modal is open, skipping DOM cleanup");
      } else {
        const orphanedElements = document.querySelectorAll(
          "[data-temporary='true']"
        );
        orphanedElements.forEach((el) => el.remove());
      }
      if (window?.gc) {
        window.gc();
        console.log("✅ Manual garbage collection triggered");
      } else if (typeof global !== "undefined" && global?.gc) {
        global.gc();
        console.log("✅ Manual garbage collection triggered (global)");
      } else {
        console.log("⚠️ Manual garbage collection not available");
      }
      console.log("✅ Memory cleanup completed");
      return window.getMemoryDiagnostics();
    } catch (error) {
      console.error("❌ Memory cleanup failed:", error);
      return { error: error.message };
    }
  };
}
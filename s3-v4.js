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

  class IStorageProvider {
    constructor(configManager, cryptoService, logger) {
      if (this.constructor === IStorageProvider) {
        throw new Error("Cannot instantiate abstract class IStorageProvider.");
      }
      this.config = configManager;
      this.crypto = cryptoService;
      this.logger = logger;
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
  }

  class S3Service extends IStorageProvider {
    constructor(configManager, cryptoService, logger) {
      super(configManager, cryptoService, logger);
      this.client = null;
      this.sdkLoaded = false;
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
    async copyObject(sourceKey, destinationKey) {
      return this.withRetry(async () => {
        const result = await this.client
          .copyObject({
            Bucket: this.config.get("bucketName"),
            CopySource: `${this.config.get("bucketName")}/${sourceKey}`,
            Key: destinationKey,
          })
          .promise();
        this.logger.log("success", `Copied ${sourceKey} → ${destinationKey}`);
        return result;
      });
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
    }

    isConfigured() {
      return !!this.config.get("googleClientId");
    }

    async initialize() {
      if (!this.isConfigured())
        throw new Error("Google Drive configuration incomplete");
      await this._loadGapiAndGis();
      await new Promise((resolve) => gapi.load("client", resolve));
      await gapi.client.init({});

      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.config.get("googleClientId"),
        scope: this.DRIVE_SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            this.logger.log("error", "Google Auth Error", tokenResponse.error);
            return;
          }
          gapi.client.setToken(tokenResponse);
          localStorage.setItem(
            "tcs_google_access_token",
            JSON.stringify(tokenResponse)
          );
        },
      });

      const storedToken = localStorage.getItem("tcs_google_access_token");
      if (storedToken) {
        try {
          const token = JSON.parse(storedToken);
          if (
            token.expires_in &&
            Date.now() < token.iat + token.expires_in * 1000
          ) {
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
          localStorage.removeItem("tcs_google_access_token");
        }
      }
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

    async handleAuthentication() {
      if (!this.isConfigured() || !this.tokenClient) {
        throw new Error("Google Drive is not configured or initialized.");
      }
      return new Promise((resolve, reject) => {
        const callback = (tokenResponse) => {
          if (tokenResponse.error) {
            this.logger.log("error", "Google Auth Error", tokenResponse);
            reject(
              new Error(
                tokenResponse.error_description || "Authentication failed."
              )
            );
            return;
          }
          gapi.client.setToken(tokenResponse);
          localStorage.setItem(
            "tcs_google_access_token",
            JSON.stringify(tokenResponse)
          );
          this.logger.log("success", "Google Drive authentication successful.");
          resolve();
        };

        this.tokenClient.callback = callback;

        if (gapi.client.getToken() === null) {
          this.tokenClient.requestAccessToken({ prompt: "consent" });
        } else {
          this.tokenClient.requestAccessToken({ prompt: "" });
        }
      });
    }

    async _getAppFolderId() {
      if (this.pathIdCache.has(this.APP_FOLDER_NAME)) {
        return this.pathIdCache.get(this.APP_FOLDER_NAME);
      }

      try {
        const response = await gapi.client.drive.files.list({
          q: `mimeType='application/vnd.google-apps.folder' and name='${this.APP_FOLDER_NAME}' and trashed=false`,
          fields: "files(id, name)",
          spaces: "drive",
        });

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
          const folderId = createResponse.result.id;
          this.pathIdCache.set(this.APP_FOLDER_NAME, folderId);
          return folderId;
        }
      } catch (error) {
        this.logger.log(
          "error",
          "Failed to get/create app folder.",
          error.result.error
        );
        throw new Error(
          "Could not access or create the application folder in Google Drive."
        );
      }
    }

    async _getPathId(path, createIfNotExists = false) {
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
          parentId = createResponse.result.id;
          this.pathIdCache.set(currentPath, parentId);
        } else {
          return null;
        }
      }
      return parentId;
    }

    async _getFileMetadata(path) {
      const parts = path.split("/").filter((p) => p);
      const filename = parts.pop();
      const folderPath = parts.join("/");

      const parentId = await this._getPathId(folderPath);
      if (!parentId) return null;

      const response = await gapi.client.drive.files.list({
        q: `name='${filename}' and '${parentId}' in parents and trashed=false`,
        fields: "files(id, name, etag, size, modifiedTime)",
        spaces: "drive",
      });

      return response.result.files.length > 0 ? response.result.files[0] : null;
    }

    async upload(key, data, isMetadata = false) {
      await this.handleAuthentication();
      const parts = key.split("/").filter((p) => p);
      const filename = parts.pop();
      const folderPath = parts.join("/");

      const parentId = await this._getPathId(folderPath, true);
      const existingFile = await this._getFileMetadata(key);

      const body = isMetadata
        ? JSON.stringify(data)
        : await this.crypto.encrypt(data);
      const blob = new Blob([body], {
        type: isMetadata ? "application/json" : "application/octet-stream",
      });

      const metadata = {
        name: filename,
        mimeType: isMetadata ? "application/json" : "application/octet-stream",
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
        throw new Error(result.error.message);
      }
      this.logger.log("success", `Uploaded ${key} to Google Drive`, {
        ETag: result.etag,
      });
      return { ETag: result.etag, ...result };
    }

    async download(key, isMetadata = false) {
      await this.handleAuthentication();
      const file = await this._getFileMetadata(key);
      if (!file) {
        const error = new Error(`File not found in Google Drive: ${key}`);
        error.code = "NoSuchKey";
        error.statusCode = 404;
        throw error;
      }

      const response = await gapi.client.drive.files.get({
        fileId: file.id,
        alt: "media",
      });

      if (response.status !== 200) {
        this.logger.log(
          "error",
          `Google Drive download failed for ${key}`,
          response.result
        );
        throw new Error(`Download failed with status ${response.status}`);
      }

      const body = response.body;
      const result = isMetadata
        ? JSON.parse(body)
        : await this.crypto.decrypt(new TextEncoder().encode(body).buffer);
      return result;
    }

    async delete(key) {
      await this.handleAuthentication();
      const file = await this._getFileMetadata(key);
      if (!file) {
        this.logger.log("warning", `File to delete not found: ${key}`);
        return;
      }

      await gapi.client.drive.files.delete({ fileId: file.id });
      this.logger.log("success", `Deleted ${key} from Google Drive.`);
    }

    async list(prefix = "") {
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
        allFiles.push(...response.result.files);
        pageToken = response.result.nextPageToken;
      } while (pageToken);

      return allFiles.map((file) => ({
        Key: `${prefix}${file.name}`,
        LastModified: new Date(file.modifiedTime),
        Size: file.size,
      }));
    }

    async downloadWithResponse(key) {
      await this.handleAuthentication();
      const file = await this._getFileMetadata(key);
      if (!file) {
        const error = new Error(`File not found in Google Drive: ${key}`);
        error.code = "NoSuchKey";
        error.statusCode = 404;
        throw error;
      }

      const contentResponse = await gapi.client.drive.files.get({
        fileId: file.id,
        alt: "media",
      });

      return {
        Body: contentResponse.body,
        ETag: file.etag,
        ...file,
      };
    }

    async copyObject(sourceKey, destinationKey) {
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

      this.logger.log("success", `Copied ${sourceKey} → ${destinationKey}`);
      return response.result;
    }

    async verify() {
      this.logger.log("info", "Verifying Google Drive connection...");
      await this.handleAuthentication();
      await this._getAppFolderId();
      this.logger.log("success", "Google Drive connection verified.");
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
     * Detects changes between local storage and the last known sync state.
     * This uses a combined strategy:
     * - For CHAT items (key starts with 'CHAT_'): Uses the `updatedAt` timestamp for fast, memory-safe change detection.
     * - For all other items: Uses the original `size`-based comparison.
     * This prevents memory crashes caused by stringifying large chat objects.
     */
    async detectChanges() {
      const changedItems = [];
      const now = Date.now();

      const { totalSize } = await this.dataService.estimateDataSize();
      const itemsIterator =
        totalSize > this.dataService.memoryThreshold
          ? this.dataService.streamAllItemsInternal()
          : [await this.dataService.getAllItems()];

      for await (const batch of itemsIterator) {
        for (const item of batch) {
          const key = item.id;
          const value = item.data;
          const existingItem = this.metadata.items[key];

          if (existingItem?.deleted) {
            continue;
          }

          let hasChanged = false;
          let changeReason = "unknown";
          let itemLastModified = now;
          let currentSize = 0;

          // STRATEGY 1: Timestamp-based detection for CHAT items
          if (
            key.startsWith("CHAT_") &&
            item.type === "idb" &&
            value?.updatedAt
          ) {
            itemLastModified = value.updatedAt;

            if (!existingItem) {
              hasChanged = true;
              changeReason = "new-chat";
            } else if (itemLastModified > (existingItem.lastModified || 0)) {
              hasChanged = true;
              changeReason = "timestamp";
            } else if (!existingItem.synced) {
              hasChanged = true;
              changeReason = "never-synced-chat";
            }
          }
          // STRATEGY 2: Size-based detection for all other items (the original, safe logic)
          else {
            currentSize = this.getItemSize(value);
            itemLastModified = existingItem?.lastModified || 0;

            if (!existingItem) {
              hasChanged = true;
              changeReason = "new";
            } else if (currentSize !== existingItem.size) {
              hasChanged = true;
              changeReason = "size";
              itemLastModified = now;
            } else if (!existingItem.synced) {
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
              const data = await this.dataService.getItem(item.id, item.type);
              if (data) {
                await this.storageService.upload(`items/${item.id}.json`, data);

                const newMetadataEntry = {
                  synced: Date.now(),
                  type: item.type,
                  lastModified: item.lastModified,
                };

                if (!item.id.startsWith("CHAT_")) {
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
              const data = await this.storageService.download(
                `items/${key}.json`
              );
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
        await this.updateSyncDiagnosticsCache();
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
              await this.storageService.upload(`items/${item.id}.json`, data);
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
        await this.storageService.upload("metadata.json", cloudMetadata, true);
        this.metadata.lastSync = cloudMetadata.lastSync;
        this.setLastCloudSync(cloudMetadata.lastSync);
        this.saveMetadata();
        await this.updateSyncDiagnosticsCache();
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
      await this.syncFromCloud();
      const cloudMetadata = await this.getCloudMetadata();
      const localMetadataEmpty =
        Object.keys(this.metadata.items || {}).length === 0;
      const cloudMetadataEmpty =
        Object.keys(cloudMetadata.items || {}).length === 0;
      if (localMetadataEmpty && cloudMetadataEmpty) {
        const { totalSize, itemCount } =
          await this.dataService.estimateDataSize();
        if (itemCount > 0) {
          this.logger.log(
            "info",
            `🚀 Fresh setup detected: ${itemCount} local items found with empty metadata. Triggering initial sync.`
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
      if (useStreaming) {
        this.logger.log(
          "info",
          `Using memory-efficient metadata initialization for large dataset (${this.dataService.formatSize(
            totalSize
          )})`
        );
        for await (const batch of this.dataService.streamAllItemsInternal()) {
          for (const item of batch) {
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
          if (itemCount % 1000 === 0) {
            this.logger.log(
              "info",
              `Processed ${itemCount} items for metadata initialization`
            );
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      } else {
        this.logger.log(
          "info",
          `Using standard metadata initialization for small dataset (${this.dataService.formatSize(
            totalSize
          )})`
        );
        const allItems = await this.dataService.getAllItems();
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
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      const interval = Math.max(this.config.get("syncInterval") * 1000, 15000);
      this.autoSyncInterval = setInterval(async () => {
        if (
          this.storageService &&
          this.storageService.isConfigured() &&
          !this.syncInProgress
        ) {
          try {
            await this.performFullSync();
          } catch (error) {
            this.logger.log("error", "Auto-sync failed", error.message);
          }
        }
      }, interval);
      this.logger.log("info", "Auto-sync started");
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
        const { totalSize, itemCount } =
          await this.dataService.estimateDataSize();
        const localCount = itemCount;
        let chatItems = 0;
        if (totalSize > this.dataService.memoryThreshold) {
          for await (const batch of this.dataService.streamAllItemsInternal()) {
            for (const item of batch) {
              if (item.id.startsWith("CHAT_")) {
                chatItems++;
              }
            }
          }
        } else {
          const allItems = await this.dataService.getAllItems();
          chatItems = allItems.filter((item) =>
            item.id.startsWith("CHAT_")
          ).length;
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
        ];

        const diagnosticsData = {
          timestamp: Date.now(),
          localItems: localCount,
          localMetadata: metadataActive,
          cloudMetadata: cloudActive,
          chatSyncLocal: chatItems,
          chatSyncCloud: cloudChatItems,
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
      try {
        const { totalSize, itemCount } =
          await this.dataService.estimateDataSize();
        const localCount = itemCount;
        let chatItems = 0;
        if (totalSize > this.dataService.memoryThreshold) {
          for await (const batch of this.dataService.streamAllItemsInternal()) {
            for (const item of batch) {
              if (item.id.startsWith("CHAT_")) {
                chatItems++;
              }
            }
          }
        } else {
          const allItems = await this.dataService.getAllItems();
          chatItems = allItems.filter((item) =>
            item.id.startsWith("CHAT_")
          ).length;
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
        return;
      }
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
    }

    async performDailyBackup() {
      this.logger.log("info", "Starting server-side daily backup");
      try {
        await this.ensureSyncIsCurrent();
        return await this.createServerSideDailyBackup();
      } catch (error) {
        this.logger.log(
          "error",
          "Server-side daily backup failed",
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

      try {
        const itemsList = await this.storageService.list("items/");
        this.logger.log(
          "info",
          `Found ${itemsList.length} items to backup via server-side copy`
        );

        let copiedItems = 0;
        const concurrency = 20;
        const itemsToProcess = itemsList.filter(
          (item) => item.Key && item.Key.startsWith("items/")
        );

        for (let i = 0; i < itemsToProcess.length; i += concurrency) {
          const batch = itemsToProcess.slice(i, i + concurrency);
          const copyPromises = batch.map(async (item) => {
            try {
              const destinationKey = `${backupFolder}/${item.Key}`;
              await this.storageService.copyObject(item.Key, destinationKey);
              return { success: true, key: item.Key };
            } catch (copyError) {
              this.logger.log(
                "warning",
                `Failed to copy item ${item.Key}: ${copyError.message}`
              );
              return {
                success: false,
                key: item.Key,
                error: copyError.message,
              };
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

        this.logger.log(
          "success",
          `Server-side snapshot created: ${backupFolder} (${copiedItems} items copied)`
        );
        return true;
      } catch (error) {
        this.logger.log(
          "error",
          `Server-side snapshot failed: ${error.message}`
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

      try {
        const itemsList = await this.storageService.list("items/");
        this.logger.log(
          "info",
          `Found ${itemsList.length} items for server-side daily backup`
        );

        let copiedItems = 0;
        const concurrency = 20;
        const itemsToProcess = itemsList.filter(
          (item) => item.Key && item.Key.startsWith("items/")
        );

        for (let i = 0; i < itemsToProcess.length; i += concurrency) {
          const batch = itemsToProcess.slice(i, i + concurrency);
          const copyPromises = batch.map(async (item) => {
            try {
              const destinationKey = `${backupFolder}/${item.Key}`;
              await this.storageService.copyObject(item.Key, destinationKey);
              return { success: true, key: item.Key };
            } catch (copyError) {
              this.logger.log(
                "warning",
                `Failed to copy item ${item.Key}: ${copyError.message}`
              );
              return {
                success: false,
                key: item.Key,
                error: copyError.message,
              };
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

        this.logger.log(
          "success",
          `Server-side daily backup created: ${backupFolder} (${copiedItems} items copied)`
        );
        await this.cleanupOldBackups();
        return true;
      } catch (error) {
        this.logger.log(
          "error",
          `Server-side daily backup failed: ${error.message}`
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

    async loadBackupList() {
      try {
        const objects = await this.storageService.list("backups/");
        const backups = [];

        for (const obj of objects) {
          if (obj.Key.endsWith("/backup-manifest.json")) {
            try {
              const manifest = await this.storageService.download(
                obj.Key,
                true
              );
              if (manifest && manifest.backupFolder) {
                const backupFolder =
                  manifest.backupFolder ||
                  obj.Key.replace("/backup-manifest.json", "");
                const backupName = backupFolder.replace("backups/", "");
                const backupType = this.getBackupType(backupName);

                backups.push({
                  key: obj.Key,
                  name: backupName,
                  displayName: backupName,
                  modified: obj.LastModified,
                  format: "server-side",
                  totalItems: manifest.totalItems,
                  copiedItems: manifest.copiedItems,
                  type: backupType,
                  backupFolder: backupFolder,
                  sortOrder: backupType === "snapshot" ? 1 : 2,
                });
              }
            } catch (error) {
              this.logger.log(
                "warning",
                `Failed to read server-side manifest for ${obj.Key}`
              );
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

        const allLocalItems = await this.dataService.getAllItems();
        this.logger.log(
          "info",
          `Found ${allLocalItems.length} items in local DB to check.`
        );

        let cleanedItemCount = 0;
        const deletionPromises = [];
        for (const localItem of allLocalItems) {
          if (!validCloudKeys.has(localItem.id)) {
            this.logger.log(
              "info",
              `- Deleting extraneous local item: ${localItem.id}`
            );
            deletionPromises.push(
              this.dataService.performDelete(localItem.id, localItem.type)
            );
            cleanedItemCount++;
          }
        }

        await Promise.all(deletionPromises);

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
        const objects = await this.storageService.list("backups/");
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        let deletedBackups = 0;

        const serverSideManifests = objects.filter((obj) =>
          obj.Key.endsWith("/backup-manifest.json")
        );

        for (const manifestObj of serverSideManifests) {
          const isOldBackup =
            new Date(manifestObj.LastModified).getTime() < thirtyDaysAgo;
          if (isOldBackup) {
            try {
              const manifest = await this.storageService.download(
                manifestObj.Key,
                true
              );
              if (manifest?.format === "server-side") {
                const backupFolder = manifest.backupFolder;

                const backupFiles = objects.filter((obj) =>
                  obj.Key.startsWith(backupFolder + "/")
                );
                for (const file of backupFiles) {
                  try {
                    await this.storageService.delete(file.Key);
                  } catch (fileError) {
                    this.logger.log(
                      "warning",
                      `Failed to delete server-side backup file: ${file.Key}`
                    );
                  }
                }
                deletedBackups++;
                this.logger.log(
                  "info",
                  `Cleaned up server-side backup: ${backupFolder}`
                );
              }
            } catch (error) {
              this.logger.log(
                "warning",
                `Failed to cleanup server-side backup: ${manifestObj.Key}`
              );
            }
          }
        }

        if (deletedBackups > 0) {
          this.logger.log(
            "success",
            `Cleaned up ${deletedBackups} old backups`
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
      this.leaderElection = null;
    }

    async initialize() {
      this.logger.log(
        "start",
        "Initializing TypingmindCloud Sync V4 (Extensible Arch)"
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
        if (storageType === "s3") {
          this.storageService = new S3Service(
            this.config,
            this.cryptoService,
            this.logger
          );
        } else if (storageType === "googleDrive") {
          this.storageService = new GoogleDriveService(
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

      await this.waitForDOM();
      this.insertSyncButton();

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
        <div class="flex justify-center items-center mb-3">
          <h3 class="text-center text-xl font-bold text-white">Cloud Backup & Sync Settings</h3>
        </div>
        ${modeStatus}
        <div class="space-y-3">

          <!-- Sync Diagnostics Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="sync-diagnostics-header">
              <div class="flex items-center gap-2">
                <label class="block text-sm font-medium text-zinc-300">Sync Diagnostics</label>
                <span id="sync-overall-status" class="text-lg">✅</span>
                <div class="flex items-center gap-1 border-l border-zinc-600 pl-2">
                  <button id="force-import-btn" class="px-2 py-1 text-xs text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:bg-gray-500 disabled:cursor-not-allowed" title="Force Import from Cloud\nOverwrites local data with cloud data.">Import ↙</button>
                  <button id="force-export-btn" class="px-2 py-1 text-xs text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:bg-gray-500 disabled:cursor-not-allowed" title="Force Export to Cloud\nOverwrites cloud data with local data.">Export ↗</button>
                  <button id="sync-diagnostics-refresh" class="text-zinc-400 hover:text-white transition-colors p-1 rounded" title="Refresh diagnostics">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <span id="sync-diagnostics-summary" class="text-xs text-zinc-400">Tap to expand</span>
                <svg id="sync-diagnostics-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="sync-diagnostics-content" class="overflow-x-auto hidden">
              <table id="sync-diagnostics-table" class="w-full text-xs text-zinc-300 border-collapse">
                <thead><tr class="border-b border-zinc-600"><th class="text-left py-1 px-2 font-medium">Type</th><th class="text-right py-1 px-2 font-medium">Count</th></tr></thead>
                <tbody id="sync-diagnostics-body"><tr><td colspan="2" class="text-center py-2 text-zinc-500">Loading...</td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- Available Backups Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="available-backups-header">
              <label class="block text-sm font-medium text-zinc-300">Available Backups</label>
              <div class="flex items-center gap-1">
                <span class="text-xs text-zinc-400">Tap to expand</span>
                <svg id="available-backups-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="available-backups-content" class="space-y-2 hidden">
              <div class="w-full">
                <select id="backup-files" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white">
                  <option value="">Please configure your provider first</option>
                </select>
              </div>
              <div class="flex justify-end space-x-2">
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
                <span class="text-xs text-zinc-400">Tap to expand</span>
                <svg id="provider-settings-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div id="provider-settings-content" class="space-y-3 hidden">
              <div>
                <label for="storage-type-select" class="block text-sm font-medium text-zinc-300">Storage Provider</label>
                <select id="storage-type-select" class="mt-1 w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white">
                  <option value="s3">Amazon S3 (or S3-Compatible)</option>
                  <option value="googleDrive">Google Drive</option>
                </select>
              </div>
              <div id="provider-settings-container">
                <div id="s3-settings-block" class="hidden space-y-2">
                  <div class="flex space-x-4">
                    <div class="w-2/3">
                      <label for="aws-bucket" class="block text-sm font-medium text-zinc-300">Bucket Name <span class="text-red-400">*</span></label>
                      <input id="aws-bucket" name="aws-bucket" type="text" value="${
                        this.config.get("bucketName") || ""
                      }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                    </div>
                    <div class="w-1/3">
                      <label for="aws-region" class="block text-sm font-medium text-zinc-300">Region <span class="text-red-400">*</span></label>
                      <input id="aws-region" name="aws-region" type="text" value="${
                        this.config.get("region") || ""
                      }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                    </div>
                  </div>
                  <div>
                    <label for="aws-access-key" class="block text-sm font-medium text-zinc-300">Access Key <span class="text-red-400">*</span></label>
                    <input id="aws-access-key" name="aws-access-key" type="password" value="${
                      this.config.get("accessKey") || ""
                    }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                  </div>
                  <div>
                    <label for="aws-secret-key" class="block text-sm font-medium text-zinc-300">Secret Key <span class="text-red-400">*</span></label>
                    <input id="aws-secret-key" name="aws-secret-key" type="password" value="${
                      this.config.get("secretKey") || ""
                    }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                  </div>
                  <div>
                    <label for="aws-endpoint" class="block text-sm font-medium text-zinc-300">S3 Compatible Storage Endpoint</label>
                    <input id="aws-endpoint" name="aws-endpoint" type="text" value="${
                      this.config.get("endpoint") || ""
                    }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off">
                  </div>
                </div>
                <div id="googleDrive-settings-block" class="hidden space-y-2">
                  <div>
                    <label for="google-client-id" class="block text-sm font-medium text-zinc-300">Google Cloud Client ID <span class="text-red-400">*</span></label>
                    <input id="google-client-id" name="google-client-id" type="text" value="${
                      this.config.get("googleClientId") || ""
                    }" class="w-full px-2 py-1.5 border border-zinc-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700 text-white" autocomplete="off" required>
                  </div>
                  <div class="pt-1">
                    <button id="google-auth-btn" class="w-full inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">Sign in with Google</button>
                    <div id="google-auth-status" class="text-xs text-center text-zinc-400 pt-2"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Common Settings Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer select-none" id="common-settings-header">
              <label class="block text-sm font-medium text-zinc-300">Common Settings</label>
              <div class="flex items-center gap-1">
                <span class="text-xs text-zinc-400">Tap to expand</span>
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

          <!-- Actions & Footer -->
          <div class="flex items-center justify-end mb-4 space-x-2 mt-4">
            <span class="text-sm text-zinc-400">Console Logging</span>
            <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
          </div>
          <div class="flex justify-between space-x-2 mt-4">
            <button id="save-settings" class="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors">Save & Verify</button>
            <div class="flex space-x-2">
              <button id="sync-now" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-500 disabled:cursor-default transition-colors" ${
                this.noSyncMode ? "disabled" : ""
              }>${this.noSyncMode ? "Sync Off" : "Sync Now"}</button>
              <button id="create-snapshot" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-500 disabled:cursor-default transition-colors" ${
                !this.isSnapshotAvailable() ? "disabled" : ""
              }>Snapshot</button>
              <button id="close-modal" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">Close</button>
            </div>
          </div>
          <div class="text-center mt-4"><span id="last-sync-msg" class="text-zinc-400">${
            this.noSyncMode
              ? "NoSync Mode: Automatic sync operations disabled"
              : ""
          }</span></div>
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

      const storageSelect = modal.querySelector("#storage-type-select");
      const s3Block = modal.querySelector("#s3-settings-block");
      const gdBlock = modal.querySelector("#googleDrive-settings-block");
      const googleAuthBtn = modal.querySelector("#google-auth-btn");
      const googleAuthStatus = modal.querySelector("#google-auth-status");

      this.setupCollapsibleSection(
        modal,
        "available-backups",
        this.backupsExpanded
      );
      this.setupCollapsibleSection(
        modal,
        "provider-settings",
        this.providerExpanded
      );
      this.setupCollapsibleSection(
        modal,
        "common-settings",
        this.commonExpanded
      );

      const updateVisibleSettings = () => {
        const selectedType = storageSelect.value;
        s3Block.classList.toggle("hidden", selectedType !== "s3");
        gdBlock.classList.toggle("hidden", selectedType !== "googleDrive");

        const isConfigured = this.storageService?.isConfigured();
        if (modal.querySelector("#force-import-btn")) {
          modal.querySelector("#force-import-btn").disabled = !isConfigured;
          modal.querySelector("#force-export-btn").disabled = !isConfigured;
        }

        if (selectedType === "googleDrive") {
          googleAuthBtn.disabled = !modal
            .querySelector("#google-client-id")
            .value.trim();
          if (
            isConfigured &&
            this.storageService instanceof GoogleDriveService &&
            gapi.client.getToken()
          ) {
            googleAuthStatus.textContent = "Status: Signed in.";
            googleAuthStatus.style.color = "#22c55e";
          } else {
            googleAuthStatus.textContent = isConfigured
              ? "Status: Not signed in."
              : "Status: Client ID required.";
            googleAuthStatus.style.color = "";
          }
        }
      };

      const handleGoogleAuth = async () => {
        const clientId = modal.querySelector("#google-client-id").value.trim();
        if (!clientId) {
          alert("Please enter a Google Client ID first.");
          return;
        }
        this.config.set("googleClientId", clientId);

        try {
          googleAuthBtn.disabled = true;
          googleAuthBtn.textContent = "Authenticating...";
          googleAuthStatus.textContent =
            "Please follow the Google sign-in prompt...";

          const tempProvider = new GoogleDriveService(
            this.config,
            this.cryptoService,
            this.logger
          );
          await tempProvider.initialize();
          await tempProvider.handleAuthentication();

          googleAuthStatus.textContent =
            "✅ Authentication successful! Please Save & Verify.";
          googleAuthStatus.style.color = "#22c55e";
          googleAuthBtn.textContent = "Re-authenticate";
        } catch (error) {
          this.logger.log("error", "Google authentication failed", error);
          googleAuthStatus.textContent = `❌ Auth failed: ${error.message}`;
          googleAuthStatus.style.color = "#ef4444";
          googleAuthBtn.textContent = "Sign in with Google";
        } finally {
          googleAuthBtn.disabled = false;
        }
      };

      storageSelect.value = this.config.get("storageType") || "s3";
      storageSelect.addEventListener("change", updateVisibleSettings);
      googleAuthBtn.addEventListener("click", handleGoogleAuth);
      modal
        .querySelector("#google-client-id")
        .addEventListener("input", updateVisibleSettings);
      updateVisibleSettings();

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
          window.location.reload();
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
        storageSelect.removeEventListener("change", updateVisibleSettings);
        googleAuthBtn.removeEventListener("click", handleGoogleAuth);
        modal
          .querySelector("#google-client-id")
          ?.removeEventListener("input", updateVisibleSettings);
        forceExportBtn.removeEventListener("click", handleForceExport);
        forceImportBtn.removeEventListener("click", handleForceImport);
      });

      const consoleLoggingCheckbox = modal.querySelector(
        "#console-logging-toggle"
      );
      consoleLoggingCheckbox.checked = this.logger.enabled;

      this.populateFormFromUrlParams(modal);
      if (this.isSnapshotAvailable()) {
        this.loadBackupList(modal);
        this.setupBackupListHandlers(modal);
        this.loadSyncDiagnostics(modal);
        this.setupDiagnosticsToggle(modal);
        this.setupDiagnosticsRefresh(modal);
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
        () => this.syncOrchestrator.performFullSync(),
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
      const setContent = (html) => {
        diagnosticsBody.innerHTML = html;
      };

      if (!this.storageService || !this.storageService.isConfigured()) {
        setContent(
          '<tr><td colspan="2" class="text-center py-2 text-zinc-500">Provider Not Configured</td></tr>'
        );
        if (overallStatusEl) overallStatusEl.textContent = "⚙️";
        if (summaryEl) summaryEl.textContent = "Setup required";
        return;
      }

      try {
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
        ];

        const tableHTML = rows
          .map(
            (row) => `
          <tr class="border-b border-zinc-700 hover:bg-zinc-700/30">
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
      }
    }
    setupCollapsibleSection(modal, sectionName, initialExpanded) {
      const header = modal.querySelector(`#${sectionName}-header`);
      const content = modal.querySelector(`#${sectionName}-content`);
      const chevron = modal.querySelector(`#${sectionName}-chevron`);
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

      setVisibility(initialExpanded);

      const toggleSection = () => {
        const currentExpanded = !content.classList.contains("hidden");
        const newExpanded = !currentExpanded;
        setVisibility(newExpanded);

        switch (sectionName) {
          case "available-backups":
            this.backupsExpanded = newExpanded;
            break;
          case "provider-settings":
            this.providerExpanded = newExpanded;
            break;
          case "common-settings":
            this.commonExpanded = newExpanded;
            break;
        }
      };

      const clickHandler = toggleSection;
      const touchHandler = (e) => {
        e.preventDefault();
        toggleSection();
      };

      header.addEventListener("click", clickHandler);
      header.addEventListener("touchend", touchHandler);
      this.modalCleanupCallbacks.push(() => {
        if (header) {
          header.removeEventListener("click", clickHandler);
          header.removeEventListener("touchend", touchHandler);
        }
      });
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
      this.modalCleanupCallbacks.push(() => {
        if (header) {
          header.removeEventListener("click", clickHandler);
          header.removeEventListener("touchend", touchHandler);
        }
      });
    }
    setupDiagnosticsRefresh(modal) {
      const refreshButton = modal.querySelector("#sync-diagnostics-refresh");
      if (!refreshButton) return;
      const refreshHandler = (e) => {
        e.stopPropagation();
        this.loadSyncDiagnostics(modal);
        refreshButton.style.transform = "rotate(360deg)";
        setTimeout(() => {
          refreshButton.style.transform = "rotate(0deg)";
        }, 300);
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

    async saveSettings(overlay) {
      const storageType = document.getElementById("storage-type-select").value;

      const newConfig = {
        storageType: storageType,
        syncInterval:
          parseInt(document.getElementById("sync-interval").value) || 15,
        encryptionKey: document.getElementById("encryption-key").value.trim(),
      };

      if (storageType === "s3") {
        newConfig.bucketName = document
          .getElementById("aws-bucket")
          .value.trim();
        newConfig.region = document.getElementById("aws-region").value.trim();
        newConfig.accessKey = document
          .getElementById("aws-access-key")
          .value.trim();
        newConfig.secretKey = document
          .getElementById("aws-secret-key")
          .value.trim();
        newConfig.endpoint = document
          .getElementById("aws-endpoint")
          .value.trim();
      } else if (storageType === "googleDrive") {
        newConfig.googleClientId = document
          .getElementById("google-client-id")
          .value.trim();
      }

      const exclusions = document.getElementById("sync-exclusions").value;

      if (newConfig.syncInterval < 15) {
        alert("Sync interval must be at least 15 seconds");
        return;
      }
      if (!newConfig.encryptionKey) {
        alert("Encryption key is a mandatory shared setting.");
        return;
      }

      const saveButton = document.getElementById("save-settings");
      const actionMsg = document.getElementById("action-msg");
      saveButton.disabled = true;
      saveButton.textContent = "Verifying...";
      actionMsg.textContent = "Verifying provider credentials...";
      actionMsg.style.color = "#3b82f6";

      try {
        const tempConfigManager = new ConfigManager();
        tempConfigManager.config = { ...this.config.config, ...newConfig };

        let tempProvider;
        if (storageType === "s3") {
          tempProvider = new S3Service(
            tempConfigManager,
            this.cryptoService,
            this.logger
          );
        } else if (storageType === "googleDrive") {
          tempProvider = new GoogleDriveService(
            tempConfigManager,
            this.cryptoService,
            this.logger
          );
        } else {
          throw new Error(`Cannot verify unknown storage type: ${storageType}`);
        }

        if (!tempProvider.isConfigured()) {
          throw new Error(
            "Please fill in all required fields for the selected provider."
          );
        }

        await tempProvider.initialize();
        await tempProvider.verify();

        actionMsg.textContent =
          "✅ Credentials verified! Saving configuration...";
        actionMsg.style.color = "#22c55e";

        Object.keys(newConfig).forEach((key) =>
          this.config.set(key, newConfig[key])
        );
        localStorage.setItem("tcs_sync-exclusions", exclusions);
        this.config.reloadExclusions();
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
        saveButton.textContent = "Save & Verify";
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
      this.logger.log("start", `Deleting backup: ${key}`);
      if (key.endsWith("-metadata.json")) {
        this.logger.log("info", "Deleting chunked backup with all chunks");
        try {
          const metadata = await this.storageService.download(key, true);
          let deletedCount = 0;
          if (metadata.chunkList && metadata.chunkList.length > 0) {
            this.logger.log(
              "info",
              `Deleting ${metadata.chunkList.length} chunk files`
            );
            const deletePromises = metadata.chunkList.map(async (chunkInfo) => {
              try {
                await this.storageService.delete(chunkInfo.filename);
                deletedCount++;
              } catch (error) {
                this.logger.log(
                  "warning",
                  `Failed to delete chunk ${chunkInfo.filename}: ${error.message}`
                );
              }
            });
            await Promise.allSettled(deletePromises);
          }
          await this.storageService.delete(key);
          this.logger.log(
            "success",
            `Deleted chunked backup: ${key} (${deletedCount} chunks + metadata)`
          );
        } catch (error) {
          this.logger.log(
            "warning",
            `Failed to read metadata for ${key}, attempting to delete file anyway`
          );
          await this.storageService.delete(key);
        }
      } else {
        this.logger.log("info", "Deleting server-side copy backup");
        const backupFolder = key.replace("/backup-manifest.json", "");
        const filesToDelete = await this.storageService.list(
          backupFolder + "/"
        );
        for (const file of filesToDelete) {
          await this.storageService.delete(file.Key);
        }
        await this.storageService.delete(key);
        this.logger.log("success", `Deleted server-side backup: ${key}`);
      }
    }

    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      const interval = Math.max(this.config.get("syncInterval") * 1000, 15000);
      this.autoSyncInterval = setInterval(async () => {
        if (
          this.storageService &&
          this.storageService.isConfigured() &&
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
      if (
        !this.noSyncMode &&
        this.storageService &&
        this.storageService.isConfigured()
      ) {
        this.updateSyncStatus("syncing");
        try {
          await this.backupService.checkAndPerformDailyBackup();
          await this.syncOrchestrator.performFullSync();
          this.startAutoSync();
          this.updateSyncStatus("success");
          this.logger.log(
            "success",
            "Cloud Sync initialized successfully on leader tab."
          );
        } catch (error) {
          this.logger.log(
            "error",
            "Background sync/backup failed on leader tab",
            error.message
          );
          this.updateSyncStatus("error");
        }
      }
    }
  }

  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1rem; overflow-y: auto; }
    #sync-status-dot { position: absolute; top: -0.15rem; right: -0.6rem; width: 0.625rem; height: 0.625rem; border-radius: 9999px; }
    .cloud-sync-modal { width: 100%; max-width: 32rem; background-color: rgb(39, 39, 42); color: white; border-radius: 0.5rem; padding: 1rem; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); }
    .cloud-sync-modal input, .cloud-sync-modal select { background-color: rgb(63, 63, 70); border: 1px solid rgb(82, 82, 91); color: white; }
    .cloud-sync-modal input:focus, .cloud-sync-modal select:focus { border-color: rgb(59, 130, 246); outline: none; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
    .cloud-sync-modal button:disabled { background-color: rgb(82, 82, 91); cursor: not-allowed; opacity: 0.5; }
    .cloud-sync-modal .bg-zinc-800 { border: 1px solid rgb(82, 82, 91); }
    .cloud-sync-modal input[type="checkbox"] { accent-color: rgb(59, 130, 246); }
    .cloud-sync-modal input[type="checkbox"]:checked { background-color: rgb(59, 130, 246); border-color: rgb(59, 130, 246); }
    #sync-diagnostics-table { font-size: 0.75rem; }
    #sync-diagnostics-table th { background-color: rgb(82, 82, 91); font-weight: 600; }
    #sync-diagnostics-table tr:hover { background-color: rgba(63, 63, 70, 0.5); }
    #sync-diagnostics-header { padding: 0.5rem; margin: -0.5rem; border-radius: 0.375rem; transition: background-color 0.2s ease; -webkit-tap-highlight-color: transparent; min-height: 44px; display: flex; align-items: center; }
    #sync-diagnostics-header:hover { background-color: rgba(63, 63, 70, 0.5); }
    #sync-diagnostics-header:active { background-color: rgba(63, 63, 70, 0.8); }
    #sync-diagnostics-chevron, #sync-diagnostics-refresh { transition: transform 0.3s ease; }
    #sync-diagnostics-content { animation: slideDown 0.2s ease-out; }
    @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 300px; } }
    @media (max-width: 640px) { #sync-diagnostics-table { font-size: 0.7rem; } #sync-diagnostics-table th, #sync-diagnostics-table td { padding: 0.5rem 0.25rem; } .cloud-sync-modal { margin: 0.5rem; max-height: 90vh; overflow-y: auto; } }
  `;
  document.head.appendChild(styleSheet);

  const app = new CloudSyncApp();
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

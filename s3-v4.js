if (window.typingMindCloudSync) {
  console.log("TypingMind Cloud Sync already loaded");
} else {
  window.typingMindCloudSync = true;
  const VERSION = "4.0.0";
  const CONSOLE_TAG = "[Cloud Sync v4]";
  const EXCLUDED_SETTINGS = [
    "aws-bucket",
    "aws-access-key",
    "aws-secret-key",
    "aws-region",
    "aws-endpoint",
    "encryption-key",
    "last-cloud-sync",
    "sync-exclusions",
  ];
  const CONFIG_KEYS = {
    syncInterval: "sync-interval",
    bucketName: "aws-bucket",
    region: "aws-region",
    accessKey: "aws-access-key",
    secretKey: "aws-secret-key",
    endpoint: "aws-endpoint",
    encryptionKey: "encryption-key",
  };
  class CloudSyncError extends Error {
    constructor(message, type = "GENERAL", details = null) {
      super(message);
      this.name = "CloudSyncError";
      this.type = type;
      this.details = details;
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
        `${this.icons[type] || "ℹ️"} ${CONSOLE_TAG} [${timestamp}] ${message}`,
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
  const logger = new Logger();
  class ConfigManager {
    constructor() {
      this.config = {
        syncInterval: 15,
        bucketName: "",
        region: "",
        accessKey: "",
        secretKey: "",
        endpoint: "",
        encryptionKey: "",
      };
      this.load();
    }
    load() {
      Object.keys(CONFIG_KEYS).forEach((key) => {
        const value = localStorage.getItem(CONFIG_KEYS[key]);
        this.config[key] =
          key === "syncInterval" ? parseInt(value) || 15 : value || "";
      });
    }
    save() {
      Object.keys(CONFIG_KEYS).forEach((key) => {
        localStorage.setItem(CONFIG_KEYS[key], this.config[key].toString());
      });
    }
    get(key) {
      return this.config[key];
    }
    set(key, value) {
      this.config[key] = value;
    }
    getAll() {
      return { ...this.config };
    }
    isAwsConfigured() {
      return !!(
        this.config.accessKey &&
        this.config.secretKey &&
        this.config.region &&
        this.config.bucketName
      );
    }
    getUserExclusions() {
      const exclusions = localStorage.getItem("sync-exclusions");
      return exclusions
        ? exclusions
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item)
        : [];
    }
    shouldExcludeSetting(key) {
      const userExclusions = this.getUserExclusions();
      return (
        EXCLUDED_SETTINGS.includes(key) ||
        userExclusions.includes(key) ||
        key.startsWith("CHAT_") ||
        key.startsWith("last-seen-") ||
        !isNaN(key)
      );
    }
  }
  const configManager = new ConfigManager();
  class ResourceManager {
    constructor() {
      this.domCache = new Map();
      this.dbPool = [];
      this.dbInUse = new Set();
      this.dbWaitingQueue = [];
      this.maxDbConnections = 3;
    }
    getDOMElement(selector, refetch = false) {
      if (!this.domCache.has(selector) || refetch) {
        this.domCache.set(selector, document.querySelector(selector));
      }
      return this.domCache.get(selector);
    }
    clearDOMCache() {
      this.domCache.clear();
    }
    async getDBConnection() {
      if (this.dbPool.length > 0) {
        const conn = this.dbPool.pop();
        this.dbInUse.add(conn);
        return conn;
      }
      if (this.dbInUse.size < this.maxDbConnections) {
        const conn = await this._createDBConnection();
        this.dbInUse.add(conn);
        return conn;
      }
      return new Promise((resolve) => {
        this.dbWaitingQueue.push(resolve);
      });
    }
    releaseDBConnection(conn) {
      this.dbInUse.delete(conn);
      if (this.dbWaitingQueue.length > 0) {
        const resolve = this.dbWaitingQueue.shift();
        this.dbInUse.add(conn);
        resolve(conn);
      } else {
        this.dbPool.push(conn);
      }
    }
    async _createDBConnection() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("keyval-store");
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = () =>
          reject(
            new CloudSyncError("Failed to open IndexedDB", "DB_CONNECTION")
          );
      });
    }
  }
  const resourceManager = new ResourceManager();
  class CryptoService {
    constructor() {
      this.keyCache = new Map();
    }
    async deriveKey(password) {
      if (this.keyCache.has(password)) {
        return this.keyCache.get(password);
      }
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
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
      } catch (error) {
        throw new CloudSyncError(
          "Failed to derive encryption key",
          "CRYPTO",
          error
        );
      }
    }
    async encrypt(data) {
      const encryptionKey = configManager.get("encryptionKey");
      if (!encryptionKey)
        throw new CloudSyncError("No encryption key configured", "CRYPTO");
      try {
        const key = await this.deriveKey(encryptionKey);
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(JSON.stringify(data));
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
      } catch (error) {
        throw new CloudSyncError("Encryption failed", "CRYPTO", error);
      }
    }
    async decrypt(encryptedData) {
      const encryptionKey = configManager.get("encryptionKey");
      if (!encryptionKey)
        throw new CloudSyncError("No encryption key configured", "CRYPTO");
      try {
        const key = await this.deriveKey(encryptionKey);
        const iv = encryptedData.slice(0, 12);
        const data = encryptedData.slice(12);
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          key,
          data
        );
        return JSON.parse(new TextDecoder().decode(decrypted));
      } catch (error) {
        throw new CloudSyncError("Decryption failed", "CRYPTO", error);
      }
    }
    async encryptBatch(dataItems) {
      const results = await Promise.all(
        dataItems.map((data) => this.encrypt(data))
      );
      return results;
    }
    async decryptBatch(encryptedItems) {
      const results = await Promise.all(
        encryptedItems.map((data) => this.decrypt(data))
      );
      return results;
    }
  }
  const cryptoService = new CryptoService();
  class S3Service {
    constructor() {
      this.client = null;
      this.retryConfig = {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      };
    }
    async initialize() {
      if (!configManager.isAwsConfigured()) {
        throw new CloudSyncError("AWS configuration incomplete", "S3_CONFIG");
      }
      await this._loadSDK();
      const config = configManager.getAll();
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
      logger.log("success", "S3 service initialized");
    }
    async _loadSDK() {
      if (window.AWS) return;
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.1691.0.min.js";
        script.onload = resolve;
        script.onerror = () =>
          reject(new CloudSyncError("Failed to load AWS SDK", "SDK_LOAD"));
        document.head.appendChild(script);
      });
    }
    async upload(key, data, isMetadata = false) {
      return this._executeWithRetry(`upload-${key}`, async () => {
        const body = isMetadata
          ? JSON.stringify(data)
          : await cryptoService.encrypt(data);
        const result = await this.client
          .upload({
            Bucket: configManager.get("bucketName"),
            Key: key,
            Body: body,
            ContentType: isMetadata
              ? "application/json"
              : "application/octet-stream",
          })
          .promise();
        logger.log("success", `Uploaded ${key}`);
        return result;
      });
    }
    async download(key, isMetadata = false) {
      return this._executeWithRetry(`download-${key}`, async () => {
        const result = await this.client
          .getObject({
            Bucket: configManager.get("bucketName"),
            Key: key,
          })
          .promise();
        const data = isMetadata
          ? JSON.parse(result.Body.toString())
          : await cryptoService.decrypt(new Uint8Array(result.Body));
        return data;
      });
    }
    async delete(key) {
      return this._executeWithRetry(`delete-${key}`, async () => {
        await this.client
          .deleteObject({
            Bucket: configManager.get("bucketName"),
            Key: key,
          })
          .promise();
        logger.log("success", `Deleted ${key}`);
      });
    }
    async list(prefix = "") {
      return this._executeWithRetry(`list-${prefix}`, async () => {
        const result = await this.client
          .listObjectsV2({
            Bucket: configManager.get("bucketName"),
            Prefix: prefix,
          })
          .promise();
        return result.Contents || [];
      });
    }
    async _executeWithRetry(operationKey, operation) {
      let lastError;
      for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          if (attempt === this.retryConfig.maxRetries) break;
          const delay = Math.min(
            this.retryConfig.baseDelay *
              Math.pow(this.retryConfig.backoffMultiplier, attempt),
            this.retryConfig.maxDelay
          );
          logger.log(
            "warning",
            `Retry ${attempt + 1}/${
              this.retryConfig.maxRetries
            } for ${operationKey} in ${delay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new CloudSyncError(
        `Operation failed after ${this.retryConfig.maxRetries} retries: ${operationKey}`,
        "S3_OPERATION",
        lastError
      );
    }
  }
  const s3Service = new S3Service();
  class DataService {
    async generateHash(content) {
      const encoder = new TextEncoder();
      const data = encoder.encode(
        typeof content === "string" ? content : JSON.stringify(content)
      );
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .slice(0, 4)
        .join("");
    }
    async executeDBOperation(operation, mode = "readonly") {
      const db = await resourceManager.getDBConnection();
      try {
        const transaction = db.transaction(["keyval"], mode);
        const store = transaction.objectStore("keyval");
        return await operation(store);
      } finally {
        resourceManager.releaseDBConnection(db);
      }
    }
    async getAllChats() {
      return this.executeDBOperation((store) => {
        return new Promise((resolve) => {
          const chats = [];
          const request = store.openCursor();
          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const key = cursor.key;
              const value = cursor.value;
              if (
                typeof key === "string" &&
                key.startsWith("chat_") &&
                value &&
                typeof value === "object"
              ) {
                chats.push({ id: key.replace("chat_", ""), ...value });
              }
              cursor.continue();
            } else {
              resolve(chats);
            }
          };
          request.onerror = () => resolve([]);
        });
      });
    }
    async getChat(chatId) {
      return this.executeDBOperation((store) => {
        return new Promise((resolve) => {
          const request = store.get(`chat_${chatId}`);
          request.onsuccess = () => {
            const result = request.result;
            resolve(result ? { id: chatId, ...result } : null);
          };
          request.onerror = () => resolve(null);
        });
      });
    }
    async saveChat(chat) {
      return this.executeDBOperation((store) => {
        return new Promise((resolve) => {
          const chatId = chat.id;
          const chatData = { ...chat };
          delete chatData.id;
          const request = store.put(chatData, `chat_${chatId}`);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      }, "readwrite");
    }
    async deleteChat(chatId) {
      return this.executeDBOperation((store) => {
        return new Promise((resolve) => {
          const request = store.delete(`chat_${chatId}`);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      }, "readwrite");
    }
    async getFilteredSettings() {
      return Array.from({ length: localStorage.length }, (_, i) => {
        const key = localStorage.key(i);
        return configManager.shouldExcludeSetting(key)
          ? null
          : [key, localStorage.getItem(key)];
      }).filter(Boolean);
    }
  }
  const dataService = new DataService();
  class MetadataManager {
    constructor() {
      this.localMetadata = {
        lastSync: 0,
        lastModified: 0,
        items: {},
        deleted: [],
      };
      this.load();
    }
    async load() {
      const stored = localStorage.getItem("cloud-metadata-v4");
      if (stored) {
        this.localMetadata = JSON.parse(stored);
      }
      logger.log("info", "Local metadata loaded", this.localMetadata);
    }
    async save() {
      this.localMetadata.lastModified = Date.now();
      localStorage.setItem(
        "cloud-metadata-v4",
        JSON.stringify(this.localMetadata)
      );
      logger.log("info", "Local metadata saved");
    }
    get() {
      return this.localMetadata;
    }
    set(metadata) {
      this.localMetadata = metadata;
    }
    updateItem(key, item) {
      this.localMetadata.items[key] = item;
    }
    deleteItem(key) {
      delete this.localMetadata.items[key];
    }
    async detectChanges() {
      const [chats, settingsEntries] = await Promise.all([
        dataService.getAllChats(),
        dataService.getFilteredSettings(),
      ]);
      const changesBatch = {
        chats: new Map(),
        settings: new Map(),
        hasChanges: false,
      };
      const BATCH_SIZE = 50;
      for (let i = 0; i < chats.length; i += BATCH_SIZE) {
        const chatBatch = chats.slice(i, i + BATCH_SIZE);
        await Promise.all(
          chatBatch.map(async (chat) => {
            const hash = await dataService.generateHash(chat);
            const existing = this.localMetadata.items[chat.id];
            if (!existing || existing.hash !== hash) {
              changesBatch.chats.set(chat.id, {
                hash,
                modified: Date.now(),
                synced: existing?.synced || 0,
                type: "idb",
              });
              changesBatch.hasChanges = true;
              logger.log("info", `Chat modified: ${chat.id}`);
            }
          })
        );
      }
      for (let i = 0; i < settingsEntries.length; i += BATCH_SIZE) {
        const settingsBatch = settingsEntries.slice(i, i + BATCH_SIZE);
        await Promise.all(
          settingsBatch.map(async ([key, value]) => {
            const hash = await dataService.generateHash(value);
            const existing = this.localMetadata.items[key];
            if (!existing || existing.hash !== hash) {
              changesBatch.settings.set(key, {
                hash,
                modified: Date.now(),
                synced: existing?.synced || 0,
                type: "ls",
              });
              changesBatch.hasChanges = true;
            }
          })
        );
      }
      if (changesBatch.hasChanges) {
        changesBatch.chats.forEach((item, key) => {
          this.localMetadata.items[key] = item;
        });
        changesBatch.settings.forEach((item, key) => {
          this.localMetadata.items[key] = item;
        });
        await this.save();
      }
      return changesBatch;
    }
  }
  const metadataManager = new MetadataManager();
  class OperationQueue {
    constructor() {
      this.queue = [];
      this.processing = false;
      this.completed = new Set();
      this.priorities = { critical: 0, high: 1, normal: 2, low: 3 };
      this.timeouts = new Map();
    }
    add(
      name,
      operation,
      dependencies = [],
      priority = "normal",
      timeout = 30000
    ) {
      if (
        this.queue.some((op) => op.name === name) ||
        this.completed.has(name)
      ) {
        logger.log("skip", `Duplicate operation: ${name}`);
        return;
      }
      this.queue.push({
        name,
        operation,
        dependencies: dependencies.filter((dep) => !this.completed.has(dep)),
        priority: this.priorities[priority],
        timeout,
        retryCount: 0,
        maxRetries: 3,
        addedAt: Date.now(),
      });
      this.queue.sort((a, b) => a.priority - b.priority);
      this.process();
    }
    async process() {
      if (this.processing) return;
      this.processing = true;
      while (this.queue.length > 0) {
        const readyOp = this.queue.find((op) =>
          op.dependencies.every((dep) => this.completed.has(dep))
        );
        if (!readyOp) {
          this._handleDeadlock();
          break;
        }
        await this._executeOperation(readyOp);
      }
      this.processing = false;
    }
    async _executeOperation(op) {
      const index = this.queue.indexOf(op);
      this.queue.splice(index, 1);
      try {
        const timeoutPromise = new Promise((_, reject) => {
          const timeoutId = setTimeout(
            () =>
              reject(
                new CloudSyncError(`Operation timeout: ${op.name}`, "TIMEOUT")
              ),
            op.timeout
          );
          this.timeouts.set(op.name, timeoutId);
        });
        logger.log("start", `Executing operation: ${op.name}`);
        await Promise.race([op.operation(), timeoutPromise]);
        const timeoutId = this.timeouts.get(op.name);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.timeouts.delete(op.name);
        }
        this.completed.add(op.name);
        logger.log("success", `Completed: ${op.name}`);
      } catch (error) {
        const timeoutId = this.timeouts.get(op.name);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.timeouts.delete(op.name);
        }
        if (op.retryCount < op.maxRetries) {
          op.retryCount++;
          const delay = Math.min(1000 * Math.pow(2, op.retryCount), 30000);
          logger.log(
            "warning",
            `Retrying ${op.name} (${op.retryCount}/${op.maxRetries}) in ${delay}ms`
          );
          setTimeout(() => {
            this.queue.unshift(op);
            this.process();
          }, delay);
        } else {
          logger.log(
            "error",
            `Failed: ${op.name}`,
            error instanceof CloudSyncError ? error.message : error
          );
          this._handleFailedOperation(op);
        }
      }
    }
    _handleDeadlock() {
      const unmetDeps = new Set();
      this.queue.forEach((op) => {
        op.dependencies.forEach((dep) => {
          if (!this.completed.has(dep)) unmetDeps.add(dep);
        });
      });
      logger.log("error", "Deadlock detected", Array.from(unmetDeps));
      this.queue = this.queue.filter(
        (op) => !op.dependencies.some((dep) => unmetDeps.has(dep))
      );
    }
    _handleFailedOperation(failedOp) {
      this.queue = this.queue.filter(
        (op) => !op.dependencies.includes(failedOp.name)
      );
    }
  }
  const operationQueue = new OperationQueue();
  class IntervalCoordinator {
    constructor() {
      this.intervals = new Map();
      this.isActive = false;
      this.lastSyncCheck = 0;
      this.lastChangeCheck = 0;
      this.lastBackupCheck = 0;
    }
    start() {
      if (this.isActive) return;
      this.isActive = true;
      this.intervals.set(
        "master",
        setInterval(() => {
          this._coordinateActivities();
        }, 1000)
      );
      logger.log("info", "Interval coordinator started");
    }
    _coordinateActivities() {
      const now = Date.now();
      if (!configManager.isAwsConfigured()) return;
      if (this._shouldSync(now)) {
        this.lastSyncCheck = now;
        operationQueue.add(
          "interval-sync",
          () => syncService.syncFromCloud(),
          [],
          "normal"
        );
      }
      if (this._shouldCheckChanges(now)) {
        this.lastChangeCheck = now;
        this._scheduleChangeDetection();
      }
      if (this._shouldCheckDailyBackup(now)) {
        this.lastBackupCheck = now;
        operationQueue.add(
          "daily-backup",
          () => backupService.performDailyBackup(),
          [],
          "low"
        );
      }
    }
    _shouldSync(now) {
      const interval = configManager.get("syncInterval") * 1000;
      return !this.lastSyncCheck || now - this.lastSyncCheck >= interval;
    }
    _shouldCheckChanges(now) {
      const interval = 5000;
      const offset = 2500;
      return (
        !this.lastChangeCheck ||
        (now - this.lastChangeCheck >= interval &&
          !this._isNearSyncTime(now, offset))
      );
    }
    _shouldCheckDailyBackup(now) {
      const interval = 24 * 60 * 60 * 1000;
      return !this.lastBackupCheck || now - this.lastBackupCheck >= interval;
    }
    _isNearSyncTime(now, offsetMs) {
      if (!this.lastSyncCheck) return false;
      const timeSinceSync = now - this.lastSyncCheck;
      const syncInterval = configManager.get("syncInterval") * 1000;
      return syncInterval - timeSinceSync <= offsetMs;
    }
    _scheduleChangeDetection() {
      if (window.requestIdleCallback) {
        requestIdleCallback(() => metadataManager.detectChanges(), {
          timeout: 1000,
        });
      } else {
        setTimeout(() => metadataManager.detectChanges(), 0);
      }
    }
    stop() {
      this.intervals.forEach((interval) => clearInterval(interval));
      this.intervals.clear();
      this.isActive = false;
      logger.log("info", "Interval coordinator stopped");
    }
  }
  const intervalCoordinator = new IntervalCoordinator();
  class SyncService {
    async syncToCloud() {
      try {
        logger.log("start", "Starting sync to cloud");
        const changesBatch = await metadataManager.detectChanges();
        let cloudMetadata;
        try {
          cloudMetadata = await s3Service.download("metadata.json", true);
        } catch (error) {
          if (error.type === "S3_OPERATION") {
            cloudMetadata = null;
          } else {
            throw error;
          }
        }
        if (!cloudMetadata) {
          cloudMetadata = {
            lastSync: 0,
            lastModified: 0,
            items: {},
            deleted: [],
          };
        }
        const itemsToSync = [];
        changesBatch.chats.forEach((item, key) => {
          if (item.modified > (item.synced || 0)) {
            itemsToSync.push([key, item]);
          }
        });
        changesBatch.settings.forEach((item, key) => {
          if (item.modified > (item.synced || 0)) {
            itemsToSync.push([key, item]);
          }
        });
        const uploadResults = await Promise.allSettled(
          itemsToSync.map(async ([key, item]) => {
            if (item.type === "idb") {
              const chat = await dataService.getChat(key);
              if (chat) {
                await s3Service.upload(`chats/${key}.json`, chat);
                const localMetadata = metadataManager.get();
                localMetadata.items[key].synced = Date.now();
                cloudMetadata.items[key] = localMetadata.items[key];
              }
            } else if (item.type === "ls") {
              const value = localStorage.getItem(key);
              if (value !== null) {
                await s3Service.upload(`settings/${key}.json`, { key, value });
                const localMetadata = metadataManager.get();
                localMetadata.items[key].synced = Date.now();
                cloudMetadata.items[key] = localMetadata.items[key];
              }
            }
          })
        );
        const failedUploads = uploadResults.filter(
          (result) => result.status === "rejected"
        );
        if (failedUploads.length > 0) {
          logger.log("warning", `${failedUploads.length} uploads failed`);
        }
        cloudMetadata.lastSync = Date.now();
        cloudMetadata.lastModified = metadataManager.get().lastModified;
        await s3Service.upload("metadata.json", cloudMetadata, true);
        const localMetadata = metadataManager.get();
        localMetadata.lastSync = cloudMetadata.lastSync;
        await metadataManager.save();
        uiService.updateSyncStatus("success");
        logger.log("success", "Sync to cloud completed");
        return true;
      } catch (error) {
        logger.log(
          "error",
          "Failed to sync to cloud",
          error instanceof CloudSyncError ? error.message : error
        );
        uiService.updateSyncStatus("error");
        throw error;
      }
    }
    async syncFromCloud() {
      try {
        logger.log("start", "Starting sync from cloud");
        let cloudMetadata;
        try {
          cloudMetadata = await s3Service.download("metadata.json", true);
        } catch (error) {
          if (error.type === "S3_OPERATION") {
            logger.log("info", "No cloud metadata found");
            return await this.syncToCloud();
          }
          throw error;
        }
        await metadataManager.detectChanges();
        const downloadResults = await Promise.allSettled(
          Object.entries(cloudMetadata.items).map(async ([key, cloudItem]) => {
            const localMetadata = metadataManager.get();
            const localItem = localMetadata.items[key];
            const shouldDownload =
              !localItem ||
              (cloudItem.hash !== localItem.hash &&
                cloudItem.modified > localItem.modified);
            if (!shouldDownload) return;
            if (cloudItem.type === "idb") {
              const chatData = await s3Service.download(`chats/${key}.json`);
              if (chatData) {
                await dataService.saveChat(chatData);
                localMetadata.items[key] = { ...cloudItem };
                logger.log("info", `Downloaded chat: ${key}`);
              }
            } else if (cloudItem.type === "ls") {
              const settingData = await s3Service.download(
                `settings/${key}.json`
              );
              if (settingData?.value !== undefined) {
                localStorage.setItem(key, settingData.value);
                localMetadata.items[key] = { ...cloudItem };
                logger.log("info", `Downloaded setting: ${key}`);
              }
            }
          })
        );
        const failedDownloads = downloadResults.filter(
          (result) => result.status === "rejected"
        );
        if (failedDownloads.length > 0) {
          logger.log("warning", `${failedDownloads.length} downloads failed`);
        }
        for (const deletedKey of cloudMetadata.deleted || []) {
          const localMetadata = metadataManager.get();
          if (localMetadata.items[deletedKey]) {
            const item = localMetadata.items[deletedKey];
            if (item.type === "idb") {
              await dataService.deleteChat(deletedKey);
            } else if (item.type === "ls") {
              localStorage.removeItem(deletedKey);
            }
            metadataManager.deleteItem(deletedKey);
            logger.log("info", `Deleted item: ${deletedKey}`);
          }
        }
        const localMetadata = metadataManager.get();
        localMetadata.lastSync = Date.now();
        await metadataManager.save();
        uiService.updateSyncStatus("success");
        logger.log("success", "Sync from cloud completed");
        return true;
      } catch (error) {
        logger.log(
          "error",
          "Failed to sync from cloud",
          error instanceof CloudSyncError ? error.message : error
        );
        uiService.updateSyncStatus("error");
        throw error;
      }
    }
    queueBidirectionalSync() {
      operationQueue.add(
        "sync-from-cloud",
        () => this.syncFromCloud(),
        [],
        "high"
      );
      operationQueue.add(
        "sync-to-cloud",
        () => this.syncToCloud(),
        ["sync-from-cloud"],
        "high"
      );
    }
  }
  const syncService = new SyncService();
  class BackupService {
    async createSnapshot(name) {
      try {
        logger.log("start", `Creating snapshot: ${name}`);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `snapshot-${timestamp}-${name.replace(
          /[^a-zA-Z0-9]/g,
          "-"
        )}.json`;
        const [chats, settings] = await Promise.all([
          dataService.getAllChats(),
          this._getSettingsForBackup(),
        ]);
        const snapshot = { chats, settings, created: Date.now(), name };
        await s3Service.upload(`snapshots/${filename}`, snapshot);
        logger.log("success", `Snapshot created: ${filename}`);
        return true;
      } catch (error) {
        logger.log(
          "error",
          "Failed to create snapshot",
          error instanceof CloudSyncError ? error.message : error
        );
        throw error;
      }
    }
    async _getSettingsForBackup() {
      const settingsEntries = await dataService.getFilteredSettings();
      return settingsEntries.reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
    }
    async loadBackupList() {
      try {
        const objects = await s3Service.list("snapshots/");
        return objects.map((obj) => ({
          key: obj.Key,
          name: obj.Key.replace("snapshots/", "").replace(".json", ""),
          size: obj.Size,
          modified: obj.LastModified,
        }));
      } catch (error) {
        logger.log(
          "error",
          "Failed to load backup list",
          error instanceof CloudSyncError ? error.message : error
        );
        return [];
      }
    }
    async restoreFromBackup(key) {
      try {
        logger.log("start", `Restoring from backup: ${key}`);
        const backup = await s3Service.download(key);
        const promises = [];
        if (backup.chats) {
          promises.push(
            ...backup.chats.map((chat) => dataService.saveChat(chat))
          );
        }
        if (backup.settings) {
          Object.entries(backup.settings).forEach(([k, v]) =>
            localStorage.setItem(k, v)
          );
        }
        await Promise.all(promises);
        await metadataManager.detectChanges();
        logger.log("success", "Backup restored successfully");
        return true;
      } catch (error) {
        logger.log(
          "error",
          "Failed to restore backup",
          error instanceof CloudSyncError ? error.message : error
        );
        throw error;
      }
    }
    async performDailyBackup() {
      const lastBackupDate = localStorage.getItem("last-daily-backup-date");
      const today = new Date().toLocaleDateString("en-GB");
      if (lastBackupDate === today) {
        logger.log("info", "Daily backup already completed today");
        return;
      }
      try {
        logger.log("start", "Performing daily backup");
        await this.createSnapshot("daily-auto");
        localStorage.setItem("last-daily-backup-date", today);
        logger.log("success", `Daily backup completed for ${today}`);
        await this.cleanupOldBackups();
      } catch (error) {
        logger.log(
          "error",
          "Daily backup failed",
          error instanceof CloudSyncError ? error.message : error
        );
        throw error;
      }
    }
    async cleanupOldBackups() {
      try {
        logger.log("start", "Cleaning up old backups");
        const objects = await s3Service.list("snapshots/");
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        let deletedCount = 0;
        for (const obj of objects) {
          if (new Date(obj.LastModified).getTime() < thirtyDaysAgo) {
            try {
              await s3Service.delete(obj.Key);
              deletedCount++;
              logger.log("info", `Deleted old backup: ${obj.Key}`);
            } catch (error) {
              logger.log("warning", `Failed to delete backup: ${obj.Key}`);
            }
          }
        }
        if (deletedCount > 0) {
          logger.log("success", `Cleaned up ${deletedCount} old backups`);
        }
      } catch (error) {
        logger.log(
          "error",
          "Failed to cleanup old backups",
          error instanceof CloudSyncError ? error.message : error
        );
      }
    }
  }
  const backupService = new BackupService();
  const uiService = {
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
    },
  };
  function insertSyncButton() {
    const existingButton = document.querySelector(
      '[data-element-id="workspace-tab-cloudsync"]'
    );
    if (existingButton) {
      logger.log("info", "Sync button already exists");
      return;
    }
    const targetSelectors = [
      'nav[role="tablist"]',
      ".space-y-4",
      '[role="navigation"]',
      ".flex.flex-col.space-y-4",
      "nav",
    ];
    let targetContainer = null;
    for (const selector of targetSelectors) {
      targetContainer = document.querySelector(selector);
      if (targetContainer) {
        logger.log("success", `Found target container: ${selector}`);
        break;
      }
    }
    if (!targetContainer) {
      logger.log(
        "warning",
        "Could not find navigation container, retrying in 2s"
      );
      setTimeout(insertSyncButton, 2000);
      return;
    }
    const syncButton = document.createElement("button");
    syncButton.setAttribute("data-element-id", "workspace-tab-cloudsync");
    syncButton.className =
      "min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-pointer h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative";
    syncButton.innerHTML = `
      <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
        <div class="relative">
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
            <path fill="currentColor" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
          </svg>
          <div id="sync-status-dot" style="position: absolute; top: -0.15rem; right: -0.6rem; width: 0.625rem; height: 0.625rem; border-radius: 9999px; display: none;"></div>
        </div>
        <span class="text-xs font-medium">Sync</span>
      </span>
    `;
    syncButton.onclick = () => openSyncModal();
    const firstChild = targetContainer.firstElementChild;
    if (firstChild) {
      targetContainer.insertBefore(syncButton, firstChild);
    } else {
      targetContainer.appendChild(syncButton);
    }
    logger.log("success", "Sync button inserted into navigation");
  }
  function waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", resolve);
      } else {
        resolve();
      }
    });
  }
  function openSyncModal() {
    const existingModal = document.getElementById("sync-modal-overlay");
    if (existingModal) {
      existingModal.remove();
    }
    const modalHTML = `
      <div class="modal-overlay" id="sync-modal-overlay">
        <div class="cloud-sync-modal">
          <div class="modal-header">
            <h2 class="modal-title">Cloud Sync Configuration</h2>
          </div>
          <div class="modal-section">
            <div class="modal-section-title">AWS S3 Configuration</div>
            <div class="form-group">
              <label for="bucket-name">Bucket Name</label>
              <input type="text" id="bucket-name" value="${
                configManager.get("bucketName") || ""
              }" placeholder="your-bucket-name">
            </div>
            <div class="form-group">
              <label for="region">Region</label>
              <input type="text" id="region" value="${
                configManager.get("region") || ""
              }" placeholder="us-east-1">
            </div>
            <div class="form-group">
              <label for="access-key">Access Key ID</label>
              <input type="text" id="access-key" value="${
                configManager.get("accessKey") || ""
              }" placeholder="AKIA...">
            </div>
            <div class="form-group">
              <label for="secret-key">Secret Access Key</label>
              <input type="password" id="secret-key" value="${
                configManager.get("secretKey") || ""
              }" placeholder="Enter your secret key">
            </div>
            <div class="form-group">
              <label for="endpoint">Endpoint (Optional)</label>
              <input type="text" id="endpoint" value="${
                configManager.get("endpoint") || ""
              }" placeholder="s3.amazonaws.com">
            </div>
            <div class="form-group">
              <label for="encryption-key">Encryption Key</label>
              <input type="password" id="encryption-key" value="${
                configManager.get("encryptionKey") || ""
              }" placeholder="Your encryption password">
            </div>
            <div class="form-group">
              <label for="sync-interval">Sync Interval (seconds)</label>
              <input type="number" id="sync-interval" value="${
                configManager.get("syncInterval") || 15
              }" min="5" max="3600">
            </div>
          </div>
          <div class="button-group">
            <button class="button button-secondary" onclick="closeModal()">Cancel</button>
            <button class="button button-primary" onclick="saveSettings()">Save & Start Sync</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    const modal = document.getElementById("sync-modal-overlay");
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  function closeModal() {
    const modal = document.getElementById("sync-modal-overlay");
    if (modal) {
      modal.remove();
    }
  }
  async function saveSettings() {
    const config = {
      bucketName: document.getElementById("bucket-name").value.trim(),
      region: document.getElementById("region").value.trim(),
      accessKey: document.getElementById("access-key").value.trim(),
      secretKey: document.getElementById("secret-key").value.trim(),
      endpoint: document.getElementById("endpoint").value.trim(),
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
      alert(
        "Please fill in all required fields (Bucket Name, Region, Access Key, Secret Key, and Encryption Key)."
      );
      return;
    }
    Object.keys(config).forEach((key) => {
      configManager.set(key, config[key]);
    });
    configManager.save();
    closeModal();
    try {
      await s3Service.initialize();
      operationQueue.add(
        "initial-sync",
        () => syncService.syncFromCloud(),
        [],
        "high"
      );
      uiService.updateSyncStatus("success");
      logger.log("success", "Configuration saved and sync started");
    } catch (error) {
      logger.log("error", "Failed to initialize sync", error);
      uiService.updateSyncStatus("error");
      alert(
        "Failed to initialize sync. Please check your configuration and try again."
      );
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
      animation: fadeIn 0.2s ease-out;
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
    .cloud-sync-modal {
      background-color: rgb(9, 9, 11);
      border-radius: 0.5rem;
      padding: 1.5rem;
      max-width: 32rem;
      width: 100%;
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.1);
      animation: slideIn 0.3s ease-out;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    .modal-header {
      margin-bottom: 1.5rem;
      text-align: center;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: bold;
      color: white;
    }
    .modal-section {
      margin-bottom: 1.5rem;
      background-color: rgb(39, 39, 42);
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid rgb(63, 63, 70);
    }
    .modal-section-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: rgb(161, 161, 170);
      margin-bottom: 1rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    .form-group:last-child {
      margin-bottom: 0;
    }
    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: rgb(161, 161, 170);
      margin-bottom: 0.5rem;
    }
    .form-group input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid rgb(63, 63, 70);
      border-radius: 0.375rem;
      background-color: rgb(24, 24, 27);
      color: white;
      font-size: 0.875rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-group input:focus {
      border-color: rgb(59, 130, 246);
      outline: none;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    .button-group {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }
    .button {
      flex: 1;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .button-primary {
      background-color: rgb(37, 99, 235);
      color: white;
    }
    .button-primary:hover {
      background-color: rgb(29, 78, 216);
      transform: translateY(-1px);
    }
    .button-secondary {
      background-color: rgb(82, 82, 91);
      color: white;
    }
    .button-secondary:hover {
      background-color: rgb(63, 63, 70);
    }
    .button:active {
      transform: translateY(0);
    }
  `;
  document.head.appendChild(styleSheet);
  async function initialize() {
    logger.log("start", "Initializing Cloud Sync v4");
    await waitForDOM();
    await metadataManager.load();
    setTimeout(() => {
      insertSyncButton();
      setTimeout(insertSyncButton, 3000);
    }, 1000);
    try {
      if (configManager.isAwsConfigured()) {
        await s3Service.initialize();
        operationQueue.add(
          "initial-sync",
          () => syncService.syncFromCloud(),
          [],
          "high"
        );
        operationQueue.add(
          "daily-backup-check",
          () => backupService.performDailyBackup(),
          [],
          "low"
        );
        uiService.updateSyncStatus("success");
      }
    } catch (error) {
      logger.log(
        "warning",
        "S3 initialization failed",
        error instanceof CloudSyncError ? error.message : error
      );
      uiService.updateSyncStatus("error");
    }
    intervalCoordinator.start();
    logger.log("success", "Cloud Sync v4 initialized");
  }
  window.openSyncModal = openSyncModal;
  window.closeModal = closeModal;
  window.saveSettings = saveSettings;
  initialize();
}

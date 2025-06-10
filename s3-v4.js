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
        try {
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
        } catch (error) {
          if (error.code === "NoSuchKey" || error.statusCode === 404) {
            throw new CloudSyncError(
              `File not found: ${key}`,
              "S3_NOT_FOUND",
              error
            );
          }
          throw error;
        }
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
          if (
            error instanceof CloudSyncError &&
            error.type === "S3_NOT_FOUND"
          ) {
            throw error;
          }
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
                await s3Service.upload(`items/${key}.json`, chat);
                const localMetadata = metadataManager.get();
                localMetadata.items[key].synced = Date.now();
                cloudMetadata.items[key] = localMetadata.items[key];
              }
            } else if (item.type === "ls") {
              const value = localStorage.getItem(key);
              if (value !== null) {
                await s3Service.upload(`items/${key}.json`, { key, value });
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
          if (error.type === "S3_OPERATION" || error.type === "S3_NOT_FOUND") {
            logger.log(
              "info",
              "No cloud metadata found - treating as new installation"
            );
            return await this.syncToCloud();
          } else {
            throw error;
          }
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
              const chatData = await s3Service.download(`items/${key}.json`);
              if (chatData) {
                await dataService.saveChat(chatData);
                localMetadata.items[key] = { ...cloudItem };
                logger.log("info", `Downloaded chat: ${key}`);
              }
            } else if (cloudItem.type === "ls") {
              const settingData = await s3Service.download(`items/${key}.json`);
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
    if (existingButton) return;
    const button = document.createElement("button");
    button.setAttribute("data-element-id", "workspace-tab-cloudsync");
    button.className =
      "min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative";
    button.innerHTML = `
      <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
        <div class="relative">
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
            <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 4.5A4.5 4.5 0 0114.5 9M9 13.5A4.5 4.5 0 013.5 9"/>
              <polyline points="9,2.5 9,4.5 11,4.5"/>
              <polyline points="9,15.5 9,13.5 7,13.5"/>
            </g>
          </svg>
          <div id="sync-status-dot"></div>
        </div>
        <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">Sync</span>
      </span>
    `;
    button.addEventListener("click", () => {
      openSyncModal();
    });
    const chatButton = document.querySelector(
      'button[data-element-id="workspace-tab-chat"]'
    );
    if (chatButton && chatButton.parentNode) {
      chatButton.parentNode.insertBefore(button, chatButton.nextSibling);
      logger.log("success", "Sync button inserted next to chat button");
      return;
    }
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.querySelector("svg")) {
        btn.parentNode.insertBefore(button, btn.nextSibling);
        logger.log("success", "Sync button inserted after first SVG button");
        return;
      }
    }
    logger.log("warning", "Could not find ideal location for sync button");
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
    if (document.querySelector(".cloud-sync-modal")) {
      logger.log("skip", "Modal already open - skipping");
      return;
    }
    logger.log("start", "Opening sync modal...");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "cloud-sync-modal";
    modal.innerHTML = `
      <div class="text-gray-800 dark:text-white text-left text-sm">
        <div class="flex justify-center items-center mb-3">
          <h3 class="text-center text-xl font-bold">S3 Cloud Sync Settings</h3>
          <button class="ml-2 text-blue-600 text-lg hint--bottom-left hint--rounded hint--large" 
            aria-label="Fill form & Save. Configure your S3 credentials and encryption key.&#10;&#10;Sync: Automatically syncs data between devices in real-time.&#10;&#10;Snapshot: Creates an instant backup that will not be overwritten.&#10;&#10;Download: Select and download backup data for local storage.&#10;&#10;Restore: Select a backup to restore your data to that point in time.">ⓘ</button>
        </div>
        <div class="space-y-3">
          <div class="mt-4 bg-gray-100 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600">
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-400">Available Backups</label>
            </div>
            <div class="space-y-2">
              <div class="w-full">
                <select id="backup-files" class="w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700">
                  <option value="">Please configure AWS credentials first</option>
                </select>
              </div>
              <div class="flex justify-end space-x-2">
                <button id="download-backup-btn" class="z-1 px-2 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                  Download
                </button>
                <button id="restore-backup-btn" class="z-1 px-2 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                  Restore
                </button>
                <button id="delete-backup-btn" class="z-1 px-2 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                  Delete
                </button>
              </div>
            </div>
          </div>
          <div class="mt-4 bg-gray-100 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600">
            <div class="space-y-2">
              <div class="flex space-x-4">
                <div class="w-2/3">
                  <label for="aws-bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Bucket Name <span class="text-red-500">*</span></label>
                  <input id="aws-bucket" name="aws-bucket" type="text" value="${
                    configManager.get("bucketName") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                </div>
                <div class="w-1/3">
                  <label for="aws-region" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Region <span class="text-red-500">*</span></label>
                  <input id="aws-region" name="aws-region" type="text" value="${
                    configManager.get("region") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                </div>
              </div>
              <div>
                <label for="aws-access-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Access Key <span class="text-red-500">*</span></label>
                <input id="aws-access-key" name="aws-access-key" type="password" value="${
                  configManager.get("accessKey") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
              </div>
              <div>
                <label for="aws-secret-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Secret Key <span class="text-red-500">*</span></label>
                <input id="aws-secret-key" name="aws-secret-key" type="password" value="${
                  configManager.get("secretKey") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
              </div>
              <div>
                <label for="aws-endpoint" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                  S3 Compatible Storage Endpoint
                  <button class="ml-1 text-blue-600 text-lg hint--top hint--rounded hint--medium" aria-label="For Amazon AWS, leave this blank. For S3 compatible services like Cloudflare R2, enter the endpoint URL.">ⓘ</button>
                </label>
                <input id="aws-endpoint" name="aws-endpoint" type="text" value="${
                  configManager.get("endpoint") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off">
              </div>
              <div class="flex space-x-4">
                <div class="w-1/2">
                  <label for="sync-interval" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Sync Interval (seconds)
                  <button class="ml-1 text-blue-600 text-lg hint--top-right hint--rounded hint--medium" aria-label="How often to sync data to cloud. Minimum 15 seconds.">ⓘ</button></label>
                  <input id="sync-interval" name="sync-interval" type="number" min="15" value="${configManager.get(
                    "syncInterval"
                  )}" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                </div>
                <div class="w-1/2">
                  <label for="encryption-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Encryption Key <span class="text-red-500">*</span>
                    <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="Choose a secure 8+ character string. Used to encrypt backup files before uploading to cloud. Store this securely - you'll need it to restore backups.">ⓘ</button>
                  </label>
                  <input id="encryption-key" name="encryption-key" type="password" value="${
                    configManager.get("encryptionKey") || ""
                  }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                </div>
              </div>
              <div>
                <label for="sync-exclusions" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Exclusions (Comma separated)
                  <button class="ml-1 text-blue-600 text-lg hint--top hint--rounded hint--medium" aria-label="Additional settings to exclude from sync. Enter comma-separated setting names.">ⓘ</button>
                </label>
                <input id="sync-exclusions" name="sync-exclusions" type="text" value="${
                  localStorage.getItem("sync-exclusions") || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" placeholder="e.g., my-setting, another-setting" autocomplete="off">
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end mb-4 space-x-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Console Logging
              <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="Enable detailed logging in browser console for troubleshooting. Add ?log=true to URL and reload for complete logging.">ⓘ</button>
            </span>
            <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
          </div>
          <div class="flex justify-between space-x-2 mt-4">
            <button id="save-settings" class="z-1 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
              Save
            </button>
            <div class="flex space-x-2">
              <button id="sync-now" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
                Sync Now
              </button>
              <button id="create-snapshot" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
                Snapshot
              </button>
              <button id="close-modal" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                Close
              </button>
            </div>
          </div>
          <div class="text-center mt-4">
            <span id="last-sync-msg"></span>
          </div>
          <div id="action-msg" class="text-center"></div>
        </div>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector("#close-modal").addEventListener("click", closeModal);
    overlay.addEventListener("click", closeModal);
    modal
      .querySelector("#save-settings")
      .addEventListener("click", saveSettings);
    modal.querySelector("#sync-now").addEventListener("click", () => {
      const syncNowButton = modal.querySelector("#sync-now");
      const originalText = syncNowButton.textContent;
      syncNowButton.disabled = true;
      syncNowButton.textContent = "Done!";
      operationQueue.add(
        "manual-sync",
        () => syncService.syncFromCloud(),
        [],
        "high"
      );
      setTimeout(() => {
        syncNowButton.textContent = originalText;
        syncNowButton.disabled = false;
      }, 2000);
    });
    modal
      .querySelector("#create-snapshot")
      .addEventListener("click", async () => {
        const snapshotButton = modal.querySelector("#create-snapshot");
        const name = prompt("Enter snapshot name:");
        if (name) {
          snapshotButton.disabled = true;
          const originalText = snapshotButton.textContent;
          snapshotButton.textContent = "Working...";
          try {
            const success = await backupService.createSnapshot(name);
            if (success) {
              snapshotButton.textContent = "Completed!";
              await loadBackupList();
            } else {
              snapshotButton.textContent = "Failed";
            }
          } catch (error) {
            logger.log("error", "Snapshot button error:", error);
            snapshotButton.textContent = "Failed";
          } finally {
            setTimeout(() => {
              snapshotButton.textContent = originalText;
              snapshotButton.disabled = false;
            }, 2000);
          }
        }
      });
    const consoleLoggingCheckbox = modal.querySelector(
      "#console-logging-toggle"
    );
    consoleLoggingCheckbox.checked = logger.enabled;
    consoleLoggingCheckbox.addEventListener("change", (e) => {
      logger.setEnabled(e.target.checked);
    });
    modal.addEventListener("click", (e) => e.stopPropagation());
    loadBackupList();
  }
  function closeModal() {
    const modal = document.querySelector(".cloud-sync-modal");
    const overlay = document.querySelector(".modal-overlay");
    if (modal) modal.remove();
    if (overlay) overlay.remove();
  }
  async function saveSettings() {
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
      alert(
        "Please fill in all required fields (Bucket Name, Region, Access Key, Secret Key, and Encryption Key)."
      );
      return;
    }
    const exclusions = document.getElementById("sync-exclusions").value.trim();
    if (exclusions) {
      localStorage.setItem("sync-exclusions", exclusions);
    } else {
      localStorage.removeItem("sync-exclusions");
    }
    Object.keys(config).forEach((key) => {
      configManager.set(key, config[key]);
    });
    configManager.save();
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
      await loadBackupList();
    } catch (error) {
      logger.log("error", "Failed to initialize sync", error);
      uiService.updateSyncStatus("error");
      alert(
        "Failed to initialize sync. Please check your configuration and try again."
      );
    }
  }
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

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
    "sync-mode",
    "last-cloud-sync",
    "sync-exclusions",
  ];
  const CONFIG_KEYS = {
    syncMode: "sync-mode",
    syncInterval: "sync-interval",
    bucketName: "aws-bucket",
    region: "aws-region",
    accessKey: "aws-access-key",
    secretKey: "aws-secret-key",
    endpoint: "aws-endpoint",
    encryptionKey: "encryption-key",
  };
  let config = {
    syncMode: "disabled",
    syncInterval: 15,
    bucketName: "",
    region: "",
    accessKey: "",
    secretKey: "",
    endpoint: "",
    encryptionKey: "",
  };
  let isLoggingEnabled =
    new URLSearchParams(window.location.search).get("log") === "true";
  let s3Client = null;
  let syncInterval = null;
  let operationQueue = [];
  let isProcessingQueue = false;
  let dbConnection = null;
  let hashCache = new Map();
  let localMetadata = {
    lastSync: 0,
    lastModified: 0,
    items: {},
    deleted: [],
  };
  function log(type, message, data = null) {
    if (!isLoggingEnabled) return;
    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
      start: "🔄",
    };
    const timestamp = new Date().toLocaleString();
    console.log(
      `${icons[type] || "ℹ️"} ${CONSOLE_TAG} [${timestamp}] ${message}`,
      data || ""
    );
  }
  function loadConfiguration() {
    Object.keys(CONFIG_KEYS).forEach((key) => {
      const value = localStorage.getItem(CONFIG_KEYS[key]);
      config[key] =
        key === "syncInterval"
          ? parseInt(value) || 15
          : value || (key === "syncMode" ? "disabled" : "");
    });
  }
  function saveConfiguration() {
    Object.keys(CONFIG_KEYS).forEach((key) => {
      localStorage.setItem(CONFIG_KEYS[key], config[key].toString());
    });
  }
  function getUserExclusions() {
    const exclusions = localStorage.getItem("sync-exclusions");
    return exclusions
      ? exclusions
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item)
      : [];
  }
  function shouldExcludeSetting(key) {
    const userExclusions = getUserExclusions();
    return (
      EXCLUDED_SETTINGS.includes(key) ||
      userExclusions.includes(key) ||
      key.startsWith("CHAT_") ||
      key.startsWith("last-seen-") ||
      !isNaN(key)
    );
  }
  async function loadAwsSdk() {
    if (window.AWS) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.1691.0.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  function initializeS3Client() {
    if (
      !config.bucketName ||
      !config.accessKey ||
      !config.secretKey ||
      !config.region
    ) {
      log("warning", "AWS configuration incomplete");
      return false;
    }
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
    s3Client = new AWS.S3();
    log("success", "S3 client initialized");
    return true;
  }
  async function getDBConnection() {
    if (dbConnection) return dbConnection;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("typingmind", 1);
      request.onsuccess = (event) => {
        dbConnection = event.target.result;
        resolve(dbConnection);
      };
      request.onerror = () => reject(new Error("Failed to open IndexedDB"));
    });
  }
  async function deriveKey(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return await crypto.subtle.importKey(
      "raw",
      hash,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }
  async function encryptData(data) {
    if (!config.encryptionKey) throw new Error("No encryption key");
    const key = await deriveKey(config.encryptionKey);
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
  }
  async function decryptData(encryptedData) {
    if (!config.encryptionKey) throw new Error("No encryption key");
    const key = await deriveKey(config.encryptionKey);
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
  async function uploadToS3(key, data, isMetadata = false) {
    if (!s3Client) return false;
    try {
      const body = isMetadata ? JSON.stringify(data) : await encryptData(data);
      await s3Client
        .upload({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ContentType: isMetadata
            ? "application/json"
            : "application/octet-stream",
        })
        .promise();
      log("success", `Uploaded ${key}`);
      return true;
    } catch (error) {
      log("error", `Failed to upload ${key}`, error.message);
      return false;
    }
  }
  async function downloadFromS3(key, isMetadata = false) {
    if (!s3Client) return null;
    try {
      const result = await s3Client
        .getObject({ Bucket: config.bucketName, Key: key })
        .promise();
      return isMetadata
        ? JSON.parse(result.Body.toString())
        : await decryptData(new Uint8Array(result.Body));
    } catch (error) {
      log("error", `Failed to download ${key}`, error.message);
      return null;
    }
  }
  async function deleteFromS3(key) {
    if (!s3Client) return false;
    try {
      await s3Client
        .deleteObject({ Bucket: config.bucketName, Key: key })
        .promise();
      log("success", `Deleted ${key}`);
      return true;
    } catch (error) {
      log("error", `Failed to delete ${key}`, error.message);
      return false;
    }
  }
  async function listS3Objects(prefix = "") {
    if (!s3Client) return [];
    try {
      const result = await s3Client
        .listObjectsV2({ Bucket: config.bucketName, Prefix: prefix })
        .promise();
      return result.Contents || [];
    } catch (error) {
      log("error", "Failed to list S3 objects", error.message);
      return [];
    }
  }
  async function generateHash(content) {
    const key = typeof content === "string" ? content : JSON.stringify(content);
    if (hashCache.has(key)) return hashCache.get(key);
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const result = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .slice(0, 4)
      .join("");
    hashCache.set(key, result);
    if (hashCache.size > 1000) hashCache.clear();
    return result;
  }
  async function getAllChatsFromIndexedDB() {
    try {
      const db = await getDBConnection();
      const transaction = db.transaction(["chats"], "readonly");
      const store = transaction.objectStore("chats");
      return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }
  async function getChatFromIndexedDB(chatId) {
    try {
      const db = await getDBConnection();
      const transaction = db.transaction(["chats"], "readonly");
      const store = transaction.objectStore("chats");
      return new Promise((resolve) => {
        const request = store.get(chatId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }
  async function saveChatToIndexedDB(chat) {
    try {
      const db = await getDBConnection();
      const transaction = db.transaction(["chats"], "readwrite");
      const store = transaction.objectStore("chats");
      return new Promise((resolve) => {
        const request = store.put(chat);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
  async function deleteChatFromIndexedDB(chatId) {
    try {
      const db = await getDBConnection();
      const transaction = db.transaction(["chats"], "readwrite");
      const store = transaction.objectStore("chats");
      return new Promise((resolve) => {
        const request = store.delete(chatId);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
  async function loadLocalMetadata() {
    const stored = localStorage.getItem("cloud-metadata-v4");
    if (stored) {
      localMetadata = JSON.parse(stored);
    }
    log("info", "Local metadata loaded", localMetadata);
  }
  async function saveLocalMetadata() {
    localMetadata.lastModified = Date.now();
    localStorage.setItem("cloud-metadata-v4", JSON.stringify(localMetadata));
    log("info", "Local metadata saved");
  }
  async function detectLocalChanges() {
    const [chats, settingsEntries] = await Promise.all([
      getAllChatsFromIndexedDB(),
      Promise.resolve(
        Array.from({ length: localStorage.length }, (_, i) => {
          const key = localStorage.key(i);
          return shouldExcludeSetting(key)
            ? null
            : [key, localStorage.getItem(key)];
        }).filter(Boolean)
      ),
    ]);
    let hasChanges = false;
    const promises = [];
    for (const chat of chats) {
      promises.push(
        (async () => {
          const hash = await generateHash(chat);
          const existing = localMetadata.items[chat.id];
          if (!existing || existing.hash !== hash) {
            localMetadata.items[chat.id] = {
              hash,
              modified: Date.now(),
              synced: existing?.synced || 0,
              type: "idb",
            };
            hasChanges = true;
            log("info", `Chat modified: ${chat.id}`);
          }
        })()
      );
    }
    for (const [key, value] of settingsEntries) {
      promises.push(
        (async () => {
          const hash = await generateHash(value);
          const existing = localMetadata.items[key];
          if (!existing || existing.hash !== hash) {
            localMetadata.items[key] = {
              hash,
              modified: Date.now(),
              synced: existing?.synced || 0,
              type: "ls",
            };
            hasChanges = true;
          }
        })()
      );
    }
    await Promise.all(promises);
    if (hasChanges) await saveLocalMetadata();
    return hasChanges;
  }
  function queueOperation(name, operation) {
    operationQueue.push({ name, operation, timestamp: Date.now() });
    log("info", `Queued operation: ${name}`);
    processOperationQueue();
  }
  async function processOperationQueue() {
    if (isProcessingQueue || operationQueue.length === 0) return;
    isProcessingQueue = true;
    log("start", "Processing operation queue");
    while (operationQueue.length > 0) {
      const { name, operation } = operationQueue.shift();
      try {
        log("start", `Executing operation: ${name}`);
        await operation();
        log("success", `Completed operation: ${name}`);
      } catch (error) {
        log("error", `Failed operation: ${name}`, error.message);
      }
    }
    isProcessingQueue = false;
    log("success", "Operation queue processed");
  }
  async function syncToCloud() {
    if (!s3Client) {
      log("error", "S3 client not initialized");
      return false;
    }
    log("start", "Starting sync to cloud");
    await detectLocalChanges();
    const cloudMetadata = (await downloadFromS3("metadata.json", true)) || {
      lastSync: 0,
      lastModified: 0,
      items: {},
      deleted: [],
    };
    const itemsToSync = Object.entries(localMetadata.items).filter(
      ([key, item]) => item.modified > (item.synced || 0)
    );
    const uploadPromises = itemsToSync.map(async ([key, item]) => {
      let success = false;
      if (item.type === "idb") {
        const chat = await getChatFromIndexedDB(key);
        if (chat) {
          success = await uploadToS3(`chats/${key}.json`, chat);
        }
      } else if (item.type === "ls") {
        const value = localStorage.getItem(key);
        if (value !== null) {
          success = await uploadToS3(`settings/${key}.json`, { key, value });
        }
      }
      if (success) {
        localMetadata.items[key].synced = Date.now();
        cloudMetadata.items[key] = localMetadata.items[key];
      }
      return success;
    });
    await Promise.all(uploadPromises);
    cloudMetadata.lastSync = Date.now();
    cloudMetadata.lastModified = localMetadata.lastModified;
    const metadataUploaded = await uploadToS3(
      "metadata.json",
      cloudMetadata,
      true
    );
    if (metadataUploaded) {
      localMetadata.lastSync = cloudMetadata.lastSync;
      await saveLocalMetadata();
      updateSyncStatusDot("success");
      log("success", "Sync to cloud completed");
      return true;
    }
    log("error", "Failed to sync to cloud");
    return false;
  }
  async function syncFromCloud() {
    if (!s3Client) {
      log("error", "S3 client not initialized");
      return false;
    }
    log("start", "Starting sync from cloud");
    const cloudMetadata = await downloadFromS3("metadata.json", true);
    if (!cloudMetadata) {
      log("info", "No cloud metadata found");
      return await syncToCloud();
    }
    await detectLocalChanges();
    const downloadPromises = Object.entries(cloudMetadata.items).map(
      async ([key, cloudItem]) => {
        const localItem = localMetadata.items[key];
        const shouldDownload =
          !localItem ||
          (cloudItem.hash !== localItem.hash &&
            cloudItem.modified > localItem.modified);
        if (!shouldDownload) return;
        if (cloudItem.type === "idb") {
          const chatData = await downloadFromS3(`chats/${key}.json`);
          if (chatData) {
            await saveChatToIndexedDB(chatData);
            localMetadata.items[key] = { ...cloudItem };
            log("info", `Downloaded chat: ${key}`);
          }
        } else if (cloudItem.type === "ls") {
          const settingData = await downloadFromS3(`settings/${key}.json`);
          if (settingData?.value !== undefined) {
            localStorage.setItem(key, settingData.value);
            localMetadata.items[key] = { ...cloudItem };
            log("info", `Downloaded setting: ${key}`);
          }
        }
      }
    );
    await Promise.all(downloadPromises);
    for (const deletedKey of cloudMetadata.deleted || []) {
      if (localMetadata.items[deletedKey]) {
        const item = localMetadata.items[deletedKey];
        if (item.type === "idb") {
          await deleteChatFromIndexedDB(deletedKey);
        } else if (item.type === "ls") {
          localStorage.removeItem(deletedKey);
        }
        delete localMetadata.items[deletedKey];
        log("info", `Deleted item: ${deletedKey}`);
      }
    }
    localMetadata.lastSync = Date.now();
    await saveLocalMetadata();
    updateSyncStatusDot("success");
    log("success", "Sync from cloud completed");
    return true;
  }
  async function createSnapshot(name) {
    if (!s3Client) {
      log("error", "S3 client not initialized");
      return false;
    }
    log("start", `Creating snapshot: ${name}`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `snapshot-${timestamp}-${name.replace(
      /[^a-zA-Z0-9]/g,
      "-"
    )}.json`;
    const [chats, settings] = await Promise.all([
      getAllChatsFromIndexedDB(),
      Promise.resolve(
        Array.from({ length: localStorage.length }, (_, i) => {
          const key = localStorage.key(i);
          return shouldExcludeSetting(key)
            ? null
            : [key, localStorage.getItem(key)];
        })
          .filter(Boolean)
          .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
      ),
    ]);
    const snapshot = { chats, settings, created: Date.now(), name };
    const success = await uploadToS3(`snapshots/${filename}`, snapshot);
    if (success) {
      log("success", `Snapshot created: ${filename}`);
      return true;
    }
    log("error", "Failed to create snapshot");
    return false;
  }
  async function loadBackupList() {
    const objects = await listS3Objects("snapshots/");
    return objects.map((obj) => ({
      key: obj.Key,
      name: obj.Key.replace("snapshots/", "").replace(".json", ""),
      size: obj.Size,
      modified: obj.LastModified,
    }));
  }
  async function restoreFromBackup(key) {
    log("start", `Restoring from backup: ${key}`);
    const backup = await downloadFromS3(key);
    if (!backup) {
      log("error", "Failed to download backup");
      return false;
    }
    const promises = [];
    if (backup.chats) {
      promises.push(...backup.chats.map((chat) => saveChatToIndexedDB(chat)));
    }
    if (backup.settings) {
      Object.entries(backup.settings).forEach(([k, v]) =>
        localStorage.setItem(k, v)
      );
    }
    await Promise.all(promises);
    await detectLocalChanges();
    log("success", "Backup restored successfully");
    return true;
  }
  function insertSyncButton() {
    if (document.querySelector("#sync-button")) return;
    const targetSelector =
      'button[class*="rounded"][class*="bg-slate-100"]:has(svg)';
    const targetButton = document.querySelector(targetSelector);
    if (!targetButton) return;
    const syncButton = document.createElement("button");
    syncButton.id = "sync-button";
    syncButton.className = targetButton.className + " relative";
    syncButton.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
      <div id="sync-status-dot" class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gray-400"></div>
    `;
    syncButton.addEventListener("click", openSyncModal);
    targetButton.parentNode.insertBefore(syncButton, targetButton.nextSibling);
    log("success", "Sync button inserted");
  }
  function updateSyncStatusDot(status = "success") {
    const dot = document.querySelector("#sync-status-dot");
    if (!dot) return;
    const colors = {
      success: "bg-green-500",
      error: "bg-red-500",
      warning: "bg-yellow-500",
      syncing: "bg-blue-500",
    };
    dot.className = `absolute -top-1 -right-1 w-3 h-3 rounded-full ${
      colors[status] || colors.success
    }`;
  }
  function openSyncModal() {
    if (document.querySelector(".cloud-sync-modal")) return;
    log("start", "Opening sync modal");
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;";
    const modal = document.createElement("div");
    modal.className = "cloud-sync-modal";
    modal.style.cssText =
      "background: white; border-radius: 8px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; color: black;";
    modal.innerHTML = `<h3 style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 16px;">Cloud Sync Settings</h3><div style="background: #f9f9f9; padding: 12px; border-radius: 6px; margin-bottom: 16px;"><label style="display: block; font-weight: 500; margin-bottom: 8px;">Available Backups</label><select id="backup-files" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;"><option value="">Loading...</option></select><div style="display: flex; gap: 8px;"><button id="download-backup-btn" style="padding: 6px 12px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;" disabled>Download</button><button id="restore-backup-btn" style="padding: 6px 12px; background: #16a34a; color: white; border: none; border-radius: 4px; cursor: pointer;" disabled>Restore</button><button id="delete-backup-btn" style="padding: 6px 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;" disabled>Delete</button></div></div><div style="background: #f9f9f9; padding: 12px; border-radius: 6px; margin-bottom: 16px;"><div style="display: flex; gap: 16px; margin-bottom: 12px;"><label style="display: flex; align-items: center;"><input type="radio" name="sync-mode" value="sync" ${
      config.syncMode === "sync" ? "checked" : ""
    }><span style="margin-left: 8px;">Sync</span></label><label style="display: flex; align-items: center;"><input type="radio" name="sync-mode" value="backup" ${
      config.syncMode === "backup" ? "checked" : ""
    }><span style="margin-left: 8px;">Backup</span></label><label style="display: flex; align-items: center;"><input type="radio" name="sync-mode" value="disabled" ${
      config.syncMode === "disabled" ? "checked" : ""
    }><span style="margin-left: 8px;">Disabled</span></label></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;"><input id="aws-bucket" placeholder="Bucket Name" value="${
      config.bucketName
    }" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"><input id="aws-region" placeholder="Region" value="${
      config.region
    }" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div><input id="aws-access-key" type="password" placeholder="Access Key" value="${
      config.accessKey
    }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;"><input id="aws-secret-key" type="password" placeholder="Secret Key" value="${
      config.secretKey
    }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;"><input id="aws-endpoint" placeholder="Endpoint (optional)" value="${
      config.endpoint
    }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;"><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;"><input id="sync-interval" type="number" min="15" placeholder="Interval (sec)" value="${
      config.syncInterval
    }" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"><input id="encryption-key" type="password" placeholder="Encryption Key" value="${
      config.encryptionKey
    }" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div><input id="sync-exclusions" placeholder="Exclusions (comma separated)" value="${
      localStorage.getItem("sync-exclusions") || ""
    }" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></div><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;"><label style="display: flex; align-items: center;"><input type="checkbox" id="console-logging-toggle" ${
      isLoggingEnabled ? "checked" : ""
    }><span style="margin-left: 8px;">Console Logging</span></label></div><div style="display: flex; justify-content: space-between; gap: 8px;"><button id="save-settings" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button><div style="display: flex; gap: 8px;"><button id="sync-now" style="padding: 8px 12px; background: #16a34a; color: white; border: none; border-radius: 4px; cursor: pointer;">${
      config.syncMode === "sync" ? "Sync Now" : "Backup Now"
    }</button><button id="create-snapshot" style="padding: 8px 12px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">Snapshot</button><button id="close-modal" style="padding: 8px 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button></div></div><div id="action-msg" style="text-align: center; margin-top: 16px;"></div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const handlers = {
      "#close-modal": () => overlay.remove(),
      "#save-settings": async () => {
        Object.keys(CONFIG_KEYS).forEach((key) => {
          const element = modal.querySelector(`#${CONFIG_KEYS[key]}`);
          if (element)
            config[key] =
              key === "syncInterval"
                ? parseInt(element.value) || 15
                : element.value;
        });
        const exclusions = modal.querySelector("#sync-exclusions").value;
        localStorage.setItem("sync-exclusions", exclusions);
        config.syncMode = modal.querySelector(
          'input[name="sync-mode"]:checked'
        ).value;
        saveConfiguration();
        await loadAwsSdk();
        const s3Ready = initializeS3Client();
        const msg = modal.querySelector("#action-msg");
        if (s3Ready) {
          startSyncInterval();
          msg.textContent = "Settings saved successfully!";
          setTimeout(() => (msg.textContent = ""), 3000);
        } else {
          msg.textContent = "Please check AWS configuration";
        }
      },
      "#sync-now": () => {
        queueOperation(
          config.syncMode === "sync" ? "manual-sync" : "manual-backup",
          config.syncMode === "sync" ? syncFromCloud : syncToCloud
        );
      },
      "#create-snapshot": async () => {
        const name = prompt("Enter snapshot name:");
        if (name) {
          await createSnapshot(name);
          loadBackupListInModal();
        }
      },
      "#console-logging-toggle": (e) => {
        isLoggingEnabled = e.target.checked;
        const url = new URL(window.location);
        if (isLoggingEnabled) url.searchParams.set("log", "true");
        else url.searchParams.delete("log");
        window.history.replaceState({}, "", url);
      },
    };
    Object.entries(handlers).forEach(([selector, handler]) => {
      modal.querySelector(selector).addEventListener("click", handler);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    setupBackupHandlers(modal);
    loadBackupListInModal();
  }
  function closeModal() {
    const modal = document.querySelector(".cloud-sync-modal");
    if (modal) modal.parentElement.remove();
  }
  async function saveSettings() {
    const modal = document.querySelector(".cloud-sync-modal");
    Object.keys(CONFIG_KEYS).forEach((key) => {
      const element = modal.querySelector(`#${CONFIG_KEYS[key]}`);
      if (element)
        config[key] =
          key === "syncInterval"
            ? parseInt(element.value) || 15
            : element.value;
    });
    const exclusions = modal.querySelector("#sync-exclusions").value;
    localStorage.setItem("sync-exclusions", exclusions);
    config.syncMode = modal.querySelector(
      'input[name="sync-mode"]:checked'
    ).value;
    saveConfiguration();
    await loadAwsSdk();
    const s3Ready = initializeS3Client();
    const msg = modal.querySelector("#action-msg");
    if (s3Ready) {
      startSyncInterval();
      msg.textContent = "Settings saved successfully!";
      setTimeout(() => (msg.textContent = ""), 3000);
    } else {
      msg.textContent = "Please check AWS configuration";
    }
  }
  async function loadBackupListInModal() {
    const select = document.querySelector("#backup-files");
    if (!select || !s3Client) return;
    select.innerHTML = '<option value="">Loading...</option>';
    const backups = await loadBackupList();
    select.innerHTML =
      backups.length === 0
        ? '<option value="">No backups found</option>'
        : backups
            .map(
              (b) =>
                `<option value="${b.key}">${b.name} (${formatFileSize(
                  b.size
                )})</option>`
            )
            .join("");
    updateBackupButtons();
  }
  function setupBackupHandlers(modal) {
    const select = modal.querySelector("#backup-files");
    const handlers = {
      "#download-backup-btn": async () => {
        const data = await downloadFromS3(select.value);
        if (data) {
          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });
          const a = Object.assign(document.createElement("a"), {
            href: URL.createObjectURL(blob),
            download: select.value.split("/").pop(),
          });
          a.click();
          URL.revokeObjectURL(a.href);
        }
      },
      "#restore-backup-btn": async () => {
        if (
          !select.value ||
          !confirm("This will overwrite your current data. Continue?")
        )
          return;
        const success = await restoreFromBackup(select.value);
        if (success) {
          alert("Backup restored successfully!");
          location.reload();
        }
      },
      "#delete-backup-btn": async () => {
        if (!select.value || !confirm("Delete this backup permanently?"))
          return;
        if (await deleteFromS3(select.value)) loadBackupListInModal();
      },
    };
    Object.entries(handlers).forEach(([selector, handler]) => {
      modal.querySelector(selector).addEventListener("click", handler);
    });
    select.addEventListener("change", updateBackupButtons);
  }
  function updateBackupButtons() {
    const select = document.querySelector("#backup-files");
    const hasSelection = select?.value;
    [
      "#download-backup-btn",
      "#restore-backup-btn",
      "#delete-backup-btn",
    ].forEach((selector) => {
      const btn = document.querySelector(selector);
      if (btn) btn.disabled = !hasSelection;
    });
  }
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
  function startSyncInterval() {
    if (syncInterval) clearInterval(syncInterval);
    if (config.syncMode === "disabled") return;
    syncInterval = setInterval(() => {
      queueOperation(
        `auto-${config.syncMode}`,
        config.syncMode === "sync" ? syncFromCloud : syncToCloud
      );
    }, config.syncInterval * 1000);
    log("info", `Sync interval started: ${config.syncInterval}s`);
  }
  function startPeriodicChangeCheck() {
    setInterval(async () => {
      if (config.syncMode !== "disabled") {
        await detectLocalChanges();
      }
    }, 5000);
  }
  async function performDailyBackup() {
    const lastBackupDate = localStorage.getItem("last-daily-backup-date");
    const today = new Date().toLocaleDateString("en-GB");
    if (lastBackupDate === today)
      return log("info", "Daily backup already completed today");
    log("start", "Performing daily backup");
    const success = await createSnapshot("daily-auto");
    if (success) {
      localStorage.setItem("last-daily-backup-date", today);
      log("success", `Daily backup completed for ${today}`);
      await cleanupOldBackups();
    }
  }
  async function cleanupOldBackups() {
    if (!s3Client) return;
    log("start", "Cleaning up old backups");
    const objects = await listS3Objects("snapshots/");
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    for (const obj of objects) {
      if (new Date(obj.LastModified).getTime() < thirtyDaysAgo) {
        if (await deleteFromS3(obj.Key)) {
          deletedCount++;
          log("info", `Deleted old backup: ${obj.Key}`);
        }
      }
    }
    if (deletedCount > 0)
      log("success", `Cleaned up ${deletedCount} old backups`);
  }
  async function initialize() {
    log("start", "Initializing Cloud Sync v4");
    loadConfiguration();
    await loadLocalMetadata();
    await loadAwsSdk();
    if (initializeS3Client()) {
      if (config.syncMode === "sync") {
        queueOperation("initial-sync", syncFromCloud);
      }
      await performDailyBackup();
    }
    setTimeout(insertSyncButton, 1000);
    startSyncInterval();
    startPeriodicChangeCheck();
    log("success", "Cloud Sync v4 initialized");
  }
  initialize();
}

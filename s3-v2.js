// TypingMind Cloud Sync & Backup v2.0.0
// Combines features from s3.js and YATSE for comprehensive sync and backup

// ==================== CONSTANTS & STATE ====================

const EXTENSION_VERSION = "2.0.0";
const MONITORED_ITEMS = {
  indexedDB: [
    "TM_useUserCharacters",
    "TM_useInstalledPlugins",
    "TM_useUserPrompts",
  ],
  localStorage: [
    "TM_useExtensionURLs",
    "TM_useCustomModels",
    "TM_useDefaultModel",
    "TM_useModelIDsOrder",
    "TM_useFolderList",
    "TM_useModelsSettings",
    "TM_useUserPluginSettings",
    "TM_useAPIKey",
    "TM_useAnthropicAPIKey",
    "TM_useCustomSearchAPIKey",
    "TM_useGeminiAPIKey",
    "TM_useKeyboardShortcuts",
    "TM_useLicenseKey",
    "aws-access-key",
    "aws-secret-key",
    "aws-endpoint",
    "aws-region",
    "aws-bucket",
    "encryption-key",
    "backup-interval",
    "sync-mode",
  ],
};

let isConsoleLoggingEnabled =
  new URLSearchParams(window.location.search).get("log") === "true";

// Core sync state
let localMetadata = {
  chats: {},
  settings: {
    items: {},
    lastModified: 0,
    syncedAt: 0,
  },
  lastSyncTime: 0,
};

// Add persistent IndexedDB connection
let persistentDB = null;
let isDBConnecting = false;
let dbConnectionRetries = 0;
const MAX_DB_RETRIES = 3;

// Operation state tracking
let operationState = {
  isImporting: false,
  isExporting: false,
  isPendingSync: false,
  operationQueue: [],
  isProcessingQueue: false,
  lastSyncStatus: null,
};

// Backup state tracking
let backupState = {
  isBackupInProgress: false,
  lastDailyBackup: null,
  lastManualSnapshot: null,
  backupInterval: null,
  isBackupIntervalRunning: false,
};

// Configuration with defaults
let config = {
  // Sync settings
  syncMode: "sync", // 'sync' or 'backup'
  syncInterval: 15, // seconds
  importThreshold: 1, // percentage
  exportThreshold: 10, // percentage
  alertOnSmallerCloud: true,

  // Backup settings
  keepDailyBackups: 30, // days
  compressionLevel: 9, // ZIP compression level

  // File prefixes
  dailyBackupPrefix: "typingmind-backup-",
  snapshotPrefix: "s-",

  // AWS configuration
  accessKey: "",
  secretKey: "",
  region: "",
  bucketName: "",
  endpoint: "",

  // Encryption configuration
  encryptionKey: "",
};

// Track last seen updates for change detection
let lastSeenUpdates = {};

// Track file sizes
let cloudFileSize = 0;
let localFileSize = 0;
let isLocalDataModified = false;

// ==================== LOGGING SYSTEM ====================

// Define log priority levels
const LOG_LEVELS = {
  error: 1, // Always log errors - highest priority
  warning: 2, // Important warnings
  success: 2, // Success messages for important operations
  upload: 2, // Important upload events
  download: 2, // Important download events
  cleanup: 2, // Deletion operations
  start: 3, // Start of key operations
  end: 3, // End of key operations
  info: 4, // General info
  skip: 5, // Low priority skips
  visibility: 5, // Visibility events
  active: 5, // Tab activity - lowest priority
  backup: 2, // Backup operations
  restore: 2, // Restore operations
  snapshot: 2, // Snapshot operations
  sync: 2, // Sync operations
  time: 3, // Time-based operations
};

// Log icons for different types
const LOG_ICONS = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "❌",
  start: "🔄",
  end: "🏁",
  upload: "⬆️",
  download: "⬇️",
  cleanup: "🧹",
  snapshot: "📸",
  encrypt: "🔐",
  decrypt: "🔓",
  time: "⏰",
  skip: "⏩",
  visibility: "👁️",
  active: "📱",
  backup: "💾",
  restore: "📥",
  sync: "🔄",
};

// Enhanced logging function
function logToConsole(type, message, data = null) {
  if (!isConsoleLoggingEnabled) return;

  // Get priority level (default to lowest)
  const priority = LOG_LEVELS[type] || 5;

  // By default, only show priority 1-3 logs unless debug mode is enabled
  if (!isConsoleLoggingEnabled && priority > 3) return;

  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const icon = LOG_ICONS[type] || "ℹ️";
  const logMessage = `${icon} ${timestamp} ${message}`;

  // Add to mobile log container if it exists
  const mobileLog = document.getElementById("mobile-log-container");
  if (mobileLog) {
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `${timestamp}: ${message}`;
    mobileLog.appendChild(logEntry);

    // Keep only last 100 entries
    while (mobileLog.children.length > 100) {
      mobileLog.removeChild(mobileLog.firstChild);
    }
  }

  // Console output with appropriate method
  switch (type) {
    case "error":
      console.error(logMessage, data);
      break;
    case "warning":
      console.warn(logMessage, data);
      break;
    default:
      console.log(logMessage, data);
  }
}

// Create mobile log container for debugging
function createMobileLogContainer() {
  if (document.getElementById("mobile-log-container")) return;

  const container = document.createElement("div");
  container.id = "mobile-log-container";
  container.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    z-index: 9999;
    display: none;
  `;

  // Add drag handle
  const dragHandle = document.createElement("div");
  dragHandle.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
    cursor: ns-resize;
    text-align: center;
    line-height: 20px;
  `;
  dragHandle.textContent = "⋮";
  container.appendChild(dragHandle);

  // Add drag functionality
  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  function initDrag(e) {
    isDragging = true;
    startY = e.clientY || e.touches[0].clientY;
    startHeight = container.offsetHeight;
    document.addEventListener("mousemove", doDrag);
    document.addEventListener("touchmove", doDrag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchend", stopDrag);
  }

  function doDrag(e) {
    if (!isDragging) return;
    const y = e.clientY || e.touches[0].clientY;
    const newHeight = startHeight - (y - startY);
    container.style.maxHeight = Math.max(100, Math.min(600, newHeight)) + "px";
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener("mousemove", doDrag);
    document.removeEventListener("touchmove", doDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchend", stopDrag);
  }

  dragHandle.addEventListener("mousedown", initDrag);
  dragHandle.addEventListener("touchstart", initDrag);

  document.body.appendChild(container);

  // Add double-tap listener to show/hide on mobile
  setupDoubleTapListener(document.body, () => {
    container.style.display =
      container.style.display === "none" ? "block" : "none";
  });
}

// Double tap detection for mobile log toggle
function setupDoubleTapListener(element, callback) {
  let lastTap = 0;
  element.addEventListener("touchend", (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
      callback();
      e.preventDefault();
    }
    lastTap = currentTime;
  });
}

// Initialize logging state
function initializeLoggingState() {
  const urlParams = new URLSearchParams(window.location.search);
  const logParam = urlParams.get("log");

  if (logParam === "true") {
    isConsoleLoggingEnabled = true;
    logToConsole(
      "info",
      `TypingMind Cloud Sync & Backup v${EXTENSION_VERSION} initializing...`
    );
    createMobileLogContainer();
  }
}

// ==================== INITIALIZATION ====================

// Initialize the extension
async function initializeExtension() {
  // Initialize logging first
  initializeLoggingState();

  //logToConsole("start", "Starting initialization...");

  try {
    // Load AWS SDK
    await loadAwsSdk();

    // Load configuration first
    loadConfiguration();

    // Create UI elements after config is loaded
    insertSyncButton();

    // Load local metadata
    await loadLocalMetadata();

    // Initialize lastSeenUpdates from current chat states
    await initializeLastSeenUpdates();

    // Initialize settings monitoring
    await initializeSettingsMonitoring();

    // Setup localStorage change listener
    setupLocalStorageChangeListener();

    // Check if we should perform initial sync
    if (config.syncMode === "sync") {
      queueOperation("initial-sync", performInitialSync);
    }

    // Check for daily backup regardless of sync mode
    // This ensures we create a daily backup if one hasn't been created today
    if (isAwsConfigured()) {
      queueOperation("daily-backup-check", checkAndPerformDailyBackup);
    }

    // Start periodic change check
    startPeriodicChangeCheck();

    // Set up visibility change handler
    setupVisibilityChangeHandler();

    // Start regular sync interval
    startSyncInterval();

    // Start monitoring IndexedDB for deletions
    monitorIndexedDBForDeletions();

    // Start backup intervals if configured
    startBackupIntervals();

    logToConsole("success", "Initialization completed successfully");
  } catch (error) {
    logToConsole("error", "Initialization failed:", error);
    throw error;
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeExtension);
} else {
  initializeExtension();
}

// ==================== CORE SYNC ENGINE ====================

// Throttle function to limit the rate of function calls
function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Load AWS SDK
async function loadAwsSdk() {
  if (window.AWS) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.1048.0.min.js";
    script.onload = () => {
      //logToConsole("success", "AWS SDK loaded successfully");
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load AWS SDK"));
    document.head.appendChild(script);
  });
}

// Load JSZip for backup compression
async function loadJSZip() {
  if (window.JSZip) return window.JSZip;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => {
      //logToConsole("success", "JSZip loaded successfully");
      resolve(window.JSZip);
    };
    script.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(script);
  });
}

// Initialize last seen updates tracking
async function initializeLastSeenUpdates() {
  //logToConsole("start", "Initializing last seen updates...");
  const chats = await getAllChatsFromIndexedDB();

  for (const chat of chats) {
    if (!chat.id) continue;
    lastSeenUpdates[chat.id] = {
      updatedAt: chat.updatedAt || Date.now(),
      hash: await generateChatHash(chat),
    };
  }
  //logToConsole("success", "Last seen updates initialized");
}

// Load configuration from localStorage
function loadConfiguration() {
  //logToConsole("start", "Loading configuration...");

  // Initialize default config if not exists
  if (!config) {
    config = {
      syncMode: "sync",
      syncInterval: 15,
      bucketName: "",
      region: "",
      accessKey: "",
      secretKey: "",
      endpoint: "",
      encryptionKey: "",
    };
  }

  const storedConfig = {
    bucketName: localStorage.getItem("aws-bucket"),
    region: localStorage.getItem("aws-region"),
    accessKey: localStorage.getItem("aws-access-key"),
    secretKey: localStorage.getItem("aws-secret-key"),
    endpoint: localStorage.getItem("aws-endpoint"),
    syncInterval: parseInt(localStorage.getItem("backup-interval")) || 15,
    encryptionKey: localStorage.getItem("encryption-key"),
    syncMode: localStorage.getItem("sync-mode") || "sync",
  };

  // Update config with stored values
  config = { ...config, ...storedConfig };

  //logToConsole("success", "Configuration loaded", {
  //  syncMode: config.syncMode,
  //});

  return config;
}

// Save configuration to localStorage
function saveConfiguration() {
  //logToConsole("start", "Saving configuration...");

  localStorage.setItem("aws-bucket", config.bucketName);
  localStorage.setItem("aws-region", config.region);
  localStorage.setItem("aws-access-key", config.accessKey);
  localStorage.setItem("aws-secret-key", config.secretKey);
  localStorage.setItem("aws-endpoint", config.endpoint);
  localStorage.setItem("backup-interval", config.syncInterval.toString());
  localStorage.setItem("encryption-key", config.encryptionKey);
  localStorage.setItem("sync-mode", config.syncMode);

  //logToConsole("success", "Configuration saved");
}

// Load local metadata
async function loadLocalMetadata() {
  //logToConsole("start", "Loading local metadata...");

  try {
    const storedMetadata = await getIndexedDBKey("sync-metadata");
    if (storedMetadata) {
      localMetadata = JSON.parse(storedMetadata);
    } else {
      await initializeMetadataFromExistingData();
    }
    logToConsole("success", "Local metadata loaded");
  } catch (error) {
    logToConsole("error", "Failed to load local metadata:", error);
    throw error;
  }
}

// Initialize metadata from existing data
async function initializeMetadataFromExistingData() {
  //logToConsole("start", "Initializing metadata from existing data...");

  const chats = await getAllChatsFromIndexedDB();
  localMetadata = {
    chats: {},
    settings: {
      items: {},
      lastModified: Date.now(),
      syncedAt: 0,
    },
    lastSyncTime: 0,
  };

  for (const chat of chats) {
    if (!chat.id) continue;
    localMetadata.chats[chat.id] = {
      updatedAt: chat.updatedAt || Date.now(),
      hash: await generateChatHash(chat),
      syncedAt: 0,
      isDeleted: false,
    };
  }

  await saveLocalMetadata();
  logToConsole("success", "Metadata initialized from existing data");
}

// Save local metadata
async function saveLocalMetadata() {
  await setIndexedDBKey("sync-metadata", JSON.stringify(localMetadata));
  logToConsole("success", "Local metadata saved");
}

// Generate hash for a chat
async function generateChatHash(chat) {
  if (!chat || !chat.id) return null;

  const chatCopy = { ...chat };
  delete chatCopy.updatedAt;

  const msgStr = JSON.stringify(chatCopy);
  const msgBuffer = new TextEncoder().encode(msgStr);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Start periodic change check
function startPeriodicChangeCheck() {
  const checkInterval = Math.max(config.syncInterval * 1000, 15000);
  setInterval(checkForChanges, checkInterval);
  //logToConsole(
  //  "info",
  //  `Started periodic change check (interval: ${checkInterval}ms)`
  //);
}

// Check for changes in chats
async function checkForChanges() {
  if (operationState.isImporting || operationState.isExporting) {
    logToConsole("skip", "Skipping change check - operation in progress");
    return;
  }

  logToConsole("start", "Checking for changes...");
  const chats = await getAllChatsFromIndexedDB();
  let hasChanges = false;

  for (const chat of chats) {
    if (!chat.id) continue;

    const currentHash = await generateChatHash(chat);
    const lastSeen = lastSeenUpdates[chat.id];

    if (!lastSeen || lastSeen.hash !== currentHash) {
      hasChanges = true;
      await updateChatMetadata(chat.id, true);
      lastSeenUpdates[chat.id] = {
        updatedAt: Date.now(),
        hash: currentHash,
      };
    }
  }

  if (hasChanges) {
    logToConsole("info", "Changes detected - queueing sync operation");
    queueOperation("sync", syncFromCloud);
  } else {
    logToConsole("skip", "No changes detected");
  }
}

// Setup localStorage change listener
function setupLocalStorageChangeListener() {
  window.addEventListener("storage", async (e) => {
    if (!e.key) return;

    // Handle chat changes
    if (e.key.startsWith("chat:")) {
      const chatId = e.key.split(":")[1];
      if (!chatId) return;

      logToConsole("info", `Chat storage change detected for chat ${chatId}`);
      await updateChatMetadata(chatId, true);
      queueOperation("sync", syncFromCloud);
      return;
    }

    // Handle settings changes
    if (MONITORED_ITEMS.localStorage.includes(e.key)) {
      logToConsole("info", `Settings storage change detected for ${e.key}`);
      await handleSettingChange(e.key, e.newValue, "localstorage");
      return;
    }
  });

  // Also monitor settings changes through direct localStorage modifications
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    const oldValue = localStorage.getItem(key);
    originalSetItem.apply(this, arguments);

    // If this is a monitored setting and the value actually changed
    if (MONITORED_ITEMS.localStorage.includes(key) && oldValue !== value) {
      logToConsole("info", `Direct settings change detected for ${key}`);
      handleSettingChange(key, value, "localstorage");
    }
  };

  logToConsole("success", "Storage change listeners setup complete");
}

// ==================== INDEXEDDB UTILITIES ====================

// Get persistent IndexedDB connection
async function getPersistentDB() {
  if (persistentDB) return persistentDB;
  if (isDBConnecting) {
    // Wait for existing connection attempt
    while (isDBConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return persistentDB;
  }

  isDBConnecting = true;
  try {
    persistentDB = await openIndexedDB();
    isDBConnecting = false;
    dbConnectionRetries = 0;
    return persistentDB;
  } catch (error) {
    isDBConnecting = false;
    dbConnectionRetries++;
    logToConsole(
      "error",
      `Failed to establish IndexedDB connection (attempt ${dbConnectionRetries}):`,
      error
    );

    if (dbConnectionRetries < MAX_DB_RETRIES) {
      // Try to reconnect after a delay
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * dbConnectionRetries)
      );
      return getPersistentDB();
    }
    throw error;
  }
}

// Modified openIndexedDB to handle connection management
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("keyval-store", 1);

    request.onerror = (event) => {
      logToConsole("error", "Failed to open IndexedDB:", event.target.error);
      reject(request.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Add connection error handler
      db.onerror = (event) => {
        logToConsole("error", "IndexedDB error:", event.target.error);
        persistentDB = null; // Clear persistent connection on error
      };

      // Add close handler
      db.onclose = () => {
        logToConsole("info", "IndexedDB connection closed");
        persistentDB = null; // Clear persistent connection when closed
      };

      // Add version change handler (e.g., when DB is deleted or schema is updated)
      db.onversionchange = () => {
        db.close();
        persistentDB = null;
        logToConsole("info", "IndexedDB version changed");
      };

      //logToConsole("success", "Successfully opened IndexedDB connection");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("keyval")) {
        db.createObjectStore("keyval");
      }
    };
  });
}

// Get all chats from IndexedDB
async function getAllChatsFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("keyval-store", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readonly");
      const store = transaction.objectStore("keyval");
      const chats = [];

      // Get all chat keys
      store.getAllKeys().onsuccess = (keyEvent) => {
        const keys = keyEvent.target.result;
        const chatKeys = keys.filter((key) => key.startsWith("CHAT_"));

        if (chatKeys.length === 0) {
          resolve([]);
          return;
        }

        // Get all chat data
        store.getAll().onsuccess = (valueEvent) => {
          const values = valueEvent.target.result;
          for (let i = 0; i < keys.length; i++) {
            if (keys[i].startsWith("CHAT_")) {
              chats.push(values[i]);
            }
          }
          resolve(chats);
        };
      };
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("keyval")) {
        db.createObjectStore("keyval");
      }
    };
  });
}

// Get a specific chat from IndexedDB
async function getChatFromIndexedDB(chatId) {
  return new Promise((resolve, reject) => {
    const key = chatId.startsWith("CHAT_") ? chatId : `CHAT_${chatId}`;
    const request = indexedDB.open("keyval-store", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readonly");
      const store = transaction.objectStore("keyval");

      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        resolve(getRequest.result);
      };

      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    };
  });
}

// Get a value from IndexedDB keyval store
async function getIndexedDBKey(key) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("keyval", "readonly");
    const store = transaction.objectStore("keyval");
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Set a value in IndexedDB keyval store
async function setIndexedDBKey(key, value) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("keyval", "readwrite");
    const store = transaction.objectStore("keyval");
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Monitor IndexedDB for deletions
function monitorIndexedDBForDeletions() {
  logToConsole("info", "Setting up IndexedDB deletion monitor");

  // Keep track of current chats and their detection timestamps
  let knownChats = new Map(); // Map of chatId -> { detectedAt: timestamp, confirmedCount: number }

  // Minimum time a chat must be known before considering it for deletion
  const MIN_CHAT_AGE_MS = 60 * 1000; // 60 seconds

  // Require multiple consecutive detections before considering a chat truly deleted
  const REQUIRED_MISSING_DETECTIONS = 2;

  // Track potential deletions between checks
  let potentialDeletions = new Map(); // chatId -> count of times seen as missing

  // Initial population of known chats
  getAllChatsFromIndexedDB().then((chats) => {
    const now = Date.now();
    chats.forEach((chat) => {
      if (chat.id) {
        knownChats.set(chat.id, {
          detectedAt: now,
          confirmedCount: 3, // Start with confirmed status for existing chats
        });
      }
    });
    logToConsole(
      "info",
      `Initialized deletion monitor with ${knownChats.size} chats`
    );
  });

  // Periodically check for deleted chats
  setInterval(async () => {
    if (document.hidden) return; // Skip if tab is not visible

    try {
      const now = Date.now();

      // Get current chats
      const currentChats = await getAllChatsFromIndexedDB();
      const currentChatIds = new Set(currentChats.map((chat) => chat.id));

      // Update detection timestamps for chats that are present
      for (const chatId of currentChatIds) {
        if (knownChats.has(chatId)) {
          // This is a known chat, update its confirmed count
          const chatInfo = knownChats.get(chatId);
          chatInfo.confirmedCount = Math.min(chatInfo.confirmedCount + 1, 5); // Cap at 5

          // If it was in potential deletions, remove it
          if (potentialDeletions.has(chatId)) {
            potentialDeletions.delete(chatId);
          }
        } else {
          // This is a newly detected chat
          knownChats.set(chatId, {
            detectedAt: now,
            confirmedCount: 1,
          });
          logToConsole("info", `New chat detected: ${chatId}`);
        }
      }

      // Find chats that appear to be deleted (in knownChats but not in currentChatIds)
      for (const [chatId, chatInfo] of knownChats.entries()) {
        if (!currentChatIds.has(chatId)) {
          // This chat was previously known but is now missing

          // Only consider well-established chats (seen multiple times and not too new)
          const isEstablishedChat =
            chatInfo.confirmedCount >= 2 &&
            now - chatInfo.detectedAt > MIN_CHAT_AGE_MS;

          if (isEstablishedChat) {
            // Track consecutive missing detections
            const missingCount = (potentialDeletions.get(chatId) || 0) + 1;
            potentialDeletions.set(chatId, missingCount);

            // Only consider it deleted after multiple consecutive missing detections
            if (missingCount >= REQUIRED_MISSING_DETECTIONS) {
              // Skip if already has a tombstone
              if (
                localMetadata.chats[chatId] &&
                localMetadata.chats[chatId].deleted === true
              ) {
                // Already has a tombstone, just remove from our tracking
                knownChats.delete(chatId);
                potentialDeletions.delete(chatId);
                continue;
              }

              logToConsole(
                "cleanup",
                `Confirmed deletion of chat ${chatId} (missing ${missingCount} times), creating tombstone`
              );

              // Create tombstone entry
              localMetadata.chats[chatId] = {
                deleted: true,
                deletedAt: Date.now(),
                lastModified: Date.now(),
                syncedAt: 0, // Set to 0 to ensure it's synced to cloud
                tombstoneVersion: 1,
                deletionSource: "indexeddb-monitor",
              };
              saveLocalMetadata();

              // Queue deletion from cloud
              queueOperation(`delete-chat-${chatId}`, () =>
                deleteChatFromCloud(chatId)
              );

              // Remove from our tracking
              knownChats.delete(chatId);
              potentialDeletions.delete(chatId);
            } else {
              logToConsole(
                "info",
                `Chat ${chatId} appears to be missing (${missingCount}/${REQUIRED_MISSING_DETECTIONS} checks), waiting for confirmation`
              );
            }
          } else {
            // This is a new chat that disappeared too quickly - might be a refresh or false positive
            // Remove it from tracking if it's been missing too long
            if (potentialDeletions.has(chatId)) {
              const missingCount = potentialDeletions.get(chatId) + 1;
              if (missingCount > 5) {
                // After 5 checks, just forget about it
                knownChats.delete(chatId);
                potentialDeletions.delete(chatId);
                logToConsole(
                  "info",
                  `Removed tracking for unstable new chat ${chatId}`
                );
              } else {
                potentialDeletions.set(chatId, missingCount);
              }
            } else {
              potentialDeletions.set(chatId, 1);
            }
          }
        }
      }
    } catch (error) {
      logToConsole("error", "Error in deletion monitor", error);
    }
  }, 10000); // Check every 10 seconds
}

// Save a chat to IndexedDB
async function saveChatToIndexedDB(chat) {
  return new Promise((resolve, reject) => {
    const key = `CHAT_${chat.id}`;
    const request = indexedDB.open("keyval-store", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readwrite");
      const store = transaction.objectStore("keyval");

      const putRequest = store.put(chat, key);

      putRequest.onsuccess = () => {
        resolve();
      };

      putRequest.onerror = () => {
        reject(putRequest.error);
      };
    };
  });
}

// Delete a chat from IndexedDB
async function deleteChatFromIndexedDB(chatId) {
  return new Promise((resolve, reject) => {
    const key = chatId.startsWith("CHAT_") ? chatId : `CHAT_${chatId}`;
    const request = indexedDB.open("keyval-store", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readwrite");
      const store = transaction.objectStore("keyval");

      const deleteRequest = store.delete(key);

      deleteRequest.onsuccess = () => {
        resolve();
      };

      deleteRequest.onerror = () => {
        reject(deleteRequest.error);
      };
    };
  });
}

// ==================== AWS S3 INTEGRATION ====================

// Initialize AWS S3 client
function initializeS3Client() {
  if (
    !config.accessKey ||
    !config.secretKey ||
    !config.region ||
    !config.bucketName
  ) {
    throw new Error("AWS configuration is incomplete");
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

  return new AWS.S3(s3Config);
}

// List objects in S3 bucket
async function listS3Objects(prefix = "") {
  const s3 = initializeS3Client();

  try {
    const params = {
      Bucket: config.bucketName,
      Prefix: prefix,
    };

    const response = await s3.listObjectsV2(params).promise();
    const objects = response.Contents || [];

    // Get metadata for each object
    const objectsWithMetadata = await Promise.all(
      objects.map(async (obj) => {
        try {
          const headParams = {
            Bucket: config.bucketName,
            Key: obj.Key,
          };
          const headResponse = await s3.headObject(headParams).promise();
          return {
            ...obj,
            key: obj.Key,
            metadata: headResponse.Metadata || {},
          };
        } catch (error) {
          logToConsole(
            "error",
            `Failed to get metadata for ${obj.Key}:`,
            error
          );
          return {
            ...obj,
            key: obj.Key,
            metadata: {},
          };
        }
      })
    );

    return objectsWithMetadata;
  } catch (error) {
    logToConsole("error", "Failed to list S3 objects:", error);
    throw error;
  }
}

// Upload data to S3
async function uploadToS3(key, data, metadata) {
  const s3 = initializeS3Client();

  try {
    // Determine content type based on file extension
    let contentType = "application/octet-stream";
    if (key.endsWith(".json")) {
      contentType = "application/json";
    } else if (key.endsWith(".zip")) {
      contentType = "application/zip";
    }

    const params = {
      Bucket: config.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
      Metadata: metadata,
    };

    // For large files, use multipart upload
    if (data.byteLength > 5 * 1024 * 1024) {
      //logToConsole(
      //  "info",
      //  `File size > 5MB, using multipart upload for ${key}`
      //);

      // Clean up any incomplete multipart uploads before starting a new one
      await cleanupIncompleteMultipartUploads();

      const uploadId = await startMultipartUpload(key);
      const partSize = 5 * 1024 * 1024;
      const parts = [];

      for (let i = 0; i < data.byteLength; i += partSize) {
        const end = Math.min(i + partSize, data.byteLength);
        const chunk = data.slice(i, end);
        const partNumber = Math.floor(i / partSize) + 1;

        const part = await uploadPart(key, uploadId, partNumber, chunk);
        parts.push(part);

        const progress = Math.min(
          100,
          Math.round((end / data.byteLength) * 100)
        );
        //logToConsole("info", `Upload progress: ${progress}%`);
      }

      await completeMultipartUpload(key, uploadId, parts);
    } else {
      await s3.putObject(params).promise();
    }

    // If this was a metadata.json upload, clean up old versions
    if (key === "metadata.json") {
      await cleanupMetadataVersions();
    }

    logToConsole("success", `Successfully uploaded to S3: ${key}`);
  } catch (error) {
    logToConsole("error", `Failed to upload to S3: ${key}`, error);
    throw error;
  }
}

// Download data from S3
async function downloadFromS3(key) {
  const s3 = initializeS3Client();

  try {
    const params = {
      Bucket: config.bucketName,
      Key: key,
    };

    const response = await s3.getObject(params).promise();

    // Convert AWS metadata (x-amz-meta-*) to our format
    const cleanMetadata = {};
    for (const [key, value] of Object.entries(response.Metadata || {})) {
      const cleanKey = key.replace("x-amz-meta-", "");
      cleanMetadata[cleanKey] = value;
    }

    return {
      data: response.Body,
      metadata: cleanMetadata,
    };
  } catch (error) {
    if (error.code === "NoSuchKey") {
      logToConsole("info", `Object not found in S3: ${key}`);
      return null;
    }
    logToConsole("error", `Failed to download from S3: ${key}`, error);
    throw error;
  }
}

// Delete object from S3
async function deleteFromS3(key) {
  const s3 = initializeS3Client();

  try {
    const params = {
      Bucket: config.bucketName,
      Key: key,
    };

    await s3.deleteObject(params).promise();
    logToConsole("success", `Successfully deleted from S3: ${key}`);
  } catch (error) {
    logToConsole("error", `Failed to delete from S3: ${key}`, error);
    throw error;
  }
}

// Start multipart upload to S3
async function startMultipartUpload(key) {
  const s3 = initializeS3Client();

  try {
    // Determine content type based on file extension
    let contentType = "application/octet-stream";
    if (key.endsWith(".json")) {
      contentType = "application/json";
    } else if (key.endsWith(".zip")) {
      contentType = "application/zip";
    }

    const params = {
      Bucket: config.bucketName,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    };

    const response = await s3.createMultipartUpload(params).promise();
    return response.UploadId;
  } catch (error) {
    logToConsole("error", "Failed to start multipart upload:", error);
    throw error;
  }
}

// Upload part to multipart upload
async function uploadPart(key, uploadId, partNumber, data) {
  const s3 = initializeS3Client();
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second base delay
  let retryCount = 0;
  let lastError = null;
  let uploadSuccess = false;

  while (!uploadSuccess && retryCount <= maxRetries) {
    try {
      const params = {
        Bucket: config.bucketName,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: data,
      };

      if (retryCount > 0) {
        logToConsole(
          "info",
          `Retrying upload part ${partNumber} (attempt ${retryCount + 1}/${
            maxRetries + 1
          })`
        );
      }

      const response = await s3.uploadPart(params).promise();
      uploadSuccess = true;

      //logToConsole(
      //  "success",
      //  `Successfully uploaded part ${partNumber} (ETag: ${response.ETag})`
      //);

      return {
        ETag: response.ETag,
        PartNumber: partNumber,
      };
    } catch (error) {
      lastError = error;
      retryCount++;
      logToConsole(
        "error",
        `Error uploading part ${partNumber} (attempt ${retryCount}/${
          maxRetries + 1
        }):`,
        error
      );

      if (retryCount > maxRetries) {
        logToConsole(
          "error",
          `All retries failed for part ${partNumber}, aborting multipart upload`
        );

        try {
          await abortMultipartUpload(key, uploadId);
        } catch (abortError) {
          logToConsole("error", "Error aborting multipart upload:", abortError);
        }

        throw new Error(
          `Failed to upload part ${partNumber} after ${
            maxRetries + 1
          } attempts: ${lastError.message}`
        );
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 1000,
        30000
      );

      logToConsole(
        "info",
        `Retrying part ${partNumber} in ${Math.round(delay / 1000)} seconds`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Complete multipart upload
async function completeMultipartUpload(key, uploadId, parts) {
  const s3 = initializeS3Client();

  try {
    const params = {
      Bucket: config.bucketName,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    };

    await s3.completeMultipartUpload(params).promise();
    logToConsole("success", "Multipart upload completed successfully");
  } catch (error) {
    logToConsole("error", "Failed to complete multipart upload:", error);
    throw error;
  }
}

// Abort multipart upload
async function abortMultipartUpload(key, uploadId) {
  const s3 = initializeS3Client();

  try {
    const params = {
      Bucket: config.bucketName,
      Key: key,
      UploadId: uploadId,
    };

    await s3.abortMultipartUpload(params).promise();
    logToConsole("warning", "Multipart upload aborted");
  } catch (error) {
    logToConsole("error", "Failed to abort multipart upload:", error);
    throw error;
  }
}

// Cleanup incomplete multipart uploads
async function cleanupIncompleteMultipartUploads() {
  //logToConsole("cleanup", "Checking for incomplete multipart uploads...");
  const s3 = initializeS3Client();

  try {
    const multipartUploads = await s3
      .listMultipartUploads({
        Bucket: config.bucketName,
      })
      .promise();

    if (multipartUploads.Uploads && multipartUploads.Uploads.length > 0) {
      logToConsole(
        "cleanup",
        `Found ${multipartUploads.Uploads.length} incomplete multipart uploads`
      );

      for (const upload of multipartUploads.Uploads) {
        const uploadAge = Date.now() - new Date(upload.Initiated).getTime();
        const fiveMinutes = 5 * 60 * 1000;

        if (uploadAge > fiveMinutes) {
          try {
            await s3
              .abortMultipartUpload({
                Bucket: config.bucketName,
                Key: upload.Key,
                UploadId: upload.UploadId,
              })
              .promise();

            logToConsole(
              "success",
              `Aborted incomplete upload for ${upload.Key} (${Math.round(
                uploadAge / 1000 / 60
              )}min old)`
            );
          } catch (error) {
            logToConsole(
              "error",
              `Failed to abort upload for ${upload.Key}:`,
              error
            );
          }
        } else {
          logToConsole(
            "skip",
            `Skipping recent upload for ${upload.Key} (${Math.round(
              uploadAge / 1000
            )}s old)`
          );
        }
      }
    } else {
      //logToConsole("info", "No incomplete multipart uploads found");
    }
  } catch (error) {
    logToConsole("error", "Error cleaning up multipart uploads:", error);
  }
}

// ==================== ENCRYPTION UTILITIES ====================

// Derive encryption key from password
async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const salt = enc.encode("typingmind-backup-salt");
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt data
async function encryptData(data) {
  const encryptionKey = localStorage.getItem("encryption-key");

  if (!encryptionKey) {
    logToConsole("warning", "No encryption key found");
    throw new Error("Encryption key not configured");
  }

  try {
    const key = await deriveKey(encryptionKey);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedData = enc.encode(JSON.stringify(data));

    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encodedData
    );

    // Prepend marker and IV to encrypted data
    const marker = new TextEncoder().encode("ENCRYPTED:");
    const combinedData = new Uint8Array(
      marker.length + iv.length + encryptedContent.byteLength
    );
    combinedData.set(marker);
    combinedData.set(iv, marker.length);
    combinedData.set(
      new Uint8Array(encryptedContent),
      marker.length + iv.length
    );

    return combinedData;
  } catch (error) {
    logToConsole("error", "Encryption failed:", error);
    throw error;
  }
}

// Decrypt data
async function decryptData(data) {
  const marker = "ENCRYPTED:";
  const markerBytes = new TextEncoder().encode(marker);

  // Check if data is too short to be encrypted
  if (data.length < markerBytes.length) {
    return new TextDecoder().decode(data);
  }

  // Check for encryption marker
  const dataPrefix = new TextDecoder().decode(
    data.slice(0, markerBytes.length)
  );

  // If not encrypted, return as-is
  if (dataPrefix !== marker) {
    return new TextDecoder().decode(data);
  }

  // Data is encrypted, get the encryption key
  const encryptionKey = localStorage.getItem("encryption-key");
  if (!encryptionKey) {
    throw new Error("Encryption key not configured");
  }

  // Decrypt the data
  const key = await deriveKey(encryptionKey);
  const iv = data.slice(markerBytes.length, markerBytes.length + 12);
  const content = data.slice(markerBytes.length + 12);

  const decryptedContent = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    content
  );

  return new TextDecoder().decode(decryptedContent);
}

// ==================== BACKUP SYSTEM ====================

// Start backup intervals
function startBackupIntervals() {
  // We've removed the sync mode check since daily backups should run regardless of mode
  // Daily backups are now only triggered during initialization

  logToConsole("info", "Backup system initialized");
}

// Check if daily backup is needed and perform it if necessary
async function checkAndPerformDailyBackup() {
  try {
    const storedSuffix = localStorage.getItem("last-daily-backup-in-s3");
    const today = new Date();
    const currentDateSuffix = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    // Only perform backup if we haven't done one today
    if (!storedSuffix || currentDateSuffix > storedSuffix) {
      logToConsole("start", "Starting daily backup check...");
      const success = await performDailyBackup();

      // Only update localStorage if backup was successful
      if (success) {
        // Store today's date as the last backup date
        localStorage.setItem("last-daily-backup-in-s3", currentDateSuffix);
        logToConsole("success", "Daily backup completed and recorded");
      }
    } else {
      logToConsole("info", "Daily backup already performed today, skipping");
    }
  } catch (error) {
    logToConsole("error", "Daily backup check failed:", error);
  }
}

// Perform daily backup
async function performDailyBackup() {
  logToConsole("start", "Starting daily backup...");
  backupState.isBackupInProgress = true;

  try {
    // Ensure JSZip is loaded before creating backup
    await loadJSZip();

    // Format date as YYYYMMDD for the filename
    const today = new Date();
    const dateString = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    // Use the correct filename format: typingmind-backup-YYYYMMDD.zip
    const key = `typingmind-backup-${dateString}.zip`;

    // Export data from both localStorage and IndexedDB
    const data = await exportBackupData();

    // Create and upload the backup
    const success = await createDailyBackup(key, data);

    if (success) {
      await cleanupOldBackups("daily");
      backupState.lastDailyBackup = Date.now();
      logToConsole("success", "Daily backup created successfully");
      return true;
    } else {
      logToConsole("error", "Daily backup creation failed");
      return false;
    }
  } catch (error) {
    logToConsole("error", "Daily backup failed:", error);
    return false;
  } finally {
    backupState.isBackupInProgress = false;
  }
}

// Export backup data from localStorage and IndexedDB
function exportBackupData() {
  return new Promise((resolve, reject) => {
    const exportData = {
      localStorage: { ...localStorage },
      indexedDB: {},
    };

    logToConsole("info", "Starting data export", {
      localStorageKeys: Object.keys(exportData.localStorage).length,
    });

    const request = indexedDB.open("keyval-store", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = function (event) {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readonly");
      const store = transaction.objectStore("keyval");

      // Create a promise that resolves when all data is collected
      const collectData = new Promise((resolveData) => {
        store.getAllKeys().onsuccess = function (keyEvent) {
          const keys = keyEvent.target.result;
          logToConsole("info", "IndexedDB keys found", {
            count: keys.length,
          });

          store.getAll().onsuccess = function (valueEvent) {
            const values = valueEvent.target.result;
            keys.forEach((key, i) => {
              exportData.indexedDB[key] = values[i];
            });
            resolveData();
          };
        };
      });

      // Wait for both transaction completion and data collection
      Promise.all([
        collectData,
        new Promise((resolveTransaction) => {
          transaction.oncomplete = resolveTransaction;
        }),
      ])
        .then(() => {
          const hasLocalStorageData =
            Object.keys(exportData.localStorage).length > 0;
          const hasIndexedDBData = Object.keys(exportData.indexedDB).length > 0;

          logToConsole("info", "Export data summary", {
            localStorageKeys: Object.keys(exportData.localStorage).length,
            indexedDBKeys: Object.keys(exportData.indexedDB).length,
            localStorageSize: JSON.stringify(exportData.localStorage).length,
            indexedDBSize: JSON.stringify(exportData.indexedDB).length,
            hasLocalStorageData,
            hasIndexedDBData,
          });

          if (!hasLocalStorageData && !hasIndexedDBData) {
            reject(new Error("No data found in localStorage or IndexedDB"));
            return;
          }
          resolve(exportData);
        })
        .catch(reject);

      transaction.onerror = () => reject(transaction.error);
    };
  });
}

// Create daily backup with the format matching s3.js
async function createDailyBackup(key, data) {
  logToConsole("start", `Creating daily backup: ${key}`);

  try {
    // Ensure JSZip is loaded
    const JSZip = await loadJSZip();
    if (!JSZip) {
      throw new Error("Failed to load JSZip library");
    }

    // Check if encryption key is available
    const encryptionKey = localStorage.getItem("encryption-key");
    if (!encryptionKey) {
      logToConsole(
        "warning",
        "No encryption key found, backup will not be encrypted"
      );
      return false;
    }

    // Convert data to JSON string
    const dataStr = JSON.stringify(data);
    const rawSize = new Blob([dataStr]).size;
    logToConsole("info", `Raw data size: ${formatFileSize(rawSize)}`);

    // Encrypt the data
    logToConsole("info", "Encrypting backup data...");
    const encryptedData = await encryptData(dataStr);

    // Create ZIP file
    const zip = new JSZip();

    // Add the encrypted data to the ZIP
    const jsonFileName = key.replace(".zip", ".json");
    zip.file(jsonFileName, encryptedData, {
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
      binary: true,
    });

    // Generate the ZIP file
    const compressedContent = await zip.generateAsync({ type: "blob" });
    if (compressedContent.size < 100) {
      throw new Error(
        "Daily backup file is too small or empty. Upload cancelled."
      );
    }

    // Convert Blob to ArrayBuffer for S3 upload
    const arrayBuffer = await compressedContent.arrayBuffer();
    const content = new Uint8Array(arrayBuffer);

    // Prepare metadata for S3
    const uploadMetadata = {
      version: EXTENSION_VERSION,
      timestamp: String(Date.now()),
      type: "daily",
      originalSize: String(rawSize),
      compressedSize: String(compressedContent.size),
      encrypted: "true",
    };

    // Upload to S3
    await uploadToS3(key, content, uploadMetadata);

    logToConsole("success", `Daily backup created successfully: ${key}`);
    return true;
  } catch (error) {
    logToConsole("error", `Failed to create daily backup: ${error.message}`);
    return false;
  }
}

// Create manual snapshot
async function createSnapshot(name) {
  logToConsole("start", "Creating snapshot...");
  backupState.isBackupInProgress = true;

  try {
    // Load JSZip if not already loaded
    logToConsole("info", "Loading JSZip...");
    await loadJSZip();
    logToConsole("success", "JSZip loaded successfully");

    // Export data from both localStorage and IndexedDB
    const data = await exportBackupData();

    // Format timestamp in local timezone with DST handling
    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0") +
      now.getSeconds().toString().padStart(2, "0") +
      now.getMilliseconds().toString().padStart(3, "0");

    const key = `s-${name}-${timestamp}.zip`;
    logToConsole("info", `Creating snapshot with key: ${key}`);

    // Check if encryption key is available
    const encryptionKey = localStorage.getItem("encryption-key");
    if (!encryptionKey) {
      logToConsole(
        "warning",
        "No encryption key found, snapshot will not be encrypted"
      );
      return false;
    }

    // Convert data to JSON string
    const dataStr = JSON.stringify(data);
    const rawSize = new Blob([dataStr]).size;
    logToConsole("info", `Raw data size: ${formatFileSize(rawSize)}`);

    // Encrypt the data
    logToConsole("info", "Encrypting snapshot data...");
    const encryptedData = await encryptData(dataStr);

    // Create ZIP file
    const zip = new JSZip();

    // Add the encrypted data to the ZIP
    const jsonFileName = key.replace(".zip", ".json");
    zip.file(jsonFileName, encryptedData, {
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
      binary: true,
    });

    // Generate the ZIP file
    const compressedContent = await zip.generateAsync({ type: "blob" });
    if (compressedContent.size < 100) {
      throw new Error("Snapshot file is too small or empty. Upload cancelled.");
    }

    // Convert Blob to ArrayBuffer for S3 upload
    const arrayBuffer = await compressedContent.arrayBuffer();
    const content = new Uint8Array(arrayBuffer);

    // Prepare metadata for S3
    const uploadMetadata = {
      version: EXTENSION_VERSION,
      timestamp: String(Date.now()),
      type: "snapshot",
      originalSize: String(rawSize),
      compressedSize: String(compressedContent.size),
      encrypted: "true",
    };

    // Upload to S3
    await uploadToS3(key, content, uploadMetadata);

    backupState.lastManualSnapshot = Date.now();

    // Refresh the backup list in the modal
    await loadBackupList();

    // Show success message to user
    const statusText = document.querySelector(".status-text");
    if (statusText) {
      statusText.textContent = `Snapshot "${name}" created successfully`;
      setTimeout(() => {
        statusText.textContent = `Last synced: ${getLastSyncTime()}`;
      }, 3000);
    }

    return true;
  } catch (error) {
    logToConsole("error", "Failed to create snapshot:", error);
    return false;
  } finally {
    backupState.isBackupInProgress = false;
  }
}

// Clean up old backups
async function cleanupOldBackups(type) {
  logToConsole("start", `Cleaning up old ${type} backups...`);

  try {
    let prefix;
    let keepCount;

    switch (type) {
      case "daily":
        prefix = config.dailyBackupPrefix;
        keepCount = config.keepDailyBackups;
        break;
      default:
        return;
    }

    const objects = await listS3Objects(prefix);
    objects.sort((a, b) => b.LastModified - a.LastModified);

    for (let i = keepCount; i < objects.length; i++) {
      await deleteFromS3(objects[i].Key);
      logToConsole("cleanup", `Deleted old backup: ${objects[i].Key}`);
    }

    logToConsole("success", `Cleanup of old ${type} backups completed`);
  } catch (error) {
    logToConsole("error", `Failed to clean up old ${type} backups:`, error);
  }
}

// Restore from backup
async function restoreFromBackup(key) {
  logToConsole("start", `Starting restore from backup: ${key}`);

  try {
    // Load JSZip first
    const JSZip = await loadJSZip();
    if (!JSZip) {
      throw new Error("Failed to load JSZip library");
    }

    // Download the backup file
    const backup = await downloadFromS3(key);
    if (!backup || !backup.data) {
      throw new Error("Backup not found or empty");
    }

    // Load and extract ZIP
    logToConsole("info", "Loading ZIP file...");
    const zip = await JSZip.loadAsync(backup.data);
    const files = Object.keys(zip.files);

    if (files.length === 0) {
      throw new Error("Backup ZIP file is empty");
    }

    // Find the JSON file in the ZIP (should be the first file)
    const jsonFile = files.find((file) => file.endsWith(".json"));
    if (!jsonFile) {
      throw new Error("No JSON file found in backup");
    }

    // Extract the content
    logToConsole("info", `Extracting data from ${jsonFile}...`);
    const backupContent = await zip.file(jsonFile).async("uint8array");

    // Decrypt if needed
    logToConsole("info", "Processing backup content...");
    const decryptedContent = await decryptData(backupContent);

    // Parse the JSON data
    logToConsole("info", "Parsing backup data...");
    const backupData = JSON.parse(decryptedContent);

    if (!backupData) {
      throw new Error("Invalid backup data format");
    }

    // Import the data to storage
    logToConsole("info", "Importing data to storage...");
    await importDataToStorage(backupData);

    // Update last sync time
    const currentTime = new Date().toLocaleString();
    localStorage.setItem("last-cloud-sync", currentTime);

    // Save metadata directly instead of calling updateChatMetadata with null
    await saveLocalMetadata();

    logToConsole("success", "Backup restored successfully");
    return true;
  } catch (error) {
    logToConsole("error", `Failed to restore backup: ${error.message}`);
    throw error;
  }
}

// Import data to storage (both localStorage and IndexedDB)
function importDataToStorage(data) {
  return new Promise((resolve, reject) => {
    // Keys to preserve during import
    const preserveKeys = [
      "import-size-threshold",
      "export-size-threshold",
      "alert-smaller-cloud",
      "encryption-key",
      "aws-bucket",
      "aws-access-key",
      "aws-secret-key",
      "aws-region",
      "aws-endpoint",
      "backup-interval",
      "sync-mode",
      "sync-status-hidden",
      "sync-status-position",
      "activeTabBackupRunning",
      "last-time-based-backup",
      "last-daily-backup-in-s3",
      "last-cloud-sync",
    ];

    // Import localStorage data
    if (data.localStorage) {
      logToConsole("info", "Importing localStorage data...");
      Object.keys(data.localStorage).forEach((key) => {
        if (!preserveKeys.includes(key)) {
          localStorage.setItem(key, data.localStorage[key]);
        }
      });
    }

    // Import IndexedDB data
    if (data.indexedDB) {
      logToConsole("info", "Importing IndexedDB data...");
      const request = indexedDB.open("keyval-store");

      request.onerror = () => reject(new Error("Failed to open IndexedDB"));

      request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(["keyval"], "readwrite");
        const objectStore = transaction.objectStore("keyval");

        transaction.oncomplete = () => {
          logToConsole("success", "IndexedDB import completed");
          resolve();
        };

        transaction.onerror = () =>
          reject(new Error("IndexedDB transaction failed"));

        // Clear existing data
        const deleteRequest = objectStore.clear();
        deleteRequest.onsuccess = function () {
          // Import new data
          Object.keys(data.indexedDB).forEach((key) => {
            objectStore.put(data.indexedDB[key], key);
          });
        };
      };

      request.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("keyval")) {
          db.createObjectStore("keyval");
        }
      };
    } else {
      // If there's no IndexedDB data, resolve immediately
      resolve();
    }

    // Ensure the extension URL is in the list
    let extensionURLs = JSON.parse(
      localStorage.getItem("TM_useExtensionURLs") || "[]"
    );
    if (!extensionURLs.some((url) => url.endsWith("s3-v2.js"))) {
      extensionURLs.push(
        "https://itcon-pty-au.github.io/typingmind-cloud-backup-bugfix/s3-v2.js"
      );
      localStorage.setItem(
        "TM_useExtensionURLs",
        JSON.stringify(extensionURLs)
      );
    }
  });
}

// ==================== SYNC ENGINE ====================

// Check if AWS configuration is complete
function isAwsConfigured() {
  return !!(
    config.accessKey &&
    config.secretKey &&
    config.region &&
    config.bucketName
  );
}

// Queue an operation
function queueOperation(type, operation) {
  if (!isAwsConfigured()) {
    logToConsole("skip", "Skipping cloud operation - AWS not configured");
    return;
  }

  operationState.operationQueue.push({ type, operation });

  if (!operationState.isProcessingQueue) {
    processOperationQueue();
  }
}

// Process operation queue
async function processOperationQueue() {
  if (
    operationState.isProcessingQueue ||
    operationState.operationQueue.length === 0
  ) {
    return;
  }

  operationState.isProcessingQueue = true;
  logToConsole("start", "Processing operation queue...");

  try {
    while (operationState.operationQueue.length > 0) {
      const { type, operation } = operationState.operationQueue[0];

      try {
        await operation();
        operationState.operationQueue.shift();
        logToConsole("success", `Operation completed: ${type}`);
      } catch (error) {
        logToConsole("error", `Operation failed: ${type}`, error);
        // Remove failed operation after 3 retries
        if (operationState.operationQueue[0].retries >= 3) {
          operationState.operationQueue.shift();
        } else {
          operationState.operationQueue[0].retries =
            (operationState.operationQueue[0].retries || 0) + 1;
        }
      }

      // Add delay between operations
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    operationState.isProcessingQueue = false;
  }
}

// Start sync interval
function startSyncInterval() {
  if (config.syncMode !== "sync" || !isAwsConfigured()) return;

  const interval = Math.max(config.syncInterval * 1000, 15000);
  setInterval(() => {
    if (!operationState.isImporting && !operationState.isExporting) {
      queueOperation("periodic-sync", syncFromCloud);
    }
  }, interval);

  logToConsole("info", `Sync interval started (${interval}ms)`);
}

// Perform initial sync
async function performInitialSync() {
  logToConsole("start", "Performing initial sync...");

  try {
    // Check AWS credentials and encryption key
    if (
      !config.accessKey ||
      !config.secretKey ||
      !config.region ||
      !config.bucketName
    ) {
      logToConsole("warning", "AWS configuration is incomplete");
      return;
    }

    // Get local chats first
    const localChats = await getAllChatsFromIndexedDB();
    logToConsole("info", `Found ${localChats.length} local chats`);

    // Download cloud metadata
    const cloudMetadata = await downloadFromS3("metadata.json");

    if (!cloudMetadata || !cloudMetadata.data) {
      // No cloud data exists yet
      if (localChats.length > 0) {
        // We have local data, create initial backup
        logToConsole(
          "info",
          "No cloud data found - creating initial backup with local data"
        );
        await syncToCloud();
      } else {
        // No local data and no cloud data - nothing to do
        logToConsole(
          "info",
          "No local or cloud data found - skipping initial sync"
        );
      }
      return;
    }

    // Parse and validate cloud metadata
    try {
      const metadata = JSON.parse(
        typeof cloudMetadata.data === "string"
          ? cloudMetadata.data
          : new TextDecoder().decode(cloudMetadata.data)
      );

      if (!metadata || typeof metadata !== "object" || !metadata.chats) {
        throw new Error("Invalid metadata format");
      }

      // Check if there are any chats in the cloud metadata
      const chatCount = Object.keys(metadata.chats).length;
      logToConsole("info", `Found ${chatCount} chats in cloud metadata`);

      if (chatCount === 0 && localChats.length > 0) {
        // Cloud metadata exists but no chats - create fresh backup
        logToConsole("info", "Creating fresh backup with local data");
        await syncToCloud();
        return;
      }

      // Cloud data exists and appears valid, proceed with normal sync
      logToConsole(
        "info",
        "Cloud data found and validated - performing normal sync"
      );
      await syncFromCloud();
    } catch (error) {
      logToConsole("error", "Invalid cloud metadata:", error);
      if (localChats.length > 0) {
        logToConsole(
          "info",
          "Creating fresh backup with local data due to invalid cloud metadata"
        );
        await syncToCloud();
      }
      return;
    }
  } catch (error) {
    logToConsole("error", "Initial sync failed:", error);
    throw error;
  }
}

// Sync from cloud
async function syncFromCloud() {
  if (operationState.isImporting || operationState.isExporting) {
    logToConsole("skip", "Sync in progress - skipping");
    return;
  }

  logToConsole("start", "Starting sync from cloud...");
  operationState.isImporting = true;

  try {
    // First get cloud metadata
    const cloudMetadataObj = await downloadFromS3("metadata.json");
    if (!cloudMetadataObj) {
      logToConsole("info", "No cloud metadata found");
      return;
    }

    let cloudMetadata;
    try {
      cloudMetadata = JSON.parse(
        typeof cloudMetadataObj.data === "string"
          ? cloudMetadataObj.data
          : new TextDecoder().decode(cloudMetadataObj.data)
      );
    } catch (error) {
      logToConsole("error", "Failed to parse cloud metadata:", error);
      throw new Error("Invalid cloud metadata format");
    }

    // Initialize metadata structure if needed
    if (!cloudMetadata || typeof cloudMetadata !== "object") {
      cloudMetadata = {
        version: EXTENSION_VERSION,
        timestamp: Date.now(),
        chats: {},
        settings: {
          items: {},
          lastModified: 0,
          syncedAt: 0,
        },
      };
    }

    // Ensure required objects exist
    if (!cloudMetadata.chats) cloudMetadata.chats = {};
    if (!cloudMetadata.settings) {
      cloudMetadata.settings = {
        items: {},
        lastModified: 0,
        syncedAt: 0,
      };
    }

    // Get local chats for comparison
    const localChats = await getAllChatsFromIndexedDB();
    const localChatsMap = new Map(localChats.map((chat) => [chat.id, chat]));

    // Track changes
    const changes = {
      toDownload: [],
      toUpload: [],
      toDelete: [],
      settingsToSync: false,
    };

    // Check cloud chats against local
    for (const [chatId, cloudChatMeta] of Object.entries(cloudMetadata.chats)) {
      const localChat = localChatsMap.get(chatId);

      if (!localChat) {
        // Chat exists in cloud but not locally - download it
        changes.toDownload.push(chatId);
      } else {
        // Chat exists in both places - check if changed
        const localHash = await generateChatHash(localChat);
        if (localHash !== cloudChatMeta.hash) {
          // Different content - check timestamps to decide direction
          if (cloudChatMeta.lastModified > (localChat.updatedAt || 0)) {
            changes.toDownload.push(chatId);
          } else {
            changes.toUpload.push(chatId);
          }
        }
      }
    }

    // Check local chats against cloud
    for (const [chatId, localChat] of localChatsMap) {
      if (!cloudMetadata.chats[chatId]) {
        // Chat exists locally but not in cloud
        changes.toUpload.push(chatId);
      }
    }

    // Check settings changes
    if (cloudMetadata.settings.lastModified > localMetadata.settings.syncedAt) {
      changes.settingsToSync = true;
    }

    // Process downloads
    for (const chatId of changes.toDownload) {
      try {
        const cloudChat = await downloadFromS3(`chats/${chatId}.json`);
        if (!cloudChat) continue;

        let decryptedContent = await decryptData(cloudChat.data);

        // Parse the decrypted JSON
        let chatData;
        try {
          chatData = JSON.parse(decryptedContent);
        } catch (parseError) {
          logToConsole(
            "error",
            `Failed to parse chat ${chatId} JSON:`,
            parseError
          );
          continue;
        }

        await saveChatToIndexedDB(chatData);
        logToConsole("success", `Downloaded and saved chat ${chatId}`);
      } catch (error) {
        logToConsole("error", `Failed to download chat ${chatId}:`, error);
      }
    }

    // Process uploads
    for (const chatId of changes.toUpload) {
      try {
        const chat = localChatsMap.get(chatId);
        if (!chat) continue;

        const chatData = JSON.stringify(chat);
        let uploadData;
        let uploadMetadata = {
          version: EXTENSION_VERSION,
          timestamp: String(Date.now()),
          chatId: chat.id,
          messageCount: String(chat.messagesArray?.length || 0),
          encrypted: config.encryptionKey ? "true" : "false",
        };

        if (config.encryptionKey) {
          uploadData = await encryptData(chatData);
        } else {
          uploadData = new TextEncoder().encode(chatData);
        }

        await uploadToS3(`chats/${chat.id}.json`, uploadData, uploadMetadata);

        // Update metadata
        cloudMetadata.chats[chatId] = {
          lastModified: chat.updatedAt || Date.now(),
          hash: await generateChatHash(chat),
          syncedAt: Date.now(),
        };
      } catch (error) {
        logToConsole("error", `Failed to upload chat ${chatId}:`, error);
      }
    }

    // Process settings sync
    if (changes.settingsToSync) {
      try {
        const cloudSettings = await downloadFromS3("settings.json");
        if (cloudSettings) {
          let settingsData;
          const decryptedData = await decryptData(cloudSettings.data);
          logToConsole("info", "Decrypted settings data:", {
            length: decryptedData.length,
            preview: decryptedData.substring(0, 100),
          });
          try {
            settingsData = JSON.parse(decryptedData);
          } catch (parseError) {
            logToConsole("error", "Failed to parse settings JSON:", {
              error: parseError,
              decryptedData: decryptedData.substring(0, 100),
            });
            throw parseError;
          }

          // Apply settings
          for (const [key, value] of Object.entries(settingsData)) {
            if (value.source === "indexeddb") {
              await setIndexedDBKey(key, value.data);
            } else {
              localStorage.setItem(key, value.data);
            }
          }
        }
      } catch (error) {
        logToConsole("error", "Failed to sync settings:", error);
      }
    }

    // Check if any settings need to be uploaded
    const settingsToUpload = {};
    let hasSettingsChanges = false;

    for (const [key, metadata] of Object.entries(
      localMetadata.settings.items || {}
    )) {
      if (metadata.lastModified > metadata.lastSynced) {
        hasSettingsChanges = true;
        const value =
          metadata.source === "indexeddb"
            ? await getIndexedDBValue(key)
            : localStorage.getItem(key);

        if (value !== undefined && value !== null) {
          settingsToUpload[key] = {
            data: value,
            source: metadata.source,
            lastModified: metadata.lastModified,
          };
        }
      }
    }

    // Upload settings if changed
    if (hasSettingsChanges) {
      try {
        const settingsData = JSON.stringify(settingsToUpload);
        let uploadData;
        let uploadMetadata = {
          version: EXTENSION_VERSION,
          timestamp: String(Date.now()),
          type: "settings",
          encrypted: "true",
        };

        // Always encrypt settings data
        const encryptedResult = await encryptData(settingsData);
        uploadData = encryptedResult;
        uploadMetadata = {
          version: EXTENSION_VERSION,
          timestamp: String(Date.now()),
          type: "settings",
          encrypted: "true",
        };

        await uploadToS3("settings.json", uploadData, uploadMetadata);

        // Update metadata
        if (!cloudMetadata.settings) {
          cloudMetadata.settings = {
            items: {},
            lastModified: Date.now(),
            syncedAt: Date.now(),
          };
        }
        cloudMetadata.settings.lastModified = Date.now();
        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(cloudMetadata))
        );

        // Update local sync status
        for (const key of Object.keys(settingsToUpload)) {
          if (localMetadata.settings.items[key]) {
            localMetadata.settings.items[key].lastSynced = Date.now();
          }
        }
        localMetadata.settings.syncedAt = Date.now();
        await saveLocalMetadata();

        logToConsole("success", "Settings synced to cloud");
      } catch (error) {
        logToConsole("error", "Failed to sync settings:", error);
      }
    }

    // Update cloud metadata with any changes
    await uploadToS3(
      "metadata.json",
      new TextEncoder().encode(JSON.stringify(cloudMetadata))
    );

    // Update local metadata
    localMetadata.lastSyncTime = Date.now();
    await saveLocalMetadata();

    // Prepare sync status message
    const syncStatus = {
      downloaded: changes.toDownload.length,
      uploaded: changes.toUpload.length,
      settingsSynced: changes.settingsToSync || hasSettingsChanges,
      //lastSettingsSync: localMetadata.settings.syncedAt,
      //timeSinceLastSettingsSync: Date.now() - localMetadata.settings.syncedAt,
    };

    // Log appropriate message based on sync status
    if (
      syncStatus.downloaded > 0 ||
      syncStatus.uploaded > 0 ||
      syncStatus.settingsSynced
    ) {
      logToConsole("success", "Sync completed with changes", syncStatus);
    } else if (syncStatus.timeSinceLastSettingsSync < 60000) {
      // Within last minute
      logToConsole(
        "success",
        "Sync completed (settings were synced recently)",
        {
          ...syncStatus,
          lastSettingsSync: new Date(
            syncStatus.lastSettingsSync
          ).toLocaleTimeString(),
        }
      );
    } else {
      logToConsole("success", "Sync completed (no changes needed)", syncStatus);
    }
  } catch (error) {
    logToConsole("error", "Sync from cloud failed:", error);
    throw error;
  } finally {
    operationState.isImporting = false;
  }
}

// Sync to cloud
async function syncToCloud() {
  if (operationState.isImporting || operationState.isExporting) {
    logToConsole("skip", "Sync in progress - skipping");
    return;
  }

  logToConsole("start", "Starting sync to cloud...");
  operationState.isExporting = true;

  try {
    const chats = await getAllChatsFromIndexedDB();

    // Upload each chat individually
    for (const chat of chats) {
      if (!chat.id) continue;

      const chatData = JSON.stringify(chat);
      let uploadData;
      let uploadMetadata = {
        version: EXTENSION_VERSION,
        timestamp: String(Date.now()),
        chatId: chat.id,
        messageCount: String(chat.messagesArray?.length || 0),
        encrypted: config.encryptionKey ? "true" : "false",
      };

      if (config.encryptionKey) {
        uploadData = await encryptData(chatData);
      } else {
        uploadData = new TextEncoder().encode(chatData);
      }

      await uploadToS3(`chats/${chat.id}.json`, uploadData, uploadMetadata);
    }

    // Update metadata
    const metadata = {
      version: EXTENSION_VERSION,
      timestamp: Date.now(),
      chats: {},
      settings: {
        items: {},
        lastModified: Date.now(),
        syncedAt: Date.now(),
      },
    };

    // Add metadata for each chat
    for (const chat of chats) {
      if (!chat.id) continue;
      metadata.chats[chat.id] = {
        lastModified: chat.updatedAt || Date.now(),
        hash: await generateChatHash(chat),
        syncedAt: Date.now(),
      };
    }

    // Upload settings to cloud during initial sync
    const settingsToUpload = {};
    let hasSettings = false;

    // Add monitored localStorage settings
    for (const key of MONITORED_ITEMS.localStorage) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        settingsToUpload[key] = {
          data: value,
          source: "localStorage",
          lastModified: Date.now(),
        };
        hasSettings = true;

        // Also update local metadata
        if (!localMetadata.settings.items[key]) {
          localMetadata.settings.items[key] = {
            hash: await generateContentHash(value),
            lastModified: Date.now(),
            lastSynced: Date.now(),
            source: "localStorage",
          };
        }
      }
    }

    // Add monitored IndexedDB settings
    for (const key of MONITORED_ITEMS.indexedDB) {
      const value = await getIndexedDBValue(key);
      if (value !== undefined) {
        settingsToUpload[key] = {
          data: value,
          source: "indexeddb",
          lastModified: Date.now(),
        };
        hasSettings = true;

        // Also update local metadata
        if (!localMetadata.settings.items[key]) {
          localMetadata.settings.items[key] = {
            hash: await generateContentHash(value),
            lastModified: Date.now(),
            lastSynced: Date.now(),
            source: "indexeddb",
          };
        }
      }
    }

    // Upload settings if any were found
    if (hasSettings) {
      logToConsole(
        "info",
        "Uploading monitored settings to cloud during initial sync"
      );
      const settingsData = JSON.stringify(settingsToUpload);
      let uploadData;
      let uploadMetadata = {
        version: EXTENSION_VERSION,
        timestamp: String(Date.now()),
        type: "settings",
        encrypted: "true",
      };

      // Always encrypt settings data
      const encryptedResult = await encryptData(settingsData);
      uploadData = encryptedResult;

      await uploadToS3("settings.json", uploadData, uploadMetadata);

      // Update metadata with settings info
      metadata.settings.lastModified = Date.now();
      metadata.settings.syncedAt = Date.now();
    }

    await uploadToS3(
      "metadata.json",
      new TextEncoder().encode(JSON.stringify(metadata))
    );

    localMetadata.lastSyncTime = Date.now();
    localMetadata.settings.lastModified = Date.now();
    localMetadata.settings.syncedAt = Date.now();
    await saveLocalMetadata();

    logToConsole("success", "Sync to cloud completed");
  } catch (error) {
    logToConsole("error", "Sync to cloud failed:", error);
    throw error;
  } finally {
    operationState.isExporting = false;
  }
}

// Detect changes between local and cloud data
async function detectChanges(localChats, cloudChats) {
  const changes = [];
  const localChatsMap = new Map(localChats.map((chat) => [chat.id, chat]));
  const cloudChatsMap = new Map(cloudChats.map((chat) => [chat.id, chat]));
  const processedIds = new Set();

  // Check for updates and additions
  for (const [chatId, cloudChat] of cloudChatsMap) {
    processedIds.add(chatId);
    const localChat = localChatsMap.get(chatId);

    if (!localChat) {
      // New chat in cloud
      changes.push({ type: "add", chat: cloudChat });
    } else {
      const cloudHash = await generateChatHash(cloudChat);
      const localHash = await generateChatHash(localChat);

      if (cloudHash !== localHash) {
        // Chat was updated
        if (cloudChat.updatedAt > localChat.updatedAt) {
          changes.push({ type: "update", chat: cloudChat });
        }
      }
    }
  }

  // Check for deletions
  for (const [chatId, localChat] of localChatsMap) {
    if (!processedIds.has(chatId)) {
      // Chat was deleted in cloud
      changes.push({ type: "delete", chatId });
    }
  }

  return changes;
}

// Update chat metadata
async function updateChatMetadata(
  chatId,
  isModified = true,
  isDeleted = false
) {
  const chat = await getChatFromIndexedDB(chatId);

  if (!localMetadata.chats[chatId]) {
    localMetadata.chats[chatId] = {
      updatedAt: 0,
      hash: null,
      syncedAt: 0,
      isDeleted: false,
    };
  }

  if (chat) {
    localMetadata.chats[chatId].updatedAt = chat.updatedAt || Date.now();
    localMetadata.chats[chatId].hash = await generateChatHash(chat);
    localMetadata.chats[chatId].isDeleted = false;
  } else {
    localMetadata.chats[chatId].isDeleted = isDeleted;
  }

  if (isModified) {
    localMetadata.chats[chatId].syncedAt = 0;
  }

  await saveLocalMetadata();
}

// Setup visibility change handler
function setupVisibilityChangeHandler() {
  document.addEventListener("visibilitychange", () => {
    const isVisible = document.visibilityState === "visible";
    logToConsole(
      "visibility",
      `Page visibility changed: ${isVisible ? "visible" : "hidden"}`
    );

    if (isVisible) {
      // For sync mode, queue a sync operation
      if (config.syncMode === "sync") {
        queueOperation("visibility-sync", syncFromCloud);
      }

      // We've removed the daily backup check on visibility change
      // Daily backups are now only triggered during initialization
    }
  });
}

// ==================== UI COMPONENTS ====================

// Insert sync button
function insertSyncButton() {
  // Remove existing button if it exists
  const existingButton = document.getElementById("cloud-sync-button");
  if (existingButton) {
    existingButton.remove();
  }

  // Get current mode from config or localStorage
  const currentMode =
    config?.syncMode || localStorage.getItem("sync-mode") || "sync";

  const button = document.createElement("button");
  button.id = "cloud-sync-button";
  button.className =
    "min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full";

  button.innerHTML = `
    <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
      <svg class="w-4 h-4 flex-shrink-0" width="18px" height="18px" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
        ${
          currentMode === "sync"
            ? `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 4.5A4.5 4.5 0 0114.5 9M9 13.5A4.5 4.5 0 013.5 9"/>
              <polyline points="9,2.5 9,4.5 11,4.5"/>
              <polyline points="9,15.5 9,13.5 7,13.5"/>
             </g>`
            : `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15.75 11.25v3c0 .828-.672 1.5-1.5 1.5h-10.5c-.828 0-1.5-.672-1.5-1.5v-3"/>
              <polyline points="12.75,6 9,2.25 5.25,6"/>
              <line x1="9" y1="2.25" x2="9" y2="11.25"/>
             </g>`
        }
      </svg>
      <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">${
        currentMode === "sync" ? "Sync" : "Backup"
      }</span>
    </span>
  `;

  button.addEventListener("click", () => {
    openSyncModal();
  });

  // Try to insert after the Teams button
  const teamsButton = document.querySelector(
    'button[data-element-id="workspace-tab-teams"]'
  );
  if (teamsButton && teamsButton.parentNode) {
    teamsButton.parentNode.insertBefore(button, teamsButton.nextSibling);
    return;
  }

  // Fallback: Try to insert after any button with an SVG icon
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.querySelector("svg")) {
      btn.parentNode.insertBefore(button, btn.nextSibling);
      return;
    }
  }

  // If still not inserted, try again in 1 second
  setTimeout(insertSyncButton, 1000);
}

// Add required CSS styles for modal
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

  .cloud-sync-modal {
    display: inline-block;
    width: 100%;
    background-color: rgb(9, 9, 11);
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

  /* Tooltip styles */
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

  /* Ensure specific tooltip classes don't override the width */
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

  /* Animation keyframes */
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

// Open sync modal
function openSyncModal() {
  // Check if modal already exists
  if (document.querySelector(".cloud-sync-modal")) {
    logToConsole("skip", "Modal already open - skipping");
    return;
  }

  logToConsole("start", "Opening sync modal...");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "cloud-sync-modal";

  modal.innerHTML = `
    <div class="text-gray-800 dark:text-white text-left text-sm">
      <div class="flex justify-center items-center mb-3">
        <h3 class="text-center text-xl font-bold">Cloud Sync Settings</h3>
        <button class="ml-2 text-blue-600 text-lg hint--bottom-left hint--rounded hint--large" 
          aria-label="Fill form & Save. If you are using Amazon S3 - fill in S3 Bucket Name, AWS Region, AWS Access Key, AWS Secret Key and Encryption key.&#10;&#10;Initial backup: You will need to click on Export to create your first backup in S3. Thereafter, automatic backups are done to S3 as per Backup Interval if the browser tab is active.&#10;&#10;Restore backup: If S3 already has an existing backup, this extension will automatically pick it and restore the local data.&#10;&#10;&#10;&#10;Snapshot: Creates an instant no-touch backup that will not be overwritten.&#10;&#10;Download: You can select the backup data to be download and click on Download button to download it for local storage.&#10;&#10;Restore: Select the backup you want to restore and Click on Restore. The typingmind data will be restored to the selected backup data/date.">ⓘ</button>
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
            <div class="flex items-center space-x-4 mb-4">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-400">Mode:</label>
              <label class="inline-flex items-center">
                <input type="radio" name="sync-mode" value="sync" class="form-radio text-blue-600" ${
                  config.syncMode === "sync" ? "checked" : ""
                }>
                <span class="ml-2">Sync</span>
                <button class="ml-1 text-blue-600 text-lg hint--top-right hint--rounded hint--medium" aria-label="Automatically syncs data between devices. When enabled, data will be imported from cloud on app start.">ⓘ</button>
              </label>
              <label class="inline-flex items-center">
                <input type="radio" name="sync-mode" value="backup" class="form-radio text-blue-600" ${
                  config.syncMode === "backup" ? "checked" : ""
                }>
                <span class="ml-2">Backup</span>
                <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="Only creates backups. No automatic import from cloud on app start.">ⓘ</button>
              </label>
            </div>

            <div class="flex space-x-4">
              <div class="w-2/3">
                <label for="aws-bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Bucket Name <span class="text-red-500">*</span></label>
                <input id="aws-bucket" name="aws-bucket" type="text" value="${
                  config.bucketName || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
              </div>
              <div class="w-1/3">
                <label for="aws-region" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Region <span class="text-red-500">*</span></label>
                <input id="aws-region" name="aws-region" type="text" value="${
                  config.region || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
              </div>
            </div>

            <div>
              <label for="aws-access-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Access Key <span class="text-red-500">*</span></label>
              <input id="aws-access-key" name="aws-access-key" type="password" value="${
                config.accessKey || ""
              }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
            </div>

            <div>
              <label for="aws-secret-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Secret Key <span class="text-red-500">*</span></label>
              <input id="aws-secret-key" name="aws-secret-key" type="password" value="${
                config.secretKey || ""
              }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
            </div>

            <div>
              <label for="aws-endpoint" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                S3 Compatible Storage Endpoint
                <button class="ml-1 text-blue-600 text-lg hint--top hint--rounded hint--medium" aria-label="For Amazon AWS, leave this blank. For S3 compatible cloud services like Cloudflare, iDrive and the likes, populate this.">ⓘ</button>
              </label>
              <input id="aws-endpoint" name="aws-endpoint" type="text" value="${
                config.endpoint || ""
              }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off">
            </div>

            <div class="flex space-x-4">
              <div class="w-1/2">
                <label for="sync-interval" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Sync Interval
                <button class="ml-1 text-blue-600 text-lg hint--top-right hint--rounded hint--medium" aria-label="How often do you want to sync your data to cloud? Minimum 15 seconds">ⓘ</button></label>
                <input id="sync-interval" name="sync-interval" type="number" min="15" value="${
                  config.syncInterval
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
              </div>
              <div class="w-1/2">
                <label for="encryption-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Encryption Key <span class="text-red-500">*</span>
                  <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="Choose a secure 8+ character string. This is to encrypt the backup file before uploading to cloud. Securely store this somewhere as you will need this to restore backup from cloud.">ⓘ</button>
                </label>
                <input id="encryption-key" name="encryption-key" type="password" value="${
                  config.encryptionKey || ""
                }" class="z-1 w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end mb-4 space-x-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Console Logging
            <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="Use this to enable detailed logging in Browser console for troubleshooting purpose. Clicking on this button will instantly start logging. However, earlier events will not be logged. You could add ?log=true to the page URL and reload the page to start logging from the beginning of the page load.">ⓘ</button>
          </span>
          <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
        </div>

        <div class="flex justify-between space-x-2 mt-4">
          <button id="save-settings" class="z-1 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
            Save Settings
          </button>
          <div class="flex space-x-2">
            <button id="sync-now" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
              Sync Now
            </button>
            <button id="create-snapshot" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
              Create Snapshot
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

  // Add event listeners
  modal.querySelector("#close-modal").addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);

  modal.querySelector("#save-settings").addEventListener("click", saveSettings);
  modal.querySelector("#sync-now").addEventListener("click", () => {
    queueOperation("manual-sync", syncFromCloud);
    updateSyncStatus();
  });

  modal.querySelector("#create-snapshot").addEventListener("click", () => {
    const name = prompt("Enter snapshot name:");
    if (name) {
      createSnapshot(name);
      updateSyncStatus();
    }
  });

  // Set console logging checkbox state based on URL parameter
  const consoleLoggingCheckbox = modal.querySelector("#console-logging-toggle");
  consoleLoggingCheckbox.checked = isConsoleLoggingEnabled;
  consoleLoggingCheckbox.addEventListener("change", (e) => {
    isConsoleLoggingEnabled = e.target.checked;
  });

  // Prevent clicks inside modal from closing it
  modal.addEventListener("click", (e) => e.stopPropagation());

  loadBackupList();
  updateSyncStatus();
}

// Close modal
function closeModal() {
  const modal = document.querySelector(".cloud-sync-modal");
  const overlay = document.querySelector(".modal-overlay");

  if (modal) modal.remove();
  if (overlay) overlay.remove();
}

// Save settings
async function saveSettings() {
  const newConfig = {
    bucketName: document.getElementById("aws-bucket").value,
    region: document.getElementById("aws-region").value,
    accessKey: document.getElementById("aws-access-key").value,
    secretKey: document.getElementById("aws-secret-key").value,
    endpoint: document.getElementById("aws-endpoint").value,
    syncMode: document.querySelector('input[name="sync-mode"]:checked').value,
    syncInterval: parseInt(document.getElementById("sync-interval").value),
    encryptionKey: document.getElementById("encryption-key").value,
  };

  // Validate settings
  if (
    !newConfig.bucketName ||
    !newConfig.region ||
    !newConfig.accessKey ||
    !newConfig.secretKey
  ) {
    alert("Please fill in all required AWS settings");
    return;
  }

  if (newConfig.syncInterval < 15) {
    alert("Sync interval must be at least 15 seconds");
    return;
  }

  // Update config
  config = { ...config, ...newConfig };
  saveConfiguration();

  // Update button text to match new mode
  const buttonText = document.querySelector(
    "#cloud-sync-button span:last-child"
  );
  if (buttonText) {
    buttonText.innerText = config.syncMode === "sync" ? "Sync" : "Backup";
  }

  // Restart intervals
  startSyncInterval();
  startBackupIntervals();

  // Perform initial sync
  if (config.syncMode === "sync") {
    queueOperation("initial-sync", performInitialSync);
  }

  closeModal();
  logToConsole("success", "Settings saved");

  // Force re-insert of sync button to ensure text is updated
  insertSyncButton();
}

// Get formatted last sync time
function getLastSyncTime() {
  if (!localMetadata.lastSyncTime) {
    return "Never";
  }

  const lastSync = new Date(localMetadata.lastSyncTime);
  const now = new Date();
  const diff = now - lastSync;

  if (diff < 60000) {
    // Less than 1 minute
    return "Just now";
  } else if (diff < 3600000) {
    // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else if (diff < 86400000) {
    // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else {
    return lastSync.toLocaleString();
  }
}

// Update sync status
function updateSyncStatus() {
  const statusText = document.querySelector(".status-text");
  if (statusText) {
    statusText.textContent = `Last synced: ${getLastSyncTime()}`;
  }
}

// Load backup list
async function loadBackupList() {
  try {
    const backupList = document.getElementById("backup-files");
    if (!backupList) return;

    // Show loading state
    backupList.innerHTML = '<option value="">Loading backups...</option>';
    backupList.disabled = true;

    const bucketName = localStorage.getItem("aws-bucket");
    const awsAccessKey = localStorage.getItem("aws-access-key");
    const awsSecretKey = localStorage.getItem("aws-secret-key");

    if (!bucketName || !awsAccessKey || !awsSecretKey) {
      backupList.innerHTML =
        '<option value="">Please configure AWS credentials first</option>';
      backupList.disabled = false;
      return;
    }

    // Get all objects from S3
    const backups = await listS3Objects();

    // Clear existing options
    backupList.innerHTML = "";
    backupList.disabled = false;

    // Filter out chat folder items
    const filteredBackups = backups.filter(
      (backup) => !backup.Key.startsWith("chats/") && backup.Key !== "chats/"
    );

    if (filteredBackups.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.text = "No backups found";
      backupList.appendChild(option);
    } else {
      // Sort backups by timestamp (newest first)
      const sortedBackups = filteredBackups.sort((a, b) => {
        const timestampA =
          a.metadata?.timestamp || a.LastModified?.getTime() || 0;
        const timestampB =
          b.metadata?.timestamp || b.LastModified?.getTime() || 0;
        return timestampB - timestampA;
      });

      // Add sorted backups to the list
      sortedBackups.forEach((backup) => {
        const option = document.createElement("option");
        option.value = backup.Key;
        const size = formatFileSize(backup.Size || 0);
        option.text = `${backup.Key} - ${size}`;
        backupList.appendChild(option);
      });
    }

    // Update button states based on selection
    updateButtonStates();

    // Add change listener to update button states
    backupList.addEventListener("change", updateButtonStates);

    // Function to update button states
    function updateButtonStates() {
      const selectedValue = backupList.value || "";
      const downloadButton = document.getElementById("download-backup-btn");
      const restoreButton = document.getElementById("restore-backup-btn");
      const deleteButton = document.getElementById("delete-backup-btn");

      // Check file types
      const isSnapshot = selectedValue.startsWith("s-");
      const isDailyBackup = selectedValue.startsWith("typingmind-backup-");
      const isChatsFolder = selectedValue === "chats/";
      const isSettingsFile = selectedValue === "settings.json";
      const isMetadataFile = selectedValue === "metadata.json";

      if (downloadButton) {
        downloadButton.disabled = !selectedValue;
      }

      if (restoreButton) {
        restoreButton.disabled =
          !selectedValue || (!isSnapshot && !isDailyBackup);
      }

      if (deleteButton) {
        // Enable delete for all files except protected ones
        const isProtectedFile =
          !selectedValue || isChatsFolder || isSettingsFile || isMetadataFile;
        deleteButton.disabled = isProtectedFile;
      }
    }

    // Add button handlers
    setupButtonHandlers(backupList);
  } catch (error) {
    logToConsole("error", "Failed to load backup list:", error);
    if (backupList) {
      backupList.innerHTML = '<option value="">Error loading backups</option>';
      backupList.disabled = false;
    }
  }
}

// Helper function to set up button handlers
function setupButtonHandlers(backupList) {
  // Download button handler
  const downloadButton = document.getElementById("download-backup-btn");
  if (downloadButton) {
    // Remove existing click handler
    const newDownloadButton = downloadButton.cloneNode(true);
    downloadButton.parentNode.replaceChild(newDownloadButton, downloadButton);

    newDownloadButton.onclick = async () => {
      const key = backupList.value;
      if (!key) {
        alert("Please select a backup to download");
        return;
      }

      try {
        const backup = await downloadFromS3(key);

        // Handle download based on file type
        if (key.endsWith(".zip")) {
          handleZipDownload(backup, key);
        } else {
          handleRegularFileDownload(backup, key);
        }
      } catch (error) {
        logToConsole("error", "Failed to download backup:", error);
        alert("Failed to download backup: " + error.message);
      }
    };
  }

  // Restore button handler
  const restoreButton = document.getElementById("restore-backup-btn");
  if (restoreButton) {
    // Remove existing click handler
    const newRestoreButton = restoreButton.cloneNode(true);
    restoreButton.parentNode.replaceChild(newRestoreButton, restoreButton);

    newRestoreButton.onclick = async () => {
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
          await restoreFromBackup(key);
          alert("Backup restored successfully!");
        } catch (error) {
          logToConsole("error", "Failed to restore backup:", error);
          alert("Failed to restore backup: " + error.message);
        }
      }
    };
  }

  // Delete button handler
  const deleteButton = document.getElementById("delete-backup-btn");
  if (deleteButton) {
    // Remove existing click handler
    const newDeleteButton = deleteButton.cloneNode(true);
    deleteButton.parentNode.replaceChild(newDeleteButton, deleteButton);

    newDeleteButton.onclick = async () => {
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
          await deleteFromS3(key);
          await loadBackupList(); // Refresh the list
          alert("Backup deleted successfully!");
        } catch (error) {
          logToConsole("error", "Failed to delete backup:", error);
          alert("Failed to delete backup: " + error.message);
        }
      }
    };
  }
}

// Helper functions for handling downloads
async function handleZipDownload(backup, key) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(backup.data);

  // Find metadata file
  const metadataFile = zip.file("metadata.json");
  let metadata;
  if (metadataFile) {
    const metadataContent = await metadataFile.async("text");
    metadata = JSON.parse(metadataContent);
  }

  // Find and process the main data file
  const dataFile = Object.keys(zip.files).find((f) => f !== "metadata.json");
  if (!dataFile) {
    throw new Error("No data file found in backup");
  }

  const fileContent = await zip.file(dataFile).async("uint8array");

  try {
    // Decrypt the content
    const decryptedString = await decryptData(fileContent);

    // Parse and format JSON
    let finalContent;
    try {
      const parsedContent = JSON.parse(decryptedString);
      finalContent = JSON.stringify(parsedContent, null, 2);
    } catch (parseError) {
      finalContent = decryptedString;
    }

    // Download the processed content
    const blob = new Blob([finalContent], { type: "application/json" });
    downloadFile(key.replace(".zip", ".json"), blob);
  } catch (error) {
    logToConsole("error", "Failed to process zip content:", error);
    throw error;
  }
}

async function handleRegularFileDownload(backup, key) {
  try {
    const decryptedString = await decryptData(backup.data);

    // For JSON files, ensure we have a properly formatted JSON string
    if (key.endsWith(".json")) {
      // Parse and format JSON
      const parsedData = JSON.parse(decryptedString);
      const formattedJson = JSON.stringify(parsedData, null, 2);

      // Create a text blob with the JSON content
      const blob = new Blob([formattedJson], { type: "application/json" });
      downloadFile(key, blob);
    } else {
      downloadFile(key, decryptedString);
    }
  } catch (error) {
    logToConsole("error", "Processing failed, downloading raw data:", error);
    // If decryption fails, download the raw data
    downloadFile(key, backup.data);
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Download file
function downloadFile(filename, data) {
  logToConsole(
    "info",
    `Downloading file: ${filename}, data type: ${typeof data}`
  );

  let blob;

  // Handle different data types
  if (data instanceof Blob) {
    // If it's already a Blob, use it directly
    blob = data;
  } else if (typeof data === "string") {
    // For string data, create a text blob
    blob = new Blob([data], { type: "text/plain" });
  } else if (typeof data === "object") {
    // For objects, stringify with formatting
    try {
      const jsonString = JSON.stringify(data, null, 2);
      blob = new Blob([jsonString], { type: "application/json" });
    } catch (error) {
      logToConsole("error", "Failed to stringify object:", error);
      // Fallback to basic toString
      blob = new Blob([String(data)], { type: "text/plain" });
    }
  } else {
    // For any other type, convert to string
    blob = new Blob([String(data)], { type: "text/plain" });
  }

  // Log the blob size
  logToConsole("info", `Download blob size: ${formatFileSize(blob.size)}`);

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== SETTINGS MONITORING ====================

// Modified getIndexedDBValue to use persistent connection
async function getIndexedDBValue(key) {
  const db = await getPersistentDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction("keyval", "readonly");
      const store = transaction.objectStore("keyval");
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    } catch (error) {
      persistentDB = null; // Reset connection on error
      reject(error);
    }
  });
}

// Monitor settings changes
async function initializeSettingsMonitoring() {
  //logToConsole("start", "Initializing settings monitoring...");

  // Ensure metadata structure exists
  if (!localMetadata.settings) {
    localMetadata.settings = {
      items: {},
      lastModified: Date.now(),
      syncedAt: 0,
    };
  }

  if (!localMetadata.settings.items) {
    localMetadata.settings.items = {};
  }

  // Initialize metadata for all monitored items
  for (const key of MONITORED_ITEMS.indexedDB) {
    const value = await getIndexedDBValue(key);
    if (value !== undefined) {
      const hash = await generateContentHash(value);
      // Only set lastModified if this is a new item or if the hash has changed
      if (
        !localMetadata.settings.items[key] ||
        localMetadata.settings.items[key].hash !== hash
      ) {
        localMetadata.settings.items[key] = {
          hash,
          lastModified: Date.now(),
          lastSynced: 0,
          source: "indexeddb",
        };
      }
    }
  }

  for (const key of MONITORED_ITEMS.localStorage) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      const hash = await generateContentHash(value);
      // Only set lastModified if this is a new item or if the hash has changed
      if (
        !localMetadata.settings.items[key] ||
        localMetadata.settings.items[key].hash !== hash
      ) {
        localMetadata.settings.items[key] = {
          hash,
          lastModified: Date.now(),
          lastSynced: 0,
          source: "localstorage",
        };
      }
    }
  }

  // Set up localStorage change listener
  window.addEventListener("storage", async (e) => {
    if (MONITORED_ITEMS.localStorage.includes(e.key)) {
      await handleSettingChange(e.key, e.newValue, "localstorage");
    }
  });

  // Set up periodic check for IndexedDB changes
  setInterval(checkIndexedDBChanges, 5000);

  // Save initial metadata
  await saveLocalMetadata();

  logToConsole("success", "Settings monitoring initialized");
}

// Generate hash for content
async function generateContentHash(content) {
  const str = typeof content === "string" ? content : JSON.stringify(content);
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Modified checkIndexedDBChanges to handle transactions properly
async function checkIndexedDBChanges() {
  try {
    const db = await getPersistentDB();

    // Process each key sequentially with its own transaction
    for (const key of MONITORED_ITEMS.indexedDB) {
      try {
        // Create a new transaction for each key
        const value = await new Promise((resolve, reject) => {
          const transaction = db.transaction("keyval", "readonly");
          const store = transaction.objectStore("keyval");
          const request = store.get(key);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);

          // Handle transaction completion
          transaction.oncomplete = () => {
            if (!request.result) resolve(undefined);
          };

          transaction.onerror = () => {
            reject(transaction.error);
          };
        });

        if (value !== undefined) {
          const hash = await generateContentHash(value);
          const metadata = localMetadata.settings.items[key];

          if (!metadata || metadata.hash !== hash) {
            await handleSettingChange(key, value, "indexeddb");
          }
        }
      } catch (error) {
        logToConsole("error", `Error checking IndexedDB key ${key}:`, error);
        // Don't reset persistentDB here as the connection might still be valid
      }
    }
  } catch (error) {
    logToConsole("error", "Failed to check IndexedDB changes:", error);
    persistentDB = null; // Only reset connection on critical errors
  }
}

// Handle setting change
async function handleSettingChange(key, value, source) {
  const hash = await generateContentHash(value);

  // Check if the value has actually changed
  const existingMetadata = localMetadata.settings.items[key];
  if (existingMetadata && existingMetadata.hash === hash) {
    logToConsole("info", `Setting ${key} unchanged, skipping sync`);
    return;
  }

  logToConsole("info", `Setting changed: ${key}`);

  localMetadata.settings.items[key] = {
    hash,
    lastModified: Date.now(),
    lastSynced: 0,
    source,
  };

  localMetadata.settings.lastModified = Date.now();
  await saveLocalMetadata();

  // Queue settings-specific sync operation
  if (config.syncMode === "sync") {
    queueOperation("settings-sync", async () => {
      // Only sync settings, not chats
      try {
        const cloudMetadataObj = await downloadFromS3("metadata.json");
        if (!cloudMetadataObj) return;

        let cloudMetadata = JSON.parse(
          typeof cloudMetadataObj.data === "string"
            ? cloudMetadataObj.data
            : new TextDecoder().decode(cloudMetadataObj.data)
        );

        // Upload changed settings
        const settingsToUpload = {};
        settingsToUpload[key] = {
          data: value,
          source: source,
          lastModified: Date.now(),
        };

        const settingsData = JSON.stringify(settingsToUpload);
        let uploadData;
        let uploadMetadata = {
          version: EXTENSION_VERSION,
          timestamp: String(Date.now()),
          type: "settings",
          encrypted: "true",
        };

        // Always encrypt settings data
        const encryptedResult = await encryptData(settingsData);
        uploadData = encryptedResult;
        uploadMetadata = {
          version: EXTENSION_VERSION,
          timestamp: String(Date.now()),
          type: "settings",
          encrypted: "true",
        };

        await uploadToS3("settings.json", uploadData, uploadMetadata);

        // Update metadata
        if (!cloudMetadata.settings) {
          cloudMetadata.settings = {
            items: {},
            lastModified: Date.now(),
            syncedAt: Date.now(),
          };
        }
        cloudMetadata.settings.lastModified = Date.now();
        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(cloudMetadata))
        );

        // Update local sync status
        localMetadata.settings.items[key].lastSynced = Date.now();
        localMetadata.settings.syncedAt = Date.now();
        await saveLocalMetadata();

        logToConsole("success", `Setting ${key} synced to cloud`);
      } catch (error) {
        logToConsole("error", `Failed to sync setting ${key}:`, error);
      }
    });
  }
}

async function cleanupMetadataVersions() {
  //logToConsole("start", "Starting metadata.json version cleanup...");

  try {
    const s3 = initializeS3Client();

    // List all versions of metadata.json
    const params = {
      Bucket: config.bucketName,
      Prefix: "metadata.json",
    };

    // Get bucket versioning status first
    const versioningStatus = await s3
      .getBucketVersioning({ Bucket: config.bucketName })
      .promise();
    const isVersioningEnabled = versioningStatus.Status === "Enabled";

    if (!isVersioningEnabled) {
      logToConsole(
        "info",
        "Bucket versioning is not enabled, skipping version cleanup"
      );
      return;
    }

    // List all versions including delete markers
    const versions = await s3.listObjectVersions(params).promise();

    // Combine both versions and delete markers, excluding the current version
    let allVersions = [];

    if (versions.Versions) {
      // Get all non-current versions
      allVersions.push(...versions.Versions.filter((v) => !v.IsLatest));
    }

    if (versions.DeleteMarkers) {
      // Add all delete markers except the most recent one if it exists
      const sortedMarkers = versions.DeleteMarkers.sort(
        (a, b) => b.LastModified - a.LastModified
      );
      if (sortedMarkers.length > 0 && !sortedMarkers[0].IsLatest) {
        allVersions.push(...sortedMarkers);
      } else {
        allVersions.push(...sortedMarkers.slice(1));
      }
    }

    //if (allVersions.length === 0) {
    //  logToConsole("info", "No old metadata versions to clean up");
    //  return;
    //}

    //logToConsole(
    //  "info",
    //  `Found ${allVersions.length} old metadata versions to clean up`
    //);

    // Process versions in batches of 1000 (AWS limit)
    const batchSize = 1000;
    for (let i = 0; i < allVersions.length; i += batchSize) {
      const batch = allVersions.slice(i, i + batchSize);

      const deleteParams = {
        Bucket: config.bucketName,
        Delete: {
          Objects: batch.map((version) => ({
            Key: version.Key,
            VersionId: version.VersionId,
          })),
          Quiet: false,
        },
      };

      const deleteResult = await s3.deleteObjects(deleteParams).promise();

      if (deleteResult.Deleted) {
        logToConsole(
          "success",
          `Deleted ${deleteResult.Deleted.length} old metadata versions`
        );
      }

      if (deleteResult.Errors && deleteResult.Errors.length > 0) {
        logToConsole(
          "error",
          "Some versions could not be deleted:",
          deleteResult.Errors
        );
        // Log specific errors for debugging
        deleteResult.Errors.forEach((error) => {
          logToConsole(
            "error",
            `Failed to delete version ${error.VersionId}: ${error.Message}`
          );
        });
      }
    }

    logToConsole("success", "Metadata version cleanup completed");
  } catch (error) {
    logToConsole("error", "Failed to cleanup metadata versions:", error);
    // Log detailed error information
    if (error.code) {
      logToConsole(
        "error",
        `Error code: ${error.code}, Message: ${error.message}`
      );
    }
  }
}

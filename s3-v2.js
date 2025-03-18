// TypingMind Cloud Sync & Backup v2.0.0
// Combines features from s3.js and YATSE for comprehensive sync and backup

// ==================== CONSTANTS & STATE ====================

const EXTENSION_VERSION = "2.0.0";
const EXCLUDED_SETTINGS = [
  "aws-bucket",
  "aws-access-key",
  "aws-secret-key",
  "aws-region",
  "aws-endpoint",
  "encryption-key",
  "chat-sync-metadata",
  "sync-mode",
  "last-cloud-sync",
  "TM_useDraftContent",
  "lastDailyBackup",
  "TM_useLastVerifiedToken",
  "TM_useStateUpdateHistory",
  "TM_useGlobalChatLoading",
  "TM_crossTabLastSynced",
  "TM_useLastOpenedChatID",
];

function shouldExcludeSetting(key) {
  return (
    EXCLUDED_SETTINGS.includes(key) ||
    key.startsWith("CHAT_") ||
    key.startsWith("last-seen-") ||
    key.startsWith("sync-") ||
    !isNaN(key)
  );
}

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
  isCheckingChanges: false,
  lastError: null,
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
  syncMode: "disabled", // 'sync', 'backup', or 'disabled'
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

// Track settings changes between syncs
let pendingSettingsChanges = false;

// Track active intervals
let activeIntervals = {
  sync: null,
  backup: null,
};

// Clear all intervals
function clearAllIntervals() {
  if (activeIntervals.sync) {
    clearInterval(activeIntervals.sync);
    activeIntervals.sync = null;
  }
  if (activeIntervals.backup) {
    clearInterval(activeIntervals.backup);
    activeIntervals.backup = null;
  }
}

// ==================== LOGGING SYSTEM ====================

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

  // By default, only show priority 1-3 logs unless debug mode is enabled
  if (!isConsoleLoggingEnabled) return;

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

async function performFullInitialization() {
  try {
    // Load local metadata
    await loadLocalMetadata();

    // Initialize lastSeenUpdates from current chat states
    await initializeLastSeenUpdates();

    // Initialize settings monitoring
    await initializeSettingsMonitoring();

    // Setup localStorage change listener
    await setupLocalStorageChangeListener();

    // Check for daily backup if applicable
    if (config.syncMode !== "disabled") {
      queueOperation("daily-backup-check", checkAndPerformDailyBackup);
    }

    // Start interval (works for both sync and backup modes)
    startSyncInterval();

    // If in sync mode, also perform initial sync
    if (config.syncMode === "sync") {
      queueOperation("initial-sync", performInitialSync);
    }

    // Start monitoring IndexedDB for deletions
    monitorIndexedDBForDeletions();

    logToConsole("success", "Full initialization completed successfully");
  } catch (error) {
    logToConsole("error", "Error during full initialization:", error);
    throw error;
  }
}

async function initializeExtension() {
  // Initialize logging first
  initializeLoggingState();

  try {
    // Load AWS SDK
    await loadAwsSdk();

    // Load configuration first
    loadConfiguration();

    // Create UI elements after config is loaded
    insertSyncButton();

    // Check AWS configuration first
    if (!isAwsConfigured()) {
      logToConsole(
        "info",
        "AWS not configured - minimal initialization completed"
      );
      return;
    }

    // Check if disabled mode
    if (config.syncMode === "disabled") {
      logToConsole(
        "info",
        "Disabled mode - skipping cloud operations initialization"
      );
      return;
    }

    // Proceed with full initialization if AWS is configured and not in disabled mode
    await performFullInitialization();

    // Set up visibility change handler
    setupVisibilityChangeHandler();

    logToConsole("success", "Initialization completed successfully");
  } catch (error) {
    logToConsole("error", "Error initializing extension:", error);
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
      syncMode: "disabled",
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
    syncMode: localStorage.getItem("sync-mode") || "disabled",
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
  try {
    await setIndexedDBKey("sync-metadata", JSON.stringify(localMetadata));
    logToConsole("success", "Local metadata saved");
  } catch (error) {
    logToConsole("error", "Failed to save local metadata:", error);
    throw error;
  }
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

// Check for changes in chats
async function checkForChanges() {
  if (operationState.isImporting || operationState.isExporting) {
    logToConsole("skip", "Skipping change check - operation in progress");
    return;
  }

  // Add a check to prevent concurrent executions
  if (operationState.isCheckingChanges) {
    logToConsole("skip", "Change check already in progress");
    return;
  }

  operationState.isCheckingChanges = true;
  try {
    logToConsole("start", "Checking for changes...");

    // Get latest chats without reloading metadata
    const chats = await getAllChatsFromIndexedDB();
    let hasChanges = false;

    for (const chat of chats) {
      if (!chat.id) continue;

      const currentHash = await generateChatHash(chat);
      const localChatMeta = localMetadata.chats[chat.id];

      // Consider a chat changed if:
      // 1. No last seen hash exists
      // 2. Hash has changed from last seen
      // 3. Chat has never been synced (syncedAt is 0 or undefined)
      // 4. Chat has been modified since last sync
      if (
        !lastSeenUpdates[chat.id] ||
        currentHash !== lastSeenUpdates[chat.id].hash ||
        !localChatMeta?.syncedAt ||
        (localChatMeta && localChatMeta.lastModified > localChatMeta.syncedAt)
      ) {
        hasChanges = true;
        await updateChatMetadata(chat.id, true);
        lastSeenUpdates[chat.id] = {
          updatedAt: Date.now(),
          hash: currentHash,
        };
      }
    }

    if (hasChanges) {
      if (config.syncMode === "sync") {
        logToConsole("info", "Local changes detected - queueing sync to cloud");
        queueOperation("local-changes-sync", syncToCloud);
      } else if (config.syncMode === "backup") {
        logToConsole(
          "info",
          "Local changes detected - queueing backup to cloud"
        );
        queueOperation("backup-modified-chats", syncToCloud);
      }
    }
  } finally {
    operationState.isCheckingChanges = false;
  }
}

// Setup localStorage change listener
async function setupLocalStorageChangeListener() {
  window.addEventListener("storage", (e) => {
    if (!e.key || shouldExcludeSetting(e.key)) {
      return;
    }

    // Mark settings as changed, will be synced during interval
    pendingSettingsChanges = true;
    logToConsole("info", `LocalStorage change detected: ${e.key}`);
    // Immediately update sync status to show out-of-sync
    throttledCheckSyncStatus();
  });

  // Also monitor for programmatic changes
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    const oldValue = localStorage.getItem(key);
    originalSetItem.apply(this, arguments);

    if (!shouldExcludeSetting(key) && oldValue !== value) {
      pendingSettingsChanges = true;
      logToConsole("info", `LocalStorage programmatic change detected: ${key}`);
      // Immediately update sync status to show out-of-sync
      throttledCheckSyncStatus();
    }
  };
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
            const key = keys[i];
            if (key.startsWith("CHAT_")) {
              const chat = values[i];
              // Ensure chat has an id, removing CHAT_ prefix if present
              if (!chat.id) {
                chat.id = key.startsWith("CHAT_") ? key.slice(5) : key;
              }
              chats.push(chat);
            }
          }
          resolve(chats);
        };
      };

      transaction.oncomplete = () => {
        db.close();
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
  //logToConsole("info", "Setting up IndexedDB deletion monitor");

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

              // Only queue deletion from cloud if sync is enabled
              if (config.syncMode === "sync" || config.syncMode === "backup") {
                logToConsole(
                  "cleanup",
                  `Queueing deletion from cloud for chat ${chatId}`
                );
                queueOperation(`delete-chat-${chatId}`, () =>
                  deleteChatFromCloud(chatId)
                );
              }

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
    if (!chat || !chat.id) {
      reject(
        new Error("Cannot save chat: chat object or chat.id is undefined")
      );
      return;
    }

    const key = chat.id.startsWith("CHAT_") ? chat.id : `CHAT_${chat.id}`;
    const request = indexedDB.open("keyval-store", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readwrite");
      const store = transaction.objectStore("keyval");

      // Ensure chat.id is consistent with the key
      if (chat.id.startsWith("CHAT_") && key !== chat.id) {
        chat.id = chat.id.slice(5); // Remove CHAT_ prefix from chat.id
      }

      const putRequest = store.put(chat, key);

      putRequest.onsuccess = () => {
        logToConsole("success", `Saved chat ${chat.id} to IndexedDB`);
        resolve();
      };

      putRequest.onerror = () => reject(putRequest.error);

      transaction.oncomplete = () => {
        db.close();
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

// Delete a chat from IndexedDB
async function deleteChatFromIndexedDB(chatId) {
  return new Promise((resolve, reject) => {
    if (!chatId) {
      reject(new Error("Cannot delete chat: chatId is undefined"));
      return;
    }

    // Ensure we have the CHAT_ prefix
    const key =
      typeof chatId === "string" && chatId.startsWith("CHAT_")
        ? chatId
        : `CHAT_${chatId}`;

    const request = indexedDB.open("keyval-store", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readwrite");
      const store = transaction.objectStore("keyval");

      const deleteRequest = store.delete(key);

      deleteRequest.onsuccess = () => {
        logToConsole("success", `Deleted chat ${chatId} from IndexedDB`);
        resolve();
      };

      deleteRequest.onerror = () => reject(deleteRequest.error);

      transaction.oncomplete = () => {
        db.close();
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

    // Special handling for metadata.json - no decryption needed
    if (key === "metadata.json") {
      return {
        data: response.Body,
        metadata: cleanMetadata,
      };
    }

    // For all other files, return as is
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
  startSyncInterval(); // Reuse the same interval mechanism
}

// Check if daily backup is needed and perform it if necessary
async function checkAndPerformDailyBackup() {
  try {
    const lastBackupStr = localStorage.getItem("lastDailyBackup");
    const lastBackup = lastBackupStr ? new Date(parseInt(lastBackupStr)) : null;
    const now = new Date();

    // If no backup has been performed today
    if (!lastBackup || lastBackup.toDateString() !== now.toDateString()) {
      //logToConsole("info", "Starting daily backup...");
      await performDailyBackup();
      // Update last backup time
      localStorage.setItem("lastDailyBackup", now.getTime().toString());
      //logToConsole("success", "Daily backup completed");
    } else {
      //logToConsole("skip", "Daily backup already performed today");
    }
  } catch (error) {
    logToConsole("error", "Error checking/performing daily backup:", error);
  }
}

// Perform daily backup
async function performDailyBackup() {
  //logToConsole("start", "Starting daily backup...");
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
    // Temporarily disable sync
    operationState.isImporting = true;

    // Download the backup file
    const backup = await downloadFromS3(key);
    if (!backup || !backup.data) {
      throw new Error("Backup not found or empty");
    }

    let backupContent;
    if (key.endsWith(".zip")) {
      // Handle ZIP files
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(backup.data);

      // Find the JSON file in the ZIP
      const jsonFile = Object.keys(zip.files).find((f) => f.endsWith(".json"));
      if (!jsonFile) {
        throw new Error("No JSON file found in backup");
      }

      // Extract the content
      backupContent = await zip.file(jsonFile).async("uint8array");
    } else {
      // Handle regular files
      backupContent = backup.data;
    }

    // Decrypt the content
    const decryptedContent = await decryptData(backupContent);

    // Validate the decrypted content before importing
    if (typeof decryptedContent !== "object" || !decryptedContent) {
      throw new Error("Invalid backup data format");
    }

    // Import the data to storage
    await importDataToStorage(decryptedContent);

    // Validate imported chats
    const chats = await getAllChatsFromIndexedDB();
    for (const chat of chats) {
      if (!chat.id) {
        logToConsole("warning", "Found chat without ID, skipping", chat);
        continue;
      }
    }

    // Update last sync time
    const currentTime = new Date().toLocaleString();
    localStorage.setItem("last-cloud-sync", currentTime);

    // Save metadata
    await saveLocalMetadata();

    // Re-enable sync
    operationState.isImporting = false;

    logToConsole("success", "Backup restored successfully");
    return true;
  } catch (error) {
    logToConsole("error", "Restore failed:", error);
    // Ensure sync is re-enabled even if restoration fails
    operationState.isImporting = false;
    throw error;
  }
}

// Import data to storage (both localStorage and IndexedDB)
function importDataToStorage(data) {
  return new Promise((resolve, reject) => {
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
      Object.keys(data.localStorage).forEach((key) => {
        if (!preserveKeys.includes(key)) {
          // Store the value exactly as it was in the backup
          localStorage.setItem(key, data.localStorage[key]);
        }
      });
    }

    // Import IndexedDB data
    if (data.indexedDB) {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(["keyval"], "readwrite");
        const objectStore = transaction.objectStore("keyval");

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);

        // Clear existing data
        const deleteRequest = objectStore.clear();
        deleteRequest.onsuccess = function () {
          // Import new data directly
          Object.keys(data.indexedDB).forEach((key) => {
            objectStore.put(data.indexedDB[key], key);
          });
        };
      };
    } else {
      resolve();
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
  if (operationState.isProcessingQueue) return;

  operationState.isProcessingQueue = true;
  operationState.lastError = null; // Reset error state at start of queue processing
  updateSyncStatus(); // Update status to show in-progress

  try {
    while (operationState.operationQueue.length > 0) {
      const { type, operation } = operationState.operationQueue.shift();
      try {
        await operation();
      } catch (error) {
        operationState.lastError = error;
        logToConsole("error", `Operation ${type} failed:`, error);
        updateSyncStatus(); // Update status to show error
        throw error;
      }

      // Add delay between operations
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    operationState.isProcessingQueue = false;
    updateSyncStatus(); // Update status when queue is done
  }
}

// Start sync interval
function startSyncInterval() {
  // Clear any existing intervals first
  clearAllIntervals();

  // If in disabled mode, don't start any intervals
  if (config.syncMode === "disabled") {
    logToConsole("info", "Sync intervals disabled - manual operations only");
    return;
  }

  const interval = Math.max(config.syncInterval * 1000, 15000);

  activeIntervals.sync = setInterval(async () => {
    // Skip if operations are in progress
    if (operationState.isImporting || operationState.isExporting) {
      logToConsole("skip", "Operation in progress - skipping interval tasks");
      return;
    }

    // Check for local changes first
    await checkForChanges();

    // If AWS is configured, handle periodic tasks
    if (isAwsConfigured()) {
      // Handle pending settings changes (consolidate multiple changes)
      if (pendingSettingsChanges) {
        logToConsole("info", "Processing pending settings changes");
        pendingSettingsChanges = false;
        queueOperation("settings-sync", uploadSettingsToCloud);
      }

      // Handle mode-specific operations
      if (config.syncMode === "sync") {
        // For sync mode, do a quick consistency check
        if (!operationState.isCheckingChanges) {
          const cloudMetadata = await downloadCloudMetadata().catch((error) => {
            logToConsole(
              "error",
              "Error downloading cloud metadata for consistency check:",
              error
            );
            return null;
          });

          if (
            cloudMetadata &&
            cloudMetadata.lastSyncTime > localMetadata.lastSyncTime
          ) {
            logToConsole(
              "info",
              "Cloud changes detected during consistency check"
            );
            queueOperation("consistency-check", syncFromCloud);
          }
        }
      } else if (config.syncMode === "backup") {
        // For backup mode, check for any modified chats and queue them for backup
        const modifiedChats = Object.entries(localMetadata.chats)
          .filter(([_, meta]) => meta.lastModified > meta.syncedAt)
          .map(([chatId]) => chatId);

        if (modifiedChats.length > 0) {
          logToConsole("info", `Found ${modifiedChats.length} chats to backup`);
          queueOperation("backup-modified-chats", syncToCloud);
        }
      }
    }
  }, interval);

  logToConsole(
    "info",
    `${
      config.syncMode.charAt(0).toUpperCase() + config.syncMode.slice(1)
    } interval started (${interval}ms)`
  );
}

// Perform initial sync
async function performInitialSync() {
  logToConsole("start", "Performing initial sync...");

  try {
    // Check AWS credentials
    if (
      !config.accessKey ||
      !config.secretKey ||
      !config.region ||
      !config.bucketName
    ) {
      logToConsole("warning", "AWS configuration is incomplete");
      return;
    }

    // Load local metadata first
    await loadLocalMetadata();
    const localChatCount = Object.keys(localMetadata.chats || {}).length;
    logToConsole("info", `Found ${localChatCount} chats in local metadata`);

    // Download cloud metadata
    const s3 = initializeS3Client();
    const params = {
      Bucket: config.bucketName,
      Key: "metadata.json",
    };

    try {
      const data = await s3.getObject(params).promise();
      const content = data.Body;

      // Parse metadata directly without decryption
      const metadata = JSON.parse(
        typeof content === "string"
          ? content
          : new TextDecoder().decode(content)
      );

      if (!metadata || typeof metadata !== "object" || !metadata.chats) {
        throw new Error("Invalid metadata format");
      }

      // Check if there are any chats in the cloud metadata
      const chatCount = Object.keys(metadata.chats).length;
      logToConsole("info", `Found ${chatCount} chats in cloud metadata`);

      if (chatCount === 0 && localChatCount > 0) {
        // Cloud metadata exists but no chats - create fresh backup
        logToConsole("info", "Creating fresh backup with local data");

        // Get all local chats and update cloud metadata
        const chats = await getAllChatsFromIndexedDB();
        for (const chat of chats) {
          if (!chat.id) continue;

          const localChatMeta = localMetadata.chats[chat.id];
          if (!localChatMeta) continue;

          // Add chat to cloud metadata
          metadata.chats[chat.id] = {
            hash:
              localChatMeta.hash ||
              (await generateContentHash(JSON.stringify(chat))),
            lastModified: localChatMeta.lastModified || Date.now(),
            syncedAt: Date.now(),
            deleted: false,
          };

          // Upload the chat
          await uploadChatToCloud(chat.id, metadata);
        }

        // Upload the updated metadata
        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(metadata)),
          {
            ContentType: "application/json",
            ServerSideEncryption: "AES256",
          }
        );

        return;
      }

      // Cloud data exists and appears valid, proceed with normal sync
      logToConsole(
        "info",
        "Cloud data found and validated - performing normal sync"
      );
      await syncFromCloud();
    } catch (error) {
      if (error.code === "NoSuchKey") {
        // No cloud data exists yet
        if (localChatCount > 0) {
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
      logToConsole("error", "Invalid cloud metadata:", error);
      if (localChatCount > 0) {
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
  if (
    operationState.isImporting ||
    operationState.isExporting ||
    operationState.isProcessingQueue
  ) {
    logToConsole(
      "skip",
      "Sync already in progress or queue being processed, queueing this sync"
    );
    operationState.isPendingSync = true;
    return;
  }

  operationState.isImporting = true;
  updateSyncStatus(); // Show in-progress status

  try {
    logToConsole("start", "Starting sync from cloud...");

    // Use a single timestamp for the entire sync operation
    const syncTimestamp = Date.now();

    // Download cloud metadata once and store it
    const cloudMetadata = await downloadCloudMetadata();
    if (!cloudMetadata || !cloudMetadata.chats) {
      logToConsole("info", "No cloud metadata found or invalid format");
      return;
    }

    let hasChanges = false;

    // Check for settings changes first
    if (
      cloudMetadata.settings &&
      (!localMetadata.settings.syncedAt ||
        cloudMetadata.settings.lastModified > localMetadata.settings.syncedAt)
    ) {
      logToConsole("info", "Settings changes detected in cloud", {
        cloudLastModified: new Date(
          cloudMetadata.settings.lastModified
        ).toLocaleString(),
        localSyncedAt: localMetadata.settings.syncedAt
          ? new Date(localMetadata.settings.syncedAt).toLocaleString()
          : "never",
      });

      // Download and apply settings
      const cloudSettings = await downloadSettingsFromCloud();
      if (cloudSettings) {
        // Apply settings while preserving security keys
        const preserveKeys = [
          "aws-bucket",
          "aws-access-key",
          "aws-secret-key",
          "aws-region",
          "aws-endpoint",
          "encryption-key",
          "chat-sync-metadata",
        ];

        // Process each setting from cloud
        for (const [key, settingData] of Object.entries(cloudSettings)) {
          if (!preserveKeys.includes(key)) {
            try {
              if (key.startsWith("TM_use")) {
                // Handle IndexedDB settings
                let valueToStore = settingData.data;
                if (
                  typeof valueToStore === "string" &&
                  (valueToStore.startsWith("{") || valueToStore.startsWith("["))
                ) {
                  try {
                    valueToStore = JSON.parse(valueToStore);
                    logToConsole(
                      "info",
                      `Successfully parsed complex object for ${key}`
                    );
                  } catch (parseError) {
                    logToConsole(
                      "warning",
                      `Failed to parse ${key} as JSON, using as-is`,
                      parseError
                    );
                  }
                }
                await setIndexedDBKey(key, valueToStore);
              } else {
                // Handle localStorage settings
                let value = settingData.data;
                localStorage.setItem(key, value);
                logToConsole("info", `Updated localStorage setting: ${key}`);
              }
            } catch (error) {
              logToConsole("error", `Error applying setting ${key}:`, error);
            }
          }
        }

        localMetadata.settings.syncedAt = syncTimestamp;
        saveLocalMetadata();
        hasChanges = true;
      }
    }

    // Get all local chats
    const localChats = await getAllChatsFromIndexedDB();
    const localChatIds = new Set(localChats.map((chat) => chat.id));
    const cloudChatIds = new Set(Object.keys(cloudMetadata.chats));

    // Process cloud chats that don't exist locally or have changes
    for (const chatId of cloudChatIds) {
      const cloudChatMeta = cloudMetadata.chats[chatId];
      const localChatMeta = localMetadata.chats[chatId];

      // Skip if this is a cloud tombstone and we've already processed it
      if (cloudChatMeta.deleted === true) {
        if (
          localChatMeta?.deleted === true &&
          localChatMeta.deletedAt >= cloudChatMeta.deletedAt
        ) {
          continue;
        }

        // Delete local chat if it exists
        if (localChatIds.has(chatId)) {
          await deleteChatFromIndexedDB(chatId);
          hasChanges = true;
        }

        // Update local metadata with tombstone
        localMetadata.chats[chatId] = {
          deleted: true,
          deletedAt: cloudChatMeta.deletedAt,
          lastModified: cloudChatMeta.lastModified,
          syncedAt: syncTimestamp,
        };
        saveLocalMetadata();
        continue;
      }

      // Skip if we have a local tombstone that's newer than the cloud version
      if (localChatMeta?.deleted === true) {
        if (
          !cloudChatMeta.deleted ||
          localChatMeta.deletedAt > cloudChatMeta.lastModified
        ) {
          // Our deletion is newer than cloud's version, push our tombstone to cloud
          await deleteChatFromCloud(chatId);
          continue;
        }
      }

      // Download if:
      // 1. Chat doesn't exist locally
      // 2. Different hash
      // 3. Never synced
      // 4. Cloud changes not synced
      if (
        !localChatMeta ||
        cloudChatMeta.hash !== localChatMeta.hash ||
        !localChatMeta.syncedAt ||
        cloudChatMeta.lastModified > localChatMeta.syncedAt
      ) {
        const cloudChat = await downloadChatFromCloud(chatId);
        if (cloudChat) {
          await saveChatToIndexedDB(cloudChat);
          hasChanges = true;

          // Update local metadata
          if (!localMetadata.chats[chatId]) {
            localMetadata.chats[chatId] = {};
          }
          localMetadata.chats[chatId].lastModified = cloudChatMeta.lastModified;
          localMetadata.chats[chatId].syncedAt = syncTimestamp;
          localMetadata.chats[chatId].hash = cloudChatMeta.hash;
          saveLocalMetadata();
        }
      }
    }

    // Process local chats that don't exist in cloud
    for (const chatId of localChatIds) {
      if (!cloudChatIds.has(chatId)) {
        const localChatMeta = localMetadata.chats[chatId];

        // Skip if this is a new local chat (created after our last sync)
        if (
          !localChatMeta ||
          !localMetadata.lastSyncTime ||
          localChatMeta.lastModified > localMetadata.lastSyncTime
        ) {
          logToConsole(
            "info",
            `Skipping new local chat ${chatId} - will be uploaded in next sync`
          );
          continue;
        }

        // If this is an old chat that's missing from cloud, it was likely deleted on another device
        await deleteChatFromIndexedDB(chatId);
        hasChanges = true;

        // Add tombstone to local metadata
        localMetadata.chats[chatId] = {
          deleted: true,
          deletedAt: syncTimestamp,
          lastModified: syncTimestamp,
          syncedAt: syncTimestamp,
        };
        saveLocalMetadata();

        // Update cloud metadata with the tombstone
        if (!cloudMetadata.chats) cloudMetadata.chats = {};
        cloudMetadata.chats[chatId] = {
          deleted: true,
          deletedAt: syncTimestamp,
          lastModified: syncTimestamp,
          syncedAt: syncTimestamp,
        };
      }
    }

    if (hasChanges) {
      // Update sync times
      localMetadata.lastSyncTime = syncTimestamp;
      cloudMetadata.lastSyncTime = syncTimestamp;

      // Save final state
      await uploadToS3(
        "metadata.json",
        new TextEncoder().encode(JSON.stringify(cloudMetadata)),
        {
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
        }
      );
      saveLocalMetadata();
      logToConsole("success", "Sync from cloud completed with changes");
    } else {
      logToConsole("info", "No changes detected during sync from cloud");
    }

    operationState.lastError = null; // Clear any previous errors
    updateSyncStatus(); // Show success status
  } catch (error) {
    operationState.lastError = error;
    logToConsole("error", "Sync from cloud failed:", error);
    updateSyncStatus(); // Show error status
    throw error;
  } finally {
    operationState.isImporting = false;
    updateSyncStatus(); // Update final status

    // Check if another sync was requested while this one was running
    if (operationState.isPendingSync) {
      operationState.isPendingSync = false;
      queueOperation("pending-sync", syncFromCloud);
    }
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
  updateSyncStatus(); // Show in-progress status

  try {
    // Use a single timestamp for the entire sync operation
    const syncTimestamp = Date.now();

    // Reload local metadata to ensure we have latest changes
    await loadLocalMetadata();

    // Get current cloud metadata
    const cloudMetadata = await downloadCloudMetadata();
    let hasChanges = false;

    // Upload settings if they've changed
    if (localMetadata.settings.lastModified > localMetadata.settings.syncedAt) {
      await uploadSettingsToCloud();
      hasChanges = true;
    }

    // Get all local chats that need to be uploaded
    const chats = await getAllChatsFromIndexedDB();
    for (const chat of chats) {
      if (!chat.id) continue;

      const localChatMeta = localMetadata.chats[chat.id];
      const cloudChatMeta = cloudMetadata.chats[chat.id];

      // Skip if this chat has a cloud tombstone
      if (cloudChatMeta?.deleted === true) {
        // If our local version is newer, we might be restoring it
        if (
          !localChatMeta ||
          localChatMeta.lastModified <= cloudChatMeta.deletedAt
        ) {
          continue;
        }
      }

      // Upload if:
      // 1. No cloud metadata
      // 2. Different hash
      // 3. Never synced
      // 4. Local changes not synced
      if (
        !cloudChatMeta ||
        (localChatMeta && cloudChatMeta.hash !== localChatMeta.hash) ||
        !localChatMeta?.syncedAt ||
        localChatMeta.lastModified > localChatMeta.syncedAt
      ) {
        await uploadChatToCloud(chat.id, cloudMetadata, syncTimestamp);
        hasChanges = true;
      }
    }

    // Process local deletions
    for (const [chatId, localChatMeta] of Object.entries(localMetadata.chats)) {
      if (
        localChatMeta.deleted === true &&
        (!cloudMetadata.chats[chatId]?.deleted ||
          (cloudMetadata.chats[chatId]?.deleted === true &&
            localChatMeta.tombstoneVersion >
              (cloudMetadata.chats[chatId]?.tombstoneVersion || 0))) &&
        // Only delete if not synced or if tombstone version is newer
        (localChatMeta.syncedAt === 0 ||
          (cloudMetadata.chats[chatId]?.tombstoneVersion || 0) <
            localChatMeta.tombstoneVersion)
      ) {
        await deleteChatFromCloud(chatId);
        hasChanges = true;

        // Update local metadata to mark as synced and ensure tombstone version is set
        localMetadata.chats[chatId] = {
          ...localMetadata.chats[chatId],
          syncedAt: syncTimestamp,
          tombstoneVersion: Math.max(
            localChatMeta.tombstoneVersion || 1,
            (cloudMetadata.chats[chatId]?.tombstoneVersion || 0) + 1
          ),
        };
        await saveLocalMetadata();
      }
    }

    if (hasChanges) {
      localMetadata.lastSyncTime = syncTimestamp;
      cloudMetadata.lastSyncTime = syncTimestamp;
      await uploadToS3(
        "metadata.json",
        new TextEncoder().encode(JSON.stringify(cloudMetadata)),
        {
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
        }
      );
      saveLocalMetadata();
      logToConsole("success", "Sync to cloud completed with changes");
    } else {
      logToConsole("info", "No changes detected during sync to cloud");
    }

    operationState.lastError = null; // Clear any previous errors
    updateSyncStatus(); // Show success status
  } catch (error) {
    operationState.lastError = error;
    logToConsole("error", "Sync to cloud failed:", error);
    updateSyncStatus(); // Show error status
    throw error;
  } finally {
    operationState.isExporting = false;
    updateSyncStatus(); // Update final status
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
    // Immediately update sync status to show out-of-sync
    throttledCheckSyncStatus();
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
      // Skip if in disabled mode
      if (config.syncMode === "disabled") {
        logToConsole(
          "info",
          "Cloud operations disabled - skipping visibility change handling"
        );
        return;
      }

      // For sync mode, queue a sync operation
      if (config.syncMode === "sync") {
        queueOperation("visibility-sync", syncFromCloud);
      }
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

  const currentMode = config.syncMode;
  const button = document.createElement("button");
  button.id = "cloud-sync-button";
  button.className = `min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative ${
    currentMode === "disabled" ? "opacity-50" : ""
  }`;

  button.innerHTML = `
    <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
      <div class="relative">
        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
          ${
            currentMode === "disabled"
              ? `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 4.5A4.5 4.5 0 0114.5 9M9 13.5A4.5 4.5 0 013.5 9"/>
                  <path d="M2 2L16 16"/>
                 </g>`
              : currentMode === "sync"
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
        <div id="sync-status-dot" style="display: ${
          currentMode === "disabled" ? "none" : "block"
        }" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-zinc-900"></div>
      </div>
      <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none ${
        currentMode === "disabled" ? "text-gray-400 dark:text-gray-500" : ""
      }">${
    currentMode === "disabled"
      ? "Sync"
      : currentMode === "sync"
      ? "Sync"
      : "Backup"
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
}

// Add updateSyncStatusDot function to update the status indicator
function updateSyncStatusDot(status = "success") {
  const dot = document.getElementById("sync-status-dot");
  if (!dot) return;

  // First handle visibility based on mode
  if (config.syncMode === "disabled") {
    dot.style.display = "none";
    return;
  } else {
    dot.style.display = "block";
  }

  // Remove existing classes
  dot.className =
    "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-zinc-900";

  // Add status-specific classes
  switch (status) {
    case "success":
      dot.classList.add("bg-green-500");
      break;
    case "in-progress":
      dot.classList.add("bg-orange-500");
      break;
    case "error":
      dot.classList.add("bg-red-500");
      break;
    default:
      dot.classList.add("bg-gray-500");
  }
}

// Update the updateSyncStatus function to include dot status
function updateSyncStatus() {
  setTimeout(() => {
    // Update sync status dot based on current state and mode
    if (config.syncMode === "disabled") {
      updateSyncStatusDot("hidden");
    } else if (operationState.isImporting || operationState.isExporting) {
      updateSyncStatusDot("in-progress");
    } else if (operationState.lastError) {
      updateSyncStatusDot("error");
    } else {
      updateSyncStatusDot("success");
    }

    const syncStatus = document.getElementById("sync-status");
    if (!syncStatus) return;

    // Update sync button text and status
    if (config.syncMode === "disabled") {
      syncStatus.textContent = "Sync disabled";
      syncStatus.classList.remove(
        "text-green-500",
        "text-red-500",
        "text-yellow-500"
      );
      syncStatus.classList.add("text-gray-500");
    } else if (operationState.isImporting) {
      syncStatus.textContent = "Syncing from cloud...";
      syncStatus.classList.remove(
        "text-green-500",
        "text-red-500",
        "text-gray-500"
      );
      syncStatus.classList.add("text-yellow-500");
    } else if (operationState.isExporting) {
      syncStatus.textContent = "Syncing to cloud...";
      syncStatus.classList.remove(
        "text-green-500",
        "text-red-500",
        "text-gray-500"
      );
      syncStatus.classList.add("text-yellow-500");
    } else if (operationState.lastError) {
      syncStatus.textContent = "Sync error";
      syncStatus.classList.remove(
        "text-green-500",
        "text-yellow-500",
        "text-gray-500"
      );
      syncStatus.classList.add("text-red-500");
    } else {
      const lastSync = getLastSyncTime();
      syncStatus.textContent = lastSync
        ? `Last synced ${lastSync}`
        : "Ready to sync";
      syncStatus.classList.remove(
        "text-red-500",
        "text-yellow-500",
        "text-gray-500"
      );
      syncStatus.classList.add("text-green-500");
    }
  }, 100);
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
              <label class="inline-flex items-center">
                <input type="radio" name="sync-mode" value="disabled" class="form-radio text-blue-600" ${
                  config.syncMode === "disabled" ? "checked" : ""
                }>
                <span class="ml-2">Disabled</span>
                <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="No automatic operations. Manual sync and snapshot operations still work.">ⓘ</button>
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

  // Reset state when switching from disabled mode
  if (config.syncMode === "disabled" && newConfig.syncMode !== "disabled") {
    // Reset operation state
    operationState = {
      isImporting: false,
      isExporting: false,
      isPendingSync: false,
      operationQueue: [],
      isProcessingQueue: false,
      lastSyncStatus: null,
      isCheckingChanges: false,
      lastError: null,
    };

    // Reset backup state
    backupState = {
      isBackupInProgress: false,
      lastDailyBackup: null,
      lastManualSnapshot: null,
      backupInterval: null,
      isBackupIntervalRunning: false,
    };

    // Reset file sizes
    cloudFileSize = 0;
    localFileSize = 0;
    isLocalDataModified = false;
    pendingSettingsChanges = false;

    // Clear all intervals
    clearAllIntervals();

    logToConsole(
      "info",
      "State reset completed, proceeding with initialization"
    );
  }

  // Update config
  const oldMode = config.syncMode;
  config = { ...config, ...newConfig };
  saveConfiguration();

  // Update button text and dot visibility to match new mode
  const buttonText = document.querySelector(
    "#cloud-sync-button span:last-child"
  );
  if (buttonText) {
    buttonText.innerText =
      config.syncMode === "disabled"
        ? "Cloud"
        : config.syncMode === "sync"
        ? "Sync"
        : "Backup";
  }

  // Update sync status dot for new mode
  updateSyncStatus();

  // If switching from disabled mode to an active mode, perform full initialization
  if (oldMode === "disabled" && newConfig.syncMode !== "disabled") {
    try {
      await performFullInitialization();
      logToConsole(
        "success",
        "Full initialization completed after mode switch"
      );
    } catch (error) {
      logToConsole(
        "error",
        "Error during initialization after mode switch:",
        error
      );
      alert(
        "Error initializing cloud operations. Please check the console for details."
      );
    }
  } else if (isAwsConfigured()) {
    // Otherwise just restart interval with new settings
    startSyncInterval();

    // If switching to sync mode, perform initial sync
    if (config.syncMode === "sync" && oldMode !== "sync") {
      queueOperation("initial-sync", performInitialSync);
    }
  }

  closeModal();
  logToConsole("success", "Settings saved");

  // Force re-insert of sync button to ensure text is updated
  insertSyncButton();

  // Check sync status after settings change
  throttledCheckSyncStatus();
}

// Get formatted last sync time
function getLastSyncTime() {
  if (!localMetadata.lastSyncTime) {
    return "Never";
  }

  const lastSync = new Date(localMetadata.lastSyncTime);
  const now = new Date();
  const diff = now - lastSync;

  // Format relative time for recent syncs
  if (diff < 60000) {
    return "Just now";
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  // For older syncs, show the full local date and time
  return lastSync.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
  try {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(backup.data);

    // Find the JSON file in the ZIP
    const jsonFile = Object.keys(zip.files).find((f) => f.endsWith(".json"));
    if (!jsonFile) {
      throw new Error("No JSON file found in backup");
    }

    // Extract and decrypt the content
    const fileContent = await zip.file(jsonFile).async("uint8array");
    const decryptedContent = await decryptData(fileContent);

    // Download the decrypted content directly
    const blob = new Blob([JSON.stringify(decryptedContent, null, 2)], {
      type: "application/json",
    });
    downloadFile(key.replace(".zip", ".json"), blob);
  } catch (error) {
    logToConsole("error", "Failed to process zip content:", error);
    throw error;
  }
}

async function handleRegularFileDownload(backup, key) {
  try {
    // Decrypt the content
    const decryptedContent = await decryptData(backup.data);

    // For JSON files, ensure proper formatting for download
    if (key.endsWith(".json")) {
      const blob = new Blob([JSON.stringify(decryptedContent, null, 2)], {
        type: "application/json",
      });
      downloadFile(key, blob);
    } else {
      downloadFile(key, decryptedContent);
    }
  } catch (error) {
    logToConsole("error", "Processing failed, downloading raw data:", error);
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

  // Initialize metadata for all IndexedDB items
  const db = await openIndexedDB();
  const transaction = db.transaction("keyval", "readonly");
  const store = transaction.objectStore("keyval");
  const keys = await new Promise((resolve, reject) => {
    const request = store.getAllKeys();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  for (const key of keys) {
    if (!shouldExcludeSetting(key)) {
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
  }

  // Initialize metadata for all localStorage items
  for (const key of Object.keys(localStorage)) {
    if (!shouldExcludeSetting(key)) {
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
  }

  // Set up localStorage change listener
  window.addEventListener("storage", (e) => {
    if (!e.key || shouldExcludeSetting(e.key)) {
      return;
    }
    queueOperation("settings-sync", () =>
      handleSettingChange(e.key, e.newValue, "localstorage")
    );
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

// Modified checkIndexedDBChanges to batch changes
async function checkIndexedDBChanges() {
  let db = null;
  try {
    db = await getPersistentDB();
    const changedKeys = new Set();

    // Get all keys
    const transaction = db.transaction("keyval", "readonly");
    const store = transaction.objectStore("keyval");
    const keys = await new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    // Process each key sequentially with its own transaction
    for (const key of keys) {
      if (!shouldExcludeSetting(key)) {
        try {
          const value = await new Promise((resolve, reject) => {
            const transaction = db.transaction("keyval", "readonly");
            const store = transaction.objectStore("keyval");
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });

          if (value !== undefined) {
            const hash = await generateContentHash(value);
            const metadata = localMetadata.settings.items[key];

            // Only consider it changed if hash is different
            if (!metadata || metadata.hash !== hash) {
              changedKeys.add(key);
            }
          }
        } catch (error) {
          logToConsole("error", `Error checking IndexedDB key ${key}:`, error);
          continue;
        }
      }
    }

    // Queue a single operation for all changed keys
    if (changedKeys.size > 0) {
      const firstKey = Array.from(changedKeys)[0];
      queueOperation("settings-sync", async () =>
        handleSettingChange(
          firstKey,
          await getIndexedDBValue(firstKey),
          "indexeddb"
        )
      );
    }
  } catch (error) {
    logToConsole("error", "Error checking IndexedDB changes:", error);
    persistentDB = null;
  }
}

// Handle setting change
async function handleSettingChange(key, value, source) {
  if (shouldExcludeSetting(key)) return;

  // Generate hash for new value
  const newHash = await generateContentHash(value);
  const metadata = localMetadata.settings.items[key];

  // Only proceed if the hash has actually changed
  if (!metadata || metadata.hash !== newHash) {
    // Update metadata with new hash
    localMetadata.settings.items[key] = {
      hash: newHash,
      lastModified: Date.now(),
      lastSynced: 0,
      source: source,
    };

    // Mark settings as changed only if hash changed
    pendingSettingsChanges = true;
    localMetadata.settings.lastModified = Date.now();
    await saveLocalMetadata();

    // Immediately update sync status to show out-of-sync
    throttledCheckSyncStatus();

    logToConsole(
      "info",
      `Setting change detected from ${source}: ${key} (hash changed)`
    );
  } else {
    logToConsole(
      "info",
      `Setting change ignored from ${source}: ${key} (hash unchanged)`
    );
  }
}

async function cleanupMetadataVersions() {
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
      // Get all non-current versions of metadata.json only
      allVersions.push(
        ...versions.Versions.filter(
          (v) => !v.IsLatest && v.Key === "metadata.json"
        )
      );
    }

    if (versions.DeleteMarkers) {
      // Get delete markers for metadata.json only
      allVersions.push(
        ...versions.DeleteMarkers.filter((v) => v.Key === "metadata.json")
      );
    }

    // Sort by date (newest first)
    allVersions.sort((a, b) => b.LastModified - a.LastModified);

    // Keep the most recent version and delete others
    const versionsToDelete = allVersions.slice(1);

    if (versionsToDelete.length > 0) {
      const deleteParams = {
        Bucket: config.bucketName,
        Delete: {
          Objects: versionsToDelete.map((version) => ({
            Key: version.Key,
            VersionId: version.VersionId,
          })),
          Quiet: true,
        },
      };

      await s3.deleteObjects(deleteParams).promise();
      logToConsole(
        "success",
        `Deleted ${versionsToDelete.length} old metadata versions`
      );
    }

    logToConsole("success", "Metadata version cleanup completed");
  } catch (error) {
    logToConsole("error", "Error cleaning up metadata versions:", error);
    throw error;
  }
}

async function deleteChatFromCloud(chatId) {
  logToConsole("cleanup", `Deleting chat ${chatId} from cloud`);

  try {
    const s3 = initializeS3Client();

    // First, ensure we have the latest cloud metadata
    const cloudMetadata = await downloadCloudMetadata();

    // Delete chat file from S3
    const deleteParams = {
      Bucket: config.bucketName,
      Key: `chats/${chatId}.json`,
    };

    try {
      await s3.deleteObject(deleteParams).promise();
      logToConsole(
        "success",
        `Successfully deleted from S3: chats/${chatId}.json`
      );
    } catch (error) {
      if (error.code !== "NoSuchKey") {
        throw error;
      }
      logToConsole("info", `Chat file ${chatId} already deleted from S3`);
    }

    // Create or update the tombstone entry in cloud metadata
    if (!cloudMetadata.chats) {
      cloudMetadata.chats = {};
    }

    // Create a tombstone entry with complete information
    cloudMetadata.chats[chatId] = {
      deleted: true,
      deletedAt: Date.now(),
      lastModified: Date.now(),
      syncedAt: Date.now(),
      tombstoneVersion:
        (cloudMetadata.chats[chatId]?.tombstoneVersion || 0) + 1,
    };

    // Upload updated metadata to cloud
    await uploadToS3(
      "metadata.json",
      new TextEncoder().encode(JSON.stringify(cloudMetadata)),
      {
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      }
    );

    logToConsole("success", `Successfully deleted chat ${chatId} from cloud`);
    return true;
  } catch (error) {
    logToConsole("error", `Error deleting chat ${chatId} from cloud`, error);
    throw error;
  }
}

async function downloadSettingsFromCloud() {
  logToConsole("download", "Downloading settings.json from cloud");

  try {
    const s3 = initializeS3Client();

    // Download settings file
    const params = {
      Bucket: config.bucketName,
      Key: "settings.json",
    };

    try {
      const data = await s3.getObject(params).promise();
      const encryptedContent = new Uint8Array(data.Body);
      const settingsData = await decryptData(encryptedContent);

      return settingsData;
    } catch (error) {
      if (error.code === "NoSuchKey") {
        logToConsole(
          "info",
          "No settings.json found in cloud, creating it now"
        );
        // Create it now by uploading current settings
        await uploadSettingsToCloud();
        return {};
      }
      throw error;
    }
  } catch (error) {
    logToConsole("error", "Error downloading settings", error);
    throw error;
  }
}

async function uploadSettingsToCloud() {
  try {
    const s3 = initializeS3Client();
    const settingsData = {};
    const now = Date.now();

    // Get all localStorage items
    for (const key of Object.keys(localStorage)) {
      if (!shouldExcludeSetting(key)) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          settingsData[key] = {
            data: value,
            source: "localStorage",
            lastModified: now,
          };
        }
      }
    }

    // Get all IndexedDB items
    const db = await openIndexedDB();
    const transaction = db.transaction("keyval", "readonly");
    const store = transaction.objectStore("keyval");
    const keys = await new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    for (const key of keys) {
      if (!shouldExcludeSetting(key)) {
        try {
          const value = await getIndexedDBKey(key);
          if (value !== undefined) {
            try {
              settingsData[key] = {
                data: typeof value === "string" ? value : JSON.stringify(value),
                source: "indexeddb",
                lastModified: now,
              };
            } catch (serializeError) {
              logToConsole(
                "error",
                `Failed to serialize ${key}, storing as string`,
                serializeError
              );
              settingsData[key] = {
                data: String(value),
                source: "indexeddb",
                lastModified: now,
              };
            }
          }
        } catch (error) {
          logToConsole("error", `Error reading IndexedDB key ${key}`, error);
        }
      }
    }

    db.close();

    // Check if we have any settings to upload
    if (Object.keys(settingsData).length === 0) {
      logToConsole("info", "No settings to upload, skipping sync");
      return true;
    }

    // Encrypt and upload settings
    const encryptedData = await encryptData(settingsData);
    await uploadToS3("settings.json", encryptedData, {
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    });

    logToConsole("success", "Uploaded settings to cloud", {
      settingsCount: Object.keys(settingsData).length,
    });

    // Update local metadata
    localMetadata.settings.syncedAt = now;
    saveLocalMetadata();

    // Update cloud metadata
    const cloudMetadata = await downloadCloudMetadata();
    cloudMetadata.settings = {
      lastModified: now,
      syncedAt: now,
    };
    cloudMetadata.lastSyncTime = now; // Update global lastSyncTime

    await uploadToS3(
      "metadata.json",
      new TextEncoder().encode(JSON.stringify(cloudMetadata)),
      {
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      }
    );

    return true;
  } catch (error) {
    logToConsole("error", "Error uploading settings", error);
    throw error;
  }
}

async function downloadCloudMetadata() {
  try {
    const s3 = initializeS3Client();

    // Download metadata file
    const params = {
      Bucket: config.bucketName,
      Key: "metadata.json",
    };

    try {
      const data = await s3.getObject(params).promise();
      const content = data.Body;

      // Parse metadata directly without decryption
      const metadata = JSON.parse(
        typeof content === "string"
          ? content
          : new TextDecoder().decode(content)
      );

      logToConsole("success", "Downloaded cloud metadata", {
        chats: Object.keys(metadata.chats || {}).length,
        lastSyncTime: new Date(metadata.lastSyncTime).toLocaleString(),
        hasSettings: !!metadata.settings,
      });
      return metadata;
    } catch (error) {
      if (error.code === "NoSuchKey") {
        logToConsole(
          "info",
          "No cloud metadata found, creating initial metadata"
        );
        // Create initial metadata
        const initialMetadata = {
          version: "1.0",
          lastSyncTime: Date.now(),
          chats: {},
          settings: {
            lastModified: Date.now(),
            syncedAt: Date.now(),
          },
        };

        // Upload initial metadata without encryption
        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(initialMetadata)),
          {
            ContentType: "application/json",
            ServerSideEncryption: "AES256",
          }
        );

        return initialMetadata;
      }
      throw error;
    }
  } catch (error) {
    logToConsole("error", "Error downloading cloud metadata", error);
    throw error;
  }
}

async function downloadChatFromCloud(chatId) {
  logToConsole("download", `Downloading chat ${chatId} from cloud`);

  try {
    const s3 = initializeS3Client();

    // Download chat file
    const params = {
      Bucket: config.bucketName,
      Key: `chats/${chatId}.json`,
    };

    try {
      const data = await s3.getObject(params).promise();
      const encryptedContent = new Uint8Array(data.Body);
      const chatData = await decryptData(encryptedContent);

      // Ensure the chat has an ID that matches its key
      if (!chatData.id) {
        chatData.id = chatId;
      } else if (chatData.id !== chatId) {
        logToConsole(
          "warning",
          `Chat ID mismatch: ${chatData.id} !== ${chatId}, using key as ID`
        );
        chatData.id = chatId;
      }

      logToConsole("success", `Downloaded chat ${chatId} from cloud`);
      return chatData;
    } catch (error) {
      if (error.code === "NoSuchKey") {
        logToConsole("warning", `Chat ${chatId} not found in cloud`);

        // Get current cloud metadata to mark this chat as deleted
        const cloudMetadata = await downloadCloudMetadata();
        if (
          cloudMetadata.chats &&
          cloudMetadata.chats[chatId] &&
          !cloudMetadata.chats[chatId].deleted
        ) {
          // Create a tombstone entry in cloud metadata
          cloudMetadata.chats[chatId] = {
            deleted: true,
            deletedAt: Date.now(),
            lastModified: Date.now(),
            syncedAt: Date.now(),
            tombstoneVersion:
              (cloudMetadata.chats[chatId]?.tombstoneVersion || 0) + 1,
            deletionSource: "file-missing",
          };

          // Upload updated metadata to cloud
          await uploadToS3(
            "metadata.json",
            new TextEncoder().encode(JSON.stringify(cloudMetadata)),
            {
              ContentType: "application/json",
              ServerSideEncryption: "AES256",
            }
          );

          logToConsole(
            "info",
            `Created tombstone for missing chat ${chatId} in cloud metadata`
          );
        }
        return null;
      }
      throw error;
    }
  } catch (error) {
    logToConsole("error", `Error downloading chat ${chatId}`, error);
    throw error;
  }
}

// Upload a chat to cloud
async function uploadChatToCloud(
  chatId,
  existingCloudMetadata = null,
  syncTimestamp = null
) {
  logToConsole("upload", `Uploading chat ${chatId} to cloud`);

  try {
    const s3 = initializeS3Client();

    // Use existing cloud metadata if provided and recent, otherwise download it
    let cloudMetadata;
    if (
      existingCloudMetadata &&
      Date.now() - existingCloudMetadata.lastSyncTime < 30000
    ) {
      // Only use if less than 30 seconds old
      cloudMetadata = existingCloudMetadata;
      logToConsole("info", "Using existing cloud metadata");
    } else {
      cloudMetadata = await downloadCloudMetadata();
      logToConsole("info", "Downloaded fresh cloud metadata");
    }

    if (
      cloudMetadata.chats &&
      cloudMetadata.chats[chatId] &&
      cloudMetadata.chats[chatId].deleted === true
    ) {
      // Check if our local version is newer (might be a restoration)
      const localChatInfo = localMetadata.chats[chatId];
      const cloudDeletion = cloudMetadata.chats[chatId];

      if (!localChatInfo || localChatInfo.deleted === true) {
        // This chat is also deleted locally or not in our metadata, respect the cloud tombstone
        logToConsole(
          "info",
          `Skipping upload of chat ${chatId} as it has a cloud tombstone`
        );
        return false;
      }

      // If the local chat was modified after the cloud deletion, we might be restoring it
      if (localChatInfo.lastModified > cloudDeletion.deletedAt) {
        logToConsole(
          "info",
          `Local chat ${chatId} appears to be newer than cloud tombstone, proceeding with upload as restoration`
        );
        // Continue with upload - will overwrite the tombstone
      } else {
        // Local chat is older than cloud deletion, respect the tombstone
        logToConsole(
          "info",
          `Local chat ${chatId} is older than cloud tombstone, will be deleted locally instead`
        );
        await deleteChatFromIndexedDB(chatId);
        return false;
      }
    }

    // Get chat data
    const chatData = await getChatFromIndexedDB(chatId);
    if (!chatData) {
      logToConsole(
        "warning",
        `Chat ${chatId} not found in IndexedDB, skipping upload`
      );
      return false;
    }

    // Ensure chat has proper ID
    if (!chatData.id) {
      chatData.id = chatId;
    } else if (chatData.id.startsWith("CHAT_")) {
      chatData.id = chatData.id.slice(5);
    }

    // Double check ID consistency
    if (chatData.id !== chatId) {
      logToConsole(
        "warning",
        `Chat ID mismatch: ${chatData.id} !== ${chatId}, fixing before upload`
      );
      chatData.id = chatId;
    }

    // Generate a new hash for the chat
    const newHash = await generateContentHash(JSON.stringify(chatData));

    // Check if the chat already exists in cloud metadata and has the same hash
    // This prevents unnecessary uploads of unchanged chats
    if (
      cloudMetadata.chats &&
      cloudMetadata.chats[chatId] &&
      cloudMetadata.chats[chatId].hash === newHash &&
      !cloudMetadata.chats[chatId].deleted
    ) {
      logToConsole("info", `Chat ${chatId} hasn't changed, skipping upload`);

      // Still update local metadata to mark it as synced
      if (localMetadata.chats[chatId]) {
        localMetadata.chats[chatId].syncedAt = Date.now();
        localMetadata.chats[chatId].hash = newHash;
        saveLocalMetadata();
      }

      return true;
    }

    // Encrypt chat data
    const encryptedData = await encryptData(chatData);

    // Upload to S3
    const params = {
      Bucket: config.bucketName,
      Key: `chats/${chatId}.json`,
      Body: encryptedData,
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    };

    await s3.putObject(params).promise();

    logToConsole("success", `Uploaded chat ${chatId} to cloud`, {
      messageCount:
        chatData.messagesArray?.length || chatData.messages?.length || 0,
      title: chatData.chatTitle || "(Untitled)",
      size: encryptedData.length,
    });

    // Update local metadata
    if (!localMetadata.chats[chatId]) {
      localMetadata.chats[chatId] = {};
    }

    // Use provided sync timestamp or generate new one
    const now = syncTimestamp || Date.now();
    const lastModified = chatData.updatedAt || now;

    localMetadata.chats[chatId].lastModified = lastModified;
    localMetadata.chats[chatId].syncedAt = now;
    localMetadata.chats[chatId].hash = newHash;

    // Clear any deleted flag if it existed (this is a restoration)
    if (localMetadata.chats[chatId].deleted) {
      delete localMetadata.chats[chatId].deleted;
      delete localMetadata.chats[chatId].deletedAt;
      delete localMetadata.chats[chatId].tombstoneVersion;
      logToConsole("info", `Restored previously deleted chat ${chatId}`);
    }

    saveLocalMetadata();

    // Update cloud metadata
    if (!cloudMetadata.chats) cloudMetadata.chats = {};

    // Remove any tombstone and update metadata
    cloudMetadata.chats[chatId] = {
      lastModified: lastModified,
      syncedAt: now,
      hash: newHash,
    };

    // Update lastSyncTime to prevent unnecessary re-downloads
    cloudMetadata.lastSyncTime = now;

    await uploadToS3(
      "metadata.json",
      new TextEncoder().encode(JSON.stringify(cloudMetadata)),
      {
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      }
    );

    return true;
  } catch (error) {
    logToConsole("error", `Error uploading chat ${chatId}`, error);

    // Update metadata to mark this chat for retry later
    if (localMetadata.chats[chatId]) {
      localMetadata.chats[chatId].uploadError = error.message;
      localMetadata.chats[chatId].uploadErrorTime = Date.now();
      localMetadata.chats[chatId].uploadRetryCount =
        (localMetadata.chats[chatId].uploadRetryCount || 0) + 1;
      saveLocalMetadata();
    }

    throw error;
  }
}

// Add new sync status checking functions
async function checkSyncStatus() {
  // If sync is disabled, no status needed
  if (config.syncMode === "disabled") {
    return "disabled";
  }

  // If operations in progress -> syncing
  if (
    operationState.isImporting ||
    operationState.isExporting ||
    operationState.isProcessingQueue
  ) {
    return "syncing";
  }

  try {
    // Check for local changes (using only local metadata)
    const hasLocalChanges = Object.values(localMetadata.chats).some(
      (chat) => !chat.deleted && chat.lastModified > chat.syncedAt
    );

    // Check for pending settings changes
    const hasSettingChanges =
      pendingSettingsChanges ||
      localMetadata.settings.lastModified > localMetadata.settings.syncedAt;

    // Check for errors
    if (operationState.lastError) {
      return "out-of-sync";
    }

    // If any changes detected -> out of sync
    if (hasLocalChanges || hasSettingChanges) {
      return "out-of-sync";
    }

    // Everything is in sync
    return "in-sync";
  } catch (error) {
    logToConsole("error", "Error checking sync status:", error);
    return "out-of-sync";
  }
}

// Add throttled version to prevent too frequent updates
const throttledCheckSyncStatus = throttle(async () => {
  const status = await checkSyncStatus();
  updateSyncStatusDot(status);
}, 5000); // Throttle to every 5 seconds

// Update the status dot function to handle new states
function updateSyncStatusDot(status) {
  const dot = document.getElementById("sync-status-dot");
  if (!dot) return;

  // Handle visibility
  if (status === "disabled") {
    dot.style.display = "none";
    return;
  } else {
    dot.style.display = "block";
  }

  // Remove existing classes
  dot.className =
    "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-zinc-900";

  // Add status-specific classes
  switch (status) {
    case "in-sync":
      dot.classList.add("bg-green-500");
      break;
    case "syncing":
      dot.classList.add("bg-orange-500");
      break;
    case "out-of-sync":
      dot.classList.add("bg-red-500");
      break;
    default:
      dot.classList.add("bg-gray-500");
  }
}

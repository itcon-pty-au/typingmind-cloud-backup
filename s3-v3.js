// TypingMind Cloud Sync & Backup v2.0.0
// Combines features from s3.js and YATSE for comprehensive sync and backup
if (window.typingMindCloudSync) {
  console.log("TypingMind Cloud Sync script already loaded, skipping");
} else {
  window.typingMindCloudSync = true;
  const CONSOLE_TAG = "[Cloud Sync]";
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
    "last-daily-backup",
    "TM_useLastVerifiedToken",
    "TM_useStateUpdateHistory",
    "TM_useGlobalChatLoading",
    "TM_crossTabLastSynced",
    "TM_useLastOpenedChatID",
    "INSTANCE_ID",
    "referrer",
    "setItem",
  ];
  function getUserDefinedExclusions() {
    const exclusions = localStorage.getItem("sync-exclusions");
    return exclusions
      ? exclusions
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item)
      : [];
  }
  function shouldExcludeSetting(key) {
    const userExclusions = getUserDefinedExclusions();
    const isExcluded =
      EXCLUDED_SETTINGS.includes(key) ||
      userExclusions.includes(key) ||
      key.startsWith("CHAT_") ||
      key.startsWith("last-seen-") ||
      key.startsWith("sync-") ||
      !isNaN(key);
    if (isExcluded && userExclusions.includes(key)) {
      logToConsole(
        "debug",
        `Setting excluded by user-defined exclusions: ${key}`
      );
    }
    return isExcluded;
  }
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
  let isConsoleLoggingEnabled =
    new URLSearchParams(window.location.search).get("log") === "true";
  let localMetadata = {
    chats: {},
    settings: {
      items: {},
      lastModified: 0,
      syncedAt: 0,
    },
    lastSyncTime: 0,
  };
  let persistentDB = null;
  let dbConnectionPromise = null;
  let dbConnectionRetries = 0;
  const MAX_DB_RETRIES = 3;
  const DB_RETRY_DELAY = 1000;
  const DB_CONNECTION_TIMEOUT = 10000;
  let dbHeartbeatInterval = null;
  let operationState = {
    isImporting: false,
    isExporting: false,
    isPendingSync: false,
    operationQueue: [],
    isProcessingQueue: false,
    lastSyncStatus: null,
    isCheckingChanges: false,
    lastError: null,
    operationStartTime: null,
    queueProcessingPromise: null,
    completedOperations: new Set(),
    operationTimeouts: new Map(),
    currentlyExecutingOperation: null,
  };
  let backupState = {
    isBackupInProgress: false,
    lastDailyBackup: null,
    lastManualSnapshot: null,
    backupInterval: null,
    isBackupIntervalRunning: false,
  };
  let lastSeenUpdates = {};
  let cloudFileSize = 0;
  let localFileSize = 0;
  let isLocalDataModified = false;
  let activeIntervals = {
    sync: null,
    backup: null,
    changeCheck: null,
  };
  function clearAllIntervals() {
    if (activeIntervals.sync) {
      clearInterval(activeIntervals.sync);
      activeIntervals.sync = null;
    }
    if (activeIntervals.backup) {
      clearInterval(activeIntervals.backup);
      activeIntervals.backup = null;
    }
    if (activeIntervals.changeCheck) {
      clearInterval(activeIntervals.changeCheck);
      activeIntervals.changeCheck = null;
    }
  }
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
    progress: "📊",
    time: "⏰",
    wait: "⏳",
    pause: "⏸️",
    resume: "▶️",
    visibility: "👁️",
    active: "📱",
    calendar: "📅",
    tag: "🏷️",
    stop: "🛑",
    skip: "⏩",
  };
  function logToConsole(type, message, data = null) {
    if (!isConsoleLoggingEnabled) return;
    const timestamp = new Date().toLocaleString();
    const icons = {
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
      progress: "📊",
      time: "⏰",
      wait: "⏳",
      pause: "⏸️",
      resume: "▶️",
      visibility: "👁️",
      active: "📱",
      calendar: "📅",
      tag: "🏷️",
      stop: "🛑",
      skip: "⏩",
    };
    const icon = icons[type] || "ℹ️";
    const logMessage = `${icon} [${timestamp}] ${message}`;
    if (/Mobi|Android/i.test(navigator.userAgent)) {
      const container =
        document.getElementById("mobile-log-container") ||
        createMobileLogContainer();
      const logsContent = container.querySelector("#logs-content");
      if (logsContent) {
        const logEntry = document.createElement("div");
        logEntry.className = "text-sm mb-1 break-words";
        logEntry.textContent = logMessage;
        if (data) {
          const dataEntry = document.createElement("div");
          dataEntry.className = "text-xs text-gray-500 ml-4 mb-2";
          dataEntry.textContent = JSON.stringify(data, null, 2);
          logEntry.appendChild(dataEntry);
        }
        const searchContainer = container.querySelector(
          ".flex.items-center.gap-2"
        );
        const searchInput = searchContainer
          ? searchContainer.querySelector("input")
          : null;
        const isSearchActive =
          searchInput && !searchInput.classList.contains("hidden");
        if (isSearchActive) {
          const isReversed =
            container.getAttribute("data-log-reversed") === "true";
          if (isReversed) {
            container.originalLogEntries.unshift(logEntry);
          } else {
            container.originalLogEntries.push(logEntry);
          }
          const query = searchInput.value.trim();
          if (query && logMessage.toLowerCase().includes(query.toLowerCase())) {
            const isReversed =
              container.getAttribute("data-log-reversed") === "true";
            if (isReversed) {
              logsContent.insertBefore(
                logEntry.cloneNode(true),
                logsContent.firstChild
              );
            } else {
              logsContent.appendChild(logEntry.cloneNode(true));
            }
          }
        } else {
          const isReversed =
            container.getAttribute("data-log-reversed") === "true";
          if (isReversed) {
            logsContent.insertBefore(logEntry, logsContent.firstChild);
          } else {
            logsContent.appendChild(logEntry);
          }
        }
      }
    }
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
  function createMobileLogContainer() {
    const container = document.createElement("div");
    container.id = "mobile-log-container";
    container.className =
      "fixed bottom-0 left-0 right-0 bg-black text-white z-[9999]";
    container.setAttribute("data-log-reversed", "false");
    container.style.cssText = `
          height: 200px;
          max-height: 50vh;
          display: ${isConsoleLoggingEnabled ? "block" : "none"};
          resize: vertical;
          overflow-y: auto;
      `;
    const minimizedTag = document.createElement("div");
    minimizedTag.id = "minimized-log-tag";
    minimizedTag.className =
      "fixed bottom-0 right-0 bg-black text-white px-3 py-1 m-2 rounded cursor-pointer z-[9999] hidden";
    minimizedTag.innerHTML = "📋 Show Logs";
    let longPressTimer = null;
    let isDraggingTag = false;
    let tagStartX = 0;
    let tagStartY = 0;
    let tagOffsetX = 0;
    let tagOffsetY = 0;
    const savedPosition = localStorage.getItem("mobile-log-tag-position");
    if (savedPosition) {
      const pos = JSON.parse(savedPosition);
      minimizedTag.style.right = "auto";
      minimizedTag.style.bottom = "auto";
      minimizedTag.style.left = pos.x + "px";
      minimizedTag.style.top = pos.y + "px";
    }
    function startLongPress(e) {
      longPressTimer = setTimeout(() => {
        isDraggingTag = true;
        minimizedTag.style.opacity = "0.7";
        const rect = minimizedTag.getBoundingClientRect();
        const clientX =
          e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY =
          e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        tagOffsetX = clientX - rect.left;
        tagOffsetY = clientY - rect.top;
        document.addEventListener("touchmove", dragTag, { passive: false });
        document.addEventListener("mousemove", dragTag);
        document.addEventListener("touchend", endDragTag);
        document.addEventListener("mouseup", endDragTag);
      }, 500);
    }
    function stopLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
    function dragTag(e) {
      if (!isDraggingTag) return;
      e.preventDefault();
      const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      const newX = clientX - tagOffsetX;
      const newY = clientY - tagOffsetY;
      const maxX = window.innerWidth - minimizedTag.offsetWidth;
      const maxY = window.innerHeight - minimizedTag.offsetHeight;
      const constrainedX = Math.max(0, Math.min(newX, maxX));
      const constrainedY = Math.max(0, Math.min(newY, maxY));
      minimizedTag.style.right = "auto";
      minimizedTag.style.bottom = "auto";
      minimizedTag.style.left = constrainedX + "px";
      minimizedTag.style.top = constrainedY + "px";
    }
    function endDragTag() {
      document.removeEventListener("touchmove", dragTag);
      document.removeEventListener("mousemove", dragTag);
      document.removeEventListener("touchend", endDragTag);
      document.removeEventListener("mouseup", endDragTag);
      if (isDraggingTag) {
        isDraggingTag = false;
        minimizedTag.style.opacity = "1";
        const rect = minimizedTag.getBoundingClientRect();
        localStorage.setItem(
          "mobile-log-tag-position",
          JSON.stringify({
            x: rect.left,
            y: rect.top,
          })
        );
      }
      stopLongPress();
    }
    minimizedTag.addEventListener("touchstart", startLongPress);
    minimizedTag.addEventListener("mousedown", startLongPress);
    minimizedTag.addEventListener("touchend", stopLongPress);
    minimizedTag.addEventListener("mouseup", stopLongPress);
    minimizedTag.onclick = (e) => {
      if (!isDraggingTag) {
        container.style.display = "block";
        minimizedTag.style.display = "none";
      }
    };
    document.body.appendChild(minimizedTag);
    const header = document.createElement("div");
    header.className =
      "sticky top-0 left-0 right-0 bg-gray-800 p-2 flex justify-between items-center border-b border-gray-700";
    const searchContainer = document.createElement("div");
    searchContainer.className = "flex items-center gap-2 flex-1 max-w-xs";
    const searchIcon = document.createElement("div");
    searchIcon.className = "text-white text-lg cursor-pointer flex-shrink-0";
    searchIcon.innerHTML = "🔍";
    searchIcon.title = "Search logs";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search logs...";
    searchInput.className =
      "hidden bg-gray-700 text-white px-2 py-1 rounded text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500";
    let isSearchActive = false;
    container.originalLogEntries = [];
    function toggleSearch() {
      if (!isSearchActive) {
        searchInput.classList.remove("hidden");
        searchIcon.innerHTML = "✕";
        searchIcon.title = "Clear search";
        searchInput.focus();
        isSearchActive = true;
        const logsContainer = container.querySelector("#logs-content");
        if (logsContainer) {
          container.originalLogEntries = Array.from(logsContainer.children);
        }
      } else {
        searchInput.classList.add("hidden");
        searchIcon.innerHTML = "🔍";
        searchIcon.title = "Search logs";
        searchInput.value = "";
        isSearchActive = false;
        restoreOriginalLogs();
      }
    }
    function restoreOriginalLogs() {
      const logsContainer = container.querySelector("#logs-content");
      if (logsContainer && container.originalLogEntries.length > 0) {
        logsContainer.innerHTML = "";
        container.originalLogEntries.forEach((entry) =>
          logsContainer.appendChild(entry)
        );
      }
    }
    function performSearch(query) {
      const logsContainer = container.querySelector("#logs-content");
      if (!logsContainer || !container.originalLogEntries.length) return;
      const filteredEntries = container.originalLogEntries.filter((entry) => {
        const text = entry.textContent || "";
        return text.toLowerCase().includes(query.toLowerCase());
      });
      logsContainer.innerHTML = "";
      if (filteredEntries.length === 0) {
        const noResults = document.createElement("div");
        noResults.className = "text-gray-400 text-sm italic p-2";
        noResults.textContent = "No matching logs found";
        logsContainer.appendChild(noResults);
      } else {
        filteredEntries.forEach((entry) => {
          const clonedEntry = entry.cloneNode(true);
          logsContainer.appendChild(clonedEntry);
        });
      }
    }
    searchIcon.addEventListener("click", toggleSearch);
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.trim();
      if (query === "") {
        restoreOriginalLogs();
      } else {
        performSearch(query);
      }
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        toggleSearch();
      }
    });
    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(searchInput);
    const controls = document.createElement("div");
    controls.className = "flex items-center gap-3";
    const clearBtn = document.createElement("button");
    clearBtn.className = "text-white p-2 hover:bg-gray-700 rounded text-sm";
    clearBtn.textContent = "Clear";
    clearBtn.onclick = () => {
      const logsContainer = container.querySelector("#logs-content");
      if (logsContainer) {
        logsContainer.innerHTML = "";
        container.originalLogEntries = [];
      }
    };
    const exportBtn = document.createElement("button");
    exportBtn.className = "text-white p-2 hover:bg-gray-700 rounded text-sm";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const logsContainer = container.querySelector("#logs-content");
      if (logsContainer && logsContainer.children.length > 0) {
        const logs = Array.from(logsContainer.children)
          .map((log) => {
            const mainText = log.textContent || "";
            return mainText;
          })
          .join("\n");
        const blob = new Blob([logs], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `typingmind-logs-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/:/g, "-")}.txt`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        const originalText = exportBtn.textContent;
        exportBtn.textContent = "Done";
        exportBtn.style.backgroundColor = "#10b981";
        setTimeout(() => {
          exportBtn.textContent = originalText;
          exportBtn.style.backgroundColor = "";
        }, 2000);
      }
    });
    let isReversed = false;
    const reverseBtn = document.createElement("button");
    reverseBtn.className = "text-white p-2 hover:bg-gray-700 rounded text-sm";
    reverseBtn.innerHTML = "↕️";
    reverseBtn.title = "Reverse order";
    reverseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const logsContainer = container.querySelector("#logs-content");
      if (logsContainer && logsContainer.children.length > 0) {
        const logEntries = Array.from(logsContainer.children);
        logEntries.reverse();
        logsContainer.innerHTML = "";
        logEntries.forEach((entry) => logsContainer.appendChild(entry));
        isReversed = !isReversed;
        container.setAttribute("data-log-reversed", isReversed.toString());
        reverseBtn.innerHTML = isReversed ? "🔽" : "🔼";
        reverseBtn.title = isReversed
          ? "Latest first (click to reverse)"
          : "Latest last (click to reverse)";
      }
    });
    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "text-white p-2 hover:bg-gray-700 rounded text-sm";
    minimizeBtn.textContent = "—";
    minimizeBtn.onclick = () => {
      container.style.display = "none";
      minimizedTag.style.display = "block";
    };
    const toggleSize = document.createElement("button");
    toggleSize.className = "text-white p-2 hover:bg-gray-700 rounded";
    toggleSize.innerHTML = "□";
    toggleSize.onclick = () => {
      if (container.style.height === "200px") {
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "0";
        container.style.right = "0";
        container.style.bottom = "0";
        container.style.height = "100vh";
        container.style.maxHeight = "100vh";
        container.style.zIndex = "99999";
        logsContent.style.height = "calc(100vh - 36px)";
        toggleSize.innerHTML = "▢";
      } else {
        container.style.position = "fixed";
        container.style.top = "auto";
        container.style.left = "0";
        container.style.right = "0";
        container.style.bottom = "0";
        container.style.height = "200px";
        container.style.maxHeight = "50vh";
        logsContent.style.height = "calc(100% - 36px)";
        toggleSize.innerHTML = "□";
      }
    };
    const closeBtn = document.createElement("button");
    closeBtn.className = "text-white p-2 hover:bg-gray-700 rounded";
    closeBtn.innerHTML = "✕";
    closeBtn.onclick = () => {
      container.style.display = "none";
      minimizedTag.style.display = "none";
      const toggle = document.getElementById("console-logging-toggle");
      if (toggle) toggle.checked = false;
      isConsoleLoggingEnabled = false;
    };
    controls.appendChild(clearBtn);
    controls.appendChild(exportBtn);
    controls.appendChild(reverseBtn);
    controls.appendChild(minimizeBtn);
    controls.appendChild(toggleSize);
    controls.appendChild(closeBtn);
    const dragHandle = document.createElement("div");
    dragHandle.className =
      "absolute -top-1 left-0 right-0 h-1 bg-gray-600 cursor-row-resize";
    dragHandle.style.cursor = "row-resize";
    const logsContent = document.createElement("div");
    logsContent.id = "logs-content";
    logsContent.className = "p-2 overflow-y-auto";
    logsContent.style.height = "calc(100% - 36px)";
    header.appendChild(searchContainer);
    header.appendChild(controls);
    container.appendChild(dragHandle);
    container.appendChild(header);
    container.appendChild(logsContent);
    let startY = 0;
    let startHeight = 0;
    function initDrag(e) {
      startY = e.type === "mousedown" ? e.clientY : e.touches[0].clientY;
      startHeight = parseInt(
        document.defaultView.getComputedStyle(container).height,
        10
      );
      document.documentElement.addEventListener("mousemove", doDrag);
      document.documentElement.addEventListener("mouseup", stopDrag);
      document.documentElement.addEventListener("touchmove", doDrag);
      document.documentElement.addEventListener("touchend", stopDrag);
    }
    function doDrag(e) {
      const currentY =
        e.type === "mousemove" ? e.clientY : e.touches[0].clientY;
      const newHeight = startHeight - (currentY - startY);
      const minHeight = 100;
      const maxHeight = window.innerHeight * 0.8;
      if (newHeight > minHeight && newHeight < maxHeight) {
        container.style.height = `${newHeight}px`;
      }
    }
    function stopDrag() {
      document.documentElement.removeEventListener("mousemove", doDrag);
      document.documentElement.removeEventListener("mouseup", stopDrag);
      document.documentElement.removeEventListener("touchmove", doDrag);
      document.documentElement.removeEventListener("touchend", stopDrag);
    }
    dragHandle.addEventListener("mousedown", initDrag);
    dragHandle.addEventListener("touchstart", initDrag);
    document.body.appendChild(container);
    return container;
  }
  function initializeLoggingState() {
    const urlParams = new URLSearchParams(window.location.search);
    const logParam = urlParams.get("log");
    if (logParam === "true") {
      isConsoleLoggingEnabled = true;
      logToConsole(
        "info",
        `TypingMind Cloud Sync & Backup v${EXTENSION_VERSION} initializing...`
      );
    }
  }
  async function performFullInitialization() {
    try {
      loadConfiguration();
      await loadAwsSdk();
      await loadLocalMetadata();
      await initializeLastSeenUpdates();
      await initializeSettingsMonitoring();
      await setupLocalStorageChangeListener();
      startSyncInterval();
      if (config.syncMode === "sync") {
        await queueOperation("initial-sync", performInitialSync);
      }
      if (config.syncMode !== "disabled") {
        queueOperation(
          "daily-backup-check",
          checkAndPerformDailyBackup,
          [],
          300000
        );
      }
      setupLocalStorageChangeListener();
      monitorIndexedDBForDeletions();
      startPeriodicChangeCheck();
      //setupVisibilityChangeHandler();
      try {
        await cleanupMetadataVersions();
        // logToConsole(
        //   "success",
        //   "Metadata cleanup completed during initialization"
        // );
      } catch (cleanupError) {
        logToConsole(
          "warning",
          "Non-critical: Metadata cleanup failed during initialization",
          cleanupError
        );
      }
      logToConsole("success", "Full initialization completed");
      logToConsole("cleanup", "Starting tombstone cleanup...");
      const localCleanupCount = cleanupOldTombstones();
      const cloudCleanupCount = await cleanupCloudTombstones();
      if (localCleanupCount > 0 || cloudCleanupCount > 0) {
        logToConsole("success", "Tombstone cleanup completed", {
          localTombstonesRemoved: localCleanupCount,
          cloudTombstonesRemoved: cloudCleanupCount,
        });
      }
      return true;
    } catch (error) {
      logToConsole("error", "Error during full initialization:", error);
      return false;
    }
  }
  let isInitialized = false;
  async function initializeExtension() {
    if (isInitialized) {
      logToConsole(
        "skip",
        "Extension already initialized, skipping duplicate initialization"
      );
      return;
    }
    isInitialized = true;
    initializeLoggingState();
    try {
      await loadAwsSdk();
      loadConfiguration();
      insertSyncButton();
      if (!isAwsConfigured()) {
        logToConsole(
          "info",
          "AWS not configured - minimal initialization completed"
        );
        return;
      }
      if (config.syncMode === "disabled") {
        logToConsole(
          "info",
          "Disabled mode - skipping cloud operations initialization"
        );
        return;
      }
      let initialMetadataSaveNeeded = false;
      let settingsMetadataSaveNeeded = false;
      initialMetadataSaveNeeded = await loadLocalMetadata();
      await initializeLastSeenUpdates();
      settingsMetadataSaveNeeded = await initializeSettingsMonitoring();
      try {
        const duplicatesFound = await detectIndexedDBDuplicates();
        if (duplicatesFound) {
          await cleanupIndexedDBDuplicates();
          logToConsole(
            "success",
            "IndexedDB duplicate cleanup completed during extension initialization"
          );
        } else {
          logToConsole(
            "info",
            "No duplicates found between IndexedDB and localStorage - skipping cleanup"
          );
        }
      } catch (cleanupError) {
        logToConsole(
          "warning",
          "Non-critical: IndexedDB duplicate cleanup failed during extension initialization",
          cleanupError
        );
      }
      let hashesRecalculated = false;
      const allLocalChatsForHash = await getAllChatsFromIndexedDB();
      const localChatsMapForHash = new Map(
        allLocalChatsForHash.map((chat) => [
          chat.id.replace(/^CHAT_/, ""),
          chat,
        ])
      );
      if (localMetadata.chats) {
        for (const chatId in localMetadata.chats) {
          const cleanChatId = chatId.replace(/^CHAT_/, "");
          const chatData = localChatsMapForHash.get(cleanChatId);
          if (chatData && !localMetadata.chats[chatId].deleted) {
            try {
              const newHash = await generateHash(chatData, "chat");
              if (localMetadata.chats[chatId].hash !== newHash) {
                localMetadata.chats[chatId].hash = newHash;
                hashesRecalculated = true;
              }
            } catch (hashError) {
              logToConsole(
                "error",
                `Error generating hash for chat ${cleanChatId} during init recalc`,
                hashError
              );
            }
          } else if (!chatData && !localMetadata.chats[chatId].deleted) {
            logToConsole(
              "warning",
              `Chat ${cleanChatId} found in metadata but not in IndexedDB during hash recalc.`
            );
          }
        }
      }
      if (
        initialMetadataSaveNeeded ||
        settingsMetadataSaveNeeded ||
        hashesRecalculated
      ) {
        await saveLocalMetadata();
      }
      await setupLocalStorageChangeListener();
      startSyncInterval();

      // Check cloud state FIRST to determine initial action
      if (config.syncMode === "sync") {
        const cloudMetadata = await downloadCloudMetadata(); // Get cloud state early
        const cloudIsEmptyOrNew =
          !cloudMetadata ||
          !cloudMetadata.chats ||
          Object.keys(cloudMetadata.chats).length === 0 ||
          cloudMetadata.lastSyncTime === 0;
        const localHasData =
          localMetadata &&
          localMetadata.chats &&
          Object.keys(localMetadata.chats).length > 0;

        if (cloudIsEmptyOrNew && localHasData) {
          logToConsole(
            "info",
            "Cloud is empty/new but local data exists. Performing initial sync/upload."
          );
          // Use performInitialSync as it handles this scenario.
          await queueOperation(
            "initial-sync-upload",
            performInitialSync,
            [],
            300000
          );
        } else if (!cloudIsEmptyOrNew) {
          logToConsole(
            "info",
            "Cloud data found. Performing standard startup sync check."
          );
        } else {
          logToConsole(
            "info",
            "Both cloud and local seem empty or new. No initial sync needed immediately."
          );
        }
      }
      if (config.syncMode !== "disabled") {
        queueOperation(
          "daily-backup-check",
          checkAndPerformDailyBackup,
          [],
          300000
        );
      }
      monitorIndexedDBForDeletions();
      startPeriodicChangeCheck();
      setupVisibilityChangeHandler();
      try {
        await cleanupMetadataVersions();
        // logToConsole(
        //   "success",
        //   "Metadata cleanup completed during initialization"
        // );
      } catch (cleanupError) {
        logToConsole(
          "warning",
          "Non-critical: Metadata cleanup failed during initialization",
          cleanupError
        );
      }
      logToConsole("success", "Full initialization completed");
      logToConsole("cleanup", "Starting tombstone cleanup...");
      const localCleanupCount = cleanupOldTombstones();
      const cloudCleanupCount = await cleanupCloudTombstones();
      if (localCleanupCount > 0 || cloudCleanupCount > 0) {
        logToConsole("success", "Tombstone cleanup completed", {
          localTombstonesRemoved: localCleanupCount,
          cloudTombstonesRemoved: cloudCleanupCount,
        });
      }
      // setupVisibilityChangeHandler();
      logToConsole("success", "Initialization completed successfully");
    } catch (error) {
      logToConsole("error", "Error initializing extension:", error);
      throw error;
    }
  }
  if (document.readyState === "complete") {
    initializeExtension();
  } else {
    window.addEventListener("load", initializeExtension);
  }
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
  async function loadAwsSdk() {
    if (window.AWS) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.1048.0.min.js";
      script.onload = () => {
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load AWS SDK"));
      document.head.appendChild(script);
    });
  }
  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      script.onload = () => {
        resolve(window.JSZip);
      };
      script.onerror = () => reject(new Error("Failed to load JSZip"));
      document.head.appendChild(script);
    });
  }
  async function initializeLastSeenUpdates() {
    const chats = await getAllChatsFromIndexedDB();
    for (const chat of chats) {
      if (!chat.id) continue;
      lastSeenUpdates[chat.id] = {
        updatedAt: chat.updatedAt || Date.now(),
        hash: await generateHash(chat, "chat"),
      };
    }
  }
  function loadConfiguration() {
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
    const urlParams = new URLSearchParams(window.location.search);
    const urlSyncMode = urlParams.get("syncMode");
    if (urlSyncMode && ["disabled", "backup", "sync"].includes(urlSyncMode)) {
      localStorage.setItem("sync-mode", urlSyncMode);
      logToConsole("info", `Sync mode set from URL parameter: ${urlSyncMode}`);
      urlParams.delete("syncMode");
      const newUrl =
        window.location.pathname +
        (urlParams.toString() ? `?${urlParams.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
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
    config = { ...config, ...storedConfig };
    config.syncMode = localStorage.getItem("sync-mode") || "disabled";
    return config;
  }
  function saveConfiguration() {
    localStorage.setItem("aws-bucket", config.bucketName);
    localStorage.setItem("aws-region", config.region);
    localStorage.setItem("aws-access-key", config.accessKey);
    localStorage.setItem("aws-secret-key", config.secretKey);
    localStorage.setItem("aws-endpoint", config.endpoint);
    localStorage.setItem("backup-interval", config.syncInterval.toString());
    localStorage.setItem("encryption-key", config.encryptionKey);
    localStorage.setItem("sync-mode", config.syncMode);
  }
  async function loadLocalMetadata() {
    let metadataInitialized = false;
    try {
      const storedMetadata = await getIndexedDBKey("sync-metadata");
      if (storedMetadata) {
        try {
          localMetadata = JSON.parse(storedMetadata);
          const formatLogTimestamp = (ts) =>
            ts ? new Date(ts).toLocaleString() : ts === 0 ? "0 (Epoch)" : ts;
          let settingsHashSamples = {};
          if (localMetadata.settings?.items) {
            const sampleKeys = Object.keys(localMetadata.settings.items).slice(
              0,
              3
            );
            if (sampleKeys.length > 0) {
              settingsHashSamples = sampleKeys.reduce((acc, key) => {
                acc[key] = localMetadata.settings.items[key]?.hash
                  ? `${localMetadata.settings.items[key].hash.substring(
                      0,
                      8
                    )}...`
                  : "none";
                return acc;
              }, {});
            }
          }
          // logToConsole("debug", "Parsed localMetadata:", {
          //   lastSyncTime: formatLogTimestamp(localMetadata.lastSyncTime),
          //   hasChats: !!localMetadata.chats,
          //   chatCount: localMetadata.chats
          //     ? Object.keys(localMetadata.chats).length
          //     : 0,
          //   firstChatSyncedAt:
          //     localMetadata.chats && Object.keys(localMetadata.chats).length > 0
          //       ? formatLogTimestamp(
          //           localMetadata.chats[Object.keys(localMetadata.chats)[0]]
          //             ?.syncedAt
          //         )
          //       : undefined,
          //   hasSettings: !!localMetadata.settings,
          //   settingsCount: localMetadata.settings?.items
          //     ? Object.keys(localMetadata.settings.items).length
          //     : 0,
          //   settingsSyncedAt: formatLogTimestamp(
          //     localMetadata.settings?.syncedAt
          //   ),
          //   settingsSamples: settingsHashSamples,
          // });
        } catch (parseError) {
          logToConsole(
            "error",
            "Failed to parse stored metadata, initializing from scratch",
            parseError
          );
          metadataInitialized = await initializeMetadataFromExistingData();
        }
      } else {
        logToConsole(
          "info",
          "No stored metadata found, initializing from existing data."
        );
        metadataInitialized = await initializeMetadataFromExistingData();
      }
    } catch (error) {
      logToConsole("error", "Failed to load local metadata:", error);
      try {
        logToConsole(
          "warning",
          "Attempting to recover by initializing fresh metadata."
        );
        metadataInitialized = await initializeMetadataFromExistingData();
        logToConsole(
          "success",
          "Successfully initialized fresh metadata after load error."
        );
      } catch (initError) {
        logToConsole(
          "error",
          "Failed to initialize fresh metadata after load error:",
          initError
        );
        throw error;
      }
    }
    return metadataInitialized;
  }
  async function initializeMetadataFromExistingData() {
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
        hash: await generateHash(chat, "chat"),
        syncedAt: 0,
        isDeleted: false,
      };
    }
    for (const key of Object.keys(localStorage)) {
      if (shouldExcludeSetting(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) {
        const hash = await generateContentHash(value);
        localMetadata.settings.items[key] = {
          hash: hash,
          lastModified: Date.now(),
          syncedAt: 0,
          source: "localStorage",
          deleted: false,
        };
      }
    }
    try {
      const db = await openIndexedDB();
      const transaction = db.transaction("keyval", "readonly");
      const store = transaction.objectStore("keyval");
      const keys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      for (const key of keys) {
        if (shouldExcludeSetting(key)) continue;
        const value = await getIndexedDBValue(key);
        if (value !== undefined) {
          const valueToHash =
            typeof value === "object" ? JSON.stringify(value) : value;
          const hash = await generateContentHash(valueToHash);
          localMetadata.settings.items[key] = {
            hash: hash,
            lastModified: Date.now(),
            syncedAt: 0,
            source: "indexeddb",
            deleted: false,
          };
        }
      }
    } catch (error) {
      logToConsole(
        "warning",
        "Could not initialize IndexedDB settings metadata",
        error
      );
    }
    logToConsole("success", "Metadata initialized from existing data", {
      chatsInitialized: Object.keys(localMetadata.chats).length,
      settingsInitialized: Object.keys(localMetadata.settings.items).length,
    });
    return true;
  }
  async function saveLocalMetadata() {
    try {
      const metadataToSave = JSON.stringify(localMetadata);
      logToConsole("debug", "Saving local metadata", {
        settingsCount: Object.keys(localMetadata.settings?.items || {}).length,
        chatsCount: Object.keys(localMetadata.chats || {}).length,
        lastModified: localMetadata.settings?.lastModified
          ? new Date(localMetadata.settings.lastModified).toISOString()
          : "unknown",
        syncedAt: localMetadata.settings?.syncedAt
          ? new Date(localMetadata.settings.syncedAt).toISOString()
          : "unknown",
        metadataSize: metadataToSave.length,
      });
      // if (localMetadata.settings?.items) {
      //   const sampleKeys = Object.keys(localMetadata.settings.items).slice(0, 3);
      //   if (sampleKeys.length > 0) {
      //     logToConsole(
      //       "debug",
      //       "Sample hashes being saved:",
      //       sampleKeys.reduce((acc, key) => {
      //         acc[key] = localMetadata.settings.items[key]?.hash
      //           ? `${localMetadata.settings.items[key].hash.substring(
      //               0,
      //               8
      //             )}...`
      //           : "none";
      //         return acc;
      //       }, {})
      //     );
      //   }
      // }
      const formatLogTimestamp = (ts) =>
        ts ? new Date(ts).toLocaleString() : ts === 0 ? "0 (Epoch)" : ts;
      await setIndexedDBKey("sync-metadata", metadataToSave);
      const verifyMetadata = await getIndexedDBKey("sync-metadata");
      if (!verifyMetadata) {
        throw new Error(
          "Metadata save verification failed: No data returned from read verification"
        );
      }
      try {
        const parsedVerify = JSON.parse(verifyMetadata);
        const sampleKey = Object.keys(localMetadata.settings?.items || {})[0];

        if (
          sampleKey &&
          parsedVerify?.settings?.items?.[sampleKey]?.hash !==
            localMetadata.settings?.items?.[sampleKey]?.hash
        ) {
          // logToConsole("warning", "Metadata verification found hash mismatch", {
          //   key: sampleKey,
          //   expectedHash: localMetadata.settings?.items?.[sampleKey]?.hash
          //     ? `${localMetadata.settings.items[sampleKey].hash.substring(
          //         0,
          //         8
          //       )}...`
          //     : "none",
          //   savedHash: parsedVerify?.settings?.items?.[sampleKey]?.hash
          //     ? `${parsedVerify.settings.items[sampleKey].hash.substring(
          //         0,
          //         8
          //       )}...`
          //     : "none",
          // });
        }
        // else {
        //   logToConsole(
        //     "success",
        //     "Local metadata saved and verified in IndexedDB"
        //   );
        // }
      } catch (parseError) {
        logToConsole(
          "warning",
          "Error parsing verification metadata",
          parseError
        );
      }
    } catch (error) {
      logToConsole("error", "Failed to save local metadata:", error);
      throw error;
    }
  }
  async function generateHash(content, type = "generic") {
    let str;
    if (type === "chat" && content.id) {
      let messagesToProcess = content.messages || [];
      const stableChat = {
        folderID: content.folderID || null,
        messages: messagesToProcess
          .map((msg) => {
            if (!msg || typeof msg !== "object") return msg;
            const stableMsg = {};
            Object.keys(msg)
              .sort()
              .forEach((key) => {
                stableMsg[key] = msg[key];
              });
            return stableMsg;
          })
          .sort((a, b) => {
            if (a?.timestamp && b?.timestamp) {
              if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            }
            if (a?.index !== undefined && b?.index !== undefined) {
              if (a.index !== b.index) return a.index - b.index;
            }
            const stringifyStable = (obj) =>
              JSON.stringify(obj, Object.keys(obj || {}).sort());
            return stringifyStable(a).localeCompare(stringifyStable(b));
          }),
        title: content.title || content.chatTitle || "",
      };
      str = JSON.stringify(stableChat, Object.keys(stableChat).sort());
    } else {
      str = typeof content === "string" ? content : JSON.stringify(content);
    }
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function setupLocalStorageChangeListener() {
    window.addEventListener("storage", (e) => {
      if (!e.key || shouldExcludeSetting(e.key)) {
        return;
      }
      logToConsole("info", `LocalStorage change detected: ${e.key}`);
      throttledCheckSyncStatus();
    });
    const originalSetItem = localStorage.setItem;
    Object.defineProperty(localStorage, "setItem", {
      value: function (key, value) {
        const oldValue = localStorage.getItem(key);
        originalSetItem.apply(this, arguments);
        if (!shouldExcludeSetting(key) && oldValue !== value) {
          logToConsole(
            "info",
            `LocalStorage programmatic change detected: ${key}`
          );
          throttledCheckSyncStatus();
        }
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  async function getPersistentDB() {
    if (persistentDB) {
      try {
        const transaction = persistentDB.transaction(["keyval"], "readonly");
        return persistentDB;
      } catch (error) {
        logToConsole(
          "warning",
          "Existing IndexedDB connection is stale, reconnecting"
        );
        await cleanupDBConnection();
      }
    }
    if (dbConnectionPromise) {
      try {
        return await dbConnectionPromise;
      } catch (error) {
        dbConnectionPromise = null;
      }
    }
    dbConnectionPromise = (async () => {
      try {
        persistentDB = await Promise.race([
          openIndexedDB(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("IndexedDB connection timeout")),
              DB_CONNECTION_TIMEOUT
            )
          ),
        ]);
        setupDBConnectionMonitoring();
        dbConnectionRetries = 0;
        return persistentDB;
      } catch (error) {
        dbConnectionPromise = null;
        dbConnectionRetries++;
        if (dbConnectionRetries < MAX_DB_RETRIES) {
          const delay = Math.min(
            DB_RETRY_DELAY * Math.pow(2, dbConnectionRetries - 1) +
              Math.random() * 1000,
            5000
          );
          logToConsole(
            "warning",
            `IndexedDB connection attempt ${dbConnectionRetries} failed, retrying in ${Math.round(
              delay / 1000
            )}s`,
            error
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return getPersistentDB();
        }
        logToConsole(
          "error",
          "Max IndexedDB connection retries reached",
          error
        );
        throw new Error(
          `Failed to establish IndexedDB connection after ${MAX_DB_RETRIES} attempts: ${error.message}`
        );
      }
    })();
    return dbConnectionPromise;
  }
  function setupDBConnectionMonitoring() {
    if (dbHeartbeatInterval) {
      clearInterval(dbHeartbeatInterval);
    }
    dbHeartbeatInterval = setInterval(async () => {
      if (!persistentDB) return;
      try {
        const transaction = persistentDB.transaction(["keyval"], "readonly");
        const store = transaction.objectStore("keyval");
        await new Promise((resolve, reject) => {
          const request = store.count();
          request.onsuccess = resolve;
          request.onerror = reject;
        });
      } catch (error) {
        logToConsole(
          "warning",
          "IndexedDB connection health check failed",
          error
        );
        await cleanupDBConnection();
      }
    }, 30000);
  }
  async function cleanupDBConnection() {
    try {
      if (dbHeartbeatInterval) {
        clearInterval(dbHeartbeatInterval);
        dbHeartbeatInterval = null;
      }
      if (persistentDB) {
        persistentDB.close();
        persistentDB = null;
      }
      dbConnectionPromise = null;
      logToConsole("info", "Cleaned up stale IndexedDB connection");
    } catch (error) {
      logToConsole("error", "Error cleaning up IndexedDB connection", error);
    }
  }
  function openIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("keyval-store", 1);
      request.onerror = () => {
        reject(
          new Error(
            `Failed to open IndexedDB: ${
              request.error?.message || "Unknown error"
            }`
          )
        );
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        db.onerror = (event) => {
          logToConsole("error", "IndexedDB error:", event.target.error);
          cleanupDBConnection();
        };
        db.onclose = () => {
          logToConsole("info", "IndexedDB connection closed");
          cleanupDBConnection();
        };
        db.onversionchange = () => {
          logToConsole("info", "IndexedDB version changed, closing connection");
          cleanupDBConnection();
        };
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("keyval")) {
          db.createObjectStore("keyval");
        }
      };
      setTimeout(() => {
        if (!persistentDB) {
          reject(new Error("IndexedDB open request timed out"));
        }
      }, DB_CONNECTION_TIMEOUT);
    });
  }
  async function getAllChatsFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("keyval-store", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(["keyval"], "readonly");
        const store = transaction.objectStore("keyval");
        const chats = [];
        store.getAllKeys().onsuccess = (keyEvent) => {
          const keys = keyEvent.target.result;
          const chatKeys = keys.filter((key) => key.startsWith("CHAT_"));
          if (chatKeys.length === 0) {
            resolve([]);
            return;
          }
          store.getAll().onsuccess = (valueEvent) => {
            const values = valueEvent.target.result;
            for (let i = 0; i < keys.length; i++) {
              const key = keys[i];
              if (key.startsWith("CHAT_")) {
                const chat = values[i];
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
          let fetchedChat = getRequest.result;
          logToConsole(
            "debug",
            `Chat fetched from IndexedDB (getChatFromIndexedDB): ${key}`,
            {
              hasChat: !!fetchedChat,
              hasMessages: !!fetchedChat?.messages,
              messagesLength: fetchedChat?.messages?.length,
            }
          );
          fetchedChat = standardizeChatMessages(fetchedChat);
          resolve(fetchedChat);
        };
        getRequest.onerror = () => {
          reject(getRequest.error);
        };
      };
    });
  }
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
  function monitorIndexedDBForDeletions() {
    let knownChats = new Map();
    const MIN_CHAT_AGE_MS = 60 * 1000;
    const REQUIRED_MISSING_DETECTIONS = 2;
    let potentialDeletions = new Map();
    getAllChatsFromIndexedDB().then((chats) => {
      const now = Date.now();
      chats.forEach((chat) => {
        if (chat.id) {
          knownChats.set(chat.id, {
            detectedAt: now,
            confirmedCount: 3,
          });
        }
      });
      logToConsole(
        "info",
        `Initialized deletion monitor with ${knownChats.size} chats`
      );
    });
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const now = Date.now();
        const currentChats = await getAllChatsFromIndexedDB();
        const currentChatIds = new Set(currentChats.map((chat) => chat.id));
        for (const chatId of currentChatIds) {
          if (knownChats.has(chatId)) {
            const chatInfo = knownChats.get(chatId);
            chatInfo.confirmedCount = Math.min(chatInfo.confirmedCount + 1, 5);
            if (potentialDeletions.has(chatId)) {
              potentialDeletions.delete(chatId);
            }
          } else {
            knownChats.set(chatId, {
              detectedAt: now,
              confirmedCount: 1,
            });
            /*
              updateChatMetadata(chatId, true)
                .then(() => {
                  if (config.syncMode === "sync" || config.syncMode === "backup") {
                    queueOperation(`new-chat-sync-${chatId}`, () =>
                      uploadChatToCloud(chatId)
                    );
                  }
                })
                .catch((error) => {
                  logToConsole(
                    "error",
                    `Error updating metadata for new chat ${chatId}:`,
                    error
                  );
                });
              */
          }
        }
        for (const [chatId, chatInfo] of knownChats.entries()) {
          if (!currentChatIds.has(chatId)) {
            const isEstablishedChat =
              chatInfo.confirmedCount >= 2 &&
              now - chatInfo.detectedAt > MIN_CHAT_AGE_MS;
            if (isEstablishedChat) {
              const missingCount = (potentialDeletions.get(chatId) || 0) + 1;
              potentialDeletions.set(chatId, missingCount);
              if (missingCount >= REQUIRED_MISSING_DETECTIONS) {
                if (
                  localMetadata.chats[chatId] &&
                  localMetadata.chats[chatId].deleted === true
                ) {
                  knownChats.delete(chatId);
                  potentialDeletions.delete(chatId);
                  continue;
                }
                logToConsole(
                  "cleanup",
                  `Confirmed deletion of chat ${chatId} (missing ${missingCount} times), creating tombstone`
                );
                localMetadata.chats[chatId] = {
                  deleted: true,
                  deletedAt: Date.now(),
                  lastModified: Date.now(),
                  syncedAt: 0,
                  tombstoneVersion: 1,
                  deletionSource: "indexeddb-monitor",
                };
                saveLocalMetadata();
                if (
                  config.syncMode === "sync" ||
                  config.syncMode === "backup"
                ) {
                  logToConsole(
                    "cleanup",
                    `Queueing deletion from cloud for chat ${chatId}`
                  );
                  queueOperation(`delete-chat-${chatId}`, () =>
                    deleteChatFromCloud(chatId)
                  );
                }
                knownChats.delete(chatId);
                potentialDeletions.delete(chatId);
              } else {
                logToConsole(
                  "info",
                  `Chat ${chatId} appears to be missing (${missingCount}/${REQUIRED_MISSING_DETECTIONS} checks), waiting for confirmation`
                );
              }
            } else {
              if (potentialDeletions.has(chatId)) {
                const missingCount = potentialDeletions.get(chatId) + 1;
                if (missingCount > 5) {
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
    }, 10000);
  }
  async function saveChatToIndexedDB(chat, syncTimestamp = null) {
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
        if (chat.id.startsWith("CHAT_") && key !== chat.id) {
          chat.id = chat.id.slice(5);
        }
        chat.updatedAt = Date.now();
        const putRequest = store.put(chat, key);
        putRequest.onsuccess = () => {
          logToConsole("success", `Saved chat ${chat.id} to IndexedDB`);
          const isCloudOriginated = !!syncTimestamp;
          updateChatMetadata(
            chat.id,
            !isCloudOriginated,
            false,
            syncTimestamp,
            chat
          )
            .then(() => resolve())
            .catch(reject);
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("keyval")) {
          db.createObjectStore("keyval");
        }
      };
    });
  }
  async function deleteChatFromIndexedDB(chatId) {
    return new Promise((resolve, reject) => {
      if (!chatId) {
        reject(new Error("Cannot delete chat: chatId is undefined"));
        return;
      }
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
      };
    });
  }
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
  async function listS3Objects(prefix = "") {
    const s3 = initializeS3Client();
    try {
      const params = {
        Bucket: config.bucketName,
        Prefix: prefix,
      };
      const response = await s3.listObjectsV2(params).promise();
      const objects = response.Contents || [];
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
  async function uploadToS3(key, data, metadata) {
    const s3 = initializeS3Client();
    try {
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
      if (key === "metadata.json") {
        params.CacheControl = "no-cache, no-store, must-revalidate";
      }
      if (data.byteLength > 5 * 1024 * 1024) {
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
        }
        await completeMultipartUpload(key, uploadId, parts);
      } else {
        await s3.putObject(params).promise();
      }
      logToConsole("success", `Successfully uploaded to S3: ${key}`);
    } catch (error) {
      logToConsole("error", `Failed to upload to S3: ${key}`, error);
      throw error;
    }
  }
  async function downloadFromS3(key) {
    const s3 = initializeS3Client();
    try {
      const params = {
        Bucket: config.bucketName,
        Key: key,
      };
      const response = await s3.getObject(params).promise();
      const cleanMetadata = {};
      for (const [key, value] of Object.entries(response.Metadata || {})) {
        const cleanKey = key.replace("x-amz-meta-", "");
        cleanMetadata[cleanKey] = value;
      }
      if (key === "metadata.json") {
        return {
          data: response.Body,
          metadata: cleanMetadata,
        };
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
  async function startMultipartUpload(key) {
    const s3 = initializeS3Client();
    try {
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
  async function uploadPart(key, uploadId, partNumber, data) {
    const s3 = initializeS3Client();
    const maxRetries = 3;
    const baseDelay = 1000;
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
            logToConsole(
              "error",
              "Error aborting multipart upload:",
              abortError
            );
          }
          throw new Error(
            `Failed to upload part ${partNumber} after ${
              maxRetries + 1
            } attempts: ${lastError.message}`
          );
        }
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
  async function cleanupIncompleteMultipartUploads() {
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
      }
    } catch (error) {
      logToConsole("error", "Error cleaning up multipart uploads:", error);
    }
  }
  async function deriveKey(password) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("typingmind-backup-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    return key;
  }
  async function safeStringify(data) {
    try {
      if (typeof data === "string") {
        return data;
      }
      const chunkSize = 50000;
      let result = "{";
      const keys = Object.keys(data);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        let value = data[key];
        if (value === undefined) {
          value = null;
        }
        if (i > 0) result += ",";
        result += `"${key}":`;
        if (typeof value === "object" && value !== null) {
          if (Array.isArray(value)) {
            result += "[";
            for (let j = 0; j < value.length; j++) {
              if (j > 0) result += ",";
              let arrayValue = value[j];
              if (arrayValue === undefined) {
                arrayValue = null;
              }
              result += JSON.stringify(arrayValue);
              if (result.length > chunkSize) {
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
            result += "]";
          } else {
            const objKeys = Object.keys(value);
            result += "{";
            for (let j = 0; j < objKeys.length; j++) {
              const objKey = objKeys[j];
              if (j > 0) result += ",";
              let objValue = value[objKey];
              if (objValue === undefined) {
                objValue = null;
              }
              result += `"${objKey}":${JSON.stringify(objValue)}`;
              if (result.length > chunkSize) {
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
            result += "}";
          }
        } else {
          result += JSON.stringify(value);
        }
        if (result.length > chunkSize) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      result += "}";
      return result;
    } catch (error) {
      logToConsole(
        "warning",
        "Safe stringify failed, falling back to regular JSON.stringify",
        error
      );
      return JSON.stringify(data, (key, value) =>
        value === undefined ? null : value
      );
    }
  }
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
      const jsonString = await safeStringify(data);
      const encodedData = enc.encode(jsonString);
      const encryptedContent = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        key,
        encodedData
      );
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
  async function decryptData(data) {
    const marker = "ENCRYPTED:";
    const dataString = new TextDecoder().decode(data.slice(0, marker.length));
    const bucketName = localStorage.getItem("aws-bucket");
    logToConsole("tag", "Checking encryption marker:", {
      expectedMarker: marker,
      foundMarker: dataString,
      isEncrypted: dataString === marker,
    });
    if (dataString !== marker) {
      logToConsole("info", "Data is not encrypted, returning as-is");
      return JSON.parse(new TextDecoder().decode(data));
    }
    if (!bucketName) {
      logToConsole("info", "Backup not configured, skipping decryption");
      throw new Error("Backup not configured");
    }
    const encryptionKey = localStorage.getItem("encryption-key");
    if (!encryptionKey) {
      logToConsole("error", "Encrypted data found but no key provided");
      if (backupIntervalRunning) {
        clearInterval(backupInterval);
        backupIntervalRunning = false;
      }
      wasImportSuccessful = false;
      await showCustomAlert(
        "Please configure your encryption key in the backup settings before proceeding.",
        "Configuration Required"
      );
      throw new Error("Encryption key not configured");
    }
    try {
      const key = await deriveKey(encryptionKey);
      const iv = data.slice(marker.length, marker.length + 12);
      const encryptedData = data.slice(marker.length + 12);
      const decryptedContent = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        key,
        encryptedData
      );
      const decryptedText = new TextDecoder().decode(decryptedContent);
      logToConsole("success", "Decryption successful");
      return decryptedText;
    } catch (error) {
      logToConsole("error", "Decryption failed:", error);
      throw new Error(
        "Failed to decrypt backup. Please check your encryption key."
      );
    }
  }
  function startBackupIntervals() {
    startSyncInterval();
  }
  async function checkAndPerformDailyBackup() {
    try {
      const lastBackupStr = localStorage.getItem("last-daily-backup");
      const now = new Date();
      const currentDateStr = `${now.getFullYear()}${String(
        now.getMonth() + 1
      ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      if (!lastBackupStr || lastBackupStr !== currentDateStr) {
        logToConsole("info", "Starting daily backup...");
        await performDailyBackup();
        localStorage.setItem("last-daily-backup", currentDateStr);
        logToConsole("success", "Daily backup completed");
      } else {
        logToConsole("skip", "Daily backup already performed today");
      }
    } catch (error) {
      logToConsole("error", "Error checking/performing daily backup:", error);
    }
  }
  async function performDailyBackup() {
    backupState.isBackupInProgress = true;
    try {
      await loadJSZip();
      const today = new Date();
      const dateString = `${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const key = `typingmind-backup-${dateString}.zip`;
      const data = await exportBackupData();
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
        Promise.all([
          collectData,
          new Promise((resolveTransaction) => {
            transaction.oncomplete = resolveTransaction;
          }),
        ])
          .then(() => {
            const hasLocalStorageData =
              Object.keys(exportData.localStorage).length > 0;
            const hasIndexedDBData =
              Object.keys(exportData.indexedDB).length > 0;
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
  async function createDailyBackup(key, data) {
    logToConsole("start", `Creating daily backup: ${key}`);
    try {
      const JSZip = await loadJSZip();
      if (!JSZip) {
        throw new Error("Failed to load JSZip library");
      }
      const encryptionKey = localStorage.getItem("encryption-key");
      if (!encryptionKey) {
        logToConsole(
          "warning",
          "No encryption key found, backup will not be encrypted"
        );
        return false;
      }
      logToConsole("info", "Encrypting backup data...");
      const encryptedData = await encryptData(data);
      const rawSize = Math.round(encryptedData.length * 0.8);
      logToConsole(
        "info",
        `Estimated raw data size: ${formatFileSize(rawSize)}`
      );
      const zip = new JSZip();
      const jsonFileName = key.replace(".zip", ".json");
      zip.file(jsonFileName, encryptedData, {
        compression: "DEFLATE",
        compressionOptions: {
          level: 9,
        },
        binary: true,
      });
      const compressedContent = await zip.generateAsync({ type: "blob" });
      if (compressedContent.size < 100) {
        throw new Error(
          "Daily backup file is too small or empty. Upload cancelled."
        );
      }
      const arrayBuffer = await compressedContent.arrayBuffer();
      const content = new Uint8Array(arrayBuffer);
      const uploadMetadata = {
        version: EXTENSION_VERSION,
        timestamp: String(Date.now()),
        type: "daily",
        originalSize: String(rawSize),
        compressedSize: String(compressedContent.size),
        encrypted: "true",
      };
      await uploadToS3(key, content, uploadMetadata);
      logToConsole("success", "Daily backup created successfully");
      return true;
    } catch (error) {
      logToConsole("error", "Daily backup creation failed:", error);
      return false;
    }
  }
  async function createSnapshot(name) {
    logToConsole("start", "Creating snapshot...");
    backupState.isBackupInProgress = true;
    try {
      logToConsole("info", "Loading JSZip...");
      await loadJSZip();
      logToConsole("success", "JSZip loaded successfully");
      const data = await exportBackupData();
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
      const encryptionKey = localStorage.getItem("encryption-key");
      if (!encryptionKey) {
        logToConsole(
          "warning",
          "No encryption key found, snapshot will not be encrypted"
        );
        return false;
      }
      logToConsole("info", "Encrypting snapshot data...");
      const encryptedData = await encryptData(data);
      const rawSize = Math.round(encryptedData.length * 0.8);
      logToConsole(
        "info",
        `Estimated raw data size: ${formatFileSize(rawSize)}`
      );
      const zip = new JSZip();
      const jsonFileName = key.replace(".zip", ".json");
      zip.file(jsonFileName, encryptedData, {
        compression: "DEFLATE",
        compressionOptions: {
          level: 9,
        },
        binary: true,
      });
      const compressedContent = await zip.generateAsync({ type: "blob" });
      if (compressedContent.size < 100) {
        throw new Error(
          "Snapshot file is too small or empty. Upload cancelled."
        );
      }
      const arrayBuffer = await compressedContent.arrayBuffer();
      const content = new Uint8Array(arrayBuffer);
      const uploadMetadata = {
        version: EXTENSION_VERSION,
        timestamp: String(Date.now()),
        type: "snapshot",
        originalSize: String(rawSize),
        compressedSize: String(compressedContent.size),
        encrypted: "true",
      };
      await uploadToS3(key, content, uploadMetadata);
      backupState.lastManualSnapshot = Date.now();
      await loadBackupList();
      logToConsole("success", "Snapshot created successfully");
      return true;
    } catch (error) {
      logToConsole("error", "Snapshot creation failed:", error);
      return false;
    } finally {
      backupState.isBackupInProgress = false;
    }
  }
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
  async function restoreFromBackup(key) {
    logToConsole("start", `Starting restore from backup: ${key}`);
    try {
      operationState.isImporting = true;
      const backup = await downloadFromS3(key);
      if (!backup || !backup.data) {
        throw new Error("Backup not found or empty");
      }
      let backupContent;
      if (key.endsWith(".zip")) {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(backup.data);
        const jsonFile = Object.keys(zip.files).find((f) =>
          f.endsWith(".json")
        );
        if (!jsonFile) {
          throw new Error("No JSON file found in backup");
        }
        backupContent = await zip.file(jsonFile).async("uint8array");
      } else {
        backupContent = backup.data;
      }
      logToConsole("info", "Decrypting backup content...");
      const decryptedContent = await decryptData(backupContent);
      logToConsole("info", "Decrypted content type:", typeof decryptedContent);
      let parsedContent;
      try {
        logToConsole("info", "Attempting to parse decrypted content...");
        parsedContent = JSON.parse(decryptedContent);
        logToConsole("info", "Parsed content structure:", {
          type: typeof parsedContent,
          hasLocalStorage: !!parsedContent.localStorage,
          hasIndexedDB: !!parsedContent.indexedDB,
          localStorageKeys: parsedContent.localStorage
            ? Object.keys(parsedContent.localStorage).length
            : 0,
          indexedDBKeys: parsedContent.indexedDB
            ? Object.keys(parsedContent.indexedDB).length
            : 0,
        });
      } catch (error) {
        logToConsole("error", "JSON parse error:", error);
        logToConsole(
          "error",
          "Decrypted content preview:",
          decryptedContent.slice(0, 200)
        );
        throw new Error(`Failed to parse backup data: ${error.message}`);
      }
      if (!parsedContent || typeof parsedContent !== "object") {
        throw new Error("Invalid backup format: Root content is not an object");
      }
      if (!parsedContent.localStorage && !parsedContent.indexedDB) {
        throw new Error(
          "Invalid backup format: Missing both localStorage and indexedDB sections"
        );
      }
      logToConsole("info", "Importing data to storage...");
      await importDataToStorage(parsedContent);
      const chats = await getAllChatsFromIndexedDB();
      for (const chat of chats) {
        if (!chat.id) {
          logToConsole("warning", "Found chat without ID, skipping", chat);
          continue;
        }
      }
      const currentTime = new Date().toLocaleString();
      localStorage.setItem("last-cloud-sync", currentTime);
      await saveLocalMetadata();
      operationState.isImporting = false;
      logToConsole("success", "Backup restored successfully");
      return true;
    } catch (error) {
      logToConsole("error", "Restore failed:", error);
      operationState.isImporting = false;
      throw error;
    }
  }
  function importDataToStorage(data) {
    return new Promise((resolve, reject) => {
      const preserveKeys = [
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
        "last-daily-backup",
        "last-cloud-sync",
        "chat-sync-metadata",
      ];
      let settingsRestored = 0;
      if (data.localStorage) {
        Object.entries(data.localStorage).forEach(([key, settingData]) => {
          if (!preserveKeys.includes(key)) {
            try {
              const value =
                typeof settingData === "object" &&
                settingData.data !== undefined
                  ? settingData.data
                  : settingData;
              const source =
                typeof settingData === "object" && settingData.source
                  ? settingData.source
                  : "localStorage";
              if (source === "indexeddb") {
                return;
              }
              localStorage.setItem(key, value);
              settingsRestored++;
              logToConsole("info", `Restored setting to localStorage: ${key}`);
            } catch (error) {
              logToConsole(
                "error",
                `Error restoring localStorage setting ${key}:`,
                error
              );
            }
          }
        });
      }
      if (data.indexedDB) {
        const request = indexedDB.open("keyval-store");
        request.onerror = () => reject(request.error);
        request.onsuccess = function (event) {
          const db = event.target.result;
          const transaction = db.transaction(["keyval"], "readwrite");
          const objectStore = transaction.objectStore("keyval");
          transaction.oncomplete = () => {
            logToConsole("success", `Settings restore completed`, {
              totalRestored: settingsRestored,
              timestamp: new Date().toISOString(),
            });
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          const deleteRequest = objectStore.clear();
          deleteRequest.onsuccess = function () {
            Object.entries(data.indexedDB).forEach(([key, settingData]) => {
              if (!preserveKeys.includes(key)) {
                try {
                  let value =
                    typeof settingData === "object" &&
                    settingData.data !== undefined
                      ? settingData.data
                      : settingData;
                  const source =
                    typeof settingData === "object" && settingData.source
                      ? settingData.source
                      : "indexeddb";
                  if (source === "localStorage") {
                    return;
                  }
                  if (
                    typeof value === "string" &&
                    (value.startsWith("{") || value.startsWith("["))
                  ) {
                    try {
                      value = JSON.parse(value);
                    } catch (parseError) {
                      logToConsole(
                        "warning",
                        `Failed to parse ${key} as JSON, using as-is`,
                        parseError
                      );
                    }
                  }
                  objectStore.put(value, key);
                  settingsRestored++;
                  logToConsole("info", `Restored setting to IndexedDB: ${key}`);
                } catch (error) {
                  logToConsole(
                    "error",
                    `Error restoring IndexedDB setting ${key}:`,
                    error
                  );
                }
              }
            });
          };
        };
      } else {
        logToConsole("success", `Settings restore completed`, {
          totalRestored: settingsRestored,
          timestamp: new Date().toISOString(),
        });
        resolve();
      }
    });
  }
  function isAwsConfigured() {
    return !!(
      config.accessKey &&
      config.secretKey &&
      config.region &&
      config.bucketName
    );
  }
  function queueOperation(name, operation, dependencies = [], timeout = 30000) {
    if (config.syncMode === "disabled" && !name.startsWith("manual")) {
      logToConsole("skip", `Skipping operation ${name} - sync is disabled`);
      return;
    }
    const existingOp = operationState.operationQueue.find(
      (op) => op.name === name
    );
    const isCurrentlyExecuting =
      operationState.currentlyExecutingOperation === name;

    if (existingOp || isCurrentlyExecuting) {
      logToConsole("skip", `Skipping duplicate operation: ${name}`, {
        existingDeps: existingOp.dependencies,
        newDeps: dependencies,
        queueLength: operationState.operationQueue.length,
        stackTrace: new Error().stack.split("\n").slice(2, 5).join("\n"),
      });
      return;
    }
    dependencies = dependencies.filter(
      (dep) => !operationState.completedOperations.has(dep)
    );
    const operationObject = {
      name,
      operation,
      dependencies,
      timeout,
      retryCount: 0,
      maxRetries: 3,
      addedAt: Date.now(),
    };
    if (dependencies.length === 0) {
      operationState.operationQueue.unshift(operationObject);
    } else {
      operationState.operationQueue.push(operationObject);
    }
    if (name.includes("bidirectional")) {
      logToConsole("info", `Queued ${name}`, {
        dependencies: dependencies,
        queuePosition: dependencies.length === 0 ? "immediate" : "waiting",
        queueLength: operationState.operationQueue.length,
        completedOps: Array.from(operationState.completedOperations),
      });
    }
    processOperationQueue();
  }
  async function processOperationQueue() {
    if (
      operationState.isProcessingQueue ||
      operationState.operationQueue.length === 0
    ) {
      return;
    }
    if (operationState.queueProcessingPromise) {
      return operationState.queueProcessingPromise;
    }
    operationState.queueProcessingPromise = (async () => {
      try {
        operationState.isProcessingQueue = true;
        while (operationState.operationQueue.length > 0) {
          const nextOpIndex = operationState.operationQueue.findIndex((op) =>
            op.dependencies.every((dep) =>
              operationState.completedOperations.has(dep)
            )
          );
          if (nextOpIndex === -1) {
            const pendingDeps = new Set(
              operationState.operationQueue.flatMap((op) => op.dependencies)
            );
            const availableDeps = new Set(operationState.completedOperations);
            const missingDeps = [...pendingDeps].filter(
              (dep) => !availableDeps.has(dep)
            );
            logToConsole(
              "error",
              `Dependency cycle or missing dependencies detected. Missing: ${JSON.stringify(
                missingDeps
              )}`,
              {
                pendingOps: operationState.operationQueue.map((op) => ({
                  name: op.name,
                  deps: op.dependencies,
                })),
                completedOps: [...availableDeps],
              }
            );
            operationState.operationQueue =
              operationState.operationQueue.filter((op) => {
                const opMissingDeps = op.dependencies.filter(
                  (dep) => !availableDeps.has(dep)
                );
                if (opMissingDeps.length > 0) {
                  logToConsole(
                    "warning",
                    `Removing operation '${
                      op.name
                    }' due to missing dependencies: ${JSON.stringify(
                      opMissingDeps
                    )}`
                  );
                  return false;
                }
                return true;
              });
            if (operationState.operationQueue.length === 0) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          const nextOperation = operationState.operationQueue[nextOpIndex];
          const { name, operation, timeout } = nextOperation;
          operationState.currentlyExecutingOperation = name;
          operationState.operationQueue.splice(nextOpIndex, 1);
          try {
            const timeoutPromise = new Promise((_, reject) => {
              const timeoutId = setTimeout(() => {
                reject(
                  new Error(`Operation ${name} timed out after ${timeout}ms`)
                );
              }, timeout);
              operationState.operationTimeouts.set(name, timeoutId);
            });
            logToConsole("info", `Executing operation: ${name}`);
            await Promise.race([operation(), timeoutPromise]);
            clearTimeout(operationState.operationTimeouts.get(name));
            operationState.operationTimeouts.delete(name);
            operationState.completedOperations.add(name);
            if (name.includes("bidirectional")) {
              logToConsole("info", `Completed ${name}`, {
                completedOps: Array.from(operationState.completedOperations),
                remainingQueue: operationState.operationQueue.map((op) => ({
                  name: op.name,
                  deps: op.dependencies,
                  canRun: op.dependencies.every((dep) =>
                    operationState.completedOperations.has(dep)
                  ),
                })),
              });
            }
            operationState.operationQueue.splice(nextOpIndex, 1);
            operationState.currentlyExecutingOperation = null;
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            if (operationState.operationTimeouts.has(name)) {
              clearTimeout(operationState.operationTimeouts.get(name));
              operationState.operationTimeouts.delete(name);
            }
            logToConsole("error", `Error executing operation ${name}:`, error);
            if (nextOperation.retryCount < nextOperation.maxRetries) {
              nextOperation.retryCount++;
              const delay = Math.min(
                1000 * Math.pow(2, nextOperation.retryCount),
                30000
              );
              logToConsole(
                "info",
                `Retrying operation ${name} (attempt ${nextOperation.retryCount}/${nextOperation.maxRetries}) in ${delay}ms`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
            operationState.operationQueue.splice(nextOpIndex, 1);
            operationState.currentlyExecutingOperation = null;
            operationState.completedOperations.delete(name);
            const dependentOps = operationState.operationQueue.filter((op) =>
              op.dependencies.includes(name)
            );
            if (dependentOps.length > 0) {
              logToConsole(
                "warning",
                `Removing ${dependentOps.length} dependent operations due to failure of '${name}'`
              );
              operationState.operationQueue =
                operationState.operationQueue.filter(
                  (op) => !op.dependencies.includes(name)
                );
            }
          }
        }
      } finally {
        operationState.isProcessingQueue = false;
        operationState.queueProcessingPromise = null;
        for (const [name, timeoutId] of operationState.operationTimeouts) {
          clearTimeout(timeoutId);
        }
        operationState.operationTimeouts.clear();
        if (operationState.operationQueue.length === 0) {
          operationState.isImporting = false;
          operationState.isExporting = false;
          operationState.isPendingSync = false;
          operationState.lastError = null;
          checkSyncStatus();
        }
      }
    })();
    return operationState.queueProcessingPromise;
  }
  let recentCloudObservations = [];

  function trackCloudObservation(settingsCount) {
    const now = Date.now();
    recentCloudObservations.push({ timestamp: now, settingsCount });
    recentCloudObservations = recentCloudObservations.filter(
      (obs) => now - obs.timestamp < 300000
    );
  }

  function detectSuspiciousCloudChange(currentCount) {
    if (recentCloudObservations.length === 0) return false;
    const recentObs = recentCloudObservations.filter(
      (obs) => Date.now() - obs.timestamp < 120000
    );
    if (recentObs.length === 0) return false;
    const maxRecentCount = Math.max(
      ...recentObs.map((obs) => obs.settingsCount)
    );
    return currentCount === 0 && maxRecentCount > 50;
  }

  async function detectCloudChanges(cloudMetadata) {
    if (!cloudMetadata || !cloudMetadata.chats)
      return { hasChanges: false, metadata: cloudMetadata };

    const cloudSettingsCount = cloudMetadata.settings?.items
      ? Object.keys(cloudMetadata.settings.items).length
      : 0;
    trackCloudObservation(cloudSettingsCount);

    logToConsole("debug", "🔍 Checking for cloud changes", {
      hasCloudSettings: !!cloudMetadata.settings,
      hasLocalSettings: !!localMetadata.settings,
      cloudSettingsItems: cloudSettingsCount,
      localSettingsItems: localMetadata.settings?.items
        ? Object.keys(localMetadata.settings.items).length
        : 0,
    });

    if (cloudMetadata.settings?.items) {
      logToConsole("debug", "📊 Checking individual settings changes");

      const recentlyModified = Object.entries(cloudMetadata.settings.items)
        .filter(
          ([key, meta]) =>
            !meta.deleted && Date.now() - meta.lastModified < 300000
        )
        .sort((a, b) => b[1].lastModified - a[1].lastModified)
        .slice(0, 5);

      const allModificationTimes = Object.entries(cloudMetadata.settings.items)
        .filter(([key, meta]) => !meta.deleted)
        .map(([key, meta]) => ({
          key,
          lastModified: meta.lastModified,
          ageMinutes: Math.round((Date.now() - meta.lastModified) / 60000),
          timeString: new Date(meta.lastModified).toISOString(),
        }))
        .sort((a, b) => b.lastModified - a.lastModified)
        .slice(0, 5);

      // logToConsole(
      //   "debug",
      //   "Most recently modified settings (regardless of age)",
      //   {
      //     currentTime: new Date().toISOString(),
      //     settings: allModificationTimes,
      //   }
      // );

      // if (recentlyModified.length > 0) {
      //   logToConsole(
      //     "debug",
      //     "Recently modified settings in cloud (last 5 minutes)",
      //     {
      //       count: recentlyModified.length,
      //       settings: recentlyModified.map(([key, meta]) => ({
      //         key,
      //         lastModified: new Date(meta.lastModified).toISOString(),
      //         hash: meta.hash?.substring(0, 8) + "...",
      //         ageMinutes: Math.round((Date.now() - meta.lastModified) / 60000),
      //       })),
      //     }
      //   );
      // } else {
      //   logToConsole("debug", "No settings found modified in the last 5 minutes");
      // }

      const settingsEntries = Object.entries(cloudMetadata.settings.items);
      // logToConsole(
      //   "debug",
      //   `Starting to check ${settingsEntries.length} cloud settings individually`
      // );

      let checkedCount = 0;
      let changesFound = 0;
      // let sampleSettings = [];

      for (const [settingKey, cloudSettingMeta] of settingsEntries) {
        checkedCount++;
        const localSettingMeta = localMetadata.settings?.items?.[settingKey];

        // if (checkedCount <= 3) {
        //   sampleSettings.push({
        //     key: settingKey,
        //     cloudHash: cloudSettingMeta.hash?.substring(0, 12) + "...",
        //     localHash: localSettingMeta?.hash?.substring(0, 12) + "...",
        //     hashMatch: cloudSettingMeta.hash === localSettingMeta?.hash,
        //     cloudModified: cloudSettingMeta.lastModified
        //       ? new Date(cloudSettingMeta.lastModified).toISOString()
        //       : "NONE",
        //     localSynced: localSettingMeta?.syncedAt
        //       ? new Date(localSettingMeta.syncedAt).toISOString()
        //       : "NONE",
        //   });
        // }

        if (cloudSettingMeta.deleted === true) {
          if (
            !localSettingMeta?.deleted ||
            cloudSettingMeta.deletedAt > (localSettingMeta?.deletedAt || 0)
          ) {
            logToConsole(
              "debug",
              `✅ Cloud settings change detected: Newer tombstone for ${settingKey}`
            );
            return { hasChanges: true, metadata: cloudMetadata };
          }
          continue;
        }

        const hasLocalMeta = !!localSettingMeta;
        const hasLocalHash = !!localSettingMeta?.hash;
        const hasLocalSyncedAt = !!localSettingMeta?.syncedAt;
        const hashMatch = cloudSettingMeta.hash === localSettingMeta?.hash;
        const cloudNewer =
          cloudSettingMeta.lastModified > (localSettingMeta?.syncedAt || 0);

        const mightHaveChange =
          !hasLocalMeta ||
          !hasLocalHash ||
          !hasLocalSyncedAt ||
          !hashMatch ||
          cloudNewer;

        if (mightHaveChange) {
          changesFound++;
          logToConsole(
            "info",
            `🔍 POTENTIAL CHANGE DETECTED for ${settingKey}`,
            {
              hasLocalMeta,
              hasLocalHash,
              hasLocalSyncedAt,
              hashMatch,
              cloudNewer,
              cloudLastModified: cloudSettingMeta.lastModified
                ? new Date(cloudSettingMeta.lastModified).toISOString()
                : "NONE",
              localSyncedAt: localSettingMeta?.syncedAt
                ? new Date(localSettingMeta.syncedAt).toISOString()
                : "NONE",
              cloudHash: cloudSettingMeta.hash?.substring(0, 12) + "...",
              localHash: localSettingMeta?.hash?.substring(0, 12) + "...",
              timeDiff:
                cloudSettingMeta.lastModified && localSettingMeta?.syncedAt
                  ? cloudSettingMeta.lastModified - localSettingMeta.syncedAt
                  : "N/A",
            }
          );
        }

        if (
          !localSettingMeta ||
          !localSettingMeta.hash ||
          !localSettingMeta.syncedAt ||
          (cloudSettingMeta.hash &&
            cloudSettingMeta.hash !== localSettingMeta.hash) ||
          cloudSettingMeta.lastModified > localSettingMeta.syncedAt
        ) {
          const reason = !localSettingMeta
            ? "missing locally"
            : !localSettingMeta.hash
            ? "no local hash"
            : !localSettingMeta.syncedAt
            ? "never synced"
            : cloudSettingMeta.hash !== localSettingMeta.hash
            ? "hash mismatch"
            : "cloud newer";

          logToConsole(
            "info",
            `✅ CONFIRMED Cloud settings change detected: ${settingKey} (${reason})`,
            {
              cloudLastModified: cloudSettingMeta.lastModified
                ? new Date(cloudSettingMeta.lastModified).toISOString()
                : "NONE",
              localSyncedAt: localSettingMeta?.syncedAt
                ? new Date(localSettingMeta.syncedAt).toISOString()
                : "NONE",
              cloudHash: cloudSettingMeta.hash,
              localHash: localSettingMeta?.hash,
            }
          );
          return { hasChanges: true, metadata: cloudMetadata };
        }
      }

      logToConsole(
        "debug",
        `Finished checking individual settings: ${checkedCount} checked, ${changesFound} potential changes found, 0 confirmed changes`
      );

      // if (sampleSettings.length > 0) {
      //   logToConsole("debug", "Sample settings checked", { sampleSettings });
      // }

      const timestampMismatches = [];
      for (const [settingKey, cloudSettingMeta] of settingsEntries.slice(
        0,
        10
      )) {
        const localSettingMeta = localMetadata.settings?.items?.[settingKey];
        if (
          localSettingMeta &&
          cloudSettingMeta.lastModified &&
          localSettingMeta.syncedAt
        ) {
          const timeDiff =
            cloudSettingMeta.lastModified - localSettingMeta.syncedAt;
          if (Math.abs(timeDiff) > 1000) {
            timestampMismatches.push({
              key: settingKey,
              cloudModified: new Date(
                cloudSettingMeta.lastModified
              ).toISOString(),
              localSynced: new Date(localSettingMeta.syncedAt).toISOString(),
              timeDiff: timeDiff,
              cloudNewer: timeDiff > 0,
              hashMatch: cloudSettingMeta.hash === localSettingMeta.hash,
            });
          }
        }
      }

      // if (timestampMismatches.length > 0) {
      //   logToConsole("debug", "Found timestamp mismatches in sample", {
      //     timestampMismatches,
      //   });
      // }

      logToConsole("debug", "❌ No individual settings changes detected");
    } else {
      logToConsole(
        "debug",
        "ℹ️ No cloud settings items found, checking if we have local settings to upload"
      );

      if (
        localMetadata.settings?.items &&
        Object.keys(localMetadata.settings.items).length > 0
      ) {
        const localSettingsCount = Object.keys(
          localMetadata.settings.items
        ).length;

        const suspiciousChange =
          detectSuspiciousCloudChange(cloudSettingsCount);
        const timeSinceLastSync =
          Date.now() - (localMetadata.lastSyncTime || 0);
        const recentSync = timeSinceLastSync < 60000;

        if ((recentSync && localSettingsCount > 10) || suspiciousChange) {
          const reason = suspiciousChange
            ? `recently observed cloud with ${Math.max(
                ...recentCloudObservations.map((obs) => obs.settingsCount)
              )} settings`
            : `last sync was recent (${Math.round(
                timeSinceLastSync / 1000
              )}s ago)`;

          logToConsole(
            "warning",
            `Cloud has no settings but local has ${localSettingsCount} and ${reason}. This may be a race condition - waiting 5 seconds before proceeding.`
          );

          await new Promise((resolve) => setTimeout(resolve, 5000));

          try {
            const retryMetadata = await downloadCloudMetadata();
            const retryCloudCount = retryMetadata.settings?.items
              ? Object.keys(retryMetadata.settings.items).length
              : 0;

            if (retryCloudCount > 0) {
              logToConsole(
                "info",
                `Race condition avoided - cloud now has ${retryCloudCount} settings after retry`
              );
              return await detectCloudChanges(retryMetadata);
            } else {
              logToConsole(
                "warning",
                `Retry still shows 0 cloud settings. Proceeding with caution - this might be a genuine cloud reset.`
              );
            }
          } catch (retryError) {
            logToConsole(
              "warning",
              "Retry metadata download failed",
              retryError
            );
          }
        }

        logToConsole(
          "debug",
          `✅ Cloud settings change detected: Cloud has no settings but local has ${localSettingsCount}`
        );
        return { hasChanges: true, metadata: cloudMetadata };
      }
    }

    for (const [chatId, cloudChatMeta] of Object.entries(cloudMetadata.chats)) {
      const localChatMeta = localMetadata.chats[chatId];
      if (cloudChatMeta.deleted === true) {
        if (
          !localChatMeta?.deleted ||
          cloudChatMeta.deletedAt > (localChatMeta?.deletedAt || 0)
        ) {
          logToConsole(
            "debug",
            `Cloud change detected: Newer tombstone for ${chatId}`
          );
          return { hasChanges: true, metadata: cloudMetadata };
        }
        continue;
      }
      if (
        !localChatMeta ||
        (localChatMeta && !localChatMeta.hash) ||
        (cloudChatMeta && !cloudChatMeta.hash) ||
        (localChatMeta &&
          cloudChatMeta.hash &&
          localChatMeta.hash &&
          cloudChatMeta.hash !== localChatMeta.hash)
      ) {
        logToConsole(
          "debug",
          `Cloud change detected: Hash/existence difference for ${chatId}`
        );
        return { hasChanges: true, metadata: cloudMetadata };
      }
    }
    for (const chatId in localMetadata.chats) {
      if (
        !cloudMetadata.chats[chatId] &&
        !localMetadata.chats[chatId].deleted
      ) {
        logToConsole(
          "debug",
          `Cloud change detected: Chat ${chatId} exists locally but not in cloud.`
        );
      }
    }

    logToConsole("debug", "❌ No cloud changes detected");
    return { hasChanges: false, metadata: cloudMetadata };
  }

  async function detectLocalOnlySettings(cloudMetadata) {
    if (!localMetadata.settings?.items) {
      return false;
    }

    if (!cloudMetadata.settings?.items) {
      logToConsole(
        "debug",
        "✅ Local-only settings detected: Cloud has no settings but local has settings"
      );
      return true;
    }

    for (const settingKey of Object.keys(localMetadata.settings.items)) {
      const localSettingMeta = localMetadata.settings.items[settingKey];
      if (
        !localSettingMeta.deleted &&
        !cloudMetadata.settings.items[settingKey]
      ) {
        logToConsole(
          "debug",
          `✅ Local-only settings detected: Setting ${settingKey} exists locally but not in cloud`
        );
        return true;
      }
    }

    logToConsole("debug", "❌ No local-only settings detected");
    return false;
  }

  function startSyncInterval() {
    if (activeIntervals.sync) {
      clearInterval(activeIntervals.sync);
      activeIntervals.sync = null;
    }
    if (config.syncMode === "disabled") {
      logToConsole("info", "Sync intervals disabled - manual operations only");
      return;
    }
    activeIntervals.sync = setInterval(async () => {
      if (document.hidden) return;
      if (
        operationState.isImporting ||
        operationState.isExporting ||
        operationState.isProcessingQueue
      ) {
        return;
      }
      try {
        const hasLocalChanges =
          (await checkLocalSettingsChanges()) ||
          Object.values(localMetadata.chats).some(
            (chat) =>
              !chat.deleted &&
              (chat.lastModified > (chat.syncedAt || 0) || !chat.syncedAt)
          );
        if (config.syncMode === "sync") {
          const initialCloudMetadata = await downloadCloudMetadata();
          const cloudChangesResult = await detectCloudChanges(
            initialCloudMetadata
          );
          const hasCloudChanges = cloudChangesResult.hasChanges;
          const cloudMetadata = cloudChangesResult.metadata;
          const hasLocalOnlySettings = await detectLocalOnlySettings(
            cloudMetadata
          );
          logToConsole("debug", "🔄 Sync interval decision", {
            hasCloudChanges,
            hasLocalChanges,
            hasLocalOnlySettings,
            localSettingsChanges: await checkLocalSettingsChanges(),
            cloudSettingsItems: cloudMetadata.settings?.items
              ? Object.keys(cloudMetadata.settings.items).length
              : 0,
            localSettingsItems: localMetadata.settings?.items
              ? Object.keys(localMetadata.settings.items).length
              : 0,
            decision:
              hasCloudChanges && (hasLocalChanges || hasLocalOnlySettings)
                ? "BIDIRECTIONAL"
                : hasCloudChanges
                ? "CLOUD_TO_LOCAL"
                : hasLocalChanges || hasLocalOnlySettings
                ? "LOCAL_TO_CLOUD"
                : "NO_SYNC",
          });
          const cloudChatCount = Object.keys(cloudMetadata?.chats || {}).length;
          const localChatCount = Object.keys(localMetadata.chats || {}).length;
          if (
            (cloudChatCount === 0 && localChatCount > 0) ||
            cloudMetadata.lastSyncTime === 0
          ) {
            logToConsole(
              "info",
              "Cloud is empty/new but we have local chats - syncing to cloud"
            );
            queueOperation("cloud-empty-sync", syncToCloud);
            return;
          }
          if (hasCloudChanges && (hasLocalChanges || hasLocalOnlySettings)) {
            logToConsole(
              "info",
              "Changes detected on both sides - queuing bidirectional sync"
            );
            const syncId = Date.now();
            const cloudSyncOp = `bidirectional-cloud-sync-${syncId}`;
            const localSyncOp = `bidirectional-local-sync-${syncId}`;
            queueOperation(cloudSyncOp, syncFromCloud, [], 300000);
            queueOperation(localSyncOp, syncToCloud, [cloudSyncOp], 60000);
            logToConsole("info", "Queued bidirectional sync operations");
          } else if (hasCloudChanges) {
            logToConsole("info", "Cloud changes detected - queuing cloud sync");
            queueOperation("cloud-changes-sync", syncFromCloud);
          } else if (hasLocalChanges || hasLocalOnlySettings) {
            logToConsole("info", "Local changes detected - queuing local sync");
            queueOperation("local-changes-sync", syncToCloud);
          }
        } else if (config.syncMode === "backup" && hasLocalChanges) {
          logToConsole("info", "Local changes detected - backing up to cloud");
          queueOperation("backup-modified-chats", syncToCloud);
        }
      } catch (error) {
        logToConsole("error", "Error in sync interval:", error);
      }
    }, config.syncInterval * 1000);
    logToConsole("info", `Started sync interval (${config.syncInterval}s)`);
  }
  async function performInitialSync() {
    logToConsole("start", "Performing initial sync...");
    try {
      const metadata = await downloadCloudMetadata();
      const chatCount = Object.keys(metadata.chats || {}).length;
      const localChatCount = Object.keys(localMetadata.chats || {}).length;
      const settingsItemsCount = Object.keys(
        metadata.settings?.items || {}
      ).length;
      logToConsole("info", "Initial sync status", {
        cloudChats: chatCount,
        localChats: localChatCount,
        cloudSettingsItems: settingsItemsCount,
      });
      if (
        (chatCount === 0 && localChatCount > 0) ||
        metadata.lastSyncTime === 0
      ) {
        logToConsole(
          "info",
          "Creating fresh backup with local data - cloud is empty or newly initialized"
        );
        if (!metadata.chats) {
          metadata.chats = {};
        }
        if (!metadata.settings) {
          metadata.settings = { items: {} };
        }
        if (!metadata.settings.items) {
          metadata.settings.items = {};
        }

        const chats = await getAllChatsFromIndexedDB();
        let uploadedCount = 0;
        for (const chat of chats) {
          if (!chat.id) continue;
          const localChatMeta = localMetadata.chats[chat.id];
          if (!localChatMeta) continue;
          metadata.chats[chat.id] = {
            hash: localChatMeta.hash || (await generateHash(chat, "chat")),
            lastModified: localChatMeta.lastModified || Date.now(),
            syncedAt: Date.now(),
            deleted: false,
          };
          try {
            await uploadChatToCloud(chat.id, metadata);
            uploadedCount++;
            if (uploadedCount % 10 === 0) {
              logToConsole(
                "info",
                `Upload progress: ${uploadedCount}/${chats.length} chats`
              );
            }
          } catch (error) {
            logToConsole("error", `Failed to upload chat ${chat.id}:`, error);
          }
        }

        // Handle initial settings upload when cloud settings are empty
        if (settingsItemsCount === 0) {
          logToConsole(
            "info",
            "Cloud settings are empty - performing initial upload of all local settings"
          );
          try {
            const settingsUploaded = await syncSettingsToCloud();
            if (settingsUploaded) {
              logToConsole(
                "success",
                "Successfully uploaded local settings to cloud during initial sync"
              );
            } else {
              logToConsole(
                "info",
                "No local settings to upload during initial sync"
              );
            }
          } catch (error) {
            logToConsole(
              "error",
              "Failed to upload settings during initial sync:",
              error
            );
          }
        }

        metadata.lastSyncTime = Date.now();
        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(metadata)),
          {
            ContentType: "application/json",
            ServerSideEncryption: "AES256",
          }
        );
        localMetadata.lastSyncTime = metadata.lastSyncTime;
        await saveLocalMetadata();
        logToConsole("success", "Successfully uploaded local chats to cloud", {
          chatsUploaded: uploadedCount,
          totalChats: chats.length,
        });
        return;
      }

      // Handle case where cloud has chats but settings are empty
      if (settingsItemsCount === 0 && chatCount > 0) {
        logToConsole(
          "info",
          "Cloud has chats but settings are empty - performing initial settings upload"
        );
        try {
          const settingsUploaded = await syncSettingsToCloud();
          if (settingsUploaded) {
            logToConsole(
              "success",
              "Successfully uploaded local settings to cloud (cloud had chats but no settings)"
            );
          } else {
            logToConsole(
              "info",
              "No local settings to upload (cloud had chats but no settings)"
            );
          }
        } catch (error) {
          logToConsole(
            "error",
            "Failed to upload settings when cloud had chats but no settings:",
            error
          );
        }
      }

      logToConsole(
        "info",
        "Cloud data found and validated - performing normal sync"
      );
      await syncFromCloud();
    } catch (error) {
      logToConsole("error", "Error during initial sync:", error);
      throw error;
    }
  }
  async function syncFromCloud() {
    if (operationState.isImporting || operationState.isExporting) {
      logToConsole("skip", "Sync already in progress, queueing this sync");
      operationState.isPendingSync = true;
      return;
    }
    try {
      operationState.isImporting = true;
      operationState.isPendingSync = false;
      logToConsole("start", "Starting sync from cloud...");
      const syncTimestamp = Date.now();
      const cloudMetadata = await downloadCloudMetadata();
      if (!cloudMetadata || !cloudMetadata.chats) {
        logToConsole("info", "No cloud metadata found or invalid format");
        return;
      }
      const cloudChatCount = Object.keys(cloudMetadata.chats).length;
      const localChatCount = Object.keys(localMetadata.chats || {}).length;
      if (
        (cloudChatCount === 0 && localChatCount > 0) ||
        cloudMetadata.lastSyncTime === 0
      ) {
        logToConsole(
          "info",
          "Aborting sync from cloud - cloud is empty/new but we have local data"
        );
        queueOperation("cloud-empty-sync", syncToCloud, [], 300000);
        return;
      }
      let hasChanges = false;
      let metadataNeedsSaving = false;
      let totalChats = Object.keys(cloudMetadata.chats).length;
      let processedChats = 0;
      let downloadedChats = 0;
      let deletedChats = 0;

      // Handle individual settings sync
      const settingsChanged = await syncSettingsFromCloud();
      if (settingsChanged) {
        hasChanges = true;
        metadataNeedsSaving = true;
        logToConsole("success", "Individual settings sync completed");
      } else {
        logToConsole("info", "No settings changes applied from cloud");
      }

      const currentLocalChats = await getAllChatsFromIndexedDB();
      const currentLocalChatIds = new Set(
        currentLocalChats.map((chat) => chat.id)
      );
      const cloudChatIds = new Set(Object.keys(cloudMetadata.chats));
      for (const [chatId, cloudChatMeta] of Object.entries(
        cloudMetadata.chats
      )) {
        processedChats++;
        const localChatMeta = localMetadata.chats[chatId];
        const chatExistsLocally = currentLocalChatIds.has(chatId);
        if (cloudChatMeta.deleted === true) {
          if (
            localChatMeta &&
            !localChatMeta.deleted &&
            localChatMeta.lastModified > cloudChatMeta.deletedAt
          ) {
            logToConsole(
              "info",
              `Local chat ${chatId} appears to be a restoration - keeping local version`
            );
            continue;
          }
          if (chatExistsLocally) {
            logToConsole(
              "cleanup",
              `Deleting local chat ${chatId} due to cloud tombstone`
            );
            await deleteChatFromIndexedDB(chatId);
            deletedChats++;
            hasChanges = true;
          }
          const currentMeta = localMetadata.chats[chatId];
          if (
            !currentMeta ||
            !currentMeta.deleted ||
            currentMeta.deletedAt < cloudChatMeta.deletedAt
          ) {
            localMetadata.chats[chatId] = {
              deleted: true,
              deletedAt: cloudChatMeta.deletedAt,
              lastModified: cloudChatMeta.lastModified,
              syncedAt: syncTimestamp,
              tombstoneVersion: cloudChatMeta.tombstoneVersion || 1,
            };
            metadataNeedsSaving = true;
          }
          continue;
        }
        if (localChatMeta?.deleted === true) {
          await deleteChatFromCloud(chatId);
          continue;
        }
        if (
          !chatExistsLocally ||
          !localChatMeta ||
          (cloudChatMeta.hash &&
            (!localChatMeta.hash || cloudChatMeta.hash !== localChatMeta.hash))
        ) {
          let downloadReason = "Unknown";
          if (!chatExistsLocally) downloadReason = "Chat missing locally";
          else if (!localChatMeta) downloadReason = "Missing local metadata";
          else if (!localChatMeta.hash) downloadReason = "Local hash missing";
          else if (cloudChatMeta.hash !== localChatMeta.hash)
            downloadReason = "Hash mismatch";
          logToConsole(
            "info",
            `Queueing download for chat ${chatId}. Reason: ${downloadReason}`,
            {
              localHash: localChatMeta?.hash,
              cloudHash: cloudChatMeta?.hash,
            }
          );
          const cloudChat = await downloadChatFromCloud(chatId);
          if (cloudChat) {
            let chatToSave = cloudChat;
            const localChat = await getChatFromIndexedDB(chatId);
            if (localChat) {
              chatToSave = await mergeChats(localChat, cloudChat);
            }
            await saveChatToIndexedDB(chatToSave, syncTimestamp);
            hasChanges = true;
            downloadedChats++;
            metadataNeedsSaving = true;
            try {
              const newHash = await generateHash(chatToSave, "chat");
              logToConsole(
                "debug",
                `Hash calculated for immediate save in syncFromCloud for ${chatId}`,
                { hash: newHash }
              );
              const metaString = await getIndexedDBKey("sync-metadata");
              let currentLocalMeta = JSON.parse(metaString || "{}");
              if (!currentLocalMeta.chats) currentLocalMeta.chats = {};
              if (!currentLocalMeta.chats[chatId])
                currentLocalMeta.chats[chatId] = {};
              currentLocalMeta.chats[chatId].hash = newHash;
              currentLocalMeta.chats[chatId].syncedAt = syncTimestamp;
              currentLocalMeta.chats[chatId].lastModified = syncTimestamp;
              currentLocalMeta.chats[chatId].deleted = false;
              delete currentLocalMeta.chats[chatId].deletedAt;
              delete currentLocalMeta.chats[chatId].tombstoneVersion;
              await setIndexedDBKey(
                "sync-metadata",
                JSON.stringify(currentLocalMeta)
              );
              logToConsole(
                "debug",
                `Immediately saved metadata for ${chatId} after merge.`
              );
              metadataNeedsSaving = false;
            } catch (metaSaveError) {
              logToConsole(
                "error",
                `Failed immediate metadata save for ${chatId}`,
                metaSaveError
              );
              metadataNeedsSaving = true;
            }
            if (!localMetadata.chats[chatId]) {
              localMetadata.chats[chatId] = {};
            }
            const currentMeta = localMetadata.chats[chatId];
            if (
              currentMeta.lastModified !== cloudChatMeta.lastModified ||
              currentMeta.syncedAt !== syncTimestamp ||
              currentMeta.hash !== cloudChatMeta.hash
            ) {
              localMetadata.chats[chatId].lastModified =
                cloudChatMeta.lastModified;
              localMetadata.chats[chatId].syncedAt = syncTimestamp;
              localMetadata.chats[chatId].hash = cloudChatMeta.hash;
              metadataNeedsSaving = true;
            }
          }
        }
      }
      const localOnlyChats = Array.from(currentLocalChatIds).filter(
        (id) => !cloudChatIds.has(id)
      );
      let localChatsProcessed = 0;
      const totalLocalOnly = localOnlyChats.length;
      if (totalLocalOnly > 0) {
        logToConsole("info", `Processing ${totalLocalOnly} local-only chats`);
      }
      for (const chatId of localOnlyChats) {
        localChatsProcessed++;
        const localChatMeta = localMetadata.chats[chatId];
        if (localChatMeta?.deleted === true) {
          continue;
        }
        logToConsole("info", `Local chat ${chatId} sync state:`, {
          hasMetadata: !!localChatMeta,
          hasLastSyncTime: !!localMetadata.lastSyncTime,
          lastModified: localChatMeta?.lastModified,
          lastSynced: localChatMeta?.syncedAt,
          needsSync:
            !localChatMeta ||
            !localMetadata.lastSyncTime ||
            localChatMeta.lastModified > localChatMeta.syncedAt,
        });
        if (
          !localChatMeta ||
          !localMetadata.lastSyncTime ||
          localChatMeta.lastModified > localChatMeta.syncedAt
        ) {
          logToConsole("info", `Uploading local chat ${chatId} to cloud`);
          try {
            await uploadChatToCloud(chatId);
            hasChanges = true;
          } catch (error) {
            logToConsole("error", `Error uploading chat ${chatId}:`, error);
          }
          continue;
        } else {
          logToConsole(
            "info",
            `Chat ${chatId} doesn't need upload - already synced and no changes`
          );
        }
      }
      if (metadataNeedsSaving) {
        logToConsole(
          "info",
          "Saving batched metadata changes from syncFromCloud"
        );
        await saveLocalMetadata();
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
        await saveLocalMetadata();
        logToConsole("success", "Sync summary:", {
          totalChatsProcessed: processedChats,
          downloaded: downloadedChats,
          deleted: deletedChats,
          localProcessed: localChatsProcessed,
          duration: `${Math.round((Date.now() - syncTimestamp) / 1000)}s`,
        });
      } else {
        logToConsole("info", "No changes detected during sync from cloud");
        if (metadataNeedsSaving) {
          await saveLocalMetadata();
        }
        updateSyncStatusDot("in-sync");
      }
      operationState.lastError = null;
      localStorage.setItem("last-cloud-sync", new Date().toLocaleString());
      logToConsole("success", "Sync completed successfully");
      operationState.lastSyncStatus = "success";
      throttledCheckSyncStatus();
    } catch (error) {
      logToConsole("error", "Sync failed:", error);
      operationState.lastError = error;
      operationState.lastSyncStatus = "error";
      updateSyncStatusDot("error");
      throw error;
    } finally {
      operationState.isImporting = false;
      if (operationState.isPendingSync) {
        operationState.isPendingSync = false;
        queueOperation("pending-sync", syncFromCloud);
      }
      throttledCheckSyncStatus();
    }
  }
  async function syncToCloud() {
    if (operationState.isImporting || operationState.isExporting) {
      logToConsole("skip", "Sync in progress - skipping");
      return;
    }
    logToConsole("start", "Starting sync to cloud...");
    operationState.isExporting = true;
    updateSyncStatus();
    try {
      const syncTimestamp = Date.now();
      await loadLocalMetadata();
      const cloudMetadata = await downloadCloudMetadata();
      let hasChanges = false;
      let uploadedChats = 0;
      let totalChatsToUpload = 0;

      // Handle individual settings sync
      const settingsChanged = await syncSettingsToCloud();
      if (settingsChanged) {
        hasChanges = true;
        logToConsole("success", "Individual settings uploaded to cloud");
      } else {
        logToConsole("info", "No settings changes to upload");
      }

      // Refresh cloud metadata after settings sync to avoid overwriting with stale data
      const refreshedCloudMetadata = settingsChanged
        ? await downloadCloudMetadata()
        : cloudMetadata;

      const chats = await getAllChatsFromIndexedDB();
      const chatsToUpload = [];
      for (const chat of chats) {
        if (!chat.id) continue;
        const currentLocalMeta = await getIndexedDBKey("sync-metadata").then(
          (metaStr) => {
            try {
              return JSON.parse(metaStr)?.chats?.[chat.id];
            } catch {
              return null;
            }
          }
        );
        const localChatMeta = currentLocalMeta;
        const cloudChatMeta = refreshedCloudMetadata.chats[chat.id];
        if (
          cloudChatMeta?.deleted === true &&
          (!localChatMeta ||
            localChatMeta.lastModified <= cloudChatMeta.deletedAt)
        ) {
          continue;
        }
        if (
          !cloudChatMeta ||
          (cloudChatMeta &&
            cloudChatMeta.hash &&
            (!localChatMeta ||
              !localChatMeta.hash ||
              cloudChatMeta.hash !== localChatMeta.hash)) ||
          !localChatMeta
        ) {
          logToConsole(
            "info",
            `syncToCloud: Adding ${chat.id} to upload queue.`
          );
          chatsToUpload.push(chat.id);
        } else if (localChatMeta && localChatMeta.syncedAt === 0) {
          logToConsole(
            "debug",
            `syncToCloud: Chat ${chat.id} hashes match cloud, updating local syncedAt timestamp.`
          );
          localMetadata.chats[chat.id].syncedAt = syncTimestamp;
          localMetadata.chats[chat.id].lastModified = syncTimestamp;
          hasChanges = true;
        }
      }
      totalChatsToUpload = chatsToUpload.length;
      if (totalChatsToUpload > 0) {
        logToConsole("info", `Found ${totalChatsToUpload} chats to upload`);
        hasChanges = true;
        for (const chatId of chatsToUpload) {
          try {
            const chatData = await getChatFromIndexedDB(chatId);
            const encryptedData = await encryptData(chatData);
            await uploadToS3(`chats/${chatId}.json`, encryptedData, {
              ContentType: "application/json",
              ServerSideEncryption: "AES256",
            });
            if (!localMetadata.chats[chatId]) {
              localMetadata.chats[chatId] = {};
            }
            const newHash = await generateHash(chatData, "chat");
            localMetadata.chats[chatId] = {
              ...localMetadata.chats[chatId],
              lastModified: chatData.updatedAt || syncTimestamp,
              syncedAt: syncTimestamp,
              hash: newHash,
            };
            if (!refreshedCloudMetadata.chats)
              refreshedCloudMetadata.chats = {};
            refreshedCloudMetadata.chats[chatId] = {
              lastModified: chatData.updatedAt || syncTimestamp,
              syncedAt: syncTimestamp,
              hash: newHash,
            };
            lastSeenUpdates[chatId] = {
              updatedAt: syncTimestamp,
              hash: newHash,
            };
            uploadedChats++;
            if (
              uploadedChats % 5 === 0 ||
              uploadedChats === totalChatsToUpload
            ) {
              logToConsole(
                "info",
                `Uploaded ${uploadedChats}/${totalChatsToUpload} chats`
              );
            }
            await saveLocalMetadata();
          } catch (error) {
            logToConsole("error", `Error uploading chat ${chatId}:`, error);
            if (localMetadata.chats[chatId]) {
              localMetadata.chats[chatId].syncedAt = 0;
              await saveLocalMetadata();
            }
          }
        }
      }
      let deletedChats = 0;
      for (const [chatId, localChatMeta] of Object.entries(
        localMetadata.chats
      )) {
        if (
          localChatMeta.deleted === true &&
          (!refreshedCloudMetadata.chats[chatId]?.deleted ||
            (refreshedCloudMetadata.chats[chatId]?.deleted === true &&
              localChatMeta.tombstoneVersion >
                (refreshedCloudMetadata.chats[chatId]?.tombstoneVersion ||
                  0))) &&
          (localChatMeta.syncedAt === 0 ||
            (refreshedCloudMetadata.chats[chatId]?.tombstoneVersion || 0) <
              localChatMeta.tombstoneVersion)
        ) {
          try {
            await deleteFromS3(`chats/${chatId}.json`);
            deletedChats++;
            refreshedCloudMetadata.chats[chatId] = {
              deleted: true,
              deletedAt: syncTimestamp,
              lastModified: syncTimestamp,
              syncedAt: syncTimestamp,
              tombstoneVersion: Math.max(
                localChatMeta.tombstoneVersion || 1,
                (refreshedCloudMetadata.chats[chatId]?.tombstoneVersion || 0) +
                  1
              ),
            };
            localMetadata.chats[chatId] = {
              ...localMetadata.chats[chatId],
              syncedAt: syncTimestamp,
              tombstoneVersion:
                refreshedCloudMetadata.chats[chatId].tombstoneVersion,
            };
            hasChanges = true;
            await saveLocalMetadata();
          } catch (error) {
            logToConsole("error", `Error deleting chat ${chatId}:`, error);
            if (localMetadata.chats[chatId]) {
              localMetadata.chats[chatId].syncedAt = 0;
              await saveLocalMetadata();
            }
          }
        }
      }
      if (hasChanges) {
        localMetadata.lastSyncTime = syncTimestamp;
        refreshedCloudMetadata.lastSyncTime = syncTimestamp;
        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(refreshedCloudMetadata)),
          {
            ContentType: "application/json",
            ServerSideEncryption: "AES256",
          }
        );
        await saveLocalMetadata();
        throttledCheckSyncStatus();
        logToConsole("success", "Sync to cloud completed with changes", {
          uploadedChats,
          deletedChats,
          totalChatsProcessed: uploadedChats + deletedChats,
        });
      } else {
        logToConsole("info", "No changes detected during sync to cloud");
        throttledCheckSyncStatus();
      }
      operationState.lastError = null;
    } catch (error) {
      logToConsole("error", "Sync to cloud failed:", error);
      operationState.lastError = error;
      throttledCheckSyncStatus();
      throw error;
    } finally {
      operationState.isExporting = false;
      throttledCheckSyncStatus();
    }
  }
  async function detectChanges(localChats, cloudChats) {
    const changes = [];
    const localChatsMap = new Map(localChats.map((chat) => [chat.id, chat]));
    const cloudChatsMap = new Map(cloudChats.map((chat) => [chat.id, chat]));
    const processedIds = new Set();
    for (const [chatId, cloudChat] of cloudChatsMap) {
      processedIds.add(chatId);
      const localChat = localChatsMap.get(chatId);
      if (!localChat) {
        changes.push({ type: "add", chat: cloudChat });
      } else {
        const cloudHash = await generateHash(cloudChat, "chat");
        const localHash = await generateHash(localChat, "chat");
        if (cloudHash !== localHash) {
          if (cloudChat.updatedAt > localChat.updatedAt) {
            changes.push({ type: "update", chat: cloudChat });
          }
        }
      }
    }
    for (const [chatId, localChat] of localChatsMap) {
      if (!processedIds.has(chatId)) {
        changes.push({ type: "delete", chatId });
      }
    }
    return changes;
  }
  async function updateChatMetadata(
    chatId,
    isModified = true,
    isDeleted = false,
    syncTimestamp = null,
    chatObject = null
  ) {
    let metadataChanged = false;
    if (!chatId) {
      logToConsole("error", "No chat ID provided to updateChatMetadata");
      return false;
    }
    const chat = chatObject;
    if (!chat && !isDeleted) {
      logToConsole(
        "error",
        "Chat object not provided to updateChatMetadata for non-deletion",
        chatId
      );
      return false;
    }
    if (!localMetadata.chats[chatId]) {
      localMetadata.chats[chatId] = {
        lastModified: Date.now(),
        syncedAt: 0,
        hash: null,
        deleted: false,
      };
      metadataChanged = true;
    }
    if (chat) {
      const currentHash = await generateHash(chat, "chat");
      const metadata = localMetadata.chats[chatId];
      const previousHash = metadata.hash;
      const previousLastModified = metadata.lastModified;
      const previousSyncedAt = metadata.syncedAt;
      metadata.lastModified = Date.now();
      metadata.hash = currentHash;
      if (syncTimestamp) {
        metadata.syncedAt = syncTimestamp;
        metadata.lastModified = syncTimestamp;
      } else if (isModified) {
        metadata.syncedAt = 0;
        metadata.lastModified = Date.now();
      } else {
        metadata.lastModified = previousLastModified;
        metadata.syncedAt = previousSyncedAt;
      }
      metadata.hash = currentHash;
      if (
        metadata.lastModified !== previousLastModified ||
        metadata.hash !== previousHash ||
        metadata.syncedAt !== previousSyncedAt ||
        metadata.deleted
      ) {
        metadataChanged = true;
      }
      if (isModified && !syncTimestamp) {
        if (metadata.syncedAt !== 0) {
          metadata.syncedAt = 0;
          metadataChanged = true;
        }
        logToConsole(
          "info",
          `Queueing upload for locally modified chat ${chatId}`
        );
        queueOperation(`chat-changed-${chatId}`, () =>
          uploadChatToCloud(chatId)
        );
      }
      if (metadata.deleted) {
        metadata.deleted = false;
        delete metadata.deletedAt;
        delete metadata.tombstoneVersion;
        metadataChanged = true;
      }
      lastSeenUpdates[chatId] = {
        hash: currentHash,
        timestamp: Date.now(),
      };
    } else if (isDeleted) {
      if (!localMetadata.chats[chatId].deleted) {
        localMetadata.chats[chatId] = {
          ...localMetadata.chats[chatId],
          deleted: true,
          deletedAt: Date.now(),
          lastModified: Date.now(),
          syncedAt: 0,
        };
        metadataChanged = true;
        delete lastSeenUpdates[chatId];
      }
    }
    if (metadataChanged) {
      throttledCheckSyncStatus();
    }
    return metadataChanged;
  }
  function setupVisibilityChangeHandler() {
    document.addEventListener("visibilitychange", () => {
      const isVisible = document.visibilityState === "visible";
      logToConsole(
        "visibility",
        `Page visibility changed: ${isVisible ? "visible" : "hidden"}`
      );
      if (isVisible) {
        if (config.syncMode === "disabled") {
          logToConsole(
            "info",
            "Cloud operations disabled - skipping visibility change handling"
          );
          return;
        }
        if (config.syncMode === "sync") {
          queueOperation("visibility-sync", syncFromCloud);
        }
      }
    });
  }
  function insertSyncButton() {
    const existingButton = document.querySelector(
      '[data-element-id="workspace-tab-cloudsync"]'
    );
    if (existingButton) return;
    const button = document.createElement("button");
    button.setAttribute("data-element-id", "workspace-tab-cloudsync");
    button.className = `min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative ${
      config.syncMode === "disabled" ? "opacity-50" : ""
    }`;
    button.innerHTML = `
      <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
        <div class="relative">
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
            ${
              config.syncMode === "disabled"
                ? `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 4.5A4.5 4.5 0 0114.5 9M9 13.5A4.5 4.5 0 013.5 9"/>
                    <path d="M2 2L16 16"/>
                   </g>`
                : config.syncMode === "sync"
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
          ${
            config.syncMode === "sync" ? `<div id="sync-status-dot"></div>` : ""
          }
        </div>
        <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none ${
          config.syncMode === "disabled"
            ? "text-gray-400 dark:text-gray-500"
            : ""
        }">${config.syncMode === "sync" ? "Sync" : "Backup"}</span>
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
      return;
    }
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.querySelector("svg")) {
        btn.parentNode.insertBefore(button, btn.nextSibling);
        return;
      }
    }
  }
  function updateSyncStatusDot(status = "success") {
    const dot = document.getElementById("sync-status-dot");
    if (!dot) return;
    if (config.syncMode !== "sync") {
      dot.style.display = "none";
      return;
    }
    dot.style.display = "block";
    dot.classList.remove(
      "bg-green-500",
      "bg-yellow-500",
      "bg-red-500",
      "bg-gray-500"
    );
    switch (status) {
      case "in-sync":
        dot.style.backgroundColor = "#22c55e";
        break;
      case "syncing":
        dot.style.backgroundColor = "#eab308";
        break;
      case "error":
      case "out-of-sync":
        dot.style.backgroundColor = "#ef4444";
        break;
      default:
        dot.style.backgroundColor = "#6b7280";
    }
  }
  function updateSyncStatus() {
    setTimeout(async () => {
      if (config.syncMode !== "sync") {
        updateSyncStatusDot("hidden");
        return;
      }
      const status = await checkSyncStatus();
      switch (status) {
        case "in-sync":
          updateSyncStatusDot("in-sync");
          break;
        case "syncing":
          updateSyncStatusDot("syncing");
          break;
        case "out-of-sync":
          updateSyncStatusDot("out-of-sync");
          break;
        case "error":
          updateSyncStatusDot("error");
          break;
        default:
          updateSyncStatusDot("hidden");
      }
    }, 100);
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
      -webkit-backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      overflow-y: auto;
      animation: fadeIn 0.2s ease-out;
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
  function openSyncModal() {
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
        <h3 class="text-center text-xl font-bold">S3 Backup & Sync Settings</h3>
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
            <div>
              <label for="sync-exclusions" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                Exclusions (Comma separated)
                <button class="ml-1 text-blue-600 text-lg hint--top hint--rounded hint--medium" aria-label="Additional settings to exclude from sync. Enter comma-separated setting names that you want to prevent from syncing between devices.">ⓘ</button>
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
            <button class="ml-1 text-blue-600 text-lg hint--top-left hint--rounded hint--medium" aria-label="Use this to enable detailed logging in Browser console for troubleshooting purpose. Clicking on this button will instantly start logging. However, earlier events will not be logged. You could add ?log=true to the page URL and reload the page to start logging from the beginning of the page load.">ⓘ</button>
          </span>
          <input type="checkbox" id="console-logging-toggle" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer">
        </div>
        <div class="flex justify-between space-x-2 mt-4">
          <button id="save-settings" class="z-1 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
            Save
          </button>
          <div class="flex space-x-2">
            <button id="sync-now" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
              ${config.syncMode === "sync" ? "Sync Now" : "Backup Now"}
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
      if (config.syncMode === "sync") {
        queueOperation("manual-sync", syncFromCloud);
      } else {
        queueOperation("manual-backup", syncToCloud);
      }
      updateSyncStatus();
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
            const success = await createSnapshot(name);
            if (success) {
              snapshotButton.textContent = "Completed!";
              setTimeout(() => {
                snapshotButton.textContent = originalText;
              }, 2000);
            } else {
              snapshotButton.textContent = "Failed";
              setTimeout(() => {
                snapshotButton.textContent = originalText;
              }, 2000);
            }
          } catch (error) {
            logToConsole("error", "Snapshot button error:", error);
            snapshotButton.textContent = "Failed";
            setTimeout(() => {
              snapshotButton.textContent = originalText;
            }, 2000);
          } finally {
            setTimeout(() => {
              snapshotButton.disabled = false;
            }, 2000);
            updateSyncStatus();
          }
        }
      });
    const syncModeRadios = modal.querySelectorAll('input[name="sync-mode"]');
    syncModeRadios.forEach((radio) => {
      radio.addEventListener("change", function () {
        const syncNowBtn = modal.querySelector("#sync-now");
        if (syncNowBtn) {
          syncNowBtn.textContent =
            this.value === "sync" ? "Sync Now" : "Backup Now";
        }
        const cloudSyncBtn = document.querySelector(
          '[data-element-id="cloud-sync-button"]'
        );
        if (cloudSyncBtn) {
          const buttonText = cloudSyncBtn.querySelector("span:last-child");
          if (buttonText) {
            buttonText.innerText =
              this.value === "disabled"
                ? "Cloud"
                : this.value === "sync"
                ? "Sync"
                : "Backup";
          }
        }
      });
    });
    const consoleLoggingCheckbox = modal.querySelector(
      "#console-logging-toggle"
    );
    consoleLoggingCheckbox.checked = isConsoleLoggingEnabled;
    consoleLoggingCheckbox.addEventListener("change", (e) => {
      isConsoleLoggingEnabled = e.target.checked;
      updateUrlLoggingParameter(isConsoleLoggingEnabled);
    });
    modal.addEventListener("click", (e) => e.stopPropagation());
    loadBackupList();
    updateSyncStatus();
  }
  function closeModal() {
    const modal = document.querySelector(".cloud-sync-modal");
    const overlay = document.querySelector(".modal-overlay");
    if (modal) modal.remove();
    if (overlay) overlay.remove();
    setTimeout(() => {
      checkSyncStatus().then((status) => {
        logToConsole("debug", `Updating sync dot after modal close: ${status}`);
        updateSyncStatusDot(status);
      });
    }, 100);
  }
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
    const exclusions = document.getElementById("sync-exclusions").value;
    localStorage.setItem("sync-exclusions", exclusions);
    if (exclusions.trim()) {
      const exclusionList = exclusions
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item);
      logToConsole("info", "Sync exclusions updated", {
        exclusions: exclusionList,
      });
    } else {
      logToConsole("info", "Sync exclusions cleared");
    }
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
    const oldMode = config.syncMode;
    config = { ...config, ...newConfig };
    saveConfiguration();
    if (oldMode === "disabled" && newConfig.syncMode !== "disabled") {
      operationState = {
        isImporting: false,
        isExporting: false,
        isPendingSync: false,
        operationQueue: [],
        isProcessingQueue: false,
        lastSyncStatus: null,
        isCheckingChanges: false,
        lastError: null,
        operationStartTime: null,
        queueProcessingPromise: null,
        completedOperations: new Set(),
        operationTimeouts: new Map(),
      };
      backupState = {
        isBackupInProgress: false,
        lastDailyBackup: null,
        lastManualSnapshot: null,
        backupInterval: null,
        isBackupIntervalRunning: false,
      };
      cloudFileSize = 0;
      localFileSize = 0;
      isLocalDataModified = false;
      clearAllIntervals();
      logToConsole(
        "info",
        "State reset completed, proceeding with initialization"
      );
    }
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
    updateSyncStatus();
    if (oldMode === "disabled" && newConfig.syncMode !== "disabled") {
      try {
        await performFullInitialization();
        logToConsole(
          "success",
          "Full initialization completed after mode switch"
        );
        if (isAwsConfigured()) {
          operationState.operationQueue = [];
          operationState.isProcessingQueue = false;
          try {
            const cloudMetadata = await downloadCloudMetadata();
            const cloudLastSync = cloudMetadata?.lastSyncTime || 0;
            const localLastSync = localMetadata?.lastSyncTime || 0;
            const cloudChatCount = Object.keys(
              cloudMetadata?.chats || {}
            ).length;
            const localChatCount = Object.keys(
              localMetadata?.chats || {}
            ).length;
            logToConsole("info", "Comparing metadata for sync direction", {
              cloudLastSync: new Date(cloudLastSync).toLocaleString(),
              localLastSync: new Date(localLastSync).toLocaleString(),
              cloudChats: cloudChatCount,
              localChats: localChatCount,
            });
            if (cloudLastSync > localLastSync && cloudChatCount > 0) {
              logToConsole(
                "info",
                "Cloud has newer data and chats, syncing from cloud"
              );
              queueOperation("force-initial-sync", async () => {
                logToConsole("start", "Performing forced sync from cloud");
                await syncFromCloud();
              });
            } else if (localChatCount > 0) {
              logToConsole("info", "Local data exists, syncing to cloud");
              queueOperation("force-initial-sync", async () => {
                logToConsole("start", "Performing forced sync to cloud");
                await syncToCloud();
              });
            }
          } catch (error) {
            logToConsole("error", "Error determining sync direction:", error);
            queueOperation("force-initial-sync", async () => {
              logToConsole(
                "start",
                "Defaulting to sync from cloud after error"
              );
              await syncFromCloud();
            });
          }
        }
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
      startSyncInterval();
      if (config.syncMode === "sync" && oldMode === "backup") {
        try {
          const cloudMetadata = await downloadCloudMetadata();
          const cloudLastSync = cloudMetadata?.lastSyncTime || 0;
          const localLastSync = localMetadata?.lastSyncTime || 0;
          const cloudChatCount = Object.keys(cloudMetadata?.chats || {}).length;
          const localChatCount = Object.keys(localMetadata?.chats || {}).length;
          logToConsole("info", "Comparing metadata for backup to sync switch", {
            cloudLastSync: new Date(cloudLastSync).toLocaleString(),
            localLastSync: new Date(localLastSync).toLocaleString(),
            cloudChats: cloudChatCount,
            localChats: localChatCount,
          });
          if (cloudChatCount === 0 && localChatCount > 0) {
            logToConsole("info", "Cloud is empty, syncing local data to cloud");
            queueOperation("mode-switch-sync", async () => {
              logToConsole(
                "start",
                "Performing sync to cloud after mode switch"
              );
              await syncToCloud();
            });
          } else if (cloudLastSync > localLastSync) {
            logToConsole("info", "Cloud has newer data, syncing from cloud");
            queueOperation("mode-switch-sync", async () => {
              logToConsole(
                "start",
                "Performing sync from cloud after mode switch"
              );
              await syncFromCloud();
            });
          } else if (localLastSync > cloudLastSync) {
            logToConsole("info", "Local has newer data, syncing to cloud");
            queueOperation("mode-switch-sync", async () => {
              logToConsole(
                "start",
                "Performing sync to cloud after mode switch"
              );
              await syncToCloud();
            });
          } else {
            if (cloudChatCount > localChatCount) {
              logToConsole("info", "Cloud has more chats, syncing from cloud");
              queueOperation("mode-switch-sync", async () => {
                logToConsole(
                  "start",
                  "Performing sync from cloud after mode switch"
                );
                await syncFromCloud();
              });
            } else {
              logToConsole(
                "info",
                "Local has equal or more chats, syncing to cloud"
              );
              queueOperation("mode-switch-sync", async () => {
                logToConsole(
                  "start",
                  "Performing sync to cloud after mode switch"
                );
                await syncToCloud();
              });
            }
          }
        } catch (error) {
          logToConsole(
            "error",
            "Error determining sync direction for mode switch:",
            error
          );
          queueOperation("mode-switch-sync", async () => {
            logToConsole(
              "start",
              "Defaulting to sync from cloud after error in mode switch"
            );
            await syncFromCloud();
          });
        }
      }
    }
    closeModal();
    logToConsole("success", "Settings saved");
    insertSyncButton();
    throttledCheckSyncStatus();
  }
  function getLastSyncTime() {
    if (!localMetadata.lastSyncTime) {
      return "Never";
    }
    const lastSync = new Date(localMetadata.lastSyncTime);
    const now = new Date();
    const diff = now - lastSync;
    if (diff < 60000) {
      return "Just now";
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
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
  async function loadBackupList() {
    try {
      const backupList = document.getElementById("backup-files");
      if (!backupList) return;
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
      const backups = await listS3Objects();
      backupList.innerHTML = "";
      backupList.disabled = false;
      const filteredBackups = backups.filter(
        (backup) => !backup.Key.startsWith("chats/") && backup.Key !== "chats/"
      );
      if (filteredBackups.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.text = "No backups found";
        backupList.appendChild(option);
      } else {
        const sortedBackups = filteredBackups.sort((a, b) => {
          const timestampA =
            a.metadata?.timestamp || a.LastModified?.getTime() || 0;
          const timestampB =
            b.metadata?.timestamp || b.LastModified?.getTime() || 0;
          return timestampB - timestampA;
        });
        sortedBackups.forEach((backup) => {
          const option = document.createElement("option");
          option.value = backup.Key;
          const size = formatFileSize(backup.Size || 0);
          option.text = `${backup.Key} - ${size}`;
          backupList.appendChild(option);
        });
      }
      updateButtonStates();
      backupList.addEventListener("change", updateButtonStates);
      function updateButtonStates() {
        const selectedValue = backupList.value || "";
        const downloadButton = document.getElementById("download-backup-btn");
        const restoreButton = document.getElementById("restore-backup-btn");
        const deleteButton = document.getElementById("delete-backup-btn");
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
            !selectedValue ||
            (!isSnapshot && !isDailyBackup && !isSettingsFile);
        }
        if (deleteButton) {
          const isProtectedFile =
            !selectedValue || isChatsFolder || isSettingsFile || isMetadataFile;
          deleteButton.disabled = isProtectedFile;
        }
      }
      setupButtonHandlers(backupList);
    } catch (error) {
      logToConsole("error", "Failed to load backup list:", error);
      if (backupList) {
        backupList.innerHTML =
          '<option value="">Error loading backups</option>';
        backupList.disabled = false;
      }
    }
  }
  function setupButtonHandlers(backupList) {
    const downloadButton = document.getElementById("download-backup-btn");
    if (downloadButton) {
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
    const restoreButton = document.getElementById("restore-backup-btn");
    if (restoreButton) {
      const newRestoreButton = restoreButton.cloneNode(true);
      restoreButton.parentNode.replaceChild(newRestoreButton, restoreButton);
      newRestoreButton.onclick = async () => {
        const key = backupList.value;
        if (!key) {
          alert("Please select a backup to restore");
          return;
        }
        if (key === "settings.json") {
          if (
            confirm(
              "Are you sure you want to restore settings from cloud? This will overwrite your current settings with the backup version."
            )
          ) {
            try {
              const backup = await downloadFromS3(key);
              if (!backup || !backup.data) {
                throw new Error("Settings backup not found or empty");
              }
              const decryptedContent = await decryptData(backup.data);
              const settingsData = JSON.parse(decryptedContent);
              const cloudMetadata = await downloadCloudMetadata();
              const preserveKeys = [
                "aws-bucket",
                "aws-access-key",
                "aws-secret-key",
                "aws-region",
                "aws-endpoint",
                "encryption-key",
                "chat-sync-metadata",
              ];
              let settingsRestored = 0;
              for (const [key, settingData] of Object.entries(settingsData)) {
                if (!preserveKeys.includes(key)) {
                  try {
                    const value = settingData.data;
                    const source = settingData.source || "localStorage";
                    if (source === "indexeddb") {
                      let valueToStore = value;
                      if (
                        typeof valueToStore === "string" &&
                        (valueToStore.startsWith("{") ||
                          valueToStore.startsWith("["))
                      ) {
                        try {
                          valueToStore = JSON.parse(valueToStore);
                        } catch (parseError) {
                          logToConsole(
                            "warning",
                            `Failed to parse ${key} as JSON, using as-is`,
                            parseError
                          );
                        }
                      }
                      await setIndexedDBKey(key, valueToStore);
                      logToConsole(
                        "info",
                        `Restored setting to IndexedDB: ${key}`
                      );
                    } else {
                      localStorage.setItem(key, value);
                      logToConsole(
                        "info",
                        `Restored setting to localStorage: ${key}`
                      );
                    }
                    settingsRestored++;
                  } catch (error) {
                    logToConsole(
                      "error",
                      `Error restoring setting ${key}:`,
                      error
                    );
                  }
                }
              }
              if (cloudMetadata.settings) {
                localMetadata.settings.lastModified =
                  cloudMetadata.settings.lastModified;
                localMetadata.settings.syncedAt =
                  cloudMetadata.settings.syncedAt;
                await saveLocalMetadata();
              }
              logToConsole("success", "Settings restore completed", {
                totalRestored: settingsRestored,
                timestamp: new Date().toISOString(),
              });
              alert(
                `Settings restored successfully! (${settingsRestored} settings restored)`
              );
            } catch (error) {
              logToConsole("error", "Failed to restore settings:", error);
              alert("Failed to restore settings: " + error.message);
            }
            return;
          }
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
    const deleteButton = document.getElementById("delete-backup-btn");
    if (deleteButton) {
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
            await loadBackupList();
            alert("Backup deleted successfully!");
          } catch (error) {
            logToConsole("error", "Failed to delete backup:", error);
            alert("Failed to delete backup: " + error.message);
          }
        }
      };
    }
  }
  async function handleZipDownload(backup, key) {
    try {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(backup.data);
      const jsonFile = Object.keys(zip.files).find((f) => f.endsWith(".json"));
      if (!jsonFile) {
        throw new Error("No JSON file found in backup");
      }
      const fileContent = await zip.file(jsonFile).async("uint8array");
      const decryptedContent = await decryptData(fileContent);
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
      const decryptedContent = await decryptData(backup.data);
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
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
  function downloadFile(filename, data) {
    logToConsole(
      "info",
      `Downloading file: ${filename}, data type: ${typeof data}`
    );
    let blob;
    if (data instanceof Blob) {
      blob = data;
    } else if (typeof data === "string") {
      blob = new Blob([data], { type: "text/plain" });
    } else if (typeof data === "object") {
      try {
        const jsonString = JSON.stringify(data, null, 2);
        blob = new Blob([jsonString], { type: "application/json" });
      } catch (error) {
        logToConsole("error", "Failed to stringify object:", error);
        blob = new Blob([String(data)], { type: "text/plain" });
      }
    } else {
      blob = new Blob([String(data)], { type: "text/plain" });
    }
    logToConsole("info", `Download blob size: ${formatFileSize(blob.size)}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
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
        persistentDB = null;
        reject(error);
      }
    });
  }
  async function initializeSettingsMonitoring() {
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

    const existingSettings = new Set();
    let orphanedMetadataCount = 0;

    // logToConsole("debug", "Settings monitoring initialization stats", {
    //   totalMetadataEntries: Object.keys(localMetadata.settings.items).length,
    //   deletedEntries: Object.values(localMetadata.settings.items).filter(
    //     (entry) => entry.deleted
    //   ).length,
    //   activeEntries: Object.values(localMetadata.settings.items).filter(
    //     (entry) => !entry.deleted
    //   ).length,
    // });

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
        existingSettings.add(key);
        const value = await getIndexedDBValue(key);
        if (value !== undefined) {
          const hash = await generateContentHash(value);
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
    for (const key of Object.keys(localStorage)) {
      if (!shouldExcludeSetting(key)) {
        existingSettings.add(key);
        const value = localStorage.getItem(key);
        if (value !== null) {
          const hash = await generateContentHash(value);
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

    for (const metadataKey of Object.keys(localMetadata.settings.items)) {
      if (
        !existingSettings.has(metadataKey) &&
        !localMetadata.settings.items[metadataKey].deleted
      ) {
        logToConsole(
          "cleanup",
          `Marking orphaned setting metadata as deleted: ${metadataKey}`
        );
        localMetadata.settings.items[metadataKey] = {
          ...localMetadata.settings.items[metadataKey],
          deleted: true,
          deletedAt: Date.now(),
          lastModified: Date.now(),
        };
        orphanedMetadataCount++;
      }
    }

    let removedDeletedCount = 0;
    try {
      const cloudMetadata = await downloadCloudMetadata();
      for (const metadataKey of Object.keys(localMetadata.settings.items)) {
        const metadataEntry = localMetadata.settings.items[metadataKey];
        if (metadataEntry.deleted) {
          const cloudSettingMeta = cloudMetadata.settings?.items?.[metadataKey];
          const cloudHasTombstone =
            cloudSettingMeta && cloudSettingMeta.deleted === true;
          const cloudDoesntHaveSetting = !cloudSettingMeta;

          if (cloudHasTombstone || cloudDoesntHaveSetting) {
            logToConsole(
              "cleanup",
              `Removing deleted setting metadata (${
                cloudHasTombstone ? "cloud has tombstone" : "not in cloud"
              }): ${metadataKey}`
            );
            delete localMetadata.settings.items[metadataKey];
            removedDeletedCount++;
          } else {
            logToConsole(
              "debug",
              `Keeping deleted metadata (still exists in cloud): ${metadataKey}`
            );
          }
        }
      }
    } catch (error) {
      logToConsole(
        "warning",
        "Could not download cloud metadata for cleanup, skipping deleted metadata cleanup",
        error
      );
    }

    if (orphanedMetadataCount > 0 || removedDeletedCount > 0) {
      logToConsole(
        "success",
        `Cleaned up ${orphanedMetadataCount} orphaned and ${removedDeletedCount} synced deleted setting metadata entries during initialization`
      );
      localMetadata.settings.lastModified = Date.now();
    }

    window.addEventListener("storage", (e) => {
      if (!e.key || shouldExcludeSetting(e.key)) {
        return;
      }
      queueOperation("settings-sync", () =>
        handleSettingChange(e.key, e.newValue, "localstorage")
      );
    });
    setInterval(checkIndexedDBChanges, 5000);
    await saveLocalMetadata();
    return orphanedMetadataCount > 0;
  }
  async function generateContentHash(content) {
    const str = typeof content === "string" ? content : JSON.stringify(content);
    // logToConsole(
    //   "debug",
    //   `Generating content hash, input type: ${typeof content}, length: ${
    //     str.length
    //   }`,
    //   {
    //     contentPreview: str.length > 100 ? str.substring(0, 100) + "..." : str,
    //   }
    // );
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    // logToConsole(
    //   "debug",
    //   `Content hash generated: ${hash.substring(0, 8)}...${hash.substring(
    //     hash.length - 8
    //   )}`
    // );
    return hash;
  }
  async function checkIndexedDBChanges() {
    let db = null;
    try {
      db = await getPersistentDB();
      const changedKeys = new Set();
      const transaction = db.transaction("keyval", "readonly");
      const store = transaction.objectStore("keyval");
      const keys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const localStorageKeys = Object.keys(localStorage);
      for (const key of keys) {
        if (!shouldExcludeSetting(key) && !localStorageKeys.includes(key)) {
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
              if (!metadata || metadata.hash !== hash) {
                changedKeys.add(key);
              }
            }
          } catch (error) {
            logToConsole(
              "error",
              `Error checking IndexedDB key ${key}:`,
              error
            );
            continue;
          }
        }
      }
      if (changedKeys.size > 0) {
        logToConsole(
          "info",
          `Detected changes in ${
            changedKeys.size
          } IndexedDB items: ${Array.from(changedKeys).join(", ")}`
        );
        for (const key of changedKeys) {
          queueOperation(`settings-sync-${key}`, async () =>
            handleSettingChange(key, await getIndexedDBValue(key), "indexeddb")
          );
        }
      }
    } catch (error) {
      logToConsole("error", "Error checking IndexedDB changes:", error);
      persistentDB = null;
    }
  }
  async function handleSettingChange(key, value, source) {
    if (shouldExcludeSetting(key)) return;
    try {
      const existingMetadata = localMetadata.settings.items[key];
      const timestamp = Date.now();

      if (value === null || value === undefined) {
        if (existingMetadata && !existingMetadata.deleted) {
          logToConsole("info", `Setting deleted from ${source}: ${key}`);
          localMetadata.settings.items[key] = {
            ...existingMetadata,
            deleted: true,
            deletedAt: timestamp,
            lastModified: timestamp,
          };
          localMetadata.settings.lastModified = timestamp;
          await saveLocalMetadata();
          throttledCheckSyncStatus();
          return true;
        }
        return false;
      }

      const newHash = await generateContentHash(value);
      if (!existingMetadata || existingMetadata.hash !== newHash) {
        localMetadata.settings.items[key] = {
          hash: newHash,
          lastModified: timestamp,
          syncedAt: 0,
          source: source,
          deleted: false,
        };
        localMetadata.settings.lastModified = timestamp;
        await saveLocalMetadata();
        throttledCheckSyncStatus();
        logToConsole(
          "info",
          `Setting change detected from ${source}: ${key} (hash changed)`,
          {
            oldHash: existingMetadata?.hash?.substring(0, 8) + "...",
            newHash: newHash.substring(0, 8) + "...",
            timestamp: new Date(timestamp).toISOString(),
          }
        );
        return true;
      }
      return false;
    } catch (error) {
      logToConsole("error", `Error handling setting change for ${key}`, error);
      return false;
    }
  }
  async function cleanupMetadataVersions() {
    try {
      const s3 = initializeS3Client();
      const params = {
        Bucket: config.bucketName,
        Prefix: "metadata.json",
      };
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
      const versions = await s3.listObjectVersions(params).promise();
      let allVersions = [];
      if (versions.Versions) {
        allVersions.push(
          ...versions.Versions.filter(
            (v) => !v.IsLatest && v.Key === "metadata.json"
          )
        );
      }
      if (versions.DeleteMarkers) {
        allVersions.push(
          ...versions.DeleteMarkers.filter((v) => v.Key === "metadata.json")
        );
      }
      allVersions.sort((a, b) => b.LastModified - a.LastModified);
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
      const cloudMetadata = await downloadCloudMetadata();
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
      if (!cloudMetadata.chats) {
        cloudMetadata.chats = {};
      }
      const now = Date.now();
      cloudMetadata.chats[chatId] = {
        deleted: true,
        deletedAt: now,
        lastModified: now,
        syncedAt: now,
        tombstoneVersion:
          (cloudMetadata.chats[chatId]?.tombstoneVersion || 0) + 1,
      };
      await uploadToS3(
        "metadata.json",
        new TextEncoder().encode(JSON.stringify(cloudMetadata)),
        {
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
        }
      );
      if (localMetadata.chats) {
        localMetadata.chats[chatId] = {
          deleted: true,
          deletedAt: now,
          lastModified: now,
          syncedAt: now,
          tombstoneVersion: cloudMetadata.chats[chatId].tombstoneVersion,
        };
        saveLocalMetadata();
      }
      logToConsole("success", `Successfully deleted chat ${chatId} from cloud`);
      return true;
    } catch (error) {
      logToConsole("error", `Error deleting chat ${chatId} from cloud`, error);
      throw error;
    }
  }
  async function downloadCloudMetadata() {
    try {
      const s3 = initializeS3Client();
      const timestamp = Date.now();
      const params = {
        Bucket: config.bucketName,
        Key: "metadata.json",
        ResponseCacheControl: "no-cache, no-store, must-revalidate",
      };

      // logToConsole("debug", "Downloading cloud metadata", {
      //   timestamp: new Date(timestamp).toISOString(),
      //   cacheBusting: true,
      // });

      try {
        const data = await s3.getObject(params).promise();
        const content = data.Body;
        const metadata = JSON.parse(
          typeof content === "string"
            ? content
            : new TextDecoder().decode(content)
        );

        logToConsole("debug", "Successfully downloaded cloud metadata", {
          settingsCount: metadata.settings?.items
            ? Object.keys(metadata.settings.items).length
            : 0,
          chatsCount: metadata.chats ? Object.keys(metadata.chats).length : 0,
          lastSyncTime: metadata.lastSyncTime
            ? new Date(metadata.lastSyncTime).toISOString()
            : "none",
        });

        return metadata;
      } catch (error) {
        if (error.code === "NoSuchKey") {
          logToConsole(
            "info",
            "No cloud metadata found, creating initial metadata"
          );
          const initialMetadata = {
            version: "1.0",
            lastSyncTime: 0,
            chats: {},
            settings: {
              lastModified: 0,
              syncedAt: 0,
              items: {},
            },
          };
          try {
            await uploadToS3(
              "metadata.json",
              new TextEncoder().encode(JSON.stringify(initialMetadata)),
              {
                ContentType: "application/json",
                ServerSideEncryption: "AES256",
              }
            );
            logToConsole("success", "Created and uploaded initial metadata");
            return initialMetadata;
          } catch (uploadError) {
            logToConsole(
              "error",
              "Failed to create initial metadata",
              uploadError
            );
            throw uploadError;
          }
        }
        throw error;
      }
    } catch (error) {
      if (
        error.code === "CredentialsError" ||
        error.message?.includes("credentials")
      ) {
        logToConsole(
          "error",
          "AWS credentials error - please check your configuration"
        );
        throw new Error("AWS credentials not properly configured");
      }
      logToConsole("error", "Error downloading cloud metadata", error);
      throw error;
    }
  }
  async function downloadChatFromCloud(chatId) {
    logToConsole("download", `Downloading chat ${chatId} from cloud`);
    try {
      const s3 = initializeS3Client();
      const params = {
        Bucket: config.bucketName,
        Key: `chats/${chatId}.json`,
      };
      try {
        const data = await s3.getObject(params).promise();
        const encryptedContent = new Uint8Array(data.Body);
        const decryptedText = await decryptData(encryptedContent);
        const sanitizedText = decryptedText
          .replace(/:\s*undefined\b/g, ": null")
          .replace(/,\s*undefined\b/g, ", null")
          .replace(/\[\s*undefined\b/g, "[null")
          .replace(/undefined\s*,/g, "null,")
          .replace(/undefined\s*\]/g, "null]");
        let chatData = JSON.parse(sanitizedText);
        logToConsole("debug", `Chat parsed from cloud download: ${chatId}`, {
          hasChat: !!chatData,
          hasMessages: !!chatData?.messages,
          messagesLength: chatData?.messages?.length,
        });
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
          const cloudMetadata = await downloadCloudMetadata();
          if (
            cloudMetadata.chats &&
            cloudMetadata.chats[chatId] &&
            !cloudMetadata.chats[chatId].deleted
          ) {
            cloudMetadata.chats[chatId] = {
              deleted: true,
              deletedAt: Date.now(),
              lastModified: Date.now(),
              syncedAt: Date.now(),
              tombstoneVersion:
                (cloudMetadata.chats[chatId]?.tombstoneVersion || 0) + 1,
              deletionSource: "file-missing",
            };
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
  async function uploadChatToCloud(
    chatId,
    existingCloudMetadata = null,
    syncTimestamp = null
  ) {
    try {
      operationState.isExporting = true;
      const s3 = initializeS3Client();
      const cloudMetadata = await downloadCloudMetadata();
      logToConsole("info", "Downloaded fresh cloud metadata");
      if (
        cloudMetadata.chats &&
        cloudMetadata.chats[chatId] &&
        cloudMetadata.chats[chatId].deleted === true
      ) {
        const localChatInfo = localMetadata.chats[chatId];
        const cloudDeletion = cloudMetadata.chats[chatId];
        if (!localChatInfo || localChatInfo.deleted === true) {
          logToConsole(
            "info",
            `Skipping upload of chat ${chatId} as it has a cloud tombstone`
          );
          return false;
        }
        if (localChatInfo.lastModified > cloudDeletion.deletedAt) {
          logToConsole(
            "info",
            `Local chat ${chatId} appears to be newer than cloud tombstone, proceeding with upload as restoration`
          );
        } else {
          logToConsole(
            "info",
            `Local chat ${chatId} is older than cloud tombstone, will be deleted locally instead`
          );
          await deleteChatFromIndexedDB(chatId);
          return false;
        }
      }
      const chatData = await getChatFromIndexedDB(chatId);
      if (!chatData) {
        logToConsole(
          "warning",
          `Chat ${chatId} not found in IndexedDB, skipping upload`
        );
        return false;
      }
      if (!chatData.id) {
        chatData.id = chatId;
      } else if (chatData.id.startsWith("CHAT_")) {
        chatData.id = chatData.id.slice(5);
      }
      if (chatData.id !== chatId) {
        logToConsole(
          "warning",
          `Chat ID mismatch: ${chatData.id} !== ${chatId}, fixing before upload`
        );
        chatData.id = chatId;
      }
      const newHash = await generateHash(chatData, "chat");
      if (
        cloudMetadata.chats &&
        cloudMetadata.chats[chatId] &&
        cloudMetadata.chats[chatId].hash === newHash &&
        !cloudMetadata.chats[chatId].deleted
      ) {
        logToConsole("info", `Chat ${chatId} hasn't changed, skipping upload`);
        if (localMetadata.chats[chatId]) {
          if (localMetadata.chats[chatId].syncedAt !== Date.now()) {
            localMetadata.chats[chatId].syncedAt = Date.now();
            localMetadata.chats[chatId].hash = newHash;
          }
        }
        return true;
      }
      const encryptedData = await encryptData(chatData);
      const params = {
        Bucket: config.bucketName,
        Key: `chats/${chatId}.json`,
        Body: encryptedData,
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      };
      await s3.putObject(params).promise();
      logToConsole("success", `Uploaded chat ${chatId} to cloud`, {
        messageCount: chatData.messages?.length || 0,
        title: chatData.chatTitle || "(Untitled)",
        size: encryptedData.length,
      });
      if (!localMetadata.chats[chatId]) {
        localMetadata.chats[chatId] = {};
      }
      const now = syncTimestamp || Date.now();
      const lastModified = chatData.updatedAt || now;
      localMetadata.chats[chatId].lastModified = lastModified;
      localMetadata.chats[chatId].syncedAt = now;
      localMetadata.chats[chatId].hash = newHash;
      if (localMetadata.chats[chatId].deleted) {
        delete localMetadata.chats[chatId].deleted;
        delete localMetadata.chats[chatId].deletedAt;
        delete localMetadata.chats[chatId].tombstoneVersion;
        logToConsole("info", `Restored previously deleted chat ${chatId}`);
      }
      lastSeenUpdates[chatId] = {
        updatedAt: now,
        hash: newHash,
      };
      if (!cloudMetadata.chats) cloudMetadata.chats = {};
      cloudMetadata.chats[chatId] = {
        lastModified: lastModified,
        syncedAt: now,
        hash: newHash,
      };
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
      if (localMetadata.chats[chatId]) {
        localMetadata.chats[chatId].syncedAt = 0;
        await saveLocalMetadata();
      }
      logToConsole("error", `Error uploading chat ${chatId}:`, error);
      throw error;
    } finally {
      operationState.isExporting = false;
      throttledCheckSyncStatus();
    }
  }
  async function checkSyncStatus() {
    if (!isAwsConfigured()) {
      logToConsole(
        "debug",
        "checkSyncStatus returning: disabled (AWS not configured)"
      );
      return "disabled";
    }
    await loadLocalMetadata();
    try {
      let chatsOutOfSync = false;
      const chatIds = Object.keys(localMetadata.chats || {});
      for (const chatId of chatIds) {
        const chatMeta = localMetadata.chats[chatId];
        if (chatMeta.deleted) continue;
        if (chatMeta.lastModified > (chatMeta.syncedAt || 0)) {
          chatsOutOfSync = true;
          logToConsole("debug", "checkSyncStatus: Chat is out of sync", {
            chatId,
            lastModified: chatMeta.lastModified,
            syncedAt: chatMeta.syncedAt,
          });
          break;
        }
      }
      if (operationState.isExporting || operationState.isImporting) {
        return "syncing";
      } else if (chatsOutOfSync) {
        return "out-of-sync";
      } else {
        return "in-sync";
      }
    } catch (error) {
      console.error("Error checking sync status:", error);
      logToConsole(
        "debug",
        "checkSyncStatus returning: error due to exception"
      );
      return "error";
    }
  }
  function updateSyncStatusDot(status) {
    const dot = document.getElementById("sync-status-dot");
    if (!dot) return;
    if (status === "disabled") {
      dot.style.display = "none";
      return;
    } else {
      dot.style.display = "block";
    }
    switch (status) {
      case "in-sync":
        dot.style.backgroundColor = "#22c55e";
        break;
      case "syncing":
        dot.style.backgroundColor = "#eab308";
        break;
      case "error":
      case "out-of-sync":
        dot.style.backgroundColor = "#ef4444";
        break;
      default:
        logToConsole(
          "debug",
          `updateSyncStatusDot hit default case for status: ${status}`
        );
        dot.style.backgroundColor = "#6b7280";
    }
  }
  function resetOperationStates() {
    operationState.isImporting = false;
    operationState.isExporting = false;
    operationState.isProcessingQueue = false;
    operationState.isPendingSync = false;
  }
  window.addEventListener("unload", resetOperationStates);
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resetOperationStates();
    }
  });
  window.addEventListener("unload", resetOperationStates);
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resetOperationStates();
    }
  });
  async function mergeChats(localChat, cloudChat) {
    logToConsole("info", "Merging chat versions", {
      chatId: localChat.id,
      localMessages: localChat.messages?.length || 0,
      cloudMessages: cloudChat.messages?.length || 0,
    });
    const mergedChat = JSON.parse(JSON.stringify(localChat));
    if (!mergedChat.messages) mergedChat.messages = [];
    mergedChat.updatedAt = Math.max(
      localChat.updatedAt || 0,
      cloudChat.updatedAt || 0
    );
    if (
      cloudChat.chatTitle &&
      (!localChat.chatTitle || cloudChat.updatedAt > localChat.updatedAt)
    ) {
      mergedChat.chatTitle = cloudChat.chatTitle;
    }
    if (!mergedChat.messages) mergedChat.messages = [];
    const cloudMessagesToMerge = cloudChat.messages || [];
    const messageMap = new Map();
    for (const msg of mergedChat.messages) {
      const msgId = msg.id || JSON.stringify(msg);
      messageMap.set(msgId, true);
    }
    for (const cloudMsg of cloudMessagesToMerge) {
      const msgId = cloudMsg.id || JSON.stringify(cloudMsg);
      if (!messageMap.has(msgId)) {
        mergedChat.messages.push(cloudMsg);
        messageMap.set(msgId, true);
      }
    }
    mergedChat.messages.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.index !== undefined && b.index !== undefined) {
        return a.index - b.index;
      }
      return 0;
    });
    mergedChat.messagesArray = mergedChat.messages;
    logToConsole(
      "debug",
      `Ensured messagesArray consistency in mergeChats for ${mergedChat.id}`,
      {
        finalMessagesCount: mergedChat.messages?.length,
        finalMessagesArrayCount: mergedChat.messagesArray?.length,
      }
    );
    logToConsole("success", "Chat merge completed", {
      messageCount: mergedChat.messages?.length || 0,
    });
    if (
      cloudChat.folderID !== undefined &&
      (!localChat.folderID || cloudChat.updatedAt > localChat.updatedAt)
    ) {
      mergedChat.folderID = cloudChat.folderID;
      logToConsole(
        "debug",
        `Merge selected cloud folderID (${cloudChat.folderID}) for chat ${localChat.id}`
      );
    } else if (
      localChat.folderID !== undefined &&
      (cloudChat.folderID === undefined ||
        localChat.updatedAt >= cloudChat.updatedAt)
    ) {
      mergedChat.folderID = localChat.folderID;
      logToConsole(
        "debug",
        `Merge selected local folderID (${localChat.folderID}) for chat ${localChat.id}`
      );
    } else if (
      localChat.folderID === undefined &&
      cloudChat.folderID === undefined
    ) {
      // If neither has folderID, ensure it's not present or is null
      delete mergedChat.folderID; // Or mergedChat.folderID = null;
      logToConsole(
        "debug",
        `Merge resulted in no folderID for chat ${localChat.id}`
      );
    }

    return mergedChat;
  }
  function cleanupOldTombstones() {
    const now = Date.now();
    const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
    let cleanupCount = 0;
    for (const [chatId, metadata] of Object.entries(localMetadata.chats)) {
      if (
        metadata.deleted &&
        metadata.deletedAt &&
        now - metadata.deletedAt > tombstoneRetentionPeriod
      ) {
        delete localMetadata.chats[chatId];
        cleanupCount++;
      }
    }
    if (cleanupCount > 0) {
      saveLocalMetadata();
      logToConsole("cleanup", `Removed ${cleanupCount} old tombstone entries`);
    }
    return cleanupCount;
  }
  async function cleanupCloudTombstones() {
    try {
      const cloudMetadata = await downloadCloudMetadata();
      const now = Date.now();
      const tombstoneRetentionPeriod = 30 * 24 * 60 * 60 * 1000;
      let cleanupCount = 0;
      if (cloudMetadata.chats) {
        for (const [chatId, metadata] of Object.entries(cloudMetadata.chats)) {
          if (
            metadata.deleted &&
            metadata.deletedAt &&
            now - metadata.deletedAt > tombstoneRetentionPeriod
          ) {
            delete cloudMetadata.chats[chatId];
            cleanupCount++;
          }
        }
        if (cleanupCount > 0) {
          await uploadToS3(
            "metadata.json",
            new TextEncoder().encode(JSON.stringify(cloudMetadata)),
            {
              ContentType: "application/json",
              ServerSideEncryption: "AES256",
            }
          );
          logToConsole(
            "cleanup",
            `Removed ${cleanupCount} old tombstone entries from cloud metadata`
          );
        }
      }
      return cleanupCount;
    } catch (error) {
      logToConsole("error", "Error cleaning up cloud tombstones", error);
      return 0;
    }
  }
  async function forceSettingsCheck() {
    if (!localMetadata.settings) {
      await initializeSettingsMonitoring();
      return false;
    }

    let hasChanges = false;
    let checkedLocalStorage = 0;
    let checkedIndexedDB = 0;
    let changesLocalStorage = 0;
    let changesIndexedDB = 0;

    for (const key of Object.keys(localStorage)) {
      if (!shouldExcludeSetting(key)) {
        checkedLocalStorage++;
        const value = localStorage.getItem(key);
        if (value !== null) {
          const changed = await handleSettingChange(key, value, "localstorage");
          if (changed) {
            hasChanges = true;
            changesLocalStorage++;
          }
        }
      }
    }

    try {
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
          checkedIndexedDB++;
          const value = await getIndexedDBValue(key);
          if (value !== undefined) {
            const changed = await handleSettingChange(key, value, "indexeddb");
            if (changed) {
              hasChanges = true;
              changesIndexedDB++;
            }
          }
        }
      }
    } catch (error) {
      logToConsole("error", "Error during forced settings check:", error);
    }

    logToConsole("debug", `Force settings check completed`, {
      checkedLocalStorage,
      checkedIndexedDB,
      changesLocalStorage,
      changesIndexedDB,
      hasChanges,
    });

    if (hasChanges) {
      logToConsole("info", "Forced settings check detected real changes");
      await saveLocalMetadata();
    }
    return hasChanges;
  }
  function startPeriodicChangeCheck() {
    if (activeIntervals.changeCheck) {
      clearInterval(activeIntervals.changeCheck);
      activeIntervals.changeCheck = null;
    }
    let settingsCheckCounter = 0;
    activeIntervals.changeCheck = setInterval(async () => {
      if (document.hidden) return;
      let changesDetected = false;
      const changedChatsLog = [];
      try {
        const chats = await getAllChatsFromIndexedDB();
        for (const chat of chats) {
          if (!chat.id) continue;
          if (localMetadata.chats[chat.id]?.deleted === true) {
            continue;
          }
          const currentHash = await generateHash(chat, "chat");
          const lastSeen = lastSeenUpdates[chat.id];
          if (
            !lastSeen ||
            currentHash !== lastSeen.hash ||
            (currentHash === lastSeen.hash &&
              chat.updatedAt > lastSeen.timestamp)
          ) {
            lastSeenUpdates[chat.id] = {
              hash: currentHash,
              timestamp: chat.updatedAt || Date.now(),
            };
            const chatMetadataChanged = await updateChatMetadata(
              chat.id,
              true,
              false,
              null,
              chat
            );
            if (chatMetadataChanged) {
              changesDetected = true;
              changedChatsLog.push(chat.id);
            }
          }
        }
        settingsCheckCounter++;
        if (settingsCheckCounter >= 12) {
          settingsCheckCounter = 0;
          const settingsChanged = await forceSettingsCheck();
          if (settingsChanged) {
            changesDetected = true;
          }
        }
        if (changesDetected) {
          if (changedChatsLog.length > 0) {
            logToConsole(
              "info",
              "Detected changes in chats during periodic check",
              {
                changedChats: changedChatsLog,
                count: changedChatsLog.length,
              }
            );
          }
          await saveLocalMetadata();
        }
      } catch (error) {
        logToConsole("error", "Error checking for changes", error);
      }
    }, 2500);
    logToConsole("info", "Started periodic change detection");
  }
  const throttledCheckSyncStatus = throttle(async () => {
    const status = await checkSyncStatus();
    updateSyncStatusDot(status);
  }, 1000);
  function updateUrlLoggingParameter(enableLogging) {
    const url = new URL(window.location.href);
    if (enableLogging) {
      url.searchParams.set("log", "true");
    } else if (url.searchParams.has("log")) {
      url.searchParams.delete("log");
    }
    window.history.replaceState({}, "", url.toString());
  }
  function standardizeChatMessages(chat) {
    if (!chat) return chat;
    if (
      chat.messages &&
      chat.messages.length > 0 &&
      (!chat.messagesArray || chat.messagesArray.length === 0)
    ) {
      chat.messagesArray = chat.messages;
    }
    if (!chat.messagesArray) {
      logToConsole(
        "debug",
        `Standardizing chat ${chat.id}: Initializing empty messagesArray`
      );
      chat.messagesArray = [];
    }
    return chat;
  }
  async function cleanupIndexedDBDuplicates() {
    const duplicateFlag = localStorage.getItem("sync_duplicateDetected");
    if (duplicateFlag !== "true") {
      logToConsole("info", "No duplicate cleanup needed - flag not set");
      return { cleaned: [], errors: [] };
    }
    logToConsole("cleanup", "Starting IndexedDB duplicate cleanup...");
    let cleanedKeys = [];
    let errorKeys = [];
    try {
      const db = await getPersistentDB();
      const transaction = db.transaction("keyval", "readwrite");
      const store = transaction.objectStore("keyval");
      const indexedDBKeys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const localStorageKeys = Object.keys(localStorage);
      for (const key of indexedDBKeys) {
        if (localStorageKeys.includes(key)) {
          try {
            const deleteTransaction = db.transaction("keyval", "readwrite");
            const deleteStore = deleteTransaction.objectStore("keyval");
            await new Promise((resolve, reject) => {
              const deleteRequest = deleteStore.delete(key);
              deleteRequest.onerror = () => reject(deleteRequest.error);
              deleteRequest.onsuccess = () => resolve();
            });
            cleanedKeys.push(key);
            logToConsole(
              "cleanup",
              `Removed duplicate key from IndexedDB: ${key}`
            );
          } catch (error) {
            errorKeys.push(key);
            logToConsole(
              "error",
              `Failed to remove duplicate key ${key} from IndexedDB:`,
              error
            );
          }
        }
      }
      if (cleanedKeys.length > 0) {
        logToConsole(
          "success",
          `IndexedDB cleanup completed. Removed ${cleanedKeys.length} duplicate keys:`,
          cleanedKeys
        );
        if (localMetadata.settings && localMetadata.settings.items) {
          for (const key of cleanedKeys) {
            if (localMetadata.settings.items[key]) {
              delete localMetadata.settings.items[key];
              logToConsole(
                "cleanup",
                `Removed ${key} from sync metadata tracking`
              );
            }
          }
          await saveLocalMetadata();
        }
        localStorage.removeItem("sync_duplicateDetected");
        logToConsole(
          "success",
          "Duplicate detection flag cleared - cleanup complete"
        );
      } else {
        logToConsole("info", "No duplicate keys found in IndexedDB");
        localStorage.removeItem("sync_duplicateDetected");
      }
      if (errorKeys.length > 0) {
        logToConsole(
          "warning",
          `Failed to clean ${errorKeys.length} keys:`,
          errorKeys
        );
      }
    } catch (error) {
      logToConsole("error", "Error during IndexedDB duplicate cleanup:", error);
      throw error;
    }
    return { cleaned: cleanedKeys, errors: errorKeys };
  }
  async function detectIndexedDBDuplicates() {
    try {
      const db = await getPersistentDB();
      const transaction = db.transaction("keyval", "readonly");
      const store = transaction.objectStore("keyval");
      const indexedDBKeys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const localStorageKeys = Object.keys(localStorage);
      const duplicates = indexedDBKeys.filter((key) =>
        localStorageKeys.includes(key)
      );
      if (duplicates.length > 0) {
        localStorage.setItem("sync_duplicateDetected", "true");
        logToConsole(
          "info",
          `Detected ${duplicates.length} duplicate keys between IndexedDB and localStorage`,
          duplicates
        );
        return true;
      } else {
        localStorage.removeItem("sync_duplicateDetected");
        // logToConsole(
        //   "info",
        //   "No duplicates detected between IndexedDB and localStorage"
        // );
        return false;
      }
    } catch (error) {
      logToConsole("error", "Error detecting IndexedDB duplicates:", error);
      return false;
    }
  }

  async function uploadSettingToCloud(settingKey, syncTimestamp = null) {
    try {
      const now = syncTimestamp || Date.now();
      const s3 = initializeS3Client();
      let settingValue;
      let source = "localStorage";
      let localStorageValue = localStorage.getItem(settingKey);
      let indexedDBValue;
      try {
        indexedDBValue = await getIndexedDBValue(settingKey);
      } catch (error) {
        logToConsole(
          "warning",
          `Could not read ${settingKey} from IndexedDB`,
          error
        );
      }
      const metadata = localMetadata.settings.items[settingKey];
      if (localStorageValue !== null && indexedDBValue !== undefined) {
        if (metadata?.source) {
          source = metadata.source;
          settingValue =
            source === "localStorage"
              ? localStorageValue
              : typeof indexedDBValue === "object"
              ? JSON.stringify(indexedDBValue)
              : indexedDBValue;
        } else {
          source = "localStorage";
          settingValue = localStorageValue;
        }
      } else if (localStorageValue !== null) {
        source = "localStorage";
        settingValue = localStorageValue;
      } else if (indexedDBValue !== undefined) {
        source = "indexeddb";
        settingValue =
          typeof indexedDBValue === "object"
            ? JSON.stringify(indexedDBValue)
            : indexedDBValue;
      } else {
        logToConsole(
          "warning",
          `Setting ${settingKey} not found in localStorage or IndexedDB`
        );
        return false;
      }

      const settingData = {
        key: settingKey,
        value: settingValue,
        source: source,
        lastModified: now,
        syncedAt: now,
      };

      logToConsole("upload", `Uploading setting ${settingKey} to cloud`, {
        source: source,
        valueLength: settingValue.length,
        timestamp: new Date(now).toISOString(),
      });

      const encryptedData = await encryptData(JSON.stringify(settingData));

      await uploadToS3(`settings/${settingKey}.json`, encryptedData, {
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      });

      // Update local metadata
      if (!localMetadata.settings.items[settingKey]) {
        localMetadata.settings.items[settingKey] = {};
      }

      const hash = await generateContentHash(settingValue);
      localMetadata.settings.items[settingKey] = {
        hash: hash,
        lastModified: now,
        syncedAt: now,
        source: source,
        deleted: false,
      };

      await saveLocalMetadata();

      logToConsole(
        "success",
        `Successfully uploaded setting ${settingKey} to cloud`,
        {
          hash: hash,
          source: source,
          timestamp: new Date(now).toISOString(),
        }
      );

      return true;
    } catch (error) {
      logToConsole("error", `Error uploading setting ${settingKey}`, error);
      throw error;
    }
  }

  async function downloadSettingFromCloud(settingKey) {
    try {
      const s3 = initializeS3Client();

      logToConsole("download", `Downloading setting ${settingKey} from cloud`);

      const params = {
        Bucket: config.bucketName,
        Key: `settings/${settingKey}.json`,
      };

      try {
        const data = await s3.getObject(params).promise();
        const encryptedContent = new Uint8Array(data.Body);
        const decryptedText = await decryptData(encryptedContent);
        const settingData = JSON.parse(decryptedText);

        if (!settingData.key || settingData.key !== settingKey) {
          logToConsole(
            "warning",
            `Setting key mismatch: expected ${settingKey}, got ${settingData.key}`
          );
          settingData.key = settingKey;
        }

        logToConsole("success", `Downloaded setting ${settingKey} from cloud`, {
          source: settingData.source,
          valueLength: settingData.value?.length || 0,
          lastModified: settingData.lastModified
            ? new Date(settingData.lastModified).toISOString()
            : "unknown",
        });

        return settingData;
      } catch (error) {
        if (error.code === "NoSuchKey") {
          logToConsole("info", `Setting ${settingKey} not found in cloud`);
          return null;
        }
        throw error;
      }
    } catch (error) {
      logToConsole("error", `Error downloading setting ${settingKey}`, error);
      throw error;
    }
  }

  async function deleteSettingFromCloud(settingKey) {
    try {
      const s3 = initializeS3Client();

      logToConsole("cleanup", `Deleting setting ${settingKey} from cloud`);

      await deleteFromS3(`settings/${settingKey}.json`);

      // Update cloud metadata to mark as deleted
      const cloudMetadata = await downloadCloudMetadata();
      if (!cloudMetadata.settings) cloudMetadata.settings = { items: {} };
      if (!cloudMetadata.settings.items) cloudMetadata.settings.items = {};

      cloudMetadata.settings.items[settingKey] = {
        deleted: true,
        deletedAt: Date.now(),
        lastModified: Date.now(),
        syncedAt: Date.now(),
        tombstoneVersion:
          (cloudMetadata.settings.items[settingKey]?.tombstoneVersion || 0) + 1,
      };

      await uploadToS3(
        "metadata.json",
        new TextEncoder().encode(JSON.stringify(cloudMetadata)),
        {
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
        }
      );

      logToConsole(
        "success",
        `Successfully deleted setting ${settingKey} from cloud`
      );
      return true;
    } catch (error) {
      logToConsole(
        "error",
        `Error deleting setting ${settingKey} from cloud`,
        error
      );
      throw error;
    }
  }

  async function syncSettingsToCloud() {
    logToConsole("start", "Starting individual settings sync to cloud...");
    try {
      const syncTimestamp = Date.now();
      let uploadedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const uploadedSettings = new Map();
      const cloudMetadata = await downloadCloudMetadata();
      const isInitialSync =
        !cloudMetadata.settings?.items ||
        Object.keys(cloudMetadata.settings.items).length === 0;

      if (isInitialSync) {
        logToConsole(
          "info",
          "Detected empty cloud settings - performing initial upload of all local settings"
        );
      }

      let orphanedMetadataCount = 0;
      if (!isInitialSync && cloudMetadata.settings?.items) {
        const s3 = initializeS3Client();
        const settingsToCheck = Object.entries(cloudMetadata.settings.items);
        const orphanedSettings = [];

        for (const [settingKey, settingMeta] of settingsToCheck) {
          if (!settingMeta.deleted) {
            try {
              const params = {
                Bucket: config.bucketName,
                Key: `settings/${settingKey}.json`,
              };
              await s3.headObject(params).promise();
            } catch (error) {
              if (error.code === "NoSuchKey" || error.code === "NotFound") {
                orphanedSettings.push(settingKey);
                logToConsole(
                  "info",
                  `Found orphaned metadata for missing setting ${settingKey}`
                );
              } else {
                logToConsole(
                  "warning",
                  `Error checking setting file ${settingKey}`,
                  error
                );
              }
            }
          }
        }

        if (orphanedSettings.length > 0) {
          const totalSettings = settingsToCheck.length;
          const orphanedPercentage =
            (orphanedSettings.length / totalSettings) * 100;

          if (orphanedPercentage > 50) {
            logToConsole(
              "warning",
              `Detected ${
                orphanedSettings.length
              }/${totalSettings} (${orphanedPercentage.toFixed(
                1
              )}%) orphaned settings - this may indicate a sync race condition. Skipping cleanup to prevent data loss.`
            );
          } else {
            for (const settingKey of orphanedSettings) {
              delete cloudMetadata.settings.items[settingKey];
              orphanedMetadataCount++;
            }

            logToConsole(
              "info",
              `Cleaned up ${orphanedMetadataCount} orphaned metadata entries - triggering re-upload`
            );
            await uploadToS3(
              "metadata.json",
              new TextEncoder().encode(JSON.stringify(cloudMetadata)),
              {
                ContentType: "application/json",
                ServerSideEncryption: "AES256",
              }
            );
          }
        }
      }

      const processedKeys = new Set();
      for (const key of Object.keys(localStorage)) {
        if (shouldExcludeSetting(key) || processedKeys.has(key)) {
          continue;
        }
        processedKeys.add(key);
        const localMeta = localMetadata.settings.items[key];
        const settingValue = localStorage.getItem(key);
        if (settingValue === null) continue;
        const cloudSettingMeta = cloudMetadata.settings?.items?.[key];
        const settingExistsInCloud =
          cloudSettingMeta && !cloudSettingMeta.deleted;
        const currentHash = await generateContentHash(settingValue);
        const needsUpload =
          isInitialSync ||
          !localMeta ||
          !localMeta.syncedAt ||
          !settingExistsInCloud ||
          localMeta.lastModified > localMeta.syncedAt ||
          localMeta.hash !== currentHash ||
          (cloudSettingMeta?.hash && cloudSettingMeta.hash !== currentHash);
        if (needsUpload) {
          try {
            await uploadSettingToCloud(key, syncTimestamp);
            uploadedCount++;
            uploadedSettings.set(key, {
              hash: currentHash,
              lastModified: localMeta?.lastModified || syncTimestamp,
              syncedAt: syncTimestamp,
              source: "localStorage",
              deleted: false,
            });
            logToConsole("debug", `Uploaded setting ${key}`, {
              reason: isInitialSync
                ? "initial sync"
                : !localMeta
                ? "no local metadata"
                : !settingExistsInCloud
                ? "not in cloud"
                : localMeta.lastModified > localMeta.syncedAt
                ? "locally modified"
                : localMeta.hash !== currentHash
                ? "content changed"
                : "hash mismatch with cloud",
              source: "localStorage",
              cloudExists: !!cloudSettingMeta,
            });
          } catch (error) {
            logToConsole("error", `Failed to upload setting ${key}`, error);
            errorCount++;
          }
        } else {
          skippedCount++;
          // logToConsole("debug", `Skipped setting ${key}: already in sync`, {
          //   lastModified: localMeta.lastModified
          //     ? new Date(localMeta.lastModified).toISOString()
          //     : "never",
          //   syncedAt: localMeta.syncedAt
          //     ? new Date(localMeta.syncedAt).toISOString()
          //     : "never",
          //   hashMatch: localMeta.hash === currentHash,
          //   existsInCloud: settingExistsInCloud,
          // });
        }
      }
      try {
        const db = await openIndexedDB();
        const transaction = db.transaction("keyval", "readonly");
        const store = transaction.objectStore("keyval");
        const keys = await new Promise((resolve, reject) => {
          const request = store.getAllKeys();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        for (const key of keys) {
          if (shouldExcludeSetting(key) || processedKeys.has(key)) {
            continue;
          }
          processedKeys.add(key);
          const localMeta = localMetadata.settings.items[key];
          const settingValue = await getIndexedDBValue(key);
          if (settingValue === undefined) continue;
          const valueToHash =
            typeof settingValue === "object"
              ? JSON.stringify(settingValue)
              : settingValue;
          const currentHash = await generateContentHash(valueToHash);
          const cloudSettingMeta = cloudMetadata.settings?.items?.[key];
          const settingExistsInCloud =
            cloudSettingMeta && !cloudSettingMeta.deleted;
          const needsUpload =
            isInitialSync ||
            !localMeta ||
            !localMeta.syncedAt ||
            !settingExistsInCloud ||
            localMeta.lastModified > localMeta.syncedAt ||
            localMeta.hash !== currentHash ||
            (cloudSettingMeta?.hash && cloudSettingMeta.hash !== currentHash);
          if (needsUpload) {
            try {
              await uploadSettingToCloud(key, syncTimestamp);
              uploadedCount++;
              uploadedSettings.set(key, {
                hash: currentHash,
                lastModified: localMeta?.lastModified || syncTimestamp,
                syncedAt: syncTimestamp,
                source: "indexeddb",
                deleted: false,
              });
              logToConsole("debug", `Uploaded IndexedDB setting ${key}`, {
                reason: isInitialSync
                  ? "initial sync"
                  : !localMeta
                  ? "no local metadata"
                  : !settingExistsInCloud
                  ? "not in cloud"
                  : localMeta.lastModified > localMeta.syncedAt
                  ? "locally modified"
                  : localMeta.hash !== currentHash
                  ? "content changed"
                  : "hash mismatch with cloud",
                source: "indexeddb",
              });
            } catch (error) {
              logToConsole(
                "error",
                `Failed to upload IndexedDB setting ${key}`,
                error
              );
              errorCount++;
            }
          } else {
            skippedCount++;
            // logToConsole(
            //   "debug",
            //   `Skipped IndexedDB setting ${key}: already in sync`,
            //   {
            //     lastModified: localMeta.lastModified
            //       ? new Date(localMeta.lastModified).toISOString()
            //       : "never",
            //     syncedAt: localMeta.syncedAt
            //       ? new Date(localMeta.syncedAt).toISOString()
            //       : "never",
            //     hashMatch: localMeta.hash === currentHash,
            //     existsInCloud: settingExistsInCloud,
            //   }
            // );
          }
        }
      } catch (error) {
        logToConsole(
          "error",
          "Error reading IndexedDB for settings sync",
          error
        );
      }
      if (uploadedCount > 0) {
        logToConsole("debug", "Updating cloud metadata after settings upload", {
          uploadedCount,
          uploadedSettingsSize: uploadedSettings.size,
          uploadedSettingsKeys: Array.from(uploadedSettings.keys()).slice(0, 5),
        });

        const updatedCloudMetadata = await downloadCloudMetadata();
        // logToConsole("debug", "Downloaded cloud metadata for update", {
        //   hasSettings: !!updatedCloudMetadata.settings,
        //   hasSettingsItems: !!updatedCloudMetadata.settings?.items,
        //   currentSettingsItemsCount: updatedCloudMetadata.settings?.items
        //     ? Object.keys(updatedCloudMetadata.settings.items).length
        //     : 0,
        // });

        if (!updatedCloudMetadata.settings)
          updatedCloudMetadata.settings = { items: {} };
        if (!updatedCloudMetadata.settings.items)
          updatedCloudMetadata.settings.items = {};

        const beforeCount = Object.keys(
          updatedCloudMetadata.settings.items
        ).length;

        for (const [settingKey, settingMeta] of uploadedSettings) {
          updatedCloudMetadata.settings.items[settingKey] = settingMeta;
          logToConsole(
            "debug",
            `Added setting ${settingKey} to cloud metadata`,
            {
              hash: settingMeta.hash?.substring(0, 8) + "...",
              source: settingMeta.source,
            }
          );
        }

        const afterCount = Object.keys(
          updatedCloudMetadata.settings.items
        ).length;

        updatedCloudMetadata.settings.lastModified = syncTimestamp;
        updatedCloudMetadata.settings.syncedAt = syncTimestamp;
        updatedCloudMetadata.lastSyncTime = Math.max(
          updatedCloudMetadata.lastSyncTime || 0,
          syncTimestamp
        );

        logToConsole("debug", "About to upload updated metadata", {
          beforeCount,
          afterCount,
          settingsAdded: uploadedSettings.size,
          metadataSize: JSON.stringify(updatedCloudMetadata).length,
        });

        await uploadToS3(
          "metadata.json",
          new TextEncoder().encode(JSON.stringify(updatedCloudMetadata)),
          {
            ContentType: "application/json",
            ServerSideEncryption: "AES256",
          }
        );

        // Verify the metadata was saved correctly
        try {
          const verifyMetadata = await downloadCloudMetadata();
          const verifySettingsCount = verifyMetadata.settings?.items
            ? Object.keys(verifyMetadata.settings.items).length
            : 0;
          // logToConsole("debug", "Verified cloud metadata after upload", {
          //   verifySettingsCount,
          //   expectedCount: afterCount,
          //   verificationMatch: verifySettingsCount === afterCount,
          // });
        } catch (verifyError) {
          logToConsole(
            "error",
            "Failed to verify metadata upload",
            verifyError
          );
        }

        logToConsole("success", "Updated cloud metadata after settings sync", {
          settingsAdded: uploadedSettings.size,
          totalCloudSettings: Object.keys(updatedCloudMetadata.settings.items)
            .length,
        });
      }
      logToConsole("success", "Individual settings sync to cloud completed", {
        uploaded: uploadedCount,
        skipped: skippedCount,
        errors: errorCount,
        totalProcessed: processedKeys.size,
        isInitialSync: isInitialSync,
        timestamp: new Date(syncTimestamp).toISOString(),
      });
      return uploadedCount > 0;
    } catch (error) {
      logToConsole("error", "Error during settings sync to cloud", error);
      throw error;
    }
  }

  async function syncSettingsFromCloud() {
    logToConsole("start", "Starting individual settings sync from cloud...");

    try {
      const syncTimestamp = Date.now();
      let downloadedCount = 0;
      let skippedCount = 0;
      let appliedCount = 0;
      let errorCount = 0;

      const cloudMetadata = await downloadCloudMetadata();

      if (!cloudMetadata.settings?.items) {
        logToConsole("info", "No individual settings found in cloud metadata");
        return false;
      }

      logToConsole(
        "info",
        `Processing ${
          Object.keys(cloudMetadata.settings.items).length
        } settings from cloud`
      );

      for (const [settingKey, cloudSettingMeta] of Object.entries(
        cloudMetadata.settings.items
      )) {
        try {
          const localSettingMeta = localMetadata.settings.items[settingKey];

          // Handle deleted settings
          if (cloudSettingMeta.deleted === true) {
            if (localSettingMeta && !localSettingMeta.deleted) {
              logToConsole(
                "cleanup",
                `Deleting local setting ${settingKey} due to cloud tombstone`
              );

              // Remove from localStorage/IndexedDB
              if (localSettingMeta.source === "localStorage") {
                localStorage.removeItem(settingKey);
              } else if (localSettingMeta.source === "indexeddb") {
                await setIndexedDBKey(settingKey, undefined);
              }

              // Update local metadata
              localMetadata.settings.items[settingKey] = {
                deleted: true,
                deletedAt: cloudSettingMeta.deletedAt,
                lastModified: cloudSettingMeta.lastModified,
                syncedAt: syncTimestamp,
                tombstoneVersion: cloudSettingMeta.tombstoneVersion || 1,
              };

              appliedCount++;
            }
            continue;
          }

          // Skip if local setting is deleted
          if (localSettingMeta?.deleted === true) {
            await deleteSettingFromCloud(settingKey);

            localMetadata.settings.items[settingKey] = {
              ...localSettingMeta,
              syncedAt: syncTimestamp,
              lastModified: Date.now(),
            };

            appliedCount++;
            logToConsole(
              "success",
              `Deleted setting ${settingKey} from cloud and updated local metadata`
            );
            continue;
          }

          // Check if we need to download this setting
          const needsDownload =
            !localSettingMeta ||
            !localSettingMeta.hash ||
            (!localSettingMeta.syncedAt &&
              cloudSettingMeta.lastModified >
                (localSettingMeta.lastModified || 0)) ||
            (localSettingMeta.syncedAt &&
              cloudSettingMeta.lastModified > localSettingMeta.syncedAt &&
              cloudSettingMeta.hash !== localSettingMeta.hash);

          if (needsDownload) {
            logToConsole(
              "info",
              `Downloading setting ${settingKey} from cloud`,
              {
                reason: !localSettingMeta
                  ? "missing locally"
                  : !localSettingMeta.hash
                  ? "no local hash"
                  : !localSettingMeta.syncedAt
                  ? "never synced"
                  : cloudSettingMeta.hash !== localSettingMeta.hash
                  ? "hash mismatch"
                  : "cloud newer",
              }
            );

            const cloudSettingData = await downloadSettingFromCloud(settingKey);

            if (cloudSettingData) {
              // Apply the setting based on its source
              if (cloudSettingData.source === "localStorage") {
                localStorage.setItem(settingKey, cloudSettingData.value);
              } else if (cloudSettingData.source === "indexeddb") {
                let valueToStore = cloudSettingData.value;

                // Try to parse JSON if it looks like an object
                if (
                  typeof valueToStore === "string" &&
                  (valueToStore.startsWith("{") || valueToStore.startsWith("["))
                ) {
                  try {
                    valueToStore = JSON.parse(valueToStore);
                  } catch (e) {
                    logToConsole(
                      "warning",
                      `Could not parse setting ${settingKey} as JSON, storing as string`
                    );
                  }
                }

                await setIndexedDBKey(settingKey, valueToStore);
              }

              // Update local metadata
              const hash = await generateContentHash(cloudSettingData.value);
              localMetadata.settings.items[settingKey] = {
                hash: hash,
                lastModified: cloudSettingData.lastModified,
                syncedAt: syncTimestamp,
                source: cloudSettingData.source,
                deleted: false,
              };

              downloadedCount++;
              appliedCount++;
            }
          } else {
            skippedCount++;
          }
        } catch (error) {
          logToConsole(
            "error",
            `Error processing setting ${settingKey}`,
            error
          );
          errorCount++;
        }
      }

      // Save updated local metadata
      if (appliedCount > 0) {
        await saveLocalMetadata();
        logToConsole(
          "success",
          "Saved updated local metadata after settings sync"
        );
      }

      let cleanedDeletedCount = 0;
      for (const metadataKey of Object.keys(localMetadata.settings.items)) {
        const metadataEntry = localMetadata.settings.items[metadataKey];
        if (
          metadataEntry.deleted &&
          metadataEntry.syncedAt &&
          metadataEntry.syncedAt > metadataEntry.deletedAt
        ) {
          delete localMetadata.settings.items[metadataKey];
          cleanedDeletedCount++;
        }
      }

      if (cleanedDeletedCount > 0) {
        logToConsole(
          "cleanup",
          `Removed ${cleanedDeletedCount} synced deleted metadata entries after cloud sync`
        );
        localMetadata.settings.lastModified = Date.now();
        await saveLocalMetadata();
      }

      logToConsole("success", "Individual settings sync from cloud completed", {
        downloaded: downloadedCount,
        applied: appliedCount,
        skipped: skippedCount,
        errors: errorCount,
        timestamp: new Date(syncTimestamp).toISOString(),
      });

      return appliedCount > 0;
    } catch (error) {
      logToConsole("error", "Error during settings sync from cloud", error);
      throw error;
    }
  }

  async function checkLocalSettingsChanges() {
    try {
      let foundChanges = false;
      let checkedLocalStorage = 0;
      let checkedIndexedDB = 0;

      for (const key of Object.keys(localStorage)) {
        if (shouldExcludeSetting(key)) {
          continue;
        }
        checkedLocalStorage++;

        const localMeta = localMetadata.settings?.items?.[key];
        if (
          !localMeta ||
          !localMeta.syncedAt ||
          localMeta.lastModified > localMeta.syncedAt
        ) {
          logToConsole("debug", `Local settings change detected: ${key}`, {
            hasMetadata: !!localMeta,
            hasSyncedAt: !!localMeta?.syncedAt,
            lastModified: localMeta?.lastModified
              ? new Date(localMeta.lastModified).toISOString()
              : "NONE",
            syncedAt: localMeta?.syncedAt
              ? new Date(localMeta.syncedAt).toISOString()
              : "NONE",
          });
          foundChanges = true;
        }
      }

      try {
        const db = await openIndexedDB();
        const transaction = db.transaction("keyval", "readonly");
        const store = transaction.objectStore("keyval");
        const keys = await new Promise((resolve, reject) => {
          const request = store.getAllKeys();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });

        for (const key of keys) {
          if (shouldExcludeSetting(key)) {
            continue;
          }
          checkedIndexedDB++;

          const localMeta = localMetadata.settings?.items?.[key];

          if (
            !localMeta ||
            !localMeta.syncedAt ||
            localMeta.lastModified > localMeta.syncedAt
          ) {
            logToConsole(
              "debug",
              `Local IndexedDB settings change detected: ${key}`,
              {
                hasMetadata: !!localMeta,
                hasSyncedAt: !!localMeta?.syncedAt,
                lastModified: localMeta?.lastModified
                  ? new Date(localMeta.lastModified).toISOString()
                  : "NONE",
                syncedAt: localMeta?.syncedAt
                  ? new Date(localMeta.syncedAt).toISOString()
                  : "NONE",
              }
            );
            foundChanges = true;
          }
        }
      } catch (error) {
        logToConsole(
          "error",
          "Error checking IndexedDB for local settings changes",
          error
        );
      }

      logToConsole("debug", `Local settings check completed`, {
        checkedLocalStorage,
        checkedIndexedDB,
        foundChanges,
      });

      return foundChanges;
    } catch (error) {
      logToConsole("error", "Error checking local settings changes", error);
      return false;
    }
  }
}

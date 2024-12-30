// Global variables and constants
let backupIntervalRunning = false;
let wasImportSuccessful = false;
let isExportInProgress = false;
let isImportInProgress = false;
let isSnapshotInProgress = false;
const TIME_BACKUP_INTERVAL = 15; //minutes
const TIME_BACKUP_FILE_PREFIX = `T-${TIME_BACKUP_INTERVAL}`;
const BACKUP_FOLDER_NAME = "TypingMindBackup";
let gapi;
let tokenClient;
let backupFolderId = null;

// Client ID from the Developer Console
const CLIENT_ID =
  "102506089690-su2s10ijjprfcb9b8sjne1nb3ogo4i6l.apps.googleusercontent.com";

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

// Authorization scopes required by the API
const SCOPES = "https://www.googleapis.com/auth/drive.file";

// Utility functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Library loading functions
async function loadDexie() {
  if (typeof Dexie !== 'undefined') return;
  await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/dexie@latest/dist/dexie.js";
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

async function loadJSZip() {
  if (typeof JSZip !== 'undefined') return;
  await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.6.0/jszip.min.js";
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

async function loadGoogleAuth() {
  // Load Google API Client
  if (typeof gapi === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => {
        gapi.load("client", async () => {
          try {
            await gapi.client.init({
              discoveryDocs: [DISCOVERY_DOC],
            });
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Load Google Identity Services
  if (typeof google === 'undefined') {
    await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: "", // defined later
        });
        resolve();
      };
      document.head.appendChild(script);
    });
  }
}

// Authentication functions
async function authenticate() {
  return new Promise((resolve, reject) => {
    try {
      tokenClient.callback = async (resp) => {
        if (resp.error) {
          console.error("Authentication error:", resp);
          reject(new Error(`Authentication failed: ${resp.error}`));
          return;
        }
        resolve(resp);
      };
      
      if (gapi.client.getToken() === null) {
        // First time authentication
        tokenClient.requestAccessToken({ 
          prompt: "consent",
          hint: "Sign in to backup your Typing Mind data to Google Drive"
        });
      } else {
        // Already authenticated before
        tokenClient.requestAccessToken({ prompt: "" });
      }
    } catch (err) {
      console.error("Error in authenticate():", err);
      reject(err);
    }
  });
}

// Google Drive operations
async function setupBackupFolder() {
  try {
    await authenticate();

    // Search for existing backup folder
    const response = await gapi.client.drive.files.list({
      q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
    });

    if (response.result.files.length > 0) {
      backupFolderId = response.result.files[0].id;
    } else {
      // Create new backup folder
      const folderMetadata = {
        name: BACKUP_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      };

      const folder = await gapi.client.drive.files.create({
        resource: folderMetadata,
        fields: "id",
      });

      backupFolderId = folder.result.id;
    }
  } catch (err) {
    console.error("Error setting up backup folder:", err);
    throw err;
  }
}

// UI initialization
function createBackupButton() {
  const cloudSyncBtn = document.createElement("button");
  cloudSyncBtn.setAttribute("data-element-id", "cloud-sync-button");
  cloudSyncBtn.className =
    "cursor-default group flex items-center justify-center p-1 text-sm font-medium flex-col group focus:outline-0 focus:text-white text-white/70";

  const cloudIconSVG = `
  <svg class="w-6 h-6 flex-shrink-0" width="24px" height="24px" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M19 9.76c-.12-3.13-2.68-5.64-5.83-5.64-2.59 0-4.77 1.68-5.53 4.01-.19-.03-.39-.04-.57-.04-2.45 0-4.44 1.99-4.44 4.44 0 2.45 1.99 4.44 4.44 4.44h11.93c2.03 0 3.67-1.64 3.67-3.67 0-1.95-1.52-3.55-3.44-3.65zm-5.83-3.64c2.15 0 3.93 1.6 4.21 3.68l.12.88.88.08c1.12.11 1.99 1.05 1.99 2.19 0 1.21-.99 2.2-2.2 2.2H7.07c-1.64 0-2.97-1.33-2.97-2.97 0-1.64 1.33-2.97 2.97-2.97.36 0 .72.07 1.05.2l.8.32.33-.8c.59-1.39 1.95-2.28 3.45-2.28z" fill="currentColor"></path>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12 15.33v-5.33M9.67 12.33L12 14.67l2.33-2.34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
  `;

  const textSpan = document.createElement("span");
  textSpan.className =
    "font-normal self-stretch text-center text-xs leading-4 md:leading-none";
  textSpan.innerText = "Backup";

  const iconSpan = document.createElement("span");
  iconSpan.className =
    "block group-hover:bg-white/30 w-[35px] h-[35px] transition-all rounded-lg flex items-center justify-center group-hover:text-white/90";
  iconSpan.innerHTML = cloudIconSVG;

  cloudSyncBtn.appendChild(iconSpan);
  cloudSyncBtn.appendChild(textSpan);

  // Attach click handler
  cloudSyncBtn.addEventListener("click", function () {
    openSyncModal();
  });

  return cloudSyncBtn;
}

// Start watching for Teams button immediately
const observer = new MutationObserver((mutations) => {
  const teamsButton = document.querySelector(
    '[data-element-id="workspace-tab-teams"]'
  );

  if (teamsButton && teamsButton.parentNode && !document.querySelector('[data-element-id="cloud-sync-button"]')) {
    const cloudSyncBtn = createBackupButton();
    teamsButton.parentNode.insertBefore(cloudSyncBtn, teamsButton.nextSibling);
    console.log("Backup button inserted successfully");
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Modal UI
function openSyncModal() {
  var existingModal = document.querySelector(
    'div[data-element-id="sync-modal-dbbackup"]'
  );
  if (existingModal) {
    return;
  }
  var modalPopup = document.createElement("div");
  modalPopup.style.paddingLeft = "10px";
  modalPopup.style.paddingRight = "10px";
  modalPopup.setAttribute("data-element-id", "sync-modal-dbbackup");
  modalPopup.className =
    "bg-opacity-75 fixed inset-0 bg-gray-800 transition-all flex items-center justify-center z-[60]";
  modalPopup.innerHTML = `
        <div class="inline-block w-full align-bottom bg-white dark:bg-zinc-950 rounded-lg px-4 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:p-6 sm:align-middle pt-4 overflow-hidden sm:max-w-lg">
            <div class="text-gray-800 dark:text-white text-left text-sm">
                <div class="flex justify-center items-center mb-4">
                    <h3 class="text-center text-xl font-bold">Google Drive Backup & Sync</h3>
                    <div class="relative group ml-2">
                        <span class="cursor-pointer" id="info-icon" style="color: white">ℹ</span>
                        <div id="tooltip" style="display:none; width: 250px; margin-top: 0.5em;" class="z-1 absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded-md px-2 py-1 opacity-90 transition-opacity duration-300 opacity-0 transition-opacity">
                            Click "Connect to Google Drive" to authorize the app. Once connected, your data will be automatically backed up to Google Drive every minute when the browser tab is active.<br/><br/>
                            Restore backup: If a backup exists in Google Drive, it will be automatically restored when you load the app.<br/><br/>
                            Manual Backup & Restore: Use the "Backup Now" and "Restore" buttons for manual operations.<br/><br/>
                            Snapshot: Creates an instant backup that won't be overwritten.<br/><br/>
                            Download: Select a backup file and click Download to save it locally.<br/><br/>
                            You can revoke access anytime through your Google Account settings.
                        </div>
                    </div>
                </div>
                <div class="space-y-4">
                    <div id="auth-status" class="text-center mb-4">
                        <button id="auth-button" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                            Connect to Google Drive
                        </button>
                    </div>
                    <div class="mt-6 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
                        <div class="flex items-center justify-between mb-2">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-400">Available Backups</label>
                            <button id="refresh-backups-btn" class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="space-y-2">
                            <div class="w-full">
                                <select id="backup-files" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700">
                                    <option value="">Please connect to Google Drive first</option>
                                </select>
                            </div>
                            <div class="flex justify-end space-x-2">
                                <button id="backup-now-btn" class="z-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    Backup Now
                                </button>
                                <button id="snapshot-btn" class="z-1 px-3 py-2 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    Snapshot
                                </button>
                                <button id="download-backup-btn" class="z-1 px-3 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    Download
                                </button>
                                <button id="restore-backup-btn" class="z-1 px-3 py-2 text-sm text-white bg-yellow-600 rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    Restore
                                </button>
                                <button id="delete-backup-btn" class="z-1 px-3 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="status-message" class="mt-4 text-sm text-center"></div>
                </div>
            </div>
            <div class="mt-4 flex justify-end">
                <button id="close-modal-btn" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
            </div>
        </div>
    `;

  document.body.appendChild(modalPopup);

  // Setup event listeners
  const authButton = document.getElementById("auth-button");
  const refreshButton = document.getElementById("refresh-backups-btn");
  const backupNowButton = document.getElementById("backup-now-btn");
  const snapshotButton = document.getElementById("snapshot-btn");
  const downloadButton = document.getElementById("download-backup-btn");
  const restoreButton = document.getElementById("restore-backup-btn");
  const deleteButton = document.getElementById("delete-backup-btn");
  const closeButton = document.getElementById("close-modal-btn");
  const backupSelect = document.getElementById("backup-files");
  const statusMessage = document.getElementById("status-message");
  const infoIcon = document.getElementById("info-icon");
  const tooltip = document.getElementById("tooltip");

  // Info tooltip
  infoIcon.addEventListener("mouseenter", () => {
    tooltip.style.display = "block";
    setTimeout(() => (tooltip.style.opacity = "1"), 0);
  });
  infoIcon.addEventListener("mouseleave", () => {
    tooltip.style.opacity = "0";
    setTimeout(() => (tooltip.style.display = "none"), 300);
  });

  // Auth button
  authButton.addEventListener("click", async () => {
    try {
      await authenticate();
      updateAuthStatus(true);
      await loadBackupFiles();
    } catch (err) {
      console.error("Authentication failed:", err);
      statusMessage.textContent = "Authentication failed. Please try again.";
      statusMessage.style.color = "red";
    }
  });

  // Refresh button
  refreshButton.addEventListener("click", async () => {
    await loadBackupFiles();
  });

  // Backup now button
  backupNowButton.addEventListener("click", async () => {
    try {
      statusMessage.textContent = "Backing up...";
      const data = await exportBackupData();
      await backupToGDrive(data);
      statusMessage.textContent = "Backup completed successfully!";
      statusMessage.style.color = "green";
      await loadBackupFiles();
    } catch (err) {
      console.error("Backup failed:", err);
      statusMessage.textContent = "Backup failed. Please try again.";
      statusMessage.style.color = "red";
    }
  });

  // Snapshot button
  snapshotButton.addEventListener("click", async () => {
    try {
      statusMessage.textContent = "Creating snapshot...";
      const data = await exportBackupData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await backupToGDrive(data, `snapshot-${timestamp}.json`);
      statusMessage.textContent = "Snapshot created successfully!";
      statusMessage.style.color = "green";
      await loadBackupFiles();
    } catch (err) {
      console.error("Snapshot failed:", err);
      statusMessage.textContent = "Snapshot failed. Please try again.";
      statusMessage.style.color = "red";
    }
  });

  // Download button
  downloadButton.addEventListener("click", async () => {
    const selectedFile = backupSelect.value;
    if (!selectedFile) return;

    try {
      statusMessage.textContent = "Downloading...";
      await downloadBackupFile(selectedFile);
      statusMessage.textContent = "Download completed!";
      statusMessage.style.color = "green";
    } catch (err) {
      console.error("Download failed:", err);
      statusMessage.textContent = "Download failed. Please try again.";
      statusMessage.style.color = "red";
    }
  });

  // Restore button
  restoreButton.addEventListener("click", async () => {
    const selectedFile = backupSelect.value;
    if (!selectedFile) return;

    if (!confirm("This will overwrite your current data. Are you sure?")) {
      return;
    }

    try {
      statusMessage.textContent = "Restoring...";
      const data = await importFromGDrive(selectedFile);
      await importDataToStorage(data);
      statusMessage.textContent = "Restore completed! Refreshing page...";
      statusMessage.style.color = "green";
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error("Restore failed:", err);
      statusMessage.textContent = "Restore failed. Please try again.";
      statusMessage.style.color = "red";
    }
  });

  // Delete button
  deleteButton.addEventListener("click", async () => {
    const selectedFile = backupSelect.value;
    if (!selectedFile) return;

    if (!confirm("Are you sure you want to delete this backup?")) {
      return;
    }

    try {
      statusMessage.textContent = "Deleting...";
      await deleteBackupFile(selectedFile);
      statusMessage.textContent = "Delete completed!";
      statusMessage.style.color = "green";
      await loadBackupFiles();
    } catch (err) {
      console.error("Delete failed:", err);
      statusMessage.textContent = "Delete failed. Please try again.";
      statusMessage.style.color = "red";
    }
  });

  // Close button
  closeButton.addEventListener("click", () => {
    modalPopup.remove();
  });

  // Initial load
  checkAuthStatus();
}

async function loadBackupFiles() {
  const select = document.getElementById("backup-files");
  const refreshButton = document.getElementById("refresh-backups-btn");
  const actionButtons = document.querySelectorAll(
    "#backup-now-btn, #snapshot-btn, #download-backup-btn, #restore-backup-btn, #delete-backup-btn"
  );

  try {
    refreshButton.disabled = true;
    select.innerHTML = '<option value="">Loading backups...</option>';

    const response = await gapi.client.drive.files.list({
      q: `'${backupFolderId}' in parents and trashed=false`,
      spaces: "drive",
      fields: "files(id, name, modifiedTime)",
      orderBy: "modifiedTime desc",
    });

    const files = response.result.files;
    select.innerHTML = files.length
      ? ""
      : '<option value="">No backups found</option>';

    files.forEach((file) => {
      const option = document.createElement("option");
      option.value = file.name;
      const date = new Date(file.modifiedTime).toLocaleString();
      option.text = `${file.name} (${date})`;
      select.appendChild(option);
    });

    actionButtons.forEach((button) => (button.disabled = false));
  } catch (err) {
    console.error("Error loading backup files:", err);
    select.innerHTML = '<option value="">Error loading backups</option>';
  } finally {
    refreshButton.disabled = false;
  }
}

async function checkAuthStatus() {
  const authButton = document.getElementById("auth-button");
  const statusMessage = document.getElementById("status-message");
  const actionButtons = document.querySelectorAll(
    "#backup-now-btn, #snapshot-btn, #download-backup-btn, #restore-backup-btn, #delete-backup-btn"
  );

  try {
    const token = gapi.client.getToken();
    if (token) {
      updateAuthStatus(true);
      await loadBackupFiles();
    } else {
      updateAuthStatus(false);
      actionButtons.forEach((button) => (button.disabled = true));
    }
  } catch (err) {
    console.error("Error checking auth status:", err);
    statusMessage.textContent = "Error checking authentication status";
    statusMessage.style.color = "red";
    actionButtons.forEach((button) => (button.disabled = true));
  }
}

function updateAuthStatus(isAuthenticated) {
  const authButton = document.getElementById("auth-button");
  const statusMessage = document.getElementById("status-message");

  if (isAuthenticated) {
    authButton.textContent = "Connected to Google Drive";
    authButton.disabled = true;
    authButton.classList.add("bg-green-600");
    statusMessage.textContent = "Ready to backup";
    statusMessage.style.color = "green";
  } else {
    authButton.textContent = "Connect to Google Drive";
    authButton.disabled = false;
    authButton.classList.remove("bg-green-600");
    statusMessage.textContent = "Please connect to Google Drive";
    statusMessage.style.color = "orange";
  }
}

async function handleTimeBasedBackup() {
  try {
    const data = await exportBackupData();
    const filename = `${TIME_BACKUP_FILE_PREFIX}-backup.json`;

    // Create or update time-based backup
    await backupToGDrive(data, filename);

    console.log("Time-based backup completed successfully");
  } catch (err) {
    console.error("Error in time-based backup:", err);
  }
}

async function handleBackupFiles() {
  try {
    const data = await exportBackupData();
    const today = new Date();
    const dateSuffix = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const filename = `backup-${dateSuffix}.zip`;

    // Create daily backup
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const zip = new JSZip();
    zip.file("backup.json", blob);
    const zippedData = await zip.generateAsync({ type: "blob" });

    await backupToGDrive(zippedData, filename);

    localStorage.setItem("last-daily-backup-in-gdrive", dateSuffix);
    console.log("Daily backup completed successfully");
  } catch (err) {
    console.error("Error in daily backup:", err);
  }
}

async function setupStorageMonitoring() {
  const db = new Dexie("typingmind");
  db.version(1).stores({
    conversations: "++id",
    messages: "++id,conversationId",
    settings: "id",
  });

  const debounceBackup = debounce(async () => {
    if (!document.hidden) {
      const data = await exportBackupData();
      await backupToGDrive(data);
      const currentTime = new Date().toLocaleString();
      localStorage.setItem("last-cloud-sync", currentTime);

      var element = document.getElementById("last-sync-msg");
      if (element !== null) {
        element.innerText = `Last sync done at ${currentTime}`;
      }
    }
  }, 1000);

  // Monitor for changes
  db.conversations.hook("creating", debounceBackup);
  db.conversations.hook("updating", debounceBackup);
  db.conversations.hook("deleting", debounceBackup);
  db.messages.hook("creating", debounceBackup);
  db.messages.hook("updating", debounceBackup);
  db.messages.hook("deleting", debounceBackup);
  db.settings.hook("creating", debounceBackup);
  db.settings.hook("updating", debounceBackup);
  db.settings.hook("deleting", debounceBackup);
}

function startBackupInterval() {
  if (!backupIntervalRunning) {
    backupIntervalRunning = true;
    setInterval(async () => {
      if (!document.hidden) {
        const data = await exportBackupData();
        await backupToGDrive(data);
      }
    }, 60000); // Backup every minute when tab is active
  }
}

async function exportBackupData() {
  const db = new Dexie("typingmind");
  db.version(1).stores({
    conversations: "++id",
    messages: "++id,conversationId",
    settings: "id",
  });

  const conversations = await db.conversations.toArray();
  const messages = await db.messages.toArray();
  const settings = await db.settings.toArray();
  const localStorageData = { ...localStorage };

  return {
    conversations,
    messages,
    settings,
    localStorage: localStorageData,
    version: 1,
  };
}

// Initialize extension
if (document.readyState === "complete") {
  handleDOMReady();
} else {
  window.addEventListener("load", handleDOMReady);
}

async function handleDOMReady() {
  window.removeEventListener("load", handleDOMReady);
  try {
    // Load all required libraries first
    console.log("Loading required libraries...");
    await Promise.all([loadDexie(), loadJSZip()]);
    
    // Load Google auth separately since it requires sequential steps
    console.log("Loading Google Auth...");
    await loadGoogleAuth();
    
    console.log("Setting up backup folder...");
    await setupBackupFolder();
    
    console.log("Checking for existing backups...");
    var importSuccessful = await checkAndImportBackup();
    
    const storedSuffix = localStorage.getItem("last-daily-backup-in-gdrive");
    const today = new Date();
    const currentDateSuffix = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const currentTime = new Date().toLocaleString();
    const lastSync = localStorage.getItem("last-cloud-sync");
    var element = document.getElementById("last-sync-msg");

    if (lastSync && importSuccessful) {
      if (element !== null) {
        element.innerText = `Last sync done at ${currentTime}`;
        element = null;
      }
      if (!storedSuffix || currentDateSuffix > storedSuffix) {
        await handleBackupFiles();
      }
      startBackupInterval();
      setupStorageMonitoring();
    } else if (!backupIntervalRunning) {
      startBackupInterval();
      setupStorageMonitoring();
    }
    
    console.log("Google Drive backup extension initialized successfully!");
  } catch (err) {
    console.error("Error in handleDOMReady:", err);
  }
}

// Visibility change event listener
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden) {
    var importSuccessful = await checkAndImportBackup();
    const storedSuffix = localStorage.getItem("last-daily-backup-in-gdrive");
    const today = new Date();
    const currentDateSuffix = `${today.getFullYear()}${String(
      today.getMonth() + 1
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const currentTime = new Date().toLocaleString();
    const lastSync = localStorage.getItem("last-cloud-sync");
    var element = document.getElementById("last-sync-msg");

    if (lastSync && importSuccessful) {
      if (element !== null) {
        element.innerText = `Last sync done at ${currentTime}`;
        element = null;
      }
      if (!storedSuffix || currentDateSuffix > storedSuffix) {
        await handleBackupFiles();
      }
      startBackupInterval();
      setupStorageMonitoring();
    } else if (!backupIntervalRunning) {
      startBackupInterval();
      setupStorageMonitoring();
    }
  }
}

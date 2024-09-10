// Handle page load
const checkDOMLoaded = setInterval(async () => {
  if (document.readyState === "complete" && wasImportSuccessful !== true) {
    clearInterval(checkDOMLoaded);
    await checkAndImportBackup();
    const currentTime = new Date().toLocaleString();
    const lastSync = localStorage.getItem("last-cloud-sync");
    var element = document.getElementById("last-sync-msg");
    if (lastSync) {
      if (element !== null) {
        element.innerText = `Last sync done at ${currentTime}`;
        element = null;
      }
    }
    startBackupInterval();
  }
}, 5000);

// Create a new button
const cloudSyncBtn = document.createElement('button');
cloudSyncBtn.setAttribute('data-element-id', 'cloud-sync-button');
cloudSyncBtn.className = 'cursor-default group flex items-center justify-center p-1 text-sm font-medium flex-col group focus:outline-0 focus:text-white text-white/70';

const cloudIconSVG = `
<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 6400 5120" class="h-6 w-6 flex-shrink-0" aria-hidden="true" height="10em" width="10em" xmlns="http://www.w3.org/2000/svg"><path d="M5120 2240c0 -707 -573 -1280 -1280 -1280 -112 0 -220 15 -325 40C3380 622 3020 360 2620 360c-625 0 -1340 715 -1340 1560 0 123 15 242 43 355C745 2343 0 3035 0 3840c0 707 573 1280 1280 1280h3840c707 0 1280 -573 1280 -1280s-573 -1280 -1280 -1280zm0 1920"/></svg>
`;

const textSpan = document.createElement('span');
textSpan.className = 'text-[11px]';
textSpan.innerText = 'Backup';

const iconSpan = document.createElement('span');
iconSpan.className = 'block group-hover:bg-white/30 w-[35px] h-[35px] transition-all rounded-lg flex items-center justify-center group-hover:text-white/90';
iconSpan.innerHTML = cloudIconSVG;

cloudSyncBtn.appendChild(iconSpan);
cloudSyncBtn.appendChild(textSpan);

const teamsButton = document.querySelector('[data-element-id="workspace-tab-teams"]');
teamsButton.parentNode.insertBefore(cloudSyncBtn, teamsButton.nextSibling);

// Attach modal to new button
cloudSyncBtn.addEventListener("click", function () {
openSyncModal();
});

// New Popup
let wasImportSuccessful = false;
let lastBackupTime = 0;
let isExportInProgress = false;
let backupInterval;

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
    "fixed inset-0 bg-gray-800 transition-all bg-opacity-75 flex items-center justify-center z-[60]";
  modalPopup.innerHTML = `
        <div class="inline-block w-full align-bottom bg-white dark:bg-zinc-950 rounded-lg px-4 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:p-6 sm:align-middle pt-4 overflow-hidden sm:max-w-lg">
            <div class="text-gray-800 dark:text-white text-left text-sm">
                <div class="flex justify-center items-center mb-4">
                    <h3 class="text-center text-xl font-bold">Backup & Sync</h3>
                    <div class="relative group ml-2">
                        <span class="cursor-pointer" id="info-icon" style="color: white">ℹ</span>
                        <div id="tooltip" style="width: 250px; margin-top: 0.5em;" class="absolute z-10 -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded-md px-2 py-1 opacity-90 transition-opacity duration-300 opacity-0 transition-opacity">
                            Fill form & Save. <br/><br/> Initial backup: You will need to click on "Export to S3" to create your first backup in S3. Thereafter, automatic backups are done to S3 every 5 seconds if the browser tab is active.<br/><br/> Restore backup: If S3 already has an existing backup, this extension will automatically pick it and restore the data in this typingmind instance. <br/><br/> Adhoc Backup & Restore:  Use the "Export to S3" and "Import from S3" to perform on-demand backup or restore.
                        </div>
                    </div>
                </div>
                <div class="space-y-4">
                    <div>
                        <div class="my-4 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
                            <div class="space-y-4">
                                <div>
                                    <label for="aws-bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-400">S3 Bucket Name</label>
                                    <input id="aws-bucket" name="aws-bucket" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div>
                                    <label for="aws-access-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">AWS Access Key</label>
                                    <input id="aws-access-key" name="aws-access-key" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div>
                                    <label for="aws-secret-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">AWS Secret Key</label>
                                    <input id="aws-secret-key" name="aws-secret-key" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div class="flex justify-between space-x-2">
                                    <button id="save-aws-details-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-between space-x-2 mt-4">
                        <button id="export-to-s3-btn" type="button" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
                            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM770.87 824.869l-52.2 52.2c-4.7 4.7-1.9 12.8 4.7 13.6l179.4 21c5.1.6 9.5-3.7 8.9-8.9l-21-179.4c-.8-6.6-8.9-9.4-13.6-4.7l-52.4 52.4-256.2-256.2c-3.1-3.1-8.2-3.1-11.3 0l-42.4 42.4c-3.1 3.1-3.1 8.2 0 11.3l256.1 256.3Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                            </svg><span>Export to S3</span>
                        </button>
                        <button id="import-from-s3-btn" type="button" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
                            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM653.3 599.4l52.2-52.2c4.7-4.7 1.9-12.8-4.7-13.6l-179.4-21c-5.1-.6-9.5 3.7-8.9 8.9l21 179.4c.8 6.6 8.9 9.4 13.6 4.7l52.4-52.4 256.2 256.2c3.1 3.1 8.2 3.1 11.3 0l42.4-42.4c3.1-3.1 3.1-8.2 0-11.3L653.3 599.4Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                            </svg><span>Import from S3</span>
                        </button>
                    </div>
                    <div class="text-center mt-4">
                        <span id="last-sync-msg"></span>
                    </div>
                    <div id="action-msg" class="text-center"></div>
                </div>
            </div>
        </div>`;
  document.body.appendChild(modalPopup);

  const awsBucketInput = document.getElementById("aws-bucket");
  const awsAccessKeyInput = document.getElementById("aws-access-key");
  const awsSecretKeyInput = document.getElementById("aws-secret-key");
  const savedBucket = localStorage.getItem("aws-bucket");
  const savedAccessKey = localStorage.getItem("aws-access-key");
  const savedSecretKey = localStorage.getItem("aws-secret-key");
  const lastSync = localStorage.getItem("last-cloud-sync");

  if (savedBucket) awsBucketInput.value = savedBucket;
  if (savedAccessKey) awsAccessKeyInput.value = savedAccessKey;
  if (savedSecretKey) awsSecretKeyInput.value = savedSecretKey;
  const currentTime = new Date().toLocaleString();
  var element = document.getElementById("last-sync-msg");
  if (lastSync) {
    if (element !== null) {
      element.innerText = `Last sync done at ${currentTime}`;
      element = null;
    }
  }

  function updateButtonState() {
    const isDisabled =
      !awsBucketInput.value.trim() ||
      !awsAccessKeyInput.value.trim() ||
      !awsSecretKeyInput.value.trim();
    document.getElementById("export-to-s3-btn").disabled = isDisabled;
    document.getElementById("import-from-s3-btn").disabled = isDisabled;
    document.getElementById("save-aws-details-btn").disabled = isDisabled;
  }

  modalPopup.addEventListener("click", function (event) {
    if (event.target === modalPopup) {
      modalPopup.remove();
    }
  });

  awsBucketInput.addEventListener("input", updateButtonState);
  awsAccessKeyInput.addEventListener("input", updateButtonState);
  awsSecretKeyInput.addEventListener("input", updateButtonState);

  updateButtonState();

  const infoIcon = document.getElementById("info-icon");
  const tooltip = document.getElementById("tooltip");

  function showTooltip() {
    tooltip.classList.add("opacity-100");
    tooltip.classList.remove("opacity-0");
  }

  function hideTooltip() {
    tooltip.classList.add("opacity-0");
    tooltip.classList.remove("opacity-100");
  }

  infoIcon.addEventListener("click", () => {
    const isVisible = tooltip.classList.contains("opacity-100");
    if (isVisible) {
      hideTooltip();
    } else {
      showTooltip();
    }
  });

  // Save button click handler
  document
    .getElementById("save-aws-details-btn")
    .addEventListener("click", function () {
      localStorage.setItem("aws-bucket", awsBucketInput.value.trim());
      localStorage.setItem("aws-access-key", awsAccessKeyInput.value.trim());
      localStorage.setItem("aws-secret-key", awsSecretKeyInput.value.trim());
      const actionMsgElement = document.getElementById("action-msg");
      actionMsgElement.textContent = "AWS details saved!";
      actionMsgElement.style.color = "white";
      setTimeout(() => {
        actionMsgElement.textContent = "";
      }, 3000);
      updateButtonState();
      checkAndImportBackup();
      const currentTime = new Date().toLocaleString();
      const lastSync = localStorage.getItem("last-cloud-sync");
      var element = document.getElementById("last-sync-msg");
      if (lastSync) {
        if (element !== null) {
          element.innerText = `Last sync done at ${currentTime}`;
          element = null;
        }
      }
      startBackupInterval();
    });

  // Export button click handler
  document
    .getElementById("export-to-s3-btn")
    .addEventListener("click", async function () {
      isExportInProgress = true;
      await backupToS3();
      //console.log(`Synced to S3 at ${new Date().toLocaleString()}`);
      isExportInProgress = false;
    });

  // Import button click handler
  document
    .getElementById("import-from-s3-btn")
    .addEventListener("click", async function () {
      await importFromS3();
      //console.log(`Synced from S3 at ${new Date().toLocaleString()}`);
      wasImportSuccessful = true;
    });
}

// Visibility change event listener
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden) {
    await checkAndImportBackup();
    const currentTime = new Date().toLocaleString();
    const lastSync = localStorage.getItem("last-cloud-sync");
    var element = document.getElementById("last-sync-msg");
    if (lastSync) {
      if (element !== null) {
        element.innerText = `Last sync done at ${currentTime}`;
        element = null;
      }
    }
    startBackupInterval();
  } else {
    clearInterval(backupInterval);
  }
});

// Function to check for backup file and import it
async function checkAndImportBackup() {
  const bucketName = localStorage.getItem("aws-bucket");
  const awsAccessKey = localStorage.getItem("aws-access-key");
  const awsSecretKey = localStorage.getItem("aws-secret-key");

  if (bucketName && awsAccessKey && awsSecretKey) {
    if (typeof AWS === "undefined") {
      await loadAwsSdk();
    }

    AWS.config.update({
      accessKeyId: awsAccessKey,
      secretAccessKey: awsSecretKey,
      region: "ap-southeast-2",
    });

    const s3 = new AWS.S3();
    const params = {
      Bucket: bucketName,
      Key: "typingmind-backup.json",
    };

    s3.getObject(params, async function (err) {
      if (!err) {
        await importFromS3();
        //console.log(`Synced from S3 at ${new Date().toLocaleString()}`);
        wasImportSuccessful = true;
      } else {
        alert(
          "Backup file not found in S3! Run an adhoc 'Export to S3' first."
        );
      }
    });
  }
}

// Function to start the backup interval
function startBackupInterval() {
  clearInterval(backupInterval);
  backupInterval = setInterval(async () => {
    if (wasImportSuccessful && !isExportInProgress) {
      isExportInProgress = true;
      await backupToS3();
      //console.log(`Synced to S3 at ${new Date().toLocaleString()}`);
      isExportInProgress = false;
    }
  }, 5000);
}

// Function to load AWS SDK asynchronously
async function loadAwsSdk() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.amazonaws.com/js/aws-sdk-2.804.0.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Function to import data from S3 to localStorage and IndexedDB
function importDataToStorage(data) {
    Object.keys(localStorage).forEach((key) => {
      localStorage.removeItem(key);
    });
    const request = indexedDB.open("keyval-store");
    request.onsuccess = function (event) {
      const db = event.target.result;
      const transaction = db.transaction(["keyval"], "readwrite");
      const objectStore = transaction.objectStore("keyval");
  
      objectStore.clear().onsuccess = function () {
        data = data.indexedDB;
        Object.keys(data).forEach((key) => {
          objectStore.put(data[key], key);
        });
      };
    };
  
    Object.keys(data.localStorage).forEach((key) => {
      localStorage.setItem(key, data.localStorage[key]);
    });
  }

// Function to export data from localStorage and IndexedDB
function exportBackupData() {
  return new Promise((resolve, reject) => {
    var exportData = {
      localStorage: { ...localStorage },
      indexedDB: {},
    };
    var request = indexedDB.open("keyval-store", 1);
    request.onsuccess = function (event) {
      var db = event.target.result;
      var transaction = db.transaction(["keyval"], "readonly");
      var store = transaction.objectStore("keyval");
      store.getAllKeys().onsuccess = function (keyEvent) {
        var keys = keyEvent.target.result;
        store.getAll().onsuccess = function (valueEvent) {
          var values = valueEvent.target.result;
          keys.forEach((key, i) => {
            exportData.indexedDB[key] = values[i];
          });
          resolve(exportData);
        };
      };
    };
    request.onerror = function (error) {
      reject(error);
    };
  });
}

// Function to handle backup to S3
async function backupToS3() {
  const bucketName = localStorage.getItem("aws-bucket");
  const awsAccessKey = localStorage.getItem("aws-access-key");
  const awsSecretKey = localStorage.getItem("aws-secret-key");

  if (typeof AWS === "undefined") {
    await loadAwsSdk();
  }

  AWS.config.update({
    accessKeyId: awsAccessKey,
    secretAccessKey: awsSecretKey,
    region: "ap-southeast-2",
  });

  const data = await exportBackupData();
  const dataStr = JSON.stringify(data);
  const dataFileName = "typingmind-backup.json";
  const s3 = new AWS.S3();
  const uploadParams = {
    Bucket: bucketName,
    Key: dataFileName,
    Body: dataStr,
    ContentType: "application/json",
  };

  s3.upload(uploadParams, function (err, data) {
    const actionMsgElement = document.getElementById("action-msg");
    if (err) {
      actionMsgElement.textContent = `Error uploading data: ${err.message}`;
      actionMsgElement.style.color = "white";
    } else {
      const currentTime = new Date().toLocaleString();
      localStorage.setItem("last-cloud-sync", currentTime);
      var element = document.getElementById("last-sync-msg");
      if (element !== null) {
        element.innerText = `Last sync done at ${currentTime}`;
      }
    }
  });
  startBackupInterval();
}

// Function to handle import from S3
async function importFromS3() {
  const bucketName = localStorage.getItem("aws-bucket");
  const awsAccessKey = localStorage.getItem("aws-access-key");
  const awsSecretKey = localStorage.getItem("aws-secret-key");

  if (typeof AWS === "undefined") {
    await loadAwsSdk();
  }

  AWS.config.update({
    accessKeyId: awsAccessKey,
    secretAccessKey: awsSecretKey,
    region: "ap-southeast-2",
  });

  const s3 = new AWS.S3();
  const params = {
    Bucket: bucketName,
    Key: "typingmind-backup.json",
  };

  s3.getObject(params, function (err, data) {
    const actionMsgElement = document.getElementById("action-msg");
    if (err) {
      actionMsgElement.textContent = `Error fetching data: ${err.message}`;
      actionMsgElement.style.color = "white";
      return;
    }

    const importedData = JSON.parse(data.Body.toString("utf-8"));
    importDataToStorage(importedData);
    const currentTime = new Date().toLocaleString();
    localStorage.setItem("last-cloud-sync", currentTime);
    var element = document.getElementById("last-sync-msg");
    if (element !== null) {
      element.innerText = `Last sync done at ${currentTime}`;
    }
    wasImportSuccessful = true;
  });
}
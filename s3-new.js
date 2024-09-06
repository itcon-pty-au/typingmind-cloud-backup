const STORAGE_KEYS = {
    BUCKET: 'aws-bucket',
    ACCESS_KEY: 'aws-access-key',
    SECRET_KEY: 'aws-secret-key',
    LAST_SYNC: 'last-cloud-sync'
};

const cloudButtonDiv = document.querySelector('button[data-element-id="cloud-button"]');

if (cloudButtonDiv) {
    cloudButtonDiv.style.display = 'none';
    createCloudSyncButton(cloudButtonDiv);
}

function createCloudSyncButton(parent) {
    var cloudSyncBtn = document.createElement('button');
    cloudSyncBtn.type = 'button';
    cloudSyncBtn.setAttribute('data-element-id', 'cloud-sync-button');
    cloudSyncBtn.className = 'cursor-default bg-white/20 text-white group flex items-center justify-center rounded-md px-2 py-1 text-xs hover:bg-white/40 transition-all space-x-2 relative';
    cloudSyncBtn.innerHTML = `
        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" class="w-4 h-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
            <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4zM393.4 288H328v112c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16V288h-65.4c-14.3 0-21.4-17.2-11.3-27.3l105.4-105.4c6.2-6.2 16.4-6.2 22.6 0l105.4 105.4c10.1 10.1 2.9 27.3-11.3 27.3z"></path>
        </svg>`;
    parent.parentNode.insertBefore(cloudSyncBtn, parent.nextSibling);
    cloudSyncBtn.addEventListener('click', openSyncModal);
}

function openSyncModal() {
    var existingModal = document.querySelector('div[data-element-id="sync-modal-dbbackup"]');
    if (existingModal) return;

    var modalPopup = createModalPopup();
    document.body.appendChild(modalPopup);

    loadSavedData();

    modalPopup.addEventListener('click', handleModalClick);
    addInputListeners();
}

function createModalPopup() {
    var modalPopup = document.createElement('div');
    modalPopup.setAttribute('data-element-id', 'sync-modal-dbbackup');
    modalPopup.className = 'fixed inset-0 bg-gray-800 transition-all bg-opacity-75 flex items-center justify-center z-[60]';
    
    modalPopup.innerHTML =`
    <div class="inline-block w-full align-bottom bg-white dark:bg-zinc-950 rounded-lg px-4 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:p-6 sm:align-middle pt-4 overflow-hidden sm:max-w-lg">
        <div class="text-gray-800 dark:text-white text-left text-sm">
            <div class="flex justify-center items-center mb-4">
                <h3 class="text-center text-xl font-bold">Backup & Sync</h3>
                <div class="relative group ml-2">
                    <span class="cursor-pointer" id="info-icon">ℹ</span>
                    <div id="tooltip" style="width: 250px; margin-top: 0.5em;" class="absolute z-10 -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded-md px-2 py-1 opacity-90 transition-opacity duration-300 hidden">
                        <b>Step 1:</b> Fill form & Save<br/><br/>
                        <b>Step 2:</b> To create/update the backup in S3 with the data in this typingmind instance, click on "Export to S3". Instead, if you want to update data in this typingmind instance with the existing backup in S3, click on "Import from S3".<br/><br/>
                        <b>Step 3:</b> To automatically sync data between this typing instance and S3 going forward, toggle the "Enable Automated Cloud Backups". [ By doing this - When you open typingmind, it will refresh the latest data from S3. Also, any update to the data in the current typingmind instance will will trigger an update to S3 backup in real time.]
                    </div>
                </div>
            </div>
            <div class="space-y-4">
                ${createInputFields()}
                ${createActionButtons()}
                <div class="text-center mt-4">
                    <span id="last-sync-msg"></span>
                </div>
                <div id="action-msg" class="text-center"></div>
            </div>
        </div>
    </div>`;
    
    return modalPopup;
}

function createInputFields() {
    return `
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
            </div>
        </div>
    </div>`;
}

function createActionButtons() {
    return `
    <div class="flex justify-between space-x-2 mt-4">
        <button id="save-aws-details-btn" type="button" class="action-btn" disabled>Save</button>
        <button id="export-to-s3-btn" type="button" class="action-btn" disabled>
            <span>Export to S3</span>
        </button>
        <button id="import-from-s3-btn" type="button" class="action-btn" disabled>
            <span>Import from S3</span>
        </button>
    </div>`;
}

function loadSavedData() {
    const awsBucketInput = document.getElementById('aws-bucket');
    const awsAccessKeyInput = document.getElementById('aws-access-key');
    const awsSecretKeyInput = document.getElementById('aws-secret-key');
    const lastSyncMessage = document.getElementById('last-sync-msg');
    
    awsBucketInput.value = localStorage.getItem(STORAGE_KEYS.BUCKET) || '';
    awsAccessKeyInput.value = localStorage.getItem(STORAGE_KEYS.ACCESS_KEY) || '';
    awsSecretKeyInput.value = localStorage.getItem(STORAGE_KEYS.SECRET_KEY) || '';
    
    const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    if (lastSync) lastSyncMessage.innerText = `Last sync done at ${lastSync}`;
}

function handleModalClick(event) {
    const targetId = event.target.id;
    let awsBucketInput, awsAccessKeyInput, awsSecretKeyInput;

    if (targetId === 'info-icon') {
        const tooltip = document.getElementById('tooltip');
        toggleTooltip(tooltip);
    } 
    else if (event.target.classList.contains('action-btn')) {
        awsBucketInput = document.getElementById('aws-bucket');
        awsAccessKeyInput = document.getElementById('aws-access-key');
        awsSecretKeyInput = document.getElementById('aws-secret-key');

        switch (targetId) {
            case 'save-aws-details-btn':
                saveAwsDetails(awsBucketInput.value, awsAccessKeyInput.value, awsSecretKeyInput.value);
                break;
            case 'export-to-s3-btn':
                exportToS3(awsBucketInput.value, awsAccessKeyInput.value, awsSecretKeyInput.value);
                break;
            case 'import-from-s3-btn':
                importFromS3(awsBucketInput.value, awsAccessKeyInput.value, awsSecretKeyInput.value);
                break;
        }
    }

    // Close the modal
    if (event.target === event.currentTarget) {
        event.currentTarget.remove();
    }
}

function toggleTooltip(tooltip) {
    tooltip.classList.toggle('hidden');
}

function addInputListeners() {
    const awsBucketInput = document.getElementById('aws-bucket');
    const awsAccessKeyInput = document.getElementById('aws-access-key');
    const awsSecretKeyInput = document.getElementById('aws-secret-key');

    function updateButtonState() {
        const isDisabled = !awsBucketInput.value.trim() || !awsAccessKeyInput.value.trim() || !awsSecretKeyInput.value.trim();
        document.getElementById('export-to-s3-btn').disabled = isDisabled;
        document.getElementById('import-from-s3-btn').disabled = isDisabled;
        document.getElementById('save-aws-details-btn').disabled = isDisabled;
    }

    awsBucketInput.addEventListener('input', updateButtonState);
    awsAccessKeyInput.addEventListener('input', updateButtonState);
    awsSecretKeyInput.addEventListener('input', updateButtonState);

    updateButtonState();
}

// Save AWS details to localStorage
function saveAwsDetails(bucket, accessKey, secretKey) {
    localStorage.setItem(STORAGE_KEYS.BUCKET, bucket.trim());
    localStorage.setItem(STORAGE_KEYS.ACCESS_KEY, accessKey.trim());
    localStorage.setItem(STORAGE_KEYS.SECRET_KEY, secretKey.trim());
    displayActionMessage("AWS details saved!");
}

// Display message in the action message area
function displayActionMessage(message) {
    const actionMsgElement = document.getElementById('action-msg');
    actionMsgElement.textContent = message;
    actionMsgElement.style.color = 'white';
    setTimeout(() => {
        actionMsgElement.textContent = "";
    }, 3000);
}

// Exports to S3
async function exportToS3(bucketName, awsAccessKey, awsSecretKey) {
    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }
    configureAws();

    const data = await exportBackupData();
    const dataStr = JSON.stringify(data);
    const dataFileName = 'typingmind-backup.json';
    const s3 = new AWS.S3();
    const uploadParams = {
        Bucket: bucketName,
        Key: dataFileName,
        Body: dataStr,
        ContentType: 'application/json'
    };

    s3.upload(uploadParams, function (err) {
        if (err) {
            displayActionMessage(`Error uploading data: ${err.message}`);
        } else {
            displayActionMessage(`Export successful!`);
            const currentTime = new Date().toLocaleString();
            localStorage.setItem(STORAGE_KEYS.LAST_SYNC, currentTime);
            document.getElementById('last-sync-msg').innerText = `Last sync done at ${currentTime}`;
        }
    });
}

// Imports from S3
async function importFromS3(bucketName, awsAccessKey, awsSecretKey) {
    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }
    configureAws();

    const s3 = new AWS.S3();
    const params = {
        Bucket: bucketName,
        Key: 'typingmind-backup.json'
    };

    s3.getObject(params, function (err, data) {
        if (err) {
            displayActionMessage(`Error fetching data: ${err.message}`);
            return;
        }

        const importedData = JSON.parse(data.Body.toString('utf-8'));
        importDataToStorage(importedData);
        displayActionMessage(`Import successful!`);
        const currentTime = new Date().toLocaleString();
        localStorage.setItem(STORAGE_KEYS.LAST_SYNC, currentTime);
    });
}

// Function to load AWS SDK asynchronously
async function loadAwsSdk() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.804.0.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Import data into localStorage and IndexedDB
function importDataToStorage(data) {
    console.log("Imported data", data);

    Object.keys(data.localStorage).forEach(key => {
        localStorage.setItem(key, data.localStorage[key]);
    });

    const request = indexedDB.open("keyval-store");
    request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(["keyval"], "readwrite");
        const objectStore = transaction.objectStore("keyval");
        data = data.indexedDB;
        Object.keys(data).forEach(key => {
            objectStore.put(data[key], key);
        });
        transaction.oncomplete = () => {
            console.log("All records imported successfully!");
        };
        transaction.onerror = (e) => {
            console.error("Error during import transaction:", e.target.error);
        };
    };
    request.onerror = function (event) {
        console.error("Error opening IndexedDB:", event.target.error);
    };
}

// Function to export data from localStorage and IndexedDB
function exportBackupData() {
    return new Promise((resolve, reject) => {
        var exportData = {
            localStorage: { ...localStorage },
            indexedDB: {}
        };
        var request = indexedDB.open('keyval-store', 1);
        request.onsuccess = function (event) {
            var db = event.target.result;
            var transaction = db.transaction(['keyval'], 'readonly');
            var store = transaction.objectStore('keyval');
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

// Automated backup to S3
async function backupToS3() {
    const bucketName = localStorage.getItem(STORAGE_KEYS.BUCKET);
    const awsAccessKey = localStorage.getItem(STORAGE_KEYS.ACCESS_KEY);
    const awsSecretKey = localStorage.getItem(STORAGE_KEYS.SECRET_KEY);

    if (!bucketName || !awsAccessKey || !awsSecretKey) {
        console.warn("AWS credentials are missing. Automated backup skipped.");
        return;
    }

    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }

    configureAws();

    const data = await exportBackupData();
    const dataStr = JSON.stringify(data);
    const dataFileName = 'typingmind-backup.json';
    const s3 = new AWS.S3();
    const uploadParams = {
        Bucket: bucketName,
        Key: dataFileName,
        Body: dataStr,
        ContentType: 'application/json'
    };

    s3.upload(uploadParams, function (err) {
        if (err) {
            console.error(`Error uploading data: ${err.message}`);
        } else {
            console.log(`Automated backup successful!`);
            const currentTime = new Date().toLocaleString();
            localStorage.setItem(STORAGE_KEYS.LAST_SYNC, currentTime);
        }
    });
}

// Automated import from S3
async function importFromS3() {
    const bucketName = localStorage.getItem(STORAGE_KEYS.BUCKET);
    const awsAccessKey = localStorage.getItem(STORAGE_KEYS.ACCESS_KEY);
    const awsSecretKey = localStorage.getItem(STORAGE_KEYS.SECRET_KEY);

    if (!bucketName || !awsAccessKey || !awsSecretKey) {
        console.warn("AWS credentials are missing. Automated import skipped.");
        return;
    }

    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }

    configureAws();

    const s3 = new AWS.S3();
    const params = {
        Bucket: bucketName,
        Key: 'typingmind-backup.json'
    };

    s3.getObject(params, function (err, data) {
        if (err) {
            console.error(`Error fetching data: ${err.message}`);
            return;
        }

        const importedData = JSON.parse(data.Body.toString('utf-8'));
        importDataToStorage(importedData);
        console.log(`Automated import successful!`);
        const currentTime = new Date().toLocaleString();
        localStorage.setItem(STORAGE_KEYS.LAST_SYNC, currentTime);
    });
}

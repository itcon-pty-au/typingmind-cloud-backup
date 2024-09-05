const cloudButtonDiv = document.querySelector('button[data-element-id="cloud-button"]');
if (cloudButtonDiv) {
    cloudButtonDiv.style.display = 'none';
    var cloudSyncBtn = document.createElement('button');
    cloudSyncBtn.type = 'button';
    cloudSyncBtn.setAttribute('data-element-id', 'cloud-sync-button');
    cloudSyncBtn.className = 'cursor-default bg-white/20 text-white group flex items-center justify-center rounded-md px-2 py-1 text-xs hover:bg-white/40 transition-all space-x-2 relative';
    cloudSyncBtn.innerHTML = `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" class="w-4 h-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
        <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4zM393.4 288H328v112c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16V288h-65.4c-14.3 0-21.4-17.2-11.3-27.3l105.4-105.4c6.2-6.2 16.4-6.2 22.6 0l105.4 105.4c10.1 10.1 2.9 27.3-11.3 27.3z"></path>
    </svg>`;
    cloudButtonDiv.parentNode.insertBefore(cloudSyncBtn, cloudButtonDiv.nextSibling);
    cloudSyncBtn.addEventListener('click', function () {
        openSyncModal();
    });
}

function openSyncModal() {
    var existingModal = document.querySelector('div[data-element-id="sync-modal-dbbackup"]');
    if (existingModal) { return; }
    var modalPopup = document.createElement('div');
    modalPopup.setAttribute('data-element-id', 'sync-modal-dbbackup');
    modalPopup.className = 'fixed inset-0 bg-gray-800 transition-all bg-opacity-75 flex items-center justify-center z-[60]';
    modalPopup.innerHTML = `
        <div class="inline-block w-full align-bottom bg-white dark:bg-zinc-950 rounded-lg px-4 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:p-6 sm:align-middle pt-4 overflow-hidden sm:max-w-lg">
            <div class="text-gray-800 dark:text-white text-left text-sm">
                <div class="flex justify-center items-center mb-4">
                    <h3 class="text-center text-xl font-bold">Backup & Sync</h3>
                    <div class="relative group ml-2">
                        <span class="cursor-pointer" id="info-icon">ℹ</span>
                        <div id="tooltip" style="width: 250px; margin-top: 0.5em;" class="absolute z-10 -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded-md px-2 py-1 opacity-90 transition-opacity duration-300 opacity-0 transition-opacity">
                            <b>Step 1:</b> Fill form & Save<br/><br/>
                            <b>Step 2:</b> To create/update the backup in S3 with the data in this typingmind instance, click on "Export to S3". Instead, if you want to update data in this typingmind instance with the existing backup in S3, click on "Import from S3".<br/><br/>
                            <b>Step 3:</b> To automatically sync data between this typing instance and S3 going forward, toggle the "Enable Automated Cloud Backups". [ By doing this - When you open typingmind, it will refresh the latest data from S3. Also, any update to the data in the current typingmind instance will will trigger an update to S3 backup in real time.]
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-start space-x-2">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-400">Enable Automated Cloud Backups</span>
                    <label class="inline-flex items-center flex-shrink-0">
                        <button data-element-id="clouddb-backup-enabled" class="bg-gray-300 h-6 w-11 cursor-pointer relative inline-flex flex-shrink-0 rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2" id="cloudbk-switch" role="switch" type="button" tabindex="0" aria-checked="false" data-headlessui-state="">
                            <span aria-hidden="true" class="translate-x-0 h-5 w-5 pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
                        </button>
                    </label>
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

    const awsBucketInput = document.getElementById('aws-bucket');
    const awsAccessKeyInput = document.getElementById('aws-access-key');
    const awsSecretKeyInput = document.getElementById('aws-secret-key');
    const cloudbkSwitch = document.getElementById('cloudbk-switch');
    const savedBucket = localStorage.getItem('aws-bucket');
    const savedAccessKey = localStorage.getItem('aws-access-key');
    const savedSecretKey = localStorage.getItem('aws-secret-key');
    const lastSync = localStorage.getItem('last-cloud-sync');

    if (savedBucket) awsBucketInput.value = savedBucket;
    if (savedAccessKey) awsAccessKeyInput.value = savedAccessKey;
    if (savedSecretKey) awsSecretKeyInput.value = savedSecretKey;
    if (lastSync) document.getElementById('last-sync-msg').innerText = `Last sync done at ${lastSync}`;

    modalPopup.addEventListener('click', function (event) {
        if (event.target === modalPopup) {
            modalPopup.remove();
        }
    });

    // Tooltip toggle logic
    const infoIcon = document.getElementById('info-icon');
    const tooltip = document.getElementById('tooltip');
    let tooltipTimeout;

    function showTooltip() {
        tooltip.classList.add('opacity-100');
        tooltip.classList.remove('opacity-0');
        tooltipTimeout = setTimeout(() => {
            hideTooltip();
        }, 5000);
    }

    function hideTooltip() {
        tooltip.classList.add('opacity-0');
        tooltip.classList.remove('opacity-100');
    }

    infoIcon.addEventListener('click', () => {
        const isVisible = tooltip.classList.contains('opacity-100');
        if (isVisible) {
            hideTooltip();
        } else {
            showTooltip();
        }
    });

    infoIcon.addEventListener('mouseover', () => {
        clearTimeout(tooltipTimeout);
        showTooltip();
    });

    infoIcon.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
            hideTooltip();
        }, 5000);
    });

    tooltip.addEventListener('mouseover', () => {
        clearTimeout(tooltipTimeout);
    });

    // Save button click handler
    document.getElementById('save-aws-details-btn').addEventListener('click', function () {
        localStorage.setItem('aws-bucket', awsBucketInput.value.trim());
        localStorage.setItem('aws-access-key', awsAccessKeyInput.value.trim());
        localStorage.setItem('aws-secret-key', awsSecretKeyInput.value.trim());
        const actionMsgElement = document.getElementById('action-msg');
        actionMsgElement.textContent = "AWS details saved!";
        actionMsgElement.style.color = 'green';
        setTimeout(() => {
            actionMsgElement.textContent = "";
        }, 3000);
        updateButtonState();
    });

    // Save switch state to localStorage
    cloudbkSwitch.addEventListener('click', function () {
        const isChecked = cloudbkSwitch.getAttribute('aria-checked') === 'true';

        // Check if all AWS fields are populated before enabling backup
        if (!isChecked && (!awsBucketInput.value.trim() || !awsAccessKeyInput.value.trim() || !awsSecretKeyInput.value.trim())) {
            const actionMsgElement = document.getElementById('action-msg');
            actionMsgElement.textContent = "Please fill in all AWS fields before enabling backup.";
            actionMsgElement.style.color = 'red';
            setTimeout(() => {
                actionMsgElement.textContent = "";
            }, 3000);
            return;
        }

        if (isChecked) {
            cloudbkSwitch.setAttribute('aria-checked', 'true');
            cloudbkSwitch.classList.add('bg-blue-600');
            cloudbkSwitch.querySelector('span').classList.add('translate-x-5');
            cloudbkSwitch.querySelector('span').classList.remove('translate-x-0');
        } else {
            cloudbkSwitch.setAttribute('aria-checked', 'false');
            cloudbkSwitch.classList.remove('bg-blue-600');
            cloudbkSwitch.querySelector('span').classList.remove('translate-x-5');
            cloudbkSwitch.querySelector('span').classList.add('translate-x-0');
        }
        localStorage.setItem('clouddb-backup-enabled', !isChecked);
    });

    // Export button click handler
    document.getElementById('export-to-s3-btn').addEventListener('click', async function () {
        const bucketName = awsBucketInput.value.trim();
        const awsAccessKey = awsAccessKeyInput.value.trim();
        const awsSecretKey = awsSecretKeyInput.value.trim();

        // If AWS SDK is not already loaded, load it
        if (typeof AWS === 'undefined') {
            await loadAwsSdk();
        }

        // Initialize AWS SDK
        AWS.config.update({
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
            region: 'ap-southeast-2'
        });

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

        // Upload to S3
        s3.upload(uploadParams, function (err, data) {
            const actionMsgElement = document.getElementById('action-msg');
            if (err) {
                actionMsgElement.textContent = `Error uploading data: ${err.message}`;
                actionMsgElement.style.color = 'red';
            } else {
                actionMsgElement.textContent = `Export successful!`;
                actionMsgElement.style.color = 'green';
                const currentTime = new Date().toLocaleString();
                localStorage.setItem('last-cloud-sync', currentTime);
                document.getElementById('last-sync-msg').innerText = `Last sync done at ${currentTime}`;
            }
            setTimeout(() => {
                actionMsgElement.textContent = "";
            }, 3000);
        });
    });

    // Import button click handler
    document.getElementById('import-from-s3-btn').addEventListener('click', async function () {
        const bucketName = awsBucketInput.value.trim();
        const awsAccessKey = awsAccessKeyInput.value.trim();
        const awsSecretKey = awsSecretKeyInput.value.trim();

        // If AWS SDK is not already loaded, load it
        if (typeof AWS === 'undefined') {
            await loadAwsSdk();
        }

        // Initialize AWS SDK
        AWS.config.update({
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
            region: 'ap-southeast-2'
        });

        const s3 = new AWS.S3();
        const params = {
            Bucket: bucketName,
            Key: 'typingmind-backup.json'
        };
        // Fetch the data from S3
        s3.getObject(params, function (err, data) {
            const actionMsgElement = document.getElementById('action-msg');
            if (err) {
                actionMsgElement.textContent = `Error fetching data: ${err.message}`;
                actionMsgElement.style.color = 'red';
                return;
            }
            // Parse the data and store it back to localStorage and IndexedDB
            const importedData = JSON.parse(data.Body.toString('utf-8'));
            importDataToStorage(importedData);
            actionMsgElement.textContent = `Import successful!`;
            actionMsgElement.style.color = 'green';
            setTimeout(() => {
                actionMsgElement.textContent = "";
            }, 3000);
            const currentTime = new Date().toLocaleString();
            localStorage.setItem('last-cloud-sync', currentTime);
        });
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

function importDataToStorage(data) {
    console.log("Imported data", data);

    // Import to localStorage
    Object.keys(data.localStorage).forEach(key => {
        localStorage.setItem(key, data.localStorage[key]);
    });

    // Import to IndexedDB
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

// Function to handle automated backup on data change
function setupAutomatedBackup() {
    // Watch for changes in localStorage
    window.addEventListener('storage', async (event) => {
        if (localStorage.getItem('clouddb-backup-enabled') === 'true') {
            await backupToS3();
        }
    });

    // Watch for changes in IndexedDB
    const request = indexedDB.open("keyval-store");
    request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(["keyval"], "readonly");
        const objectStore = transaction.objectStore("keyval");

        objectStore.openCursor().onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                cursor.continue();
            } else {
                const observer = new MutationObserver((mutations) => {
                    if (localStorage.getItem('clouddb-backup-enabled') === 'true') {
                        backupToS3();
                    }
                });
                observer.observe(document, { attributes: true, childList: true, subtree: true });
            }
        };
    };
}

// Function to handle backup to S3
async function backupToS3() {
    const bucketName = localStorage.getItem('aws-bucket');
    const awsAccessKey = localStorage.getItem('aws-access-key');
    const awsSecretKey = localStorage.getItem('aws-secret-key');

    if (!bucketName || !awsAccessKey || !awsSecretKey) {
        console.warn("AWS credentials are missing. Automated backup skipped.");
        return;
    }

    // If AWS SDK is not already loaded, load it
    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }

    // Initialize AWS SDK
    AWS.config.update({
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
        region: 'ap-southeast-2'
    });

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

    s3.upload(uploadParams, function (err, data) {
        if (err) {
            console.error(`Error uploading data: ${err.message}`);
        } else {
            console.log(`Automated backup successful!`);
            const currentTime = new Date().toLocaleString();
            localStorage.setItem('last-cloud-sync', currentTime);
        }
    });
}

// On page load, check if automated backup is enabled and import data from S3
document.addEventListener('DOMContentLoaded', async () => {
    const isBackupEnabled = localStorage.getItem('clouddb-backup-enabled') === 'true';
    if (isBackupEnabled) {
        await importFromS3();
    }
    setupAutomatedBackup();
});

// Function to handle import from S3
async function importFromS3() {
    const bucketName = localStorage.getItem('aws-bucket');
    const awsAccessKey = localStorage.getItem('aws-access-key');
    const awsSecretKey = localStorage.getItem('aws-secret-key');

    if (!bucketName || !awsAccessKey || !awsSecretKey) {
        console.warn("AWS credentials are missing. Automated import skipped.");
        return;
    }

    // If AWS SDK is not already loaded, load it
    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }

    // Initialize AWS SDK
    AWS.config.update({
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
        region: 'ap-southeast-2'
    });

    const s3 = new AWS.S3();
    const params = {
        Bucket: bucketName,
        Key: 'typingmind-backup.json'
    };

    // Fetch the data from S3
    s3.getObject(params, function (err, data) {
        if (err) {
            console.error(`Error fetching data: ${err.message}`);
            return;
        }
        // Parse the data and store it back to localStorage and IndexedDB
        const importedData = JSON.parse(data.Body.toString('utf-8'));
        importDataToStorage(importedData);
        console.log(`Automated import successful!`);
        const currentTime = new Date().toLocaleString();
        localStorage.setItem('last-cloud-sync', currentTime);
    });
}

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
                    <h2 class="text-center text-xl font-bold">Backup & Sync</h2>
                    <hr class="my-4">
                    <div class="space-y-4">
                        <div>
                            <div class="my-4 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
                                <div class="space-y-4">
                                    <div>
                                        <label for="aws-bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-400">S3 Bucket Name</label>
                                        <input id="aws-bucket" name="aws-bucket" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                    </div>
                                    <div>
                                        <label for="aws-access-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">AWS Access Key</label>
                                        <input id="aws-access-key" name="aws-access-key" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                    </div>
                                    <div>
                                        <label for="aws-secret-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">AWS Secret Key</label>
                                        <input id="aws-secret-key" name="aws-secret-key" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between">
                            <button id="export-to-s3-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                                Export to S3
                            </button>
                            <button id="import-from-s3-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
                                Import from S3
                            </button>
                        </div>
                        <div id="action-msg" class="text-center"></div>
                    </div>
                </div>
            </div>`;
    document.body.appendChild(modalPopup);

    // Add click event to close modal
    modalPopup.addEventListener('click', function (event) {
        if (event.target === modalPopup) {
            modalPopup.remove();
        }
    });

    // Export button click handler
    document.getElementById('export-to-s3-btn').addEventListener('click', async function () {
        const bucketName = document.getElementById('aws-bucket').value.trim();
        const awsAccessKey = document.getElementById('aws-access-key').value.trim();
        const awsSecretKey = document.getElementById('aws-secret-key').value.trim();

        // Initialize AWS SDK
        AWS.config.update({
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
            region: 'us-east-1' // You can change this to your desired region
        });

        const data = await exportBackupData(); // Export local storage and IndexedDB data
        const dataStr = JSON.stringify(data);
        const dataFileName = `backup_${new Date().toISOString()}.json`;

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
                actionMsgElement.textContent = `Export successful! File uploaded to: ${data.Location}`;
                actionMsgElement.style.color = 'green';
                localStorage.setItem('last-cloud-sync', new Date().toLocaleString());
            }
        });
    });

    // Import button click handler
    document.getElementById('import-from-s3-btn').addEventListener('click', function () {
        const bucketName = document.getElementById('aws-bucket').value.trim();
        const awsAccessKey = document.getElementById('aws-access-key').value.trim();
        const awsSecretKey = document.getElementById('aws-secret-key').value.trim();

        // Initialize AWS SDK
        AWS.config.update({
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
            region: 'us-east-1' // You can change this to your desired region
        });

        const s3 = new AWS.S3();
        const params = {
            Bucket: bucketName,
            Key: 'backup.json' // Replace with your expected file name
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
            modalPopup.remove(); // Close modal after import
        });
    });
}

// Function to import data to localStorage and IndexedDB
function importDataToStorage(data) {
    // Import to localStorage
    Object.keys(data.localStorage).forEach(key => {
        localStorage.setItem(key, data.localStorage[key]);
    });

    // Assume you have an IndexedDB setup with a specific schema
    const request = indexedDB.open("keyval-store"); // Replace with your database name

    request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(db.objectStoreNames, "readwrite");

        for (let storeName of db.objectStoreNames) {
            const objectStore = transaction.objectStore(storeName);
            const records = data.indexedDB[storeName] || [];

            records.forEach(record => {
                objectStore.put(record); // Add or update records
            });
        }
    };

    request.onerror = function (event) {
        console.error("Error opening IndexedDB:", event.target.error);
    };
}

// Function to export data from localStorage and IndexedDB
async function exportBackupData() {
    const localStorageData = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        localStorageData[key] = localStorage.getItem(key);
    }
    const indexedDBData = await exportIndexedDB();
    return {
        localStorage: localStorageData,
        indexedDB: indexedDBData
    };
}

// Function to fetch data from IndexedDB
function exportIndexedDB() {
    return new Promise((resolve) => {
        const data = {};
        const request = indexedDB.open("keyval-store");

        request.onsuccess = function (event) {
            const db = event.target.result;
            const transaction = db.transaction(db.objectStoreNames, "readonly");

            for (let storeName of db.objectStoreNames) {
                const objectStore = transaction.objectStore(storeName);
                const allRecords = objectStore.getAll();

                allRecords.onsuccess = function (event) {
                    data[storeName] = event.target.result;
                    if (Object.keys(data).length === db.objectStoreNames.length) {
                        resolve(data);
                    }
                };
            }
        };

        request.onerror = function (event) {
            console.error("IndexedDB error:", event.target.error);
            resolve(data);
        };
    });
}

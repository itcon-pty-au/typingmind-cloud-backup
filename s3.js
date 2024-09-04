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
                    </div>
                    <div class="flex justify-between space-x-2">
                        <button id="save-aws-details-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                            Save
                        </button>
                        <button id="export-to-s3-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                            Export to S3
                        </button>
                        <button id="import-from-s3-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                            Import from S3
                        </button>
                    </div>
                    <div id="action-msg" class="text-center"></div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modalPopup);

    const awsBucketInput = document.getElementById('aws-bucket');
    const awsAccessKeyInput = document.getElementById('aws-access-key');
    const awsSecretKeyInput = document.getElementById('aws-secret-key');

    // Load AWS details from localStorage if they exist
    const savedBucket = localStorage.getItem('aws-bucket');
    const savedAccessKey = localStorage.getItem('aws-access-key');
    const savedSecretKey = localStorage.getItem('aws-secret-key');

    if (savedBucket) awsBucketInput.value = savedBucket;
    if (savedAccessKey) awsAccessKeyInput.value = savedAccessKey;
    if (savedSecretKey) awsSecretKeyInput.value = savedSecretKey;

    // Add click event to close modal
    modalPopup.addEventListener('click', function (event) {
        if (event.target === modalPopup) {
            modalPopup.remove();
        }
    });

    // Save button click handler
    document.getElementById('save-aws-details-btn').addEventListener('click', function () {
        localStorage.setItem('aws-bucket', awsBucketInput.value.trim());
        localStorage.setItem('aws-access-key', awsAccessKeyInput.value.trim());
        localStorage.setItem('aws-secret-key', awsSecretKeyInput.value.trim());
        const actionMsgElement = document.getElementById('action-msg');
        actionMsgElement.textContent = "AWS details saved!";
        actionMsgElement.style.color = 'green';
        setTimeout(()=>{
            actionMsgElement.textContent = "";
        }, 3000);
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
        const dataFileName = 'typingmind-backup.json'; // Static file name for export

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
            setTimeout(()=>{
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
            region: 'ap-southeast-2' // You can change this to your desired region
        });

        const s3 = new AWS.S3();
        const params = {
            Bucket: bucketName,
            Key: 'typingmind-backup.json' // Static file name for import
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
            //modalPopup.remove(); // Close modal after import
            setTimeout(()=>{
                actionMsgElement.textContent = "";
            }, 3000);
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

// Function to import data to localStorage and IndexedDB
function importDataToStorage(data) {
    console.log("Imported data", data);

    // Import to localStorage
    Object.keys(data.localStorage).forEach(key => {
        localStorage.setItem(key, data.localStorage[key]);
    });

    // Open the IndexedDB
    const request = indexedDB.open("keyval-store");

    request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction(["keyval"], "readwrite");

        const objectStore = transaction.objectStore("keyval");
        
        for (var key in data.indexedDB) {
            if (data.indexedDB.hasOwnProperty(key)) {
                store.put(data.indexedDB[key], key);
            }
        }

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

            const objectStore = transaction.objectStore("keyval");
            const allRecords = objectStore.getAll();

            allRecords.onsuccess = function (event) {
                data["keyval"] = event.target.result.map(record => ({
                    key: record.key, // key field
                    value: record,   // value field
                }));
                resolve(data);
            };

            allRecords.onerror = function (event) {
                console.error("Error fetching records from object store:", event.target.error);
                resolve({});
            };
        };

        request.onerror = function (event) {
            console.error("IndexedDB error:", event.target.error);
            resolve({});
        };
    });
}

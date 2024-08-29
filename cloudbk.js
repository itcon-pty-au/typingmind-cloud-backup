var cloudButtonDiv = document.querySelector('button[data-element-id="cloud-button"]');

if (cloudButtonDiv) {
    cloudButtonDiv.style.display = 'none';
    var newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.setAttribute('data-element-id', 'cloud-db-button');
    newButton.className = 'cursor-default bg-white/20 text-white group flex items-center justify-center rounded-md px-2 py-1 text-xs hover:bg-white/40 transition-all space-x-2 relative';
    newButton.innerHTML = `
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" class="w-4 h-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
        <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4zM393.4 288H328v112c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16V288h-65.4c-14.3 0-21.4-17.2-11.3-27.3l105.4-105.4c6.2-6.2 16.4-6.2 22.6 0l105.4 105.4c10.1 10.1 2.9 27.3-11.3 27.3z"></path>
    </svg>`;
    cloudButtonDiv.parentNode.insertBefore(newButton, cloudButtonDiv.nextSibling);
    newButton.addEventListener('click', function () {
        var existingModal = document.querySelector('div[data-element-id="pop-up-modal-dbbackup"]');
        if (existingModal) { return; }
        var modalPopup = document.createElement('div');
        modalPopup.setAttribute('data-element-id', 'pop-up-modal-dbbackup');
        modalPopup.className = 'fixed inset-0 bg-gray-800 transition-all bg-opacity-75 flex items-center justify-center z-[60]';
        modalPopup.innerHTML = `
        <div class="inline-block w-full align-bottom bg-white dark:bg-zinc-950 rounded-lg px-4 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:p-6 sm:align-middle pt-4 overflow-hidden sm:max-w-lg">
            <div class="text-gray-800 dark:text-white text-left text-sm">
                <h2 class="text-center text-xl font-bold">Backup & Sync</h2>
                <hr class="my-4">
                <div class="space-y-4">
                    <div>
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold flex items-center justify-start gap-2">
                                <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" class="h-5 w-5 text-blue-500" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4z"></path>
                                </svg> 
                                Cloud Backup
                            </h3>
                            <div class="flex items-center justify-start"><label class="inline-flex items-center justify-start flex-shrink-0 w-full">
                                <button data-element-id="clouddb-backup-enabled" class="bg-gray-300 h-6 w-11 cursor-pointer relative inline-flex flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2" id="plugins-switch" role="switch" type="button" tabindex="0" aria-checked="false" data-headlessui-state="">
                                    <span aria-hidden="true" class="translate-x-0 h-5 w-5 pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
                                </button></label></div>
                        </div>
                        <div class="my-4 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
                            <div class="space-y-4">
                                <!-- Form to collect connection information -->
                                <div>
                                    <label for="db-app-id" class="block text-sm font-medium text-gray-700 dark:text-gray-400">MongoDB App ID</label>
                                    <input id="db-app-id" name="db-app-id" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required disabled>
                                </div>
                                <div>
                                    <label for="db-api-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">MongoDB API Key</label>
                                    <input id="db-api-key" name="db-api-key" type="password" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required disabled>
                                </div>
                                <div>
                                    <label for="db-name" class="block text-sm font-medium text-gray-700 dark:text-gray-400">MongoDB Database Name</label>
                                    <input id="db-name" name="db-name" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required disabled>
                                </div>
                                <div>
                                    <label for="db-collection" class="block text-sm font-medium text-gray-700 dark:text-gray-400">MongoDB Collection Name</label>
                                    <input id="db-collection" name="db-collection" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required disabled>
                                </div>
                                <div>
                                    <label for="db-doc-id" class="block text-sm font-medium text-gray-700 dark:text-gray-400">MongoDB Document ID</label>
                                    <input id="db-doc-id" name="db-doc-id" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available">
                                </div>
                                <button id="cloud-export-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM770.87 824.869l-52.2 52.2c-4.7 4.7-1.9 12.8 4.7 13.6l179.4 21c5.1.6 9.5-3.7 8.9-8.9l-21-179.4c-.8-6.6-8.9-9.4-13.6-4.7l-52.4 52.4-256.2-256.2c-3.1-3.1-8.2-3.1-11.3 0l-42.4 42.4c-3.1 3.1-3.1 8.2 0 11.3l256.1 256.3Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                                    </svg> 
                                    <span>Export to Cloud</span>
                                </button>
                                <button id="cloud-import-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM653.3 599.4l52.2-52.2c4.7-4.7 1.9-12.8-4.7-13.6l-179.4-21c-5.1-.6-9.5 3.7-8.9 8.9l21 179.4c.8 6.6 8.9 9.4 13.6 4.7l52.4-52.4 256.2 256.2c3.1 3.1 8.2 3.1 11.3 0l42.4-42.4c3.1-3.1 3.1-8.2 0-11.3L653.3 599.4Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                                    </svg>
                                    <span>Import from Cloud</span>
                                </button>
                                <div id="cloud-action-msg" class="text-center"></div> <!-- NEW: Element to display success message after both buttons --> <!-- UPDATED -->
                                <div id="last-cloud-sync-msg" class="text-center text-white mt-2"></div> <!-- NEW: Element to display last sync time --> <!-- UPDATED -->
                            </div>
                        </div>
                        
                        <div>
                            <h3 class="text-lg font-semibold flex items-center justify-start gap-2 mb-2">
                                <div class="h-6 w-6 flex items-center justify-center flex-shrink-0">
                                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" class="h-4 w-4 text-blue-500" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M440.65 12.57l4 82.77A247.16 247.16 0 0 0 255.83 8C134.73 8 33.91 94.92 12.29 209.82A12 12 0 0 0 24.09 224h49.05a12 12 0 0 0 11.67-9.26 175.91 175.91 0 0 1 317-56.94l-101.46-4.86a12 12 0 0 0-12.57 12v47.41a12 12 0 0 0 12 12H500a12 12 0 0 0 12-12V12a12 12 0 0 0-12-12h-47.37a12 12 0 0 0-11.98 12.57zM255.83 432a175.61 175.61 0 0 1-146-77.8l101.8 4.87a12 12 0 0 0 12.57-12v-47.4a12 12 0 0 0-12-12H12a12 12 0 0 0-12 12V500a12 12 0 0 0 12 12h47.35a12 12 0 0 0 12-12.6l-4.15-82.57A247.17 247.17 0 0 0 255.83 504c121.11 0 221.93-86.92 243.55-201.82a12 12 0 0 0-11.8-14.18h-49.05a12 12 0 0 0-11.67 9.26A175.86 175.86 0 0 1 255.83 432z"></path>
                                    </svg>
                                </div>
                                <span>Local Backup</span>
                            </h3>
                            
                            <div>                               
                                <div class="my-4 flex items-center flex-wrap gap-2">
                                    <button id="export-btn" type="button" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
                                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM770.87 824.869l-52.2 52.2c-4.7 4.7-1.9 12.8 4.7 13.6l179.4 21c5.1.6 9.5-3.7 8.9-8.9l-21-179.4c-.8-6.6-8.9-9.4-13.6-4.7l-52.4 52.4-256.2-256.2c-3.1-3.1-8.2-3.1-11.3 0l-42.4 42.4c-3.1 3.1-3.1 8.2 0 11.3l256.1 256.3Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                                        </svg> 
                                    <span>Export</span>
                                    </button>
                                    
                                    <button id="import-btn" type="button" class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors">
                                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM653.3 599.4l52.2-52.2c4.7-4.7 1.9-12.8-4.7-13.6l-179.4-21c-5.1-.6-9.5 3.7-8.9 8.9l21 179.4c.8 6.6 8.9 9.4 13.6 4.7l52.4-52.4 256.2 256.2c3.1 3.1 8.2 3.1 11.3 0l42.4-42.4c3.1-3.1 3.1-8.2 0-11.3L653.3 599.4Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                                        </svg>
                                        <span>Import</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(modalPopup);
        modalPopup.addEventListener('click', function (event) {
            if (event.target === modalPopup) {
                modalPopup.remove();
            }
        });
        var lastCloudSync = localStorage.getItem("last-cloud-sync");
        if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
            document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
        }
        var pluginSwitch = document.getElementById('plugins-switch');
        var cloudImportBtn = document.getElementById('cloud-import-btn');
        var cloudExportBtn = document.getElementById('cloud-export-btn');
        var dbApiKeyInput = document.getElementById('db-api-key'); 
        var dbAppIdInput = document.getElementById('db-app-id'); 
        var dbNameInput = document.getElementById('db-name'); 
        var dbCollectionInput = document.getElementById('db-collection'); 
        var dbDocIdInput = document.getElementById('db-doc-id');
        populateFormFromLocalStorage(); 
        const savedState = localStorage.getItem('clouddb-backup-enabled');
        if (savedState === 'true') {
            pluginSwitch.setAttribute('aria-checked', 'true');
            pluginSwitch.classList.remove('bg-gray-300');
            pluginSwitch.classList.add('bg-blue-600');
            pluginSwitch.querySelector('span').classList.remove('translate-x-0');
            pluginSwitch.querySelector('span').classList.add('translate-x-5');
            dbApiKeyInput.removeAttribute('disabled'); 
            dbAppIdInput.removeAttribute('disabled'); 
            dbNameInput.removeAttribute('disabled'); 
            dbCollectionInput.removeAttribute('disabled'); 
            toggleCloudButtons();
        }
        function toggleCloudButtons() {
            if (!dbAppIdInput.value || !dbApiKeyInput.value || !dbNameInput.value || !dbCollectionInput.value) {
                cloudImportBtn.setAttribute('disabled', 'disabled');
                cloudExportBtn.setAttribute('disabled', 'disabled');
            } else {
                cloudImportBtn.removeAttribute('disabled');
                cloudExportBtn.removeAttribute('disabled');
            }
        }

        pluginSwitch.addEventListener('click', function () {
            var isChecked = pluginSwitch.getAttribute('aria-checked') === 'true';
            if (isChecked) {
                pluginSwitch.setAttribute('aria-checked', 'false');
                pluginSwitch.classList.remove('bg-blue-600');
                pluginSwitch.classList.add('bg-gray-300');
                pluginSwitch.querySelector('span').classList.remove('translate-x-5');
                pluginSwitch.querySelector('span').classList.add('translate-x-0');
                cloudImportBtn.setAttribute('disabled', 'disabled');
                cloudExportBtn.setAttribute('disabled', 'disabled');
                dbApiKeyInput.setAttribute('disabled', 'disabled'); 
                dbAppIdInput.setAttribute('disabled', 'disabled'); 
                dbNameInput.setAttribute('disabled', 'disabled'); 
                dbCollectionInput.setAttribute('disabled', 'disabled');
                localStorage.setItem('clouddb-backup-enabled', 'false');
            } else {
                pluginSwitch.setAttribute('aria-checked', 'true');
                pluginSwitch.classList.remove('bg-gray-300');
                pluginSwitch.classList.add('bg-blue-600');
                pluginSwitch.querySelector('span').classList.remove('translate-x-0');
                pluginSwitch.querySelector('span').classList.add('translate-x-5');
                dbApiKeyInput.removeAttribute('disabled'); 
                dbAppIdInput.removeAttribute('disabled'); 
                dbNameInput.removeAttribute('disabled'); 
                dbCollectionInput.removeAttribute('disabled');
                toggleCloudButtons();
                localStorage.setItem('clouddb-backup-enabled', 'true');
            }
        });
        dbApiKeyInput.addEventListener('input', toggleCloudButtons);
        dbAppIdInput.addEventListener('input', toggleCloudButtons);
        dbNameInput.addEventListener('input', toggleCloudButtons);
        dbCollectionInput.addEventListener('input', toggleCloudButtons);
        var exportBtn = document.getElementById('export-btn');
        exportBtn.addEventListener('click', function () {
            exportBackupData();
        });
        var importBtn = document.getElementById('import-btn');
        importBtn.addEventListener('click', function () {
            importBackupData();
        });
        cloudExportBtn.addEventListener('click', async function () {
            localStorage.setItem('db-app-id', dbAppIdInput.value.trim()); 
            localStorage.setItem('db-api-key', dbApiKeyInput.value.trim()); 
            localStorage.setItem('db-name', dbNameInput.value.trim()); 
            localStorage.setItem('db-collection', dbCollectionInput.value.trim());
            localStorage.setItem('db-doc-id', dbDocIdInput.value.trim());
            const currentTime = new Date().toLocaleString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
            await exportToCloud();
            localStorage.setItem('last-cloud-sync', currentTime);
            var lastCloudSync = localStorage.getItem("last-cloud-sync");
            if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
            }
        });
        cloudImportBtn.addEventListener('click', async function () {
            localStorage.setItem('db-app-id', dbAppIdInput.value.trim()); 
            localStorage.setItem('db-api-key', dbApiKeyInput.value.trim()); 
            localStorage.setItem('db-name', dbNameInput.value.trim()); 
            localStorage.setItem('db-collection', dbCollectionInput.value.trim());
            localStorage.setItem('db-doc-id', dbDocIdInput.value.trim());
            const currentTime = new Date().toLocaleString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });

            await importFromCloud();
            localStorage.setItem('last-cloud-sync', currentTime);
            var lastCloudSync = localStorage.getItem("last-cloud-sync");
            if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
            }
            localStorage.setItem('last-cloud-sync', currentTime);
        });
        const syncInterval = parseInt(localStorage.getItem('sync-interval'), 10) || 5;
        if (syncInterval > 0 && localStorage.getItem("clouddb-backup-enabled") === "true") {
            setInterval(async () => {
                await exportToCloud();
            }, 60000 * syncInterval);
        }
    });
}
async function exportToCloud() {
    const apiKey = localStorage.getItem('db-api-key'); 
    const appId = localStorage.getItem('db-app-id'); 
    const dbName = localStorage.getItem('db-name'); 
    const collectionName = localStorage.getItem('db-collection'); 
    let docId = localStorage.getItem('db-doc-id');
    let region = '';
    try {
        const response = await fetch(`https://services.cloud.mongodb.com/api/client/v2.0/app/${appId}/location`);
        if (!response.ok) {
            throw new Error(`Failed to fetch region. Status: ${response.status}, ${response.statusText}`);
        }
        const regionData = await response.json();
        const hostname = regionData.hostname;
        if (!hostname) {
            throw new Error('Hostname not found in response.');
        }
        const splitHost = hostname.split('//');
        if (splitHost.length < 2) {
            throw new Error('Unexpected hostname format: ' + hostname);
        }
        const regionParts = splitHost[1].split('.');
        if (regionParts.length < 2) {
            throw new Error('Unexpected region format in hostname: ' + hostname);
        }
        region = regionParts.slice(0, 2).join('.');
    } catch (error) {
        return;
    }
    let token = '';
    try {
        const response = await fetch(`https://services.cloud.mongodb.com/api/client/v2.0/app/${appId}/auth/providers/api-key/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "key": apiKey
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to retrieve access token. Status: ${response.status}, ${response.statusText}`); 
        }
        const tokenData = await response.json();
        token = tokenData.access_token; 
    } catch (error) {
        return;
    }
    try {
        const exportData = await exportBackupData();
        const url = docId ? 
            `https://${region}.data.mongodb-api.com/app/${appId}/endpoint/data/v1/action/updateOne` : 
            `https://${region}.data.mongodb-api.com/app/${appId}/endpoint/data/v1/action/insertOne`;
        const payload = docId ? {
            filter: { "_id": {"$oid": docId} },
            update: { "$set": { ...exportData } },
            upsert: true 
        } : {
            document: exportData
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                dataSource: 'mongodb-atlas', 
                database: dbName,
                collection: collectionName,
                ...payload
            }),
        });
        const currentTime = new Date().toLocaleString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
        if (response.ok) {
            const result = await response.json();
            console.log("Result: " + result.insertedId);
            localStorage.setItem('db-doc-id', result.insertedId);
            localStorage.setItem('last-cloud-sync', currentTime);
            document.getElementById('db-doc-id').value = result.insertedId;
            displayMessage('AppData synced to Cloud successfully!', 'white');
            var lastCloudSync = localStorage.getItem("last-cloud-sync");
            if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
            } 
        }
    } catch (error) {
    }
}
async function importFromCloud() {
    const apiKey = localStorage.getItem('db-api-key'); 
    const appId = localStorage.getItem('db-app-id'); 
    const dbName = localStorage.getItem('db-name'); 
    const collectionName = localStorage.getItem('db-collection'); 
    let docId = localStorage.getItem('db-doc-id');
    let region = '';
    try {
        const response = await fetch(`https://services.cloud.mongodb.com/api/client/v2.0/app/${appId}/location`);
        if (!response.ok) {
            throw new Error(`Failed to fetch region. Status: ${response.status}, ${response.statusText}`);
        }
        const regionData = await response.json();
        const hostname = regionData.hostname;
        if (!hostname) {
            throw new Error('Hostname not found in response.');
        }
        const splitHost = hostname.split('//');
        if (splitHost.length < 2) {
            throw new Error('Unexpected hostname format: ' + hostname);
        }
        const regionParts = splitHost[1].split('.');
        if (regionParts.length < 2) {
            throw new Error('Unexpected region format in hostname: ' + hostname);
        }
        region = regionParts.slice(0, 2).join('.');
    } catch (error) {
        return;
    }
    let token = '';
    try {
        const response = await fetch(`https://services.cloud.mongodb.com/api/client/v2.0/app/${appId}/auth/providers/api-key/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "key": apiKey
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to retrieve access token. Status: ${response.status}, ${response.statusText}`); 
        }
        const tokenData = await response.json();
        token = tokenData.access_token;
    } catch (error) {
        return;
    }
    try {
        const url = `https://${region}.data.mongodb-api.com/app/${appId}/endpoint/data/v1/action/findOne`; 
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                dataSource: 'mongodb-atlas',
                database: dbName,
                collection: collectionName,
                filter: { "_id": {"$oid": docId} } 
            }),
        });
        if (response.ok) {
            const backupData = await response.json();
            const storedData = backupData.document;
            if (!storedData) { 
                alert('No data found in the MongoDB document.');
                return;
            }
            for (var key in storedData.localStorage) {
                localStorage.setItem(key, storedData.localStorage[key]);
            }
            const request = indexedDB.open('keyval-store', 1);
            request.onsuccess = function (event) {
                const db = event.target.result;
                const transaction = db.transaction(['keyval'], 'readwrite');
                const store = transaction.objectStore('keyval');
                for (var key in storedData.indexedDB) {
                    store.put(storedData.indexedDB[key], key);
                }
                const currentTime = new Date().toLocaleString('en-AU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                });
                transaction.oncomplete = function () {
                    displayMessage('AppData synced from Cloud successfully!', 'white'); 
                    localStorage.setItem('last-cloud-sync', currentTime);
                    var lastCloudSync = localStorage.getItem("last-cloud-sync");
                    if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                        document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
                    }
                };
                transaction.onerror = function (error) {
                };
            };
        } else {
        }
    } catch (error) {
    }
}
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
        };
    });
}
function importBackupData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function (event) {
        var file = event.target.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var importedData = JSON.parse(e.target.result);
                    for (var key in importedData.localStorage) {
                        if (importedData.localStorage.hasOwnProperty(key)) {
                            localStorage.setItem(key, importedData.localStorage[key]);
                        }
                    }
                    var request = indexedDB.open('keyval-store', 1);
                    request.onsuccess = function (event) {
                        var db = event.target.result;
                        var transaction = db.transaction(['keyval'], 'readwrite');
                        var store = transaction.objectStore('keyval');
                        for (var key in importedData.indexedDB) {
                            if (importedData.indexedDB.hasOwnProperty(key)) {
                                store.put(importedData.indexedDB[key], key);
                            }
                        }
                        transaction.oncomplete = function () {
                        };
                        transaction.onerror = function (error) {
                        };
                    };
                    request.onerror = function (error) {
                    };
                } catch (error) {
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}
function populateFormFromLocalStorage() {
    const dbAppId = localStorage.getItem('db-app-id');
    const dbApiKey = localStorage.getItem('db-api-key');
    const dbName = localStorage.getItem('db-name');
    const dbCollection = localStorage.getItem('db-collection');
    const dbDocId = localStorage.getItem('db-doc-id');
    if (dbAppId) {
        document.getElementById('db-app-id').value = dbAppId; 
    }
    if (dbApiKey) {
        document.getElementById('db-api-key').value = dbApiKey; 
    }
    if (dbName) {
        document.getElementById('db-name').value = dbName; 
    }
    if (dbCollection) {
        document.getElementById('db-collection').value = dbCollection; 
    }
    if (dbDocId) { 
        document.getElementById('db-doc-id').value = dbDocId; 
    }
}
function checkDocumentReady() {
    if (document.readyState === 'complete') {
        initCloudBackup();
    } else {
        setTimeout(checkDocumentReady, 100);
    }
}
function initCloudBackup() {
    const isBackupEnabled = localStorage.getItem('clouddb-backup-enabled') === 'true';
    const dbApiKey = localStorage.getItem('db-api-key');
    const dbAppId = localStorage.getItem('db-app-id');
    const dbCollection = localStorage.getItem('db-collection');
    const dbDocId = localStorage.getItem('db-doc-id');
    const dbName = localStorage.getItem('db-name');
    if (isBackupEnabled && dbApiKey && dbAppId && dbCollection && dbDocId && dbName) {
        importFromCloud();
    }
}
checkDocumentReady();
function displayMessage(message, color) {
    const cloudActionMsg = document.getElementById('cloud-action-msg');
    if (!cloudActionMsg) {
        return;
    }
    cloudActionMsg.textContent = message;
    cloudActionMsg.style.color = color;
    setTimeout(() => {
        cloudActionMsg.textContent = '';
    }, 3000);
}

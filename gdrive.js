var cloudButtonDiv = document.querySelector('button[data-element-id="cloud-button"]');
if (cloudButtonDiv) {
    cloudButtonDiv.style.display = 'none';
      var cloudBkpBtn = document.createElement('button');
    cloudBkpBtn.type = 'button';
    cloudBkpBtn.setAttribute('data-element-id', 'cloud-db-button');
    cloudBkpBtn.className = 'cursor-default bg-white/20 text-white group flex items-center justify-center rounded-md px-2 py-1 text-xs hover:bg-white/40 transition-all space-x-2 relative';
      cloudBkpBtn.innerHTML = `
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" class="w-4 h-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
        <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4zM393.4 288H328v112c0 8.8-7.2 16-16 16h-48c-8.8 0-16-7.2-16-16V288h-65.4c-14.3 0-21.4-17.2-11.3-27.3l105.4-105.4c6.2-6.2 16.4-6.2 22.6 0l105.4 105.4c10.1 10.1 2.9 27.3-11.3 27.3z"></path>
    </svg>`;
    cloudButtonDiv.parentNode.insertBefore(cloudBkpBtn, cloudButtonDiv.nextSibling);
      cloudBkpBtn.addEventListener('click', function () {
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
                                Google Drive Backup <!--UPDATED-->
                            </h3>
                            <div class="flex items-center justify-start"><label class="inline-flex items-center justify-start flex-shrink-0 w-full">
                                <button data-element-id="clouddb-backup-enabled" class="bg-gray-300 h-6 w-11 cursor-pointer relative inline-flex flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2" id="cloudbk-switch" role="switch" type="button" tabindex="0" aria-checked="false" data-headlessui-state="">
                                    <span aria-hidden="true" class="translate-x-0 h-5 w-5 pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
                                </button></label></div>
                        </div>
  
                        <div class="my-4 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
                            <div class="space-y-4">
                                <!-- Form to collect Google Drive API information --> <!--UPDATED-->
                                <div>
                                    <label for="drive-client-id" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Google Drive Client ID</label> <!--UPDATED-->
                                    <input id="drive-client-id" name="drive-client-id" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required> <!--UPDATED-->
                                </div>
                                <div>
                                    <label for="drive-client-secret" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Google Drive Client Secret</label> <!--UPDATED-->
                                    <input id="drive-client-secret" name="drive-client-secret" type="password" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required> <!--UPDATED-->
                                </div>
                                <div>
                                    <label for="drive-refresh-token" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Google Drive Refresh Token</label> <!--UPDATED-->
                                    <input id="drive-refresh-token" name="drive-refresh-token" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available">
                                </div>
                                <div>
                                    <label for="remote-filename" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Remote File Name</label> <!--UPDATED-->
                                    <input id="remote-filename" name="remote-filename" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available" required> <!--UPDATED-->
                                </div>
                                <div>
                                    <label for="sync-interval" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Auto backup interval (min)</label>
                                    <input id="sync-interval" name="sync-interval" type="text" class="grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" value="" style="width:-webkit-fill-available">
                                </div>
                                <button id="cloud-export-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM770.87 824.869l-52.2 52.2c-4.7 4.7-1.9 12.8 4.7 13.6l179.4 21c5.1.6 9.5-3.7 8.9-8.9l-21-179.4c-.8-6.6-8.9-9.4-13.6-4.7l-52.4 52.4-256.2-256.2c-3.1-3.1-8.2-3.1-11.3 0l-42.4 42.4c-3.1 3.1-3.1 8.2 0 11.3l256.1 256.3Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                                    </svg> 
                                    <span>Export to Google Drive</span> <!--UPDATED-->
                                </button>
                                <button id="cloud-import-btn" type="button" class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM653.3 599.4l52.2-52.2c4.7-4.7 1.9-12.8-4.7-13.6l-179.4-21c-5.1-.6-9.5 3.7-8.9 8.9l21 179.4c.8 6.6 8.9 9.4 13.6 4.7l52.4-52.4 256.2 256.2c3.1 3.1 8.2 3.1 11.3 0l42.4-42.4c3.1-3.1 3.1-8.2 0-11.3L653.3 599.4Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                                    </svg>
                                    <span>Import from Google Drive</span> <!--UPDATED-->
                                </button>
                                <div id="cloud-action-msg" class="text-center"></div>
                                <div id="last-cloud-sync-msg" class="text-center text-white mt-2"></div>
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
        var cloudBackupSwitch = document.getElementById('cloudbk-switch');
        var cloudImportBtn = document.getElementById('cloud-import-btn');
        var cloudExportBtn = document.getElementById('cloud-export-btn');
        var driveClientIdInput = document.getElementById('drive-client-id');
        var driveClientSecretInput = document.getElementById('drive-client-secret');
        var driveRefreshTokenInput = document.getElementById('drive-refresh-token');
        var remoteFilenameInput = document.getElementById('remote-filename');
        var syncIntervalInput = document.getElementById('sync-interval');
        populateFormFromLocalStorage(); 
        const savedState = localStorage.getItem('clouddb-backup-enabled');
        if (savedState === 'true') {
            cloudBackupSwitch.setAttribute('aria-checked', 'true');
            cloudBackupSwitch.classList.remove('bg-gray-300');
            cloudBackupSwitch.classList.add('bg-blue-600');
            cloudBackupSwitch.querySelector('span').classList.remove('translate-x-0');
            cloudBackupSwitch.querySelector('span').classList.add('translate-x-5'); 
            toggleCloudButtons();
        }
        function toggleCloudButtons() {
            if (!driveClientIdInput.value || !driveClientSecretInput.value || !driveRefreshTokenInput.value) {
                cloudImportBtn.setAttribute('disabled', 'disabled');
                cloudExportBtn.setAttribute('disabled', 'disabled');
            } else {
                cloudImportBtn.removeAttribute('disabled');
                cloudExportBtn.removeAttribute('disabled');
            }
        }
        cloudBackupSwitch.addEventListener('click', function () {
            var isChecked = cloudBackupSwitch.getAttribute('aria-checked') === 'true';
            if (isChecked) {
                cloudBackupSwitch.setAttribute('aria-checked', 'false');
                cloudBackupSwitch.classList.remove('bg-blue-600');
                cloudBackupSwitch.classList.add('bg-gray-300');
                cloudBackupSwitch.querySelector('span').classList.remove('translate-x-5');
                cloudBackupSwitch.querySelector('span').classList.add('translate-x-0');
                localStorage.setItem('clouddb-backup-enabled', 'false');
                stopBackupInterval();
            } else {
                cloudBackupSwitch.setAttribute('aria-checked', 'true');
                cloudBackupSwitch.classList.remove('bg-gray-300');
                cloudBackupSwitch.classList.add('bg-blue-600');
                cloudBackupSwitch.querySelector('span').classList.remove('translate-x-0');
                cloudBackupSwitch.querySelector('span').classList.add('translate-x-5');
                toggleCloudButtons();
                localStorage.setItem('clouddb-backup-enabled', 'true');
                startBackupInterval();
            }
        });
        driveClientIdInput.addEventListener('input', toggleCloudButtons);
        driveClientSecretInput.addEventListener('input', toggleCloudButtons);
        driveRefreshTokenInput.addEventListener('input', toggleCloudButtons);
        remoteFilenameInput.addEventListener('input', toggleCloudButtons);
        var exportBtn = document.getElementById('export-btn');
        exportBtn.addEventListener('click', function () {
            exportBackupData();
        });
        var importBtn = document.getElementById('import-btn');
        importBtn.addEventListener('click', function () {
            importBackupData();
        });
        cloudExportBtn.addEventListener('click', async function () {
            const remoteFilename = remoteFilenameInput.value.trim() || 'typingmind-bk.json';
            localStorage.setItem('drive-client-id', driveClientIdInput.value.trim());
            localStorage.setItem('drive-client-secret', driveClientSecretInput.value.trim());
            localStorage.setItem('drive-refresh-token', driveRefreshTokenInput.value.trim());
            localStorage.setItem('remote-filename', remoteFilename); 
            localStorage.setItem('sync-interval', syncIntervalInput.value.trim());
            const currentTime = new Date().toLocaleString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
            await exportToGoogleDrive();
            localStorage.setItem('last-cloud-sync', currentTime);
            var lastCloudSync = localStorage.getItem("last-cloud-sync");
            if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
            }
        });
        cloudImportBtn.addEventListener('click', async function () {
            localStorage.setItem('drive-client-id', driveClientIdInput.value.trim());
            localStorage.setItem('drive-client-secret', driveClientSecretInput.value.trim());
            localStorage.setItem('drive-refresh-token', driveRefreshTokenInput.value.trim());
            localStorage.setItem('sync-interval', syncIntervalInput.value.trim()); 
            const currentTime = new Date().toLocaleString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
            await importFromGoogleDrive();
            localStorage.setItem('last-cloud-sync', currentTime);
            var lastCloudSync = localStorage.getItem("last-cloud-sync");
            if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
            }
            localStorage.setItem('last-cloud-sync', currentTime);
        });
        const syncInterval = parseInt(localStorage.getItem('sync-interval'), 10) || 5;
        if (!localStorage.getItem('sync-interval')) {
            localStorage.setItem('sync-interval', 5)
        }
        function startBackupInterval() {
            if (syncInterval > 0 && localStorage.getItem("clouddb-backup-enabled") === "true") {
                setInterval(async () => {
                    await exportToGoogleDrive();
                }, 60000 * syncInterval);
            }
        }
        function stopBackupInterval() {
            if (backupIntervalId) {
                clearInterval(backupIntervalId);
                backupIntervalId = null;
            }
        }
        startBackupInterval();
    });
}
async function exportToGoogleDrive() {
    const clientId = localStorage.getItem('drive-client-id');
    const clientSecret = localStorage.getItem('drive-client-secret');
    const refreshToken = localStorage.getItem('drive-refresh-token');
    const remoteFilename = localStorage.getItem('remote-filename');
    const googleAccessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
    try {
        const exportData = await exportBackupData();
        const metadata = {
            name: remoteFilename,
            mimeType: 'application/json',
        };
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(metadata),
        });
        const location = response.headers.get('Location');
        if (!location) {
            throw new Error('Failed to initiate resumable upload session.');
        }
        const uploadResponse = await fetch(location, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Range': `bytes 0-${JSON.stringify(exportData).length - 1}/${JSON.stringify(exportData).length}`,
            },
            body: JSON.stringify(exportData),
        });
        if (uploadResponse.ok) {
            const currentTime = new Date().toLocaleString('en-AU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
            localStorage.setItem('last-cloud-sync', currentTime);
            displayMessage('AppData synced to Google Drive successfully!', 'white');
            var lastCloudSync = localStorage.getItem("last-cloud-sync");
            if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
            }
        } else {
            throw new Error('Upload failed.');
        }
    } catch (error) {
        displayMessage('AppData sync to Google Drive failed!', 'white');
    }
}
async function getGoogleAccessToken(clientId, clientSecret, refreshToken) { 
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('refresh_token', refreshToken);
    params.append('grant_type', 'refresh_token');
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const tokenData = await response.json();
        if ('error' in tokenData) {
            throw new Error(tokenData.error);
        }

        return tokenData.access_token;
    } catch (error) {
        displayMessage('Failed to obtain Google Access Token!', 'white');
        throw error;
    }
}
async function importFromGoogleDrive() {
    const clientId = localStorage.getItem('drive-client-id');
    const clientSecret = localStorage.getItem('drive-client-secret');
    const refreshToken = localStorage.getItem('drive-refresh-token');
    const remoteFilename = localStorage.getItem('remote-filename');
    const googleAccessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
    try {
        const query = `name='${remoteFilename}' and trashed=false`;
        const driveQueryResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
            },
        });
        const driveQueryData = await driveQueryResponse.json();
        const fileId = driveQueryData.files[0]?.id;
        if (!fileId) {
            throw new Error('No file found in Google Drive for the given filename.');
        }
        const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
            },
        });
        const backupData = await downloadResponse.json();
        if (backupData) {
            for (var key in backupData.localStorage) {
                localStorage.setItem(key, backupData.localStorage[key]);
            }
            const request = indexedDB.open('keyval-store', 1);
            request.onsuccess = function (event) {
                const db = event.target.result;
                const transaction = db.transaction(['keyval'], 'readwrite');
                const store = transaction.objectStore('keyval');
                for (var key in backupData.indexedDB) {
                    store.put(backupData.indexedDB[key], key);
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
                    displayMessage('AppData synced from Google Drive successfully!', 'white'); 
                    localStorage.setItem('last-cloud-sync', currentTime);
                    var lastCloudSync = localStorage.getItem("last-cloud-sync");
                    if (lastCloudSync && document.getElementById("last-cloud-sync-msg")) {
                        document.getElementById("last-cloud-sync-msg").innerHTML = `Last synced at ${lastCloudSync}`;
                    }
                };
                transaction.onerror = function (error) {
                    displayMessage('Failed to sync data from IndexedDB!', 'white');
                };
            };
        } else {
            displayMessage('Failed to retrieve backup data from Google Drive!', 'white');
        }
    } catch (error) {
        displayMessage('AppData sync from Google Drive failed!', 'white');
    }
}
function populateFormFromLocalStorage() {
    const driveClientId = localStorage.getItem('drive-client-id');
    const driveClientSecret = localStorage.getItem('drive-client-secret');
    const driveRefreshToken = localStorage.getItem('drive-refresh-token');
    const remoteFilename = localStorage.getItem('remote-filename') || 'typingmind-bk.json';
    const syncInterval = localStorage.getItem('sync-interval');
    if (driveClientId) {
        document.getElementById('drive-client-id').value = driveClientId;
    }
    if (driveClientSecret) {
        document.getElementById('drive-client-secret').value = driveClientSecret;
    }
    if (driveRefreshToken) {
        document.getElementById('drive-refresh-token').value = driveRefreshToken;
    }
    if (remoteFilename) {
        document.getElementById('remote-filename').value = remoteFilename;
    }
    if (syncInterval) {
        document.getElementById('sync-interval').value = syncInterval;
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
    const driveClientId = localStorage.getItem('drive-client-id');
    const driveClientSecret = localStorage.getItem('drive-client-secret');
    const driveRefreshToken = localStorage.getItem('drive-refresh-token');
    const remoteFilename = localStorage.getItem('remote-filename') || 'typingmind-bk.json';

    if (isBackupEnabled && driveClientId && driveClientSecret && driveRefreshToken) {
        importFromGoogleDrive();
    }
}
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
checkDocumentReady();
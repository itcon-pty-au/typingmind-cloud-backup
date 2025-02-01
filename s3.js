console.log(`v20250201-18:31`);
let backupIntervalRunning = false;
let wasImportSuccessful = false;
let isExportInProgress = false;
let isImportInProgress = false;
let isSnapshotInProgress = false;
const TIME_BACKUP_INTERVAL = 15;
const TIME_BACKUP_FILE_PREFIX = `T-${TIME_BACKUP_INTERVAL}`;

// Move this variable declaration to the top
let awsSdkLoadPromise = null;

// Pre-load AWS SDK as soon as possible
const awsSdkPromise = loadAwsSdk();

// Add this at the top of the file with other flags
let isPageFullyLoaded = false;

(async function checkDOMOrRunBackup() {
	// Start loading AWS SDK immediately
	await awsSdkPromise;
	
	// Use 'interactive' instead of 'complete' to start sooner
	if (document.readyState !== 'loading') {
		await handleDOMReady();
	} else {
		// Use DOMContentLoaded instead of load
		window.addEventListener('DOMContentLoaded', handleDOMReady);
	}
})();

async function handleDOMReady() {
	window.removeEventListener('DOMContentLoaded', handleDOMReady);
	
	// Set page loaded flag immediately
	isPageFullyLoaded = true;
	
	// Check all required credentials upfront
	const bucketName = localStorage.getItem('aws-bucket');
	const awsAccessKey = localStorage.getItem('aws-access-key');
	const awsSecretKey = localStorage.getItem('aws-secret-key');
	const encryptionKey = localStorage.getItem('encryption-key');
	
	if (bucketName && awsAccessKey && awsSecretKey && encryptionKey) {
		try {
			var importSuccessful = await checkAndImportBackup();
			
			// Set page loaded flag regardless of import result
			isPageFullyLoaded = true;

			if (importSuccessful) {
				const storedSuffix = localStorage.getItem('last-daily-backup-in-s3');
				const today = new Date();
				const currentDateSuffix = `${today.getFullYear()}${String(
					today.getMonth() + 1
				).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
				
				if (!storedSuffix || currentDateSuffix > storedSuffix) {
					await handleBackupFiles();
				}
				
				// Only start backup if import was successful
				wasImportSuccessful = true;
				startBackupInterval();
			} else {
				// Handle case where user cancelled import
				// User chose to keep local data, so we should start backing it up
				wasImportSuccessful = true;  // Set to true to allow backups
				console.log('Import was cancelled by user - starting backup of local data');
				startBackupInterval();
			}

		} catch (error) {
			console.error('Failed to initialize backup:', error);
			isPageFullyLoaded = true;

			// Only allow backups for specific error cases
			if (error.code === 'NoSuchKey') {
				// No backup exists in cloud yet, safe to start backing up
				wasImportSuccessful = true;
				console.log('No existing backup found in S3 - starting fresh backup');
				startBackupInterval();
			} else if (error.code === 'CredentialsError' || error.code === 'InvalidAccessKeyId') {
				// Credential errors - don't start backup
				console.log('AWS credential error, not starting backup');
			} else if (error.message === 'Encryption key not configured') {
				// Encryption key missing - don't start backup
				console.log('Encryption key missing, not starting backup');
			} else {
				// For other errors (network etc), don't start backup to be safe
				console.log('Unknown error during import, not starting backup');
			}
			return;
		}
	}
}

// Create a new button
const cloudSyncBtn = document.createElement('button');
cloudSyncBtn.setAttribute('data-element-id', 'cloud-sync-button');
cloudSyncBtn.className =
	'cursor-default group flex items-center justify-center p-1 text-sm font-medium flex-col group focus:outline-0 focus:text-white text-white/70';

const cloudIconSVG = `
<svg class="w-6 h-6 flex-shrink-0" width="24px" height="24px" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M19 9.76c-.12-3.13-2.68-5.64-5.83-5.64-2.59 0-4.77 1.68-5.53 4.01-.19-.03-.39-.04-.57-.04-2.45 0-4.44 1.99-4.44 4.44 0 2.45 1.99 4.44 4.44 4.44h11.93c2.03 0 3.67-1.64 3.67-3.67 0-1.95-1.52-3.55-3.44-3.65zm-5.83-3.64c2.15 0 3.93 1.6 4.21 3.68l.12.88.88.08c1.12.11 1.99 1.05 1.99 2.19 0 1.21-.99 2.2-2.2 2.2H7.07c-1.64 0-2.97-1.33-2.97-2.97 0-1.64 1.33-2.97 2.97-2.97.36 0 .72.07 1.05.2l.8.32.33-.8c.59-1.39 1.95-2.28 3.45-2.28z" fill="currentColor"></path>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 15.33v-5.33M9.67 12.33L12 14.67l2.33-2.34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
`;

const textSpan = document.createElement('span');
textSpan.className =
	'font-normal self-stretch text-center text-xs leading-4 md:leading-none';
textSpan.innerText = 'Backup';

const iconSpan = document.createElement('span');
iconSpan.className =
	'block group-hover:bg-white/30 w-[35px] h-[35px] transition-all rounded-lg flex items-center justify-center group-hover:text-white/90';
iconSpan.innerHTML = cloudIconSVG;

cloudSyncBtn.appendChild(iconSpan);
cloudSyncBtn.appendChild(textSpan);

function insertCloudSyncButton() {
	const teamsButton = document.querySelector(
		'[data-element-id="workspace-tab-teams"]'
	);

	if (teamsButton && teamsButton.parentNode) {
		teamsButton.parentNode.insertBefore(cloudSyncBtn, teamsButton.nextSibling);
		return true;
	}
	return false;
}

const observer = new MutationObserver((mutations) => {
	if (insertCloudSyncButton()) {
		observer.disconnect();
	}
});

observer.observe(document.body, {
	childList: true,
	subtree: true,
});

const maxAttempts = 10;
let attempts = 0;
const interval = setInterval(() => {
	if (insertCloudSyncButton() || attempts >= maxAttempts) {
		clearInterval(interval);
	}
	attempts++;
}, 1000);

// Attach modal to new button
cloudSyncBtn.addEventListener('click', function () {
	openSyncModal();
});

// New Popup
let lastBackupTime = 0;
let backupInterval;

function openSyncModal() {
	var existingModal = document.querySelector(
		'div[data-element-id="sync-modal-dbbackup"]'
	);
	if (existingModal) {
		return;
	}
	var modalPopup = document.createElement('div');
	modalPopup.style.cssText = 'padding-left: 10px; padding-right: 10px; overflow-y: auto;';
	modalPopup.setAttribute('data-element-id', 'sync-modal-dbbackup');
	modalPopup.className =
		'bg-opacity-75 fixed inset-0 bg-gray-800 transition-all flex items-center justify-center z-[60]';
	modalPopup.innerHTML = `
        <div class="inline-block w-full align-bottom bg-white dark:bg-zinc-950 rounded-lg px-4 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:p-6 sm:align-middle pt-4 overflow-hidden sm:max-w-lg">
            <div class="text-gray-800 dark:text-white text-left text-sm">
                <div class="flex justify-center items-center mb-4">
                    <h3 class="text-center text-xl font-bold">Backup & Sync</h3>
                    <div class="relative group ml-2">
                        <span class="cursor-pointer" id="info-icon" style="color: white">ℹ</span>
                        <div id="tooltip" style="display:none; width: 250px; margin-top: 0.5em;" class="z-1 absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded-md px-2 py-1 opacity-90 transition-opacity duration-300 opacity-0 transition-opacity">
                            Fill form & Save. If you are using Amazon S3 - fill in S3 Bucket Name, AWS Region, AWS Access Key, AWS Secret Key.<br/><br/> Initial backup: You will need to click on "Export" to create your first backup in S3. Thereafter, automatic backups are done to S3 every 1 minute if the browser tab is active.<br/><br/> Restore backup: If S3 already has an existing backup, this extension will automatically pick it and restore the data in this typingmind instance. <br/><br/> Adhoc Backup & Restore:  Use the "Export" and "Import" to perform on-demand backup or restore. Note that this overwrites the main backup. <br/><br/> Snapshot: Creates an instant 'no-touch' backup that will not be overwritten. <br/><br/> Download: You can select the backup data to be download and click on Download button to download it for local storage. <br/><br/> Restore: Select the backup you want to restore and Click on Restore. The typingmind data will be restored to the selected backup data/date.
                        </div>
                    </div>
                </div>
                <div class="space-y-4">
                    <div>
		    <div class="mt-6 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
    <div class="flex items-center justify-between mb-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-400">Available Backups</label>
        <button id="refresh-backups-btn" class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50" disabled>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
        </button>
    </div>
    <div class="space-y-2">
        <div class="w-full">
            <select id="backup-files" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700">
                <option value="">Please configure AWS credentials first</option>
            </select>
        </div>
        <div class="flex justify-end space-x-2">
            <button id="download-backup-btn" class="z-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                Download
            </button>
            <button id="restore-backup-btn" class="z-1 px-3 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                Restore
            </button>
            <button id="delete-backup-btn" class="z-1 px-3 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                Delete
            </button>
        </div>
    </div>
</div>
                        <div class="my-4 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200 dark:bg-zinc-800 dark:border-gray-600">
                            <div class="space-y-4">
                                <div>
                                    <label for="aws-bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Bucket Name</label>
                                    <input id="aws-bucket" name="aws-bucket" type="text" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div>
                                    <label for="aws-region" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Region</label>
                                    <input id="aws-region" name="aws-region" type="text" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div>
                                    <label for="aws-access-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Access Key</label>
                                    <input id="aws-access-key" name="aws-access-key" type="password" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div>
                                    <label for="aws-secret-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Secret Key</label>
                                    <input id="aws-secret-key" name="aws-secret-key" type="password" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div>
                                    <label for="aws-endpoint" class="block text-sm font-medium text-gray-700 dark:text-gray-400">S3 Compatible Storage Endpoint (Optional)</label>
                                    <input id="aws-endpoint" name="aws-endpoint" type="text" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off">
                                </div>
                                <div>
				    <label for="backup-interval" class="block text-sm font-medium text-gray-700 dark:text-gray-400">Backup Interval (sec)</label>
				    <input id="backup-interval" name="backup-interval" type="number" min="30" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
				</div>
                                <div>
                                    <label for="encryption-key" class="block text-sm font-medium text-gray-700 dark:text-gray-400">
                                        Encryption Key
                                        <span class="ml-1 relative group cursor-pointer">
                                            <span class="text-xs">ℹ</span>
                                            <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-2 w-64 bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                                                Choose a secure 8+ character string. This is to encrypt the backup file before uploading to cloud. Securely store this somewhere as you will need this to restore backup from cloud.
                                            </div>
                                        </span>
                                    </label>
                                    <input id="encryption-key" name="encryption-key" type="password" class="z-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-zinc-700" autocomplete="off" required>
                                </div>
                                <div class="flex justify-between space-x-2">
                                    <button id="save-aws-details-btn" type="button" class="z-1 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-between space-x-2 mt-4">
                        <button id="export-to-s3-btn" type="button" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
                            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM770.87 824.869l-52.2 52.2c-4.7 4.7-1.9 12.8 4.7 13.6l179.4 21c5.1.6 9.5-3.7 8.9-8.9l-21-179.4c-.8-6.6-8.9-9.4-13.6-4.7l-52.4 52.4-256.2-256.2c-3.1-3.1-8.2-3.1-11.3 0l-42.4 42.4c-3.1 3.1-3.1 8.2 0 11.3l256.1 256.3Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                            </svg><span>Export</span>
                        </button>
                        <button id="import-from-s3-btn" type="button" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
                            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM653.3 599.4l52.2-52.2c4.7-4.7 1.9-12.8-4.7-13.6l-179.4-21c-5.1-.6-9.5 3.7-8.9 8.9l21 179.4c.8 6.6 8.9 9.4 13.6 4.7l52.4-52.4 256.2 256.2c3.1 3.1 8.2 3.1 11.3 0l42.4-42.4c3.1-3.1 3.1-8.2 0-11.3L653.3 599.4Z" transform="matrix(1 0 0 -1 0 1024)"></path>
                            </svg><span>Import</span>
                        </button>
                        <button id="snapshot-btn" type="button" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-default transition-colors" disabled>
				<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
				    <path d="M15 12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.172a3 3 0 0 0 2.12-.879l.83-.828A1 1 0 0 1 6.827 3h2.344a1 1 0 0 1 .707.293l.828.828A3 3 0 0 0 12.828 5H14a1 1 0 0 1 1 1v6zM2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2z"/>
				    <path d="M8 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm0 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 6.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z"/>
				</svg><span>Snapshot</span>
			</button>
        		<button id="close-modal-btn" type="button" class="z-1 inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
        			<span>Close</span>
    			</button>
    </div>

                    <!-- Status messages -->
                    <div class="text-center mt-4">
                        <span id="last-sync-msg"></span>
                    </div>
                    <div id="action-msg" class="text-center"></div>
                </div>
            </div>
        </div>`;
	document.body.appendChild(modalPopup);
	loadBackupFiles();

	const awsBucketInput = document.getElementById('aws-bucket');
	const awsRegionInput = document.getElementById('aws-region');
	const awsAccessKeyInput = document.getElementById('aws-access-key');
	const awsSecretKeyInput = document.getElementById('aws-secret-key');
	const awsEndpointInput = document.getElementById('aws-endpoint');
	const backupIntervalInput = document.getElementById('backup-interval');
	const encryptionKeyInput = document.getElementById('encryption-key');
	const closeButton = document.getElementById('close-modal-btn');

	const savedBucket = localStorage.getItem('aws-bucket');
	const savedRegion = localStorage.getItem('aws-region');
	const savedAccessKey = localStorage.getItem('aws-access-key');
	const savedSecretKey = localStorage.getItem('aws-secret-key');
	const savedEndpoint = localStorage.getItem('aws-endpoint');
	const lastSync = localStorage.getItem('last-cloud-sync');
	const savedInterval = localStorage.getItem('backup-interval') || '60';
	const savedEncryptionKey = localStorage.getItem('encryption-key');

	if (savedBucket) awsBucketInput.value = savedBucket;
	if (savedRegion) awsRegionInput.value = savedRegion;
	if (savedAccessKey) awsAccessKeyInput.value = savedAccessKey;
	if (savedSecretKey) awsSecretKeyInput.value = savedSecretKey;
	if (savedEndpoint) awsEndpointInput.value = savedEndpoint;
	if (backupIntervalInput) backupIntervalInput.value = savedInterval;
	if (savedEncryptionKey) document.getElementById('encryption-key').value = savedEncryptionKey;

	//const currentTime = new Date().toLocaleString();
	var element = document.getElementById('last-sync-msg');
	if (lastSync) {
		if (element !== null) {
			element.innerText = `Last sync done at ${lastSync}`;
			element = null;
		}
	}

	// Update updateButtonState to make encryption key optional
	function updateButtonState() {
		const awsBucketInput = document.getElementById('aws-bucket');
		const awsRegionInput = document.getElementById('aws-region');
		const awsAccessKeyInput = document.getElementById('aws-access-key');
		const awsSecretKeyInput = document.getElementById('aws-secret-key');
		const backupIntervalInput = document.getElementById('backup-interval');
		const encryptionKeyInput = document.getElementById('encryption-key');

		// Check if all required fields have values
		const hasRequiredFields = 
			awsBucketInput?.value?.trim() &&
			awsRegionInput?.value?.trim() &&
			awsAccessKeyInput?.value?.trim() &&
			awsSecretKeyInput?.value?.trim() &&
			backupIntervalInput?.value &&
			parseInt(backupIntervalInput.value) >= 15 &&
			encryptionKeyInput?.value?.trim().length >= 8;

		// Update button states
		const saveButton = document.getElementById('save-aws-details-btn');
		const exportButton = document.getElementById('export-to-s3-btn');
		const importButton = document.getElementById('import-from-s3-btn');
		const snapshotButton = document.getElementById('snapshot-btn');

		if (saveButton) saveButton.disabled = !hasRequiredFields;
		if (exportButton) exportButton.disabled = !hasRequiredFields;
		if (importButton) importButton.disabled = !hasRequiredFields;
		if (snapshotButton) snapshotButton.disabled = !hasRequiredFields;
	}

	modalPopup.addEventListener('click', function (event) {
		if (event.target === modalPopup) {
			modalPopup.remove();
		}
	});

	awsBucketInput.addEventListener('input', updateButtonState);
	awsRegionInput.addEventListener('input', updateButtonState);
	awsAccessKeyInput.addEventListener('input', updateButtonState);
	awsSecretKeyInput.addEventListener('input', updateButtonState);
	awsEndpointInput.addEventListener('input', updateButtonState);
	backupIntervalInput.addEventListener('input', updateButtonState);
	encryptionKeyInput.addEventListener('input', updateButtonState);

	updateButtonState();

	const infoIcon = document.getElementById('info-icon');
	const tooltip = document.getElementById('tooltip');

	function showTooltip() {
		tooltip.style.removeProperty('display');
		tooltip.classList.add('opacity-100');
		tooltip.classList.remove('z-1');
		tooltip.classList.add('z-10');
		tooltip.classList.remove('opacity-0');
	}

	function hideTooltip() {
		tooltip.style.display = 'none';
		tooltip.classList.add('opacity-0');
		tooltip.classList.remove('z-10');
		tooltip.classList.add('z-1');
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

	document
		.getElementById('backup-files')
		.addEventListener('change', updateBackupButtons);
	document
		.getElementById('download-backup-btn')
		.addEventListener('click', downloadBackupFile);
	document
		.getElementById('restore-backup-btn')
		.addEventListener('click', restoreBackupFile);
	document
		.getElementById('refresh-backups-btn')
		.addEventListener('click', loadBackupFiles);
	document
		.getElementById('delete-backup-btn')
		.addEventListener('click', deleteBackupFile);

	// Save button click handler
	document
		.getElementById('save-aws-details-btn')
		.addEventListener('click', async function () {
			let extensionURLs = JSON.parse(
				localStorage.getItem('TM_useExtensionURLs') || '[]'
			);
			if (!extensionURLs.some((url) => url.endsWith('s3.js'))) {
				extensionURLs.push(
					'https://itcon-pty-au.github.io/typingmind-cloud-backup/s3.js'
				);
				localStorage.setItem(
					'TM_useExtensionURLs',
					JSON.stringify(extensionURLs)
				);
			}
			const bucketName = awsBucketInput.value.trim();
			const region = awsRegionInput.value.trim();
			const accessKey = awsAccessKeyInput.value.trim();
			const secretKey = awsSecretKeyInput.value.trim();
			const endpoint = awsEndpointInput.value.trim();
			const backupInterval = document.getElementById('backup-interval').value;
			const encryptionKey = document.getElementById('encryption-key').value.trim();  // Add this line

			if (backupInterval < 15) {
				alert('Backup interval must be at least 15 seconds');
				return;
			}

			// Add encryption key validation
			if (encryptionKey !== '') {
				if (encryptionKey.length < 8) {
					alert('Encryption key must be at least 8 characters long');
					return;
				}
				localStorage.setItem('encryption-key', encryptionKey);
			} else {
				localStorage.removeItem('encryption-key');
			}

			localStorage.setItem('aws-region', region);
			localStorage.setItem('aws-endpoint', endpoint);

			try {
				await validateAwsCredentials(bucketName, accessKey, secretKey);
				localStorage.setItem('backup-interval', backupInterval);
				localStorage.setItem('aws-bucket', bucketName);
				localStorage.setItem('aws-access-key', accessKey);
				localStorage.setItem('aws-secret-key', secretKey);
				const actionMsgElement = document.getElementById('action-msg');
				actionMsgElement.textContent = 'AWS details saved!';
				actionMsgElement.style.color = 'white';
				setTimeout(() => {
					actionMsgElement.textContent = '';
				}, 3000);
				clearInterval(backupInterval);
				backupIntervalRunning = false;
				startBackupInterval();
				updateButtonState();
				updateBackupButtons();
				await loadBackupFiles();
				var importSuccessful = await checkAndImportBackup();
				const currentTime = new Date().toLocaleString();
				const lastSync = localStorage.getItem('last-cloud-sync');
				var element = document.getElementById('last-sync-msg');
				if (lastSync && importSuccessful) {
					if (element !== null) {
						element.innerText = `Last sync done at ${currentTime}`;
						element = null;
					}
				}
				startBackupInterval();
			} catch (err) {
				const actionMsgElement = document.getElementById('action-msg');
				actionMsgElement.textContent = `Invalid AWS details: ${err.message}`;
				actionMsgElement.style.color = 'red';
				localStorage.setItem('aws-bucket', '');
				localStorage.setItem('aws-access-key', '');
				localStorage.setItem('aws-secret-key', '');
				clearInterval(backupInterval);
			}
		});

	// Export button click handler
	document
		.getElementById('export-to-s3-btn')
		.addEventListener('click', async function () {
			if (isExportInProgress) return;
			const exportBtn = document.getElementById('export-to-s3-btn');
			exportBtn.disabled = true;
			exportBtn.style.cursor = 'not-allowed';
			exportBtn.textContent = 'Exporting';
			isExportInProgress = true;

			try {
				await backupToS3();
				// Add this line to refresh backup list after successful export
				await loadBackupFiles();
			} finally {
				isExportInProgress = false;
				exportBtn.disabled = false;
				exportBtn.style.cursor = 'pointer';
				exportBtn.innerHTML =
					'<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM770.87 824.869l-52.2 52.2c-4.7 4.7-1.9 12.8 4.7 13.6l179.4 21c5.1.6 9.5-3.7 8.9-8.9l-21-179.4c-.8-6.6-8.9-9.4-13.6-4.7l-52.4 52.4-256.2-256.2c-3.1-3.1-8.2-3.1-11.3 0l-42.4 42.4c-3.1 3.1-3.1 8.2 0 11.3l256.1 256.3Z"></path></svg><span>Export</span>';
			}
		});

	// Import button click handler
	document
		.getElementById('import-from-s3-btn')
		.addEventListener('click', async function () {
			if (isImportInProgress) return;
			const importBtn = document.getElementById('import-from-s3-btn');
			importBtn.disabled = true;
			importBtn.style.cursor = 'not-allowed';
			importBtn.textContent = 'Importing';
			isImportInProgress = true;

			try {
				await importFromS3();
			} finally {
				isImportInProgress = false;
				importBtn.disabled = false;
				importBtn.style.cursor = 'pointer';
				importBtn.innerHTML =
					'<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 1024 1024" fill-rule="evenodd" class="w-4 h-4 mr-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h360c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8H184V184h656v320c0 4.4-3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32ZM653.3 599.4l52.2-52.2c4.7-4.7 1.9-12.8-4.7-13.6l-179.4-21c-5.1-.6-9.5 3.7-8.9 8.9l21 179.4c.8 6.6 8.9 9.4 13.6 4.7l52.4-52.4 256.2 256.2c3.1 3.1 8.2 3.1 11.3 0l42.4-42.4c3.1-3.1 3.1-8.2 0-11.3L653.3 599.4Z"></path></svg><span>Import</span>';
			}
		});

	// Close button click handler
	closeButton.addEventListener('click', function () {
		modalPopup.remove();
	});

	// Snapshot button click handler
	document
		.getElementById('snapshot-btn')
		.addEventListener('click', async function () {
			const snapshotBtn = document.getElementById('snapshot-btn');

			// If button is disabled, return early
			if (snapshotBtn.disabled) return;

			// Disable button and update UI
			snapshotBtn.disabled = true;
			snapshotBtn.style.cursor = 'not-allowed';
			const originalButtonContent = snapshotBtn.innerHTML;
			snapshotBtn.innerHTML = '<span>Snapshot</span>';

			try {
				console.log(`📸 [${new Date().toLocaleString()}] Starting snapshot creation...`);
				const now = new Date();
				const timestamp =
					now.getFullYear() +
					String(now.getMonth() + 1).padStart(2, '0') +
					String(now.getDate()).padStart(2, '0') +
					'T' +
					String(now.getHours()).padStart(2, '0') +
					String(now.getMinutes()).padStart(2, '0') +
					String(now.getSeconds()).padStart(2, '0');

				const bucketName = localStorage.getItem('aws-bucket');
				const data = await exportBackupData();
				const encryptedData = await encryptData(data);  // Ensure data is encrypted

				// Load JSZip
				const jszip = await loadJSZip();
				const zip = new jszip();

				// Add the encrypted data to the zip file
				zip.file(`Snapshot_${timestamp}.json`, encryptedData, {
					compression: 'DEFLATE',
					compressionOptions: {
						level: 9,
					},
					binary: true
				});

				// Generate the zip content
				const compressedContent = await zip.generateAsync({ type: 'blob' });

				// Add size validation
				if (compressedContent.size < 100) { // 100 bytes minimum threshold
					throw new Error('Snapshot file is too small or empty. Upload cancelled.');
				}

				const s3 = new AWS.S3();
				const putParams = {
					Bucket: bucketName,
					Key: `Snapshot_${timestamp}.zip`,
					Body: compressedContent,
					ContentType: 'application/zip',
					ServerSideEncryption: 'AES256'
				};

				await s3.putObject(putParams).promise();

				// Update last sync message with snapshot status
				const lastSyncElement = document.getElementById('last-sync-msg');
				const currentTime = new Date().toLocaleString();
				lastSyncElement.textContent = `Snapshot successfully saved to the cloud at ${currentTime}`;

				// Revert back to regular sync status after 3 seconds
				setTimeout(() => {
					const lastSync = localStorage.getItem('last-cloud-sync');
					if (lastSync) {
						lastSyncElement.textContent = `Last sync done at ${lastSync}`;
					}
				}, 3000);

				// Refresh the backup files list after successful snapshot
				// Remove the existing loadBackupFiles call and replace with this conditional one
				if (document.querySelector('[data-element-id="sync-modal-dbbackup"]')) {
					await loadBackupFiles();
				}
				
				console.log(`✅ [${new Date().toLocaleString()}] Snapshot created successfully: Snapshot_${timestamp}.zip`);
			} catch (error) {
				console.error(`❌ [${new Date().toLocaleString()}] Snapshot creation failed:`, error);
				const lastSyncElement = document.getElementById('last-sync-msg');
				lastSyncElement.textContent = `Error creating snapshot: ${error.message}`;

				// Revert back to regular sync status after 3 seconds
				setTimeout(() => {
					const lastSync = localStorage.getItem('last-cloud-sync');
					if (lastSync) {
						lastSyncElement.textContent = `Last sync done at ${lastSync}`;
					}
				}, 3000);
			} finally {
				// Re-enable button and restore original content
				snapshotBtn.disabled = false;
				snapshotBtn.style.cursor = 'pointer';
				snapshotBtn.innerHTML = originalButtonContent;
			}
		});
}

// Update the visibility change handler
document.addEventListener('visibilitychange', async () => {
	console.log(`👁️ [${new Date().toLocaleString()}] Visibility changed: ${document.hidden ? 'hidden' : 'visible'}`);
	
	if (!document.hidden) {
		// Tab became visible
		console.log(`📱 [${new Date().toLocaleString()}] Tab became active`);
		
		// Only clear interval if it's already running
		if (backupIntervalRunning) {
			localStorage.setItem('activeTabBackupRunning', 'false');
			clearInterval(backupInterval);
			backupIntervalRunning = false;
		}
		
		try {
			// Perform import first
			console.log(`📥 [${new Date().toLocaleString()}] Checking for updates from S3...`);
			const importSuccessful = await checkAndImportBackup();
			
			if (importSuccessful) {
				// Update UI and check daily backup
				const currentTime = new Date().toLocaleString();
				const storedSuffix = localStorage.getItem('last-daily-backup-in-s3');
				const today = new Date();
				const currentDateSuffix = `${today.getFullYear()}${String(
					today.getMonth() + 1
				).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
				
				var element = document.getElementById('last-sync-msg');
				if (element !== null) {
					element.innerText = `Last sync done at ${currentTime}`;
					element = null;
				}
				
				// Check if daily backup is needed
				if (!storedSuffix || currentDateSuffix > storedSuffix) {
					await handleBackupFiles();
				}
				
				// Only start backup interval after successful import
				console.log(`✅ [${new Date().toLocaleString()}] Import successful, starting backup interval`);
				startBackupInterval();
			} else {
				console.log(`⚠️ [${new Date().toLocaleString()}] Import was not successful, not starting backup interval`);
			}
		} catch (error) {
			console.error(`❌ [${new Date().toLocaleString()}] Error during tab activation:`, error);
		}
	}
	// Remove the else block entirely - don't stop interval when tab becomes hidden
});

// Time based backup creates a rolling backup every X minutes. Default is 15 minutes
// Update parameter 'TIME_BACKUP_INTERVAL' in the beginning of the code to customize this
// This is to provide a secondary backup option in case of unintended corruption of the backup file
async function handleTimeBasedBackup() {
    const bucketName = localStorage.getItem('aws-bucket');
    const lastTimeBackup = parseInt(localStorage.getItem('last-time-based-backup')); // Parse as integer
    const currentTime = new Date().getTime();

    // Check if backup is needed
    if (!lastTimeBackup || isNaN(lastTimeBackup) || 
        currentTime - lastTimeBackup >= TIME_BACKUP_INTERVAL * 60 * 1000) {
        
        console.log(`⏰ [${new Date().toLocaleString()}] Starting time-based backup (T-${TIME_BACKUP_INTERVAL})`);
        const s3 = new AWS.S3();

        try {
            const data = await exportBackupData();
            const encryptedData = await encryptData(data);
            const jszip = await loadJSZip();
            const zip = new jszip();
            
            // Use the TIME_BACKUP_FILE_PREFIX constant
            zip.file(`${TIME_BACKUP_FILE_PREFIX}.json`, encryptedData, {
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 9,
                },
                binary: true
            });

            const compressedContent = await zip.generateAsync({ type: 'blob' });
            const uploadParams = {
                Bucket: bucketName,
                Key: `${TIME_BACKUP_FILE_PREFIX}.zip`,
                Body: compressedContent,
                ContentType: 'application/zip',
                ServerSideEncryption: 'AES256'
            };

            await s3.putObject(uploadParams).promise();
            
            // Store timestamp as milliseconds instead of string
            localStorage.setItem('last-time-based-backup', currentTime.toString());
            console.log(`✅ [${new Date().toLocaleString()}] Time-based backup completed`);
        } catch (error) {
            console.error(`❌ [${new Date().toLocaleString()}] Time-based backup failed:`, error);
            throw error;
        }
    } else {
        const timeUntilNextBackup = TIME_BACKUP_INTERVAL * 60 * 1000 - (currentTime - lastTimeBackup);
        const minutesUntilNext = Math.round(timeUntilNextBackup / 1000 / 60);
        console.log(`⏳ [${new Date().toLocaleString()}] Time-based backup not yet due. Next backup in ${minutesUntilNext} minutes`);
    }
}

// Function to check for backup file and import it
async function checkAndImportBackup() {
    const bucketName = localStorage.getItem('aws-bucket');
    const awsRegion = localStorage.getItem('aws-region');
    const awsAccessKey = localStorage.getItem('aws-access-key');
    const awsSecretKey = localStorage.getItem('aws-secret-key');
    const encryptionKey = localStorage.getItem('encryption-key');
    const awsEndpoint = localStorage.getItem('aws-endpoint');

    // Check all required credentials upfront
    if (!bucketName || !awsAccessKey || !awsSecretKey || !encryptionKey) {
        wasImportSuccessful = false;
        if (!encryptionKey) {
            alert('Please configure your encryption key in the backup settings before proceeding.');
        } else {
            alert('Please configure all AWS credentials in the backup settings before proceeding.');
        }
        return false;
    }

    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }

    const awsConfig = {
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
        region: awsRegion,
    };

    if (awsEndpoint) {
        awsConfig.endpoint = awsEndpoint;
    }

    AWS.config.update(awsConfig);

    try {
        // Directly try to import - all checks will happen in importFromS3()
        await importFromS3();
        wasImportSuccessful = true;
        return true;
    } catch (err) {
        if (err.code === 'NoSuchKey') {
            alert("Backup file not found in S3! Run an adhoc 'Export' first.");
            // Set wasImportSuccessful to true when no backup exists
            // This allows initial backups to work
            wasImportSuccessful = true;
            return true;
        } else if (err.message === 'Encryption key not configured' || err.message === 'Failed to decrypt backup. Please check your encryption key.') {
            // Handle both encryption-related errors
            alert('Please configure your encryption key in the backup settings to decrypt this backup.');
            wasImportSuccessful = false;
            return false;
        } else if (err.code === 'CredentialsError' || err.code === 'InvalidAccessKeyId') {
            // Handle AWS credentials errors
            localStorage.setItem('aws-bucket', '');
            localStorage.setItem('aws-access-key', '');
            localStorage.setItem('aws-secret-key', '');
            alert('Failed to connect to AWS. Please check your credentials.');
            wasImportSuccessful = false;
            return false;
        } else {
            // Handle any other errors
            console.error('Import error:', err);
            alert('Error during import: ' + err.message);
            wasImportSuccessful = false;
            return false;
        }
    }
}

async function loadBackupFiles() {
    const bucketName = localStorage.getItem('aws-bucket');
    const awsRegion = localStorage.getItem('aws-region');
    const awsAccessKey = localStorage.getItem('aws-access-key');
    const awsSecretKey = localStorage.getItem('aws-secret-key');
    const awsEndpoint = localStorage.getItem('aws-endpoint');
    
    const select = document.getElementById('backup-files');

    // Check if credentials are available
    if (!bucketName || !awsAccessKey || !awsSecretKey) {
        select.innerHTML = '<option value="">Please configure AWS credentials first</option>';
        updateBackupButtons();
        return;
    }

    try {
        // Load AWS SDK if not already loaded
        if (typeof AWS === 'undefined') {
            await loadAwsSdk();
        }

        // Configure AWS with credentials
        const awsConfig = {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
            region: awsRegion
        };

        if (awsEndpoint) {
            awsConfig.endpoint = awsEndpoint;
        }

        AWS.config.update(awsConfig);

        const s3 = new AWS.S3();
        const data = await s3.listObjectsV2({ Bucket: bucketName }).promise();
        select.innerHTML = '';

        if (data.Contents.length === 0) {
            select.innerHTML = '<option value="">No backup files found</option>';
        } else {
            // Sort files by last modified (newest first)
            const files = data.Contents.sort(
                (a, b) => b.LastModified - a.LastModified
            );

            files.forEach((file) => {
                const option = document.createElement('option');
                option.value = file.Key;
                option.textContent = `${file.Key} (${new Date(file.LastModified).toLocaleString()})`;
                select.appendChild(option);
            });
        }

        updateBackupButtons();
    } catch (error) {
        console.error('Error loading backup files:', error);
        select.innerHTML = '<option value="">Error loading backups</option>';
        updateBackupButtons();
    }
}

function updateBackupButtons() {
	const select = document.getElementById('backup-files');
	const downloadBtn = document.getElementById('download-backup-btn');
	const restoreBtn = document.getElementById('restore-backup-btn');
	const deleteBtn = document.getElementById('delete-backup-btn');
	const refreshBtn = document.getElementById('refresh-backups-btn');

	const bucketConfigured =
		localStorage.getItem('aws-bucket') &&
		localStorage.getItem('aws-access-key') &&
		localStorage.getItem('aws-secret-key');

	// Enable/disable refresh button based on credentials
	if (refreshBtn) {
		refreshBtn.disabled = !bucketConfigured;
		refreshBtn.classList.toggle('opacity-50', !bucketConfigured);
	}

	const selectedFile = select.value;
	const isSnapshotFile = selectedFile.startsWith('Snapshot_');

	// Enable download button if credentials exist and file is selected
	if (downloadBtn) {
		downloadBtn.disabled = !bucketConfigured || !selectedFile;
		downloadBtn.classList.toggle(
			'opacity-50',
			!bucketConfigured || !selectedFile
		);
	}

	// Enable restore button if credentials exist and valid file is selected
	if (restoreBtn) {
		restoreBtn.disabled =
			!bucketConfigured ||
			!selectedFile ||
			selectedFile === 'typingmind-backup.json';
		restoreBtn.classList.toggle(
			'opacity-50',
			!bucketConfigured ||
			!selectedFile ||
			selectedFile === 'typingmind-backup.json'
		);
	}

	// Enable delete button only for snapshot files
	if (deleteBtn) {
		deleteBtn.disabled = !bucketConfigured || !selectedFile || !isSnapshotFile;
		deleteBtn.classList.toggle(
			'opacity-50',
			!bucketConfigured || !selectedFile || !isSnapshotFile
		);
	}
}

async function downloadBackupFile() {
    const bucketName = localStorage.getItem('aws-bucket');
    const selectedFile = document.getElementById('backup-files').value;
    const s3 = new AWS.S3();

    try {
        console.log(`📥 [${new Date().toLocaleString()}] Starting download of ${selectedFile}`);
        
        // Get the file from S3
        const data = await s3.getObject({
            Bucket: bucketName,
            Key: selectedFile,
        }).promise();

        // If it's a zip file, handle it differently
        if (selectedFile.endsWith('.zip')) {
            const jszip = await loadJSZip();
            const zip = await jszip.loadAsync(data.Body);
            const jsonFile = Object.keys(zip.files)[0];
            const encryptedContent = await zip.file(jsonFile).async('uint8array');
            
            try {
                // Decrypt the content
                const decryptedData = await decryptData(encryptedContent);
                
                // Create a new blob with the decrypted data
                const decryptedBlob = new Blob([JSON.stringify(decryptedData, null, 2)], {
                    type: 'application/json'
                });
                
                // Create download link
                const url = window.URL.createObjectURL(decryptedBlob);
                const a = document.createElement('a');
                a.href = url;
                // Remove .zip extension if present and add .json
                const downloadName = selectedFile.replace('.zip', '.json');
                a.download = downloadName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                console.log(`✅ [${new Date().toLocaleString()}] File downloaded and decrypted successfully`);
            } catch (decryptError) {
                console.error(`❌ [${new Date().toLocaleString()}] Decryption failed:`, decryptError);
                alert('Failed to decrypt the backup file. Please check your encryption key.');
                return;
            }
        } else {
            // Handle direct file download (for non-zip files)
            try {
                const encryptedContent = new Uint8Array(data.Body);
                const decryptedData = await decryptData(encryptedContent);
                
                // Create a new blob with the decrypted data
                const decryptedBlob = new Blob([JSON.stringify(decryptedData, null, 2)], {
                    type: 'application/json'
                });
                
                // Create download link
                const url = window.URL.createObjectURL(decryptedBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                console.log(`✅ [${new Date().toLocaleString()}] File downloaded and decrypted successfully`);
            } catch (decryptError) {
                console.error(`❌ [${new Date().toLocaleString()}] Decryption failed:`, decryptError);
                alert('Failed to decrypt the backup file. Please check your encryption key.');
                return;
            }
        }
    } catch (error) {
        console.error(`❌ [${new Date().toLocaleString()}] Download failed:`, error);
        alert('Error downloading file: ' + error.message);
    }
}

async function restoreBackupFile() {
	const bucketName = localStorage.getItem('aws-bucket');
	const s3 = new AWS.S3();
	const selectedFile = document.getElementById('backup-files').value;

	try {
		const data = await s3
			.getObject({
				Bucket: bucketName,
				Key: selectedFile,
			})
			.promise();

		try {
			const jszip = await loadJSZip();
			const zip = await jszip.loadAsync(data.Body);
			const jsonFile = Object.keys(zip.files)[0];
			const encryptedContent = await zip.file(jsonFile).async('uint8array');
			const importedData = await decryptData(encryptedContent);
			importDataToStorage(importedData);
			const currentTime = new Date().toLocaleString();
			localStorage.setItem('last-cloud-sync', currentTime);
			const element = document.getElementById('last-sync-msg');
			if (element) {
				element.innerText = `Last sync done at ${currentTime}`;
			}
			alert('Backup restored successfully!');
		} catch (error) {
			console.error('Error restoring backup:', error);
			alert('Error restoring backup: ' + (error.message || 'Failed to decrypt backup. Please check your encryption key.'));
		}
	} catch (error) {
		console.error('Error restoring backup:', error);
		alert('Error restoring backup: ' + error.message);
	}
}

// Function to start the backup interval
function startBackupInterval() {
	console.log(`🕒 [${new Date().toLocaleString()}] Starting backup interval...`);
	
	// Clear any existing interval first
	if (backupIntervalRunning) {
		console.log(`🔄 [${new Date().toLocaleString()}] Clearing existing interval`);
		clearInterval(backupInterval);
		backupIntervalRunning = false;
	}
	
	// Reset the active tab flag before checking
	localStorage.setItem('activeTabBackupRunning', 'false');
	
	// Small delay to ensure flag is reset across all tabs
	setTimeout(() => {
		// Set flag for this tab
		localStorage.setItem('activeTabBackupRunning', 'true');
		
		const configuredInterval = parseInt(localStorage.getItem('backup-interval')) || 60;
		const intervalInMilliseconds = Math.max(configuredInterval * 1000, 15000); // Minimum 15 seconds
		
		console.log(`ℹ️ [${new Date().toLocaleString()}] Setting backup interval to ${intervalInMilliseconds/1000} seconds`);
		
		backupIntervalRunning = true;
		
		// Initial backup
		performBackup();
		
		// Start a new interval and store the interval ID
		backupInterval = setInterval(() => {
			console.log(`⏰ [${new Date().toLocaleString()}] Interval triggered`);
			performBackup();
		}, intervalInMilliseconds);
		
		// Add a check to ensure interval is running
		setTimeout(() => {
			if (!backupIntervalRunning) {
				console.log(`🔄 [${new Date().toLocaleString()}] Backup interval stopped, restarting...`);
				startBackupInterval();
			}
		}, intervalInMilliseconds + 1000);
	}, 100); // Small delay to ensure clean state
}

// Function to perform backup
async function performBackup() {
    if (!isPageFullyLoaded) {
        console.log(`⏳ [${new Date().toLocaleString()}] Page not fully loaded, skipping backup`);
        return;
    }

    if (document.hidden) {
        console.log(`🛑 [${new Date().toLocaleString()}] Tab is hidden, skipping backup`);
        return;
    }

    if (isExportInProgress) {
        console.log(`⏳ [${new Date().toLocaleString()}] Previous backup still in progress, skipping this iteration`);
        return;
    }

    if (!wasImportSuccessful) {
        console.log(`⚠️ [${new Date().toLocaleString()}] Import not yet successful, skipping backup`);
        return;
    }

    isExportInProgress = true;
    try {
        await backupToS3();
        console.log(`✅ [${new Date().toLocaleString()}] Backup completed...`);
    } catch (error) {
        console.error(`❌ [${new Date().toLocaleString()}] Backup failed:`, error);
    } finally {
        isExportInProgress = false;
    }
}

// Function to load AWS SDK asynchronously
async function loadAwsSdk() {
	if (awsSdkLoadPromise) return awsSdkLoadPromise;
	
	awsSdkLoadPromise = new Promise((resolve, reject) => {
		if (typeof AWS !== 'undefined') {
			resolve();
			return;
		}
		
		const script = document.createElement('script');
		script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.804.0.min.js';
		script.onload = resolve;
		script.onerror = reject;
		document.head.appendChild(script);
	});
	
	return awsSdkLoadPromise;
}

// Function to dynamically load the JSZip library
async function loadJSZip() {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src =
			'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.5.0/jszip.min.js';
		script.onload = () => {
			resolve(window.JSZip); // Pass JSZip to resolve
		};
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

// Function to import data from S3 to localStorage and IndexedDB
function importDataToStorage(data) {
    return new Promise((resolve, reject) => {
        // localStorage operations can stay synchronous
        Object.keys(data.localStorage).forEach((key) => {
            localStorage.setItem(key, data.localStorage[key]);
        });

        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        
        request.onsuccess = function (event) {
            const db = event.target.result;
            const transaction = db.transaction(['keyval'], 'readwrite');
            const objectStore = transaction.objectStore('keyval');
            
            // Listen for transaction completion
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            
            const deleteRequest = objectStore.clear();
            deleteRequest.onsuccess = function () {
                const indexedDBData = data.indexedDB;
                Object.keys(indexedDBData).forEach((key) => {
                    objectStore.put(indexedDBData[key], key);
                });
            };
        };

        // Handle extension URL after IndexedDB operations complete
        let extensionURLs = JSON.parse(
            localStorage.getItem('TM_useExtensionURLs') || '[]'
        );
        if (!extensionURLs.some((url) => url.endsWith('s3.js'))) {
            extensionURLs.push(
                'https://itcon-pty-au.github.io/typingmind-cloud-backup/s3.js'
            );
            localStorage.setItem('TM_useExtensionURLs', JSON.stringify(extensionURLs));
        }
    });
}

// Function to export data from localStorage and IndexedDB
function exportBackupData() {
    return new Promise((resolve, reject) => {
        const exportData = {
            localStorage: { ...localStorage },
            indexedDB: {},
        };

        const request = indexedDB.open('keyval-store', 1);
        request.onerror = () => reject(request.error);
        
        request.onsuccess = function (event) {
            const db = event.target.result;
            const transaction = db.transaction(['keyval'], 'readonly');
            const store = transaction.objectStore('keyval');
            
            // Listen for transaction completion
            transaction.oncomplete = () => {
                // Validate data after all operations complete
                const hasLocalStorageData = Object.keys(exportData.localStorage).length > 0;
                const hasIndexedDBData = Object.keys(exportData.indexedDB).length > 0;
                
                if (!hasLocalStorageData && !hasIndexedDBData) {
                    reject(new Error('No data found in localStorage or IndexedDB'));
                    return;
                }
                resolve(exportData);
            };
            
            transaction.onerror = () => reject(transaction.error);

            store.getAllKeys().onsuccess = function (keyEvent) {
                const keys = keyEvent.target.result;
                store.getAll().onsuccess = function (valueEvent) {
                    const values = valueEvent.target.result;
                    keys.forEach((key, i) => {
                        exportData.indexedDB[key] = values[i];
                    });
                };
            };
        };
    });
}

// Function to handle backup to S3 with chunked multipart upload using Blob
async function backupToS3() {
    console.log(`🔄 [${new Date().toLocaleString()}] Starting export to S3...`);
    let data = null;
    let dataStr = null;
    let blob = null;
    const bucketName = localStorage.getItem('aws-bucket');
    const awsRegion = localStorage.getItem('aws-region');
    const awsAccessKey = localStorage.getItem('aws-access-key');
    const awsSecretKey = localStorage.getItem('aws-secret-key');
    const awsEndpoint = localStorage.getItem('aws-endpoint');

    if (typeof AWS === 'undefined') {
        await loadAwsSdk();
    }

    const awsConfig = {
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
        region: awsRegion,
    };

    if (awsEndpoint) {
        awsConfig.endpoint = awsEndpoint;
    }

    AWS.config.update(awsConfig);

    try {
        // Add cleanup call at the start
        const s3 = new AWS.S3();
        await cleanupIncompleteMultipartUploads(s3, bucketName);

        data = await exportBackupData();
        console.log(`📤 [${new Date().toLocaleString()}] Starting backup encryption`);
        
        const encryptedData = await encryptData(data);
        
        blob = new Blob([encryptedData], { type: 'application/octet-stream' });
        console.log(`💾 [${new Date().toLocaleString()}] Blob created`);
        const dataSize = blob.size;
        
        // Add size validation
        if (dataSize < 100) { // 100 bytes as minimum threshold
            const error = new Error('Final backup blob is too small or empty');
            error.code = 'INVALID_BLOB_SIZE';
            throw error;
        }
        
        localStorage.setItem('backup-size', dataSize.toString());
        const chunkSize = 5 * 1024 * 1024; // 5MB chunks

        if (dataSize > chunkSize) {
            try {
                //console.log('Starting Multipart upload to S3');
                const createMultipartParams = {
                    Bucket: bucketName,
                    Key: 'typingmind-backup.json',
                    ContentType: 'application/json',
                    ServerSideEncryption: 'AES256'
                };

                const multipart = await s3
                    .createMultipartUpload(createMultipartParams)
                    .promise();
                const uploadedParts = [];
                let partNumber = 1;

                for (let start = 0; start < dataSize; start += chunkSize) {
                    const end = Math.min(start + chunkSize, dataSize);
                    const chunk = blob.slice(start, end);

                    // Convert chunk to ArrayBuffer using FileReader
                    const arrayBuffer = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(reader.error);
                        reader.readAsArrayBuffer(chunk);
                    });

                    const partParams = {
                        Body: arrayBuffer,
                        Bucket: bucketName,
                        Key: 'typingmind-backup.json',
                        PartNumber: partNumber,
                        UploadId: multipart.UploadId,
                    };

                    let retryCount = 0;
                    const maxRetries = 3;

                    while (retryCount < maxRetries) {
                        try {
                            const uploadResult = await s3.uploadPart(partParams).promise();
                            //console.log('Upload result:', uploadResult);
                            uploadedParts.push({
                                ETag: uploadResult.ETag,
                                PartNumber: partNumber,
                            });
                            //console.log(`Part ${partNumber} uploaded successfully with ETag: ${uploadResult.ETag}`);
                            break; // Success, exit retry loop
                        } catch (error) {
                            console.error(`Error uploading part ${partNumber}:`, error);
                            retryCount++;
                            if (retryCount === maxRetries) {
                                // If all retries fail, abort the multipart upload
                                console.log('All retries failed, aborting multipart upload');
                                await s3
                                    .abortMultipartUpload({
                                        Bucket: bucketName,
                                        Key: 'typingmind-backup.json',
                                        UploadId: multipart.UploadId,
                                    })
                                    .promise();
                                throw error;
                            }
                            // Wait before retry (exponential backoff)
                            const waitTime = Math.pow(2, retryCount) * 1000;
                            console.log(
                                `Retrying part ${partNumber} in ${waitTime / 1000} seconds...`
                            );
                            await new Promise((resolve) => setTimeout(resolve, waitTime));
                        }
                    }

                    partNumber++;

                    // Update progress
                    const progress = Math.round(((start + chunkSize) / dataSize) * 100);
                    //console.log(`Upload progress: ${Math.min(progress, 100)}%`);
                }

                const sortedParts = uploadedParts.sort(
                    (a, b) => a.PartNumber - b.PartNumber
                );

                // Complete the multipart upload
                const completeParams = {
                    Bucket: bucketName,
                    Key: 'typingmind-backup.json',
                    UploadId: multipart.UploadId,
                    MultipartUpload: {
                        Parts: sortedParts.map((part) => ({
                            ETag: part.ETag,
                            PartNumber: part.PartNumber,
                        })),
                    },
                };

                //console.log('Complete Multipart Upload Request:', JSON.stringify(completeParams, null, 2));

                await s3.completeMultipartUpload(completeParams).promise();
                //console.log('Multipart upload completed successfully');
            } catch (error) {
                console.error('Multipart upload failed:', error);
                // Run cleanup again after failure
                await cleanupIncompleteMultipartUploads(s3, bucketName);
                throw error;
            }
        } else {
            console.log('Starting standard upload to S3');
            const putParams = {
                Bucket: bucketName,
                Key: 'typingmind-backup.json',
                Body: encryptedData, // Use encryptedData instead of dataStr
                ContentType: 'application/json',
                ServerSideEncryption: 'AES256'
            };

            await s3.putObject(putParams).promise();
        }

        await handleTimeBasedBackup();
        const currentTime = new Date().toLocaleString();
        localStorage.setItem('last-cloud-sync', currentTime);
        console.log(`✅ [${new Date().toLocaleString()}] Export completed successfully`);
        var element = document.getElementById('last-sync-msg');
        if (element !== null) {
            element.innerText = `Last sync done at ${currentTime}`;
        }

        // Add this line to refresh backup list after successful backup
        if (document.querySelector('[data-element-id="sync-modal-dbbackup"]')) {
            await loadBackupFiles();
        }

    } catch (error) {
        console.error(`❌ [${new Date().toLocaleString()}] Export failed:`, error);
        if (error.code && error.code.startsWith('INVALID_')) {
            // Handle size-related errors specifically
            console.error(`Size validation failed: ${error.message}`);
            var element = document.getElementById('last-sync-msg');
            if (element !== null) {
                element.innerText = `Backup skipped: ${error.message}`;
            }
            return; // Exit without throwing to allow next backup attempt
        }
        var element = document.getElementById('last-sync-msg');
        if (element !== null) {
            element.innerText = `Backup failed: ${error.message}`;
        }
        throw error;
    } finally {
        // Clean up variables
        data = null;
        dataStr = null;
        blob = null;
    }
}

// Function to handle import from S3
async function importFromS3() {
    console.log(`📥 [${new Date().toLocaleString()}] Starting import from S3...`);
    try {
        const bucketName = localStorage.getItem('aws-bucket');
        const awsRegion = localStorage.getItem('aws-region');
        const awsAccessKey = localStorage.getItem('aws-access-key');
        const awsSecretKey = localStorage.getItem('aws-secret-key');
        const awsEndpoint = localStorage.getItem('aws-endpoint');

        if (typeof AWS === 'undefined') {
            await loadAwsSdk();
        }

        const awsConfig = {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
            region: awsRegion,
        };

        if (awsEndpoint) {
            awsConfig.endpoint = awsEndpoint;
        }

        AWS.config.update(awsConfig);

        let s3 = new AWS.S3();
        const params = {
            Bucket: bucketName,
            Key: 'typingmind-backup.json',
        };

        // Get object data first since it has the most accurate LastModified
        let s3Data;
        try {
            s3Data = await s3.getObject(params).promise();
            // console.log('GetObject LastModified:', {
            //     raw: s3Data.LastModified,
            //     iso: new Date(s3Data.LastModified).toISOString(),
            //     local: new Date(s3Data.LastModified).toLocaleString()
            // });
            cloudFileSize = s3Data.Body.length;
            cloudLastModified = s3Data.LastModified;  // Use this as the source of truth
            
            console.log(`✅ [${new Date().toLocaleString()}] S3 data fetched successfully:`, {
                contentLength: cloudFileSize,
                //contentType: s3Data.ContentType,
                lastModified: cloudLastModified
            });
        } catch (fetchError) {
            console.error(`❌ [${new Date().toLocaleString()}] Failed to fetch from S3:`, fetchError);
            throw fetchError;
        }

        const lastSync = localStorage.getItem('last-cloud-sync');
        
        // Calculate current local data size
        const currentData = await exportBackupData();
        const currentDataStr = JSON.stringify(currentData);
        const localFileSize = new Blob([currentDataStr]).size;
        
        // Only calculate percentage if we have valid sizes
        const sizeDiffPercentage = cloudFileSize && localFileSize ? 
            Math.abs((cloudFileSize - localFileSize) / localFileSize * 100) : 0;
        
        // First check if cloud is smaller than local (beyond 2-byte tolerance)
        const isCloudSmallerThanLocal = cloudFileSize && 
            cloudFileSize < localFileSize && 
            (localFileSize - cloudFileSize) > 2;

        // Then check general size tolerance for other cases
        const isWithinSizeTolerance = !cloudFileSize || 
            (!isCloudSmallerThanLocal && (
                localFileSize > 1024 * 1024 ? 
                    sizeDiffPercentage <= 0.1 : // 0.1% tolerance for files > 1MB
                    Math.abs(cloudFileSize - localFileSize) <= 2 // 2 byte tolerance for smaller files
            ));

        // Log size comparison details with more precise information
        console.log(`📊 [${new Date().toLocaleString()}] Size comparison:
    Cloud size: ${cloudFileSize} bytes
    Local size: ${localFileSize} bytes
    Difference: ${cloudFileSize - localFileSize} bytes ${sizeDiffPercentage ? `(${sizeDiffPercentage.toFixed(4)}%)` : ''}
    Within tolerance: ${isWithinSizeTolerance ? 'Yes' : 'No'}`);

        //console.log(`⏱️ [${new Date().toLocaleString()}] Checking time difference...`);
        const isTimeDifferenceSignificant = () => {
            if (!lastSync) {
                console.log(`ℹ️ No last sync found`);
                return false;
            }
            
            const cloudDate = new Date(cloudLastModified);
            
            try {
                // First try using ISO format conversion to ensure consistent parsing
                const [datePart, timePart] = lastSync.split(', ');
                let localSyncDate;
                
                // Handle different date formats
                if (datePart.includes('/')) {
                    // US format: MM/DD/YYYY
                    const [month, day, year] = datePart.split('/').map(num => parseInt(num));
                    const [time, period] = timePart.split(' ');
                    const [hours, minutes, seconds] = time.split(':').map(num => parseInt(num));
                    
                    // Convert to 24-hour format if needed
                    let hour = hours;
                    if (period) {
                        if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
                        else if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
                    }
                    
                    localSyncDate = new Date(year, month - 1, day, hour, minutes, seconds);
                } else {
                    // Try parsing as ISO format
                    localSyncDate = new Date(lastSync);
                }
                
                // Verify if the date is valid
                if (!isNaN(localSyncDate.getTime())) {
                    const diffInMilliseconds = Math.abs(cloudDate - localSyncDate);
                    const diffInHours = diffInMilliseconds / (1000 * 60 * 60);
                    
                    console.log(`🕒 Time comparison:
    Last Sync: ${localSyncDate.toISOString()}
    Cloud Modified: ${cloudDate.toISOString()}
    Difference: ${diffInHours.toFixed(2)} hours
    Local Format: ${lastSync}`);
                    
                    return diffInHours > 24;
                }
                
                throw new Error('Invalid date format');
                
            } catch (error) {
                console.error(`❌ Error parsing dates:`, error);
                // If we can't parse the date properly, return false to avoid false positives
                return false;
            }
        };

        //console.log(`🔍 [${new Date().toLocaleString()}] Checking if prompt needed...`);
        const shouldPrompt = localFileSize > 0 && (
            isCloudSmallerThanLocal || 
            sizeDiffPercentage > 1  // Only check size difference
        );
        console.log(`📢 Should prompt user: ${shouldPrompt}`);

        if (shouldPrompt) {
            console.log(`⚠️ [${new Date().toLocaleString()}] Showing prompt to user...`);
            
            // Stop backup interval while waiting for user input
            if (backupIntervalRunning) {
                console.log(`⏸️ [${new Date().toLocaleString()}] Pausing backup interval while waiting for user input`);
                clearInterval(backupInterval);
                backupIntervalRunning = false;
            }

            let message = `Warning: Potential data mismatch detected!\n\n`;
            message += `Cloud backup size: ${cloudFileSize || 'Unknown'} bytes\n`;
            message += `Local data size: ${localFileSize} bytes\n`;
            if (cloudFileSize) {
                message += `Size difference: ${sizeDiffPercentage.toFixed(2)}%\n\n`;
            }
            
            // Add specific warnings based on what triggered the prompt
            if (cloudFileSize && cloudFileSize < localFileSize) {
                message += '⚠️ Cloud backup is smaller than local data\n';
            }
            if (cloudFileSize && sizeDiffPercentage > 1) {
                message += '⚠️ Size difference exceeds 1%\n';
            }
            
            message += '\nDo you want to proceed with importing the cloud backup? This will overwrite your local data.';

            const shouldProceed = await showCustomAlert(message, 'Warning', [
                {text: 'Cancel', primary: false},
                {text: 'Proceed', primary: true}
            ]);

            if (!shouldProceed) {
                console.log(`ℹ️ [${new Date().toLocaleString()}] Import cancelled by user`);
                // Resume backup interval if user cancels
                console.log(`▶️ [${new Date().toLocaleString()}] Resuming backup interval after user cancelled`);
                startBackupInterval();
                return false;
            }
            
            // If user proceeds, backup interval will be restarted after successful import
        }

        console.log(`📥 [${new Date().toLocaleString()}] Fetching data from S3...`);
        // Use the existing params object instead of redeclaring it
        console.log(`🔍 [${new Date().toLocaleString()}] S3 getObject params:`, {
            bucket: bucketName,
            key: params.Key
        });

        let data;
        try {
            data = await s3.getObject(params).promise();
            console.log(`✅ [${new Date().toLocaleString()}] S3 data fetched successfully:`, {
                contentLength: data.Body?.length || 0
                //contentType: data.ContentType
            });
        } catch (fetchError) {
            console.error(`❌ [${new Date().toLocaleString()}] Failed to fetch from S3:`, fetchError);
            throw fetchError;
        }

        //console.log(`🔐 [${new Date().toLocaleString()}] Decrypting data...`);
        const encryptedContent = new Uint8Array(data.Body);
        //console.log(`📊 [${new Date().toLocaleString()}] Encrypted content size:`, encryptedContent.length);
        
        try {
            console.log(`🔓 [${new Date().toLocaleString()}] Starting decryption...`);
            importedData = await decryptData(encryptedContent);
            console.log(`✅ [${new Date().toLocaleString()}] Decryption successful`);
        } catch (error) {
            console.error(`❌ [${new Date().toLocaleString()}] Decryption failed:`, error);
            throw new Error('Failed to decrypt backup. Please check your encryption key.');
        }

        importDataToStorage(importedData);
        
        const currentTime = new Date().toLocaleString();
        //localStorage.setItem('last-cloud-sync', currentTime);
        var element = document.getElementById('last-sync-msg');
        if (element !== null) {
            element.innerText = `Last sync done at ${currentTime}`;
        }
        console.log(`✅ [${new Date().toLocaleString()}] Import completed successfully`);
        wasImportSuccessful = true;

        // After successful import, restart backup interval
        console.log(`▶️ [${new Date().toLocaleString()}] Resuming backup interval after successful import`);
        startBackupInterval();
        return true;
    } catch (error) {
        console.error(`❌ [${new Date().toLocaleString()}] Import failed with error:`, error);
        // Resume backup interval on error
        console.log(`▶️ [${new Date().toLocaleString()}] Resuming backup interval after import error`);
        startBackupInterval();
        throw error;
    }
}

//Delete file from S3
async function deleteBackupFile() {
	const selectedFile = document.getElementById('backup-files').value;

	// Check if it's a snapshot file
	if (!selectedFile.startsWith('Snapshot_')) {
		return;
	}

	// Ask for confirmation
	const isConfirmed = await showCustomAlert(
		`Are you sure you want to delete ${selectedFile}? This action cannot be undone.`,
		'Confirm Deletion',
		[
			{text: 'Cancel', primary: false},
			{text: 'Delete', primary: true}
		]
	);

	if (!isConfirmed) {
		return;
	}

	const bucketName = localStorage.getItem('aws-bucket');
	const s3 = new AWS.S3();

	try {
		await s3
			.deleteObject({
				Bucket: bucketName,
				Key: selectedFile,
			})
			.promise();

		// Refresh the backup files list
		await loadBackupFiles();

		// Show success message
		const actionMsgElement = document.getElementById('action-msg');
		if (actionMsgElement) {
			actionMsgElement.textContent = 'Backup file deleted successfully';
			actionMsgElement.style.color = 'white';
			setTimeout(() => {
				actionMsgElement.textContent = '';
			}, 3000);
		}
	} catch (error) {
		console.error('Error deleting file:', error);
		const actionMsgElement = document.getElementById('action-msg');
		if (actionMsgElement) {
			actionMsgElement.textContent = `Error deleting file: ${error.message}`;
			actionMsgElement.style.color = 'red';
		}
	}
}

// Validate the AWS connection
async function validateAwsCredentials(bucketName, accessKey, secretKey) {
	const awsRegion = localStorage.getItem('aws-region');
	const awsEndpoint = localStorage.getItem('aws-endpoint');

	if (typeof AWS === 'undefined') {
		await loadAwsSdk();
	}

	const awsConfig = {
		accessKeyId: accessKey,
		secretAccessKey: secretKey,
		region: awsRegion,
	};

	if (awsEndpoint) {
		awsConfig.endpoint = awsEndpoint;
	}

	AWS.config.update(awsConfig);

	const s3 = new AWS.S3();
	const params = {
		Bucket: bucketName,
		MaxKeys: 1,
	};

	return new Promise((resolve, reject) => {
		s3.listObjectsV2(params, function (err, data) {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

// Function to create a dated backup copy, zip it, and purge old backups
async function handleBackupFiles() {
	console.log(`📅 [${new Date().toLocaleString()}] Starting daily backup process...`);
	let backupFile = null;
	let backupContent = null;
	let zip = null;
	let compressedContent = null;

	const bucketName = localStorage.getItem('aws-bucket');
	const awsRegion = localStorage.getItem('aws-region');
	const awsAccessKey = localStorage.getItem('aws-access-key');
	const awsSecretKey = localStorage.getItem('aws-secret-key');
	const awsEndpoint = localStorage.getItem('aws-endpoint');

	if (typeof AWS === 'undefined') {
		await loadAwsSdk();
	}

	const awsConfig = {
		accessKeyId: awsAccessKey,
		secretAccessKey: awsSecretKey,
		region: awsRegion,
	};

	if (awsEndpoint) {
		awsConfig.endpoint = awsEndpoint;
	}

	AWS.config.update(awsConfig);

	try {
		let s3 = new AWS.S3();
		const params = {
			Bucket: bucketName,
			Prefix: 'typingmind-backup',
		};

		const today = new Date();
		const currentDateSuffix = `${today.getFullYear()}${String(
			today.getMonth() + 1
		).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

		const data = await s3.listObjectsV2(params).promise();
		
		if (data.Contents.length > 0) {
			const todaysBackupFile = data.Contents.find(
				file => file.Key === `typingmind-backup-${currentDateSuffix}.json` || 
						file.Key === `typingmind-backup-${currentDateSuffix}.zip`
			);
			
			// If no backup exists for today, create one
			if (!todaysBackupFile) {
				const getObjectParams = {
					Bucket: bucketName,
					Key: 'typingmind-backup.json',
				};
				backupFile = await s3.getObject(getObjectParams).promise();
				
				// Decrypt if it's encrypted, then re-encrypt with current key
				const decryptedData = await decryptData(new Uint8Array(backupFile.Body));
				backupContent = await encryptData(decryptedData);
				
				const jszip = await loadJSZip();
				zip = new jszip();
				zip.file(`typingmind-backup-${currentDateSuffix}.json`, backupContent, {
					compression: 'DEFLATE',
						compressionOptions: {
							level: 9,
						},
						binary: true
				});

				compressedContent = await zip.generateAsync({ type: 'blob' });

				// Add size validation
				if (compressedContent.size < 100) { // 100 bytes minimum threshold
					throw new Error('Daily backup file is too small or empty. Upload cancelled.');
				}

				const zipKey = `typingmind-backup-${currentDateSuffix}.zip`;
				const uploadParams = {
					Bucket: bucketName,
					Key: zipKey,
					Body: compressedContent,
					ContentType: 'application/zip',
					ServerSideEncryption: 'AES256'
				};
				await s3.putObject(uploadParams).promise();
				console.log(`✅ [${new Date().toLocaleString()}] Daily backup created: ${zipKey}`);
				
				// Update localStorage after successful backup creation
				localStorage.setItem('last-daily-backup-in-s3', currentDateSuffix);

				// Add refresh of backup list if modal is open
				if (document.querySelector('[data-element-id="sync-modal-dbbackup"]')) {
					await loadBackupFiles();
				}
			} else {console.log(`📅 [${new Date().toLocaleString()}] Daily backup file already exists for today`);}

			// Purge backups older than 30 days
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(today.getDate() - 30);
			for (const file of data.Contents) {
				if (file.Key.endsWith('.zip') && file.Key !== 'typingmind-backup.json') {
					const fileDate = new Date(file.LastModified);
					if (fileDate < thirtyDaysAgo) {
						const deleteParams = {
							Bucket: bucketName,
							Key: file.Key,
						};
						await s3.deleteObject(deleteParams).promise();
						console.log('🗑️ Purged old backup:', file.Key);
					}
				}
			}
		}
	} catch (error) {
		console.error(`❌ [${new Date().toLocaleString()}] Daily backup process failed:`, error);
	} finally {
		// Clean up variables
		backupFile = null;
		backupContent = null;
		zip = null;
		compressedContent = null;
	}

	// Add refresh after purging old backups if any were deleted
	if (document.querySelector('[data-element-id="sync-modal-dbbackup"]')) {
		await loadBackupFiles();
	}
}

// Function to derive encryption key from password
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
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Function to encrypt data
async function encryptData(data) {
    const encryptionKey = localStorage.getItem('encryption-key');
    console.log(`🔐 [${new Date().toLocaleString()}] Encryption attempt:`, {
        hasKey: !!encryptionKey
    });

    if (!encryptionKey) {
        console.log(`⚠️ [${new Date().toLocaleString()}] No encryption key found`);
        // Stop backup interval before showing alert
        if (backupIntervalRunning) {
            clearInterval(backupInterval);
            backupIntervalRunning = false;
            localStorage.setItem('activeTabBackupRunning', 'false');
        }
        wasImportSuccessful = false;  // Prevent new backup attempts
        
        await showCustomAlert('Please configure an encryption key in the backup settings before proceeding.', 'Configuration Required');
        throw new Error('Encryption key not configured');
    }

    try {
        const key = await deriveKey(encryptionKey);
        const enc = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = enc.encode(JSON.stringify(data));
        
        //console.log(`📝 [${new Date().toLocaleString()}] Data prepared for encryption:`);

        const encryptedContent = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            key,
            encodedData
        );

        const marker = new TextEncoder().encode('ENCRYPTED:');
        const combinedData = new Uint8Array(marker.length + iv.length + encryptedContent.byteLength);
        combinedData.set(marker);
        combinedData.set(iv, marker.length);
        combinedData.set(new Uint8Array(encryptedContent), marker.length + iv.length);
        
        console.log(`✅ [${new Date().toLocaleString()}] Encryption successful`);
        
        return combinedData;
    } catch (error) {
        // Clear the key so user knows they need to re-enter it
        localStorage.removeItem('encryption-key');
        clearInterval(backupInterval);
        // ... rest of error handling
        console.error(`❌ [${new Date().toLocaleString()}] Encryption failed:`, error);
        throw error;
    }
}

// Function to decrypt data
async function decryptData(data) {
    //console.log(`🔍 [${new Date().toLocaleString()}] Decryption attempt:`);

    // Check if data is encrypted by looking for the marker
    const marker = 'ENCRYPTED:';
    const dataString = new TextDecoder().decode(data.slice(0, marker.length));
    
    console.log(`🏷️ [${new Date().toLocaleString()}] Checking encryption marker:`, {
        expectedMarker: marker,
        foundMarker: dataString,
        isEncrypted: dataString === marker
    });
    
    if (dataString !== marker) {
        console.log(`ℹ️ [${new Date().toLocaleString()}] Data is not encrypted, returning as-is`);
        return JSON.parse(new TextDecoder().decode(data));
    }

    const encryptionKey = localStorage.getItem('encryption-key');
    if (!encryptionKey) {
        console.error(`❌ [${new Date().toLocaleString()}] Encrypted data found but no key provided`);
        // Stop backup interval before showing alert
        if (backupIntervalRunning) {
            clearInterval(backupInterval);
            backupIntervalRunning = false;
            localStorage.setItem('activeTabBackupRunning', 'false');
        }
        wasImportSuccessful = false;  // Prevent new backup attempts
        
        await showCustomAlert('Please configure your encryption key in the backup settings before proceeding.', 'Configuration Required');
        throw new Error('Encryption key not configured');
    }

    try {
        const key = await deriveKey(encryptionKey);
        const iv = data.slice(marker.length, marker.length + 12);
        const content = data.slice(marker.length + 12);

        //console.log(`🔓 [${new Date().toLocaleString()}] Attempting decryption`);

        const decryptedContent = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            key,
            content
        );

        const dec = new TextDecoder();
        const decryptedString = dec.decode(decryptedContent);
        const parsedData = JSON.parse(decryptedString);

        //console.log(`✅ [${new Date().toLocaleString()}] Decryption successful`);

        return parsedData;
    } catch (error) {
        // Clear the key so user knows they need to re-enter it
        localStorage.removeItem('encryption-key');
        clearInterval(backupInterval);
        console.error(`❌ [${new Date().toLocaleString()}] Decryption failed:`, error);
        alert('Failed to decrypt backup. Please re-enter encryption key.');
        throw error;
    }
}

// Add this new function after validateAwsCredentials
async function cleanupIncompleteMultipartUploads(s3, bucketName) {
    console.log(`🧹 [${new Date().toLocaleString()}] Checking for incomplete multipart uploads...`);
    try {
        const multipartUploads = await s3.listMultipartUploads({
            Bucket: bucketName
        }).promise();

        if (multipartUploads.Uploads && multipartUploads.Uploads.length > 0) {
            console.log(`Found ${multipartUploads.Uploads.length} incomplete multipart uploads`);
            
            for (const upload of multipartUploads.Uploads) {
                // Only abort uploads that are older than 5 minutes
                const uploadAge = Date.now() - new Date(upload.Initiated).getTime();
                const fiveMinutes = 5 * 60 * 1000;
                
                if (uploadAge > fiveMinutes) {
                    try {
                        await s3.abortMultipartUpload({
                            Bucket: bucketName,
                            Key: upload.Key,
                            UploadId: upload.UploadId
                        }).promise();
                        console.log(`✅ Aborted incomplete upload for ${upload.Key} (${Math.round(uploadAge/1000/60)}min old)`);
                    } catch (error) {
                        console.error(`Failed to abort upload for ${upload.Key}:`, error);
                    }
                } else {
                    console.log(`Skipping recent upload for ${upload.Key} (${Math.round(uploadAge/1000)}s old)`);
                }
            }
        } else {
            console.log('No incomplete multipart uploads found');
        }
    } catch (error) {
        console.error('Error cleaning up multipart uploads:', error);
    }
}

// Add this function near the top with other utility functions
function showCustomAlert(message, title = 'Alert', buttons = [{text: 'OK', primary: true}]) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        // Increase z-index and ensure pointer-events work
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[999] flex items-center justify-center p-4';
        modal.style.touchAction = 'auto'; // Enable touch events
        
        const dialog = document.createElement('div');
        dialog.className = 'bg-white dark:bg-zinc-900 rounded-lg max-w-md w-full p-6 shadow-xl relative'; // Added relative positioning
        
        const titleElement = document.createElement('h3');
        titleElement.className = 'text-lg font-semibold mb-4 text-gray-900 dark:text-white';
        titleElement.textContent = title;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-6';
        messageElement.textContent = message;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-end space-x-3';
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = `${button.primary ? 
                'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700' :
                'px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300'} 
                cursor-pointer touch-manipulation`;
            btn.style.WebkitTapHighlightColor = 'transparent';
            btn.style.userSelect = 'none';
            btn.textContent = button.text;
            
            const handleClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                modal.remove();
                // Fix: Return true for 'Proceed' and false for 'Cancel'
                resolve(button.text === 'Proceed' || button.text === 'OK');
            };
            
            btn.addEventListener('click', handleClick, { passive: false });
            btn.addEventListener('touchend', handleClick, { passive: false });
            
            buttonContainer.appendChild(btn);
        });
        
        dialog.appendChild(titleElement);
        dialog.appendChild(messageElement);
        dialog.appendChild(buttonContainer);
        modal.appendChild(dialog);
        
        // Prevent background scrolling when modal is open
        document.body.style.overflow = 'hidden';
        
        // Restore scrolling when modal is closed
        const cleanup = () => {
            document.body.style.overflow = '';
        };
        
        // Attach cleanup to modal removal
        modal.addEventListener('remove', cleanup);
        
        document.body.appendChild(modal);
        
        // Prevent modal background clicks from closing on mobile
        modal.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        dialog.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
    });
}

let backupIntervalRunning = false;
let wasImportSuccessful = false;
let isExportInProgress = false;
let isImportInProgress = false;
let isSnapshotInProgress = false;
const TIME_BACKUP_INTERVAL = 15; //minutes
const TIME_BACKUP_FILE_PREFIX = `T-${TIME_BACKUP_INTERVAL}`;
const BACKUP_FOLDER_NAME = 'TypingMindBackup';
let gapi;
let tokenClient;
let backupFolderId = null;

// Client ID from the Developer Console
const CLIENT_ID = '102506089690-su2s10ijjprfcb9b8sjne1nb3ogo4i6l.apps.googleusercontent.com';  // Paste your OAuth Client ID here (ends with .apps.googleusercontent.com)

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Authorization scopes required by the API
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

async function initializeGoogleDrive() {
    try {
        gapi = await loadGapiClient();
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // defined later
        });
        await setupBackupFolder();
    } catch (err) {
        console.error('Error initializing Google Drive:', err);
    }
}

async function loadGapiClient() {
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });

    await new Promise((resolve, reject) => {
        gapi.load('client', { callback: resolve, onerror: reject });
    });

    await gapi.client.init({
        discoveryDocs: [DISCOVERY_DOC],
    });

    return gapi;
}

async function authenticate() {
    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp) => {
            if (resp.error) {
                reject(resp);
            }
            resolve(resp);
        };
        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
}

async function setupBackupFolder() {
    try {
        await authenticate();
        
        // Search for existing backup folder
        const response = await gapi.client.drive.files.list({
            q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.result.files.length > 0) {
            backupFolderId = response.result.files[0].id;
        } else {
            // Create new backup folder
            const folderMetadata = {
                name: BACKUP_FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder'
            };

            const folder = await gapi.client.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            
            backupFolderId = folder.result.id;
        }
    } catch (err) {
        console.error('Error setting up backup folder:', err);
        throw err;
    }
}

async function backupToGDrive(data) {
    try {
        if (!backupFolderId) {
            await setupBackupFolder();
        }

        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const metadata = {
            name: 'typingmind-backup.json',
            parents: [backupFolderId]
        };

        // Check if backup file already exists
        const existingFiles = await gapi.client.drive.files.list({
            q: `name='typingmind-backup.json' and '${backupFolderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (existingFiles.result.files.length > 0) {
            // Update existing file
            const fileId = existingFiles.result.files[0].id;
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: blob
            });
        } else {
            // Create new file
            await gapi.client.request({
                path: '/upload/drive/v3/files',
                method: 'POST',
                params: {
                    uploadType: 'multipart'
                },
                headers: {
                    'Content-Type': 'multipart/related; boundary=foo_bar_baz'
                },
                body: '--foo_bar_baz\n' +
                      'Content-Type: application/json; charset=UTF-8\n\n' +
                      JSON.stringify(metadata) + '\n\n' +
                      '--foo_bar_baz\n' +
                      'Content-Type: application/json\n\n' +
                      JSON.stringify(data) + '\n\n' +
                      '--foo_bar_baz--'
            });
        }

        return true;
    } catch (err) {
        console.error('Error backing up to Google Drive:', err);
        throw err;
    }
}

async function importFromGDrive() {
    try {
        if (!backupFolderId) {
            await setupBackupFolder();
        }

        const response = await gapi.client.drive.files.list({
            q: `name='typingmind-backup.json' and '${backupFolderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.result.files.length === 0) {
            return null;
        }

        const fileId = response.result.files[0].id;
        const result = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        return result.result;
    } catch (err) {
        console.error('Error importing from Google Drive:', err);
        throw err;
    }
}

// Export the necessary functions
window.gdrive = {
    initialize: initializeGoogleDrive,
    backup: backupToGDrive,
    import: importFromGDrive
};

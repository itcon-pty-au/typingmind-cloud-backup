# TypingMind Cloud Sync v3 - Testing Guide

This document provides a comprehensive guide for testing the TypingMind Cloud Sync script (`s3-v3.js`). It covers all major features, from configuration and UI to complex sync and backup operations.

## 1. Prerequisites & Setup

Before you begin testing, you'll need to set up a suitable environment.

### 1.1. Required Tools

1.  **Web Browser:** A modern web browser like Chrome or Firefox with developer tools.
2.  **Web Server:** A simple local web server to host your `index.html` (or equivalent) and `s3-v3.js`. You can use something like VS Code's "Live Server" extension or Python's `http.server`.
3.  **S3 Bucket:**
    - **Recommended:** Use a dedicated test S3 bucket that can be wiped clean between tests.
    - **Alternative:** Set up a local S3-compatible object storage like [MinIO](https://min.io/). This is safer and avoids costs. If using MinIO, you will need to configure the "S3 Compatible Storage Endpoint" in the settings.
4.  **Multiple Browser Profiles/Incognito Windows:** To simulate syncing between two different "devices" or clients.

### 1.2. Initial Setup

1.  Create a simple `index.html` file in your project directory.
2.  Include the `s3-v3.js` script in your `index.html`:
    ```html
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>TypingMind Sync Test</title>
      </head>
      <body>
        <h1>TypingMind Cloud Sync Test Page</h1>
        <!-- The sync script will inject its button here -->
        <div id="app">
          <button data-element-id="workspace-tab-chat">Chat</button>
        </div>
        <script src="s3-v3.js"></script>
      </body>
    </html>
    ```
3.  Serve your project directory using your local web server.
4.  For many tests, you will need to manipulate `localStorage` and `IndexedDB`. The following console commands will be useful:

    - **Clear All Sync Data:**
      ```javascript
      // Wipes all localStorage keys related to the sync script
      Object.keys(localStorage)
        .filter((k) => k.startsWith("tcs_"))
        .forEach((k) => localStorage.removeItem(k));
      // Deletes the IndexedDB database
      indexedDB.deleteDatabase("keyval-store");
      console.log("Cleared all sync-related storage. Please reload the page.");
      ```
    - **Enable Debug Logging:** Add `?log` to the end of the URL (e.g., `http://127.0.0.1:5500/?log`). This provides verbose logging in the developer console, which is essential for testing.

---

## 2. Feature: Configuration Management

These tests verify that the application configuration is handled correctly.

| Test Case ID | Test Scenario                   | Prerequisites                            | Test Steps                                                                                                                                                                                              | Expected Result                                                                                |
| :----------- | :------------------------------ | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------- |
| **CM-01**    | **Load Default Settings**       | Clear all sync data from `localStorage`. | 1. Load the page. <br> 2. Open the dev console and run `window.cloudSyncApp.config.config`.                                                                                                             | The output object shows default values (e.g., `syncInterval: 15`, `bucketName: ""`).           |
| **CM-02**    | **Save and Persist Settings**   | Page is loaded.                          | 1. Open the Sync modal. <br> 2. Fill in all fields with test data (e.g., Bucket Name: 'test-bucket', Sync Interval: 30). <br> 3. Click "Save". <br> 4. Reload the page. <br> 5. Re-open the Sync modal. | The fields in the modal are still populated with the test data you entered.                    |
| **CM-03**    | **Mandatory Fields Validation** | Page is loaded.                          | 1. Open the Sync modal. <br> 2. Clear one of the required fields (e.g., Bucket Name). <br> 3. Click "Save".                                                                                             | An alert appears, "Please fill in all required AWS settings". The configuration is not saved.  |
| **CM-04**    | **Sync Interval Validation**    | Page is loaded.                          | 1. Open the Sync modal. <br> 2. Set "Sync Interval" to a value less than 15 (e.g., 10). <br> 3. Click "Save".                                                                                           | An alert appears, "Sync interval must be at least 15 seconds". The configuration is not saved. |
| **CM-05**    | **Exclusions Configuration**    | Page is loaded.                          | 1. Open Sync modal. <br> 2. In "Exclusions", enter `key1, key2`. <br> 3. Save and reload. <br> 4. In console, add an item: `localStorage.setItem('key1', 'test')`. <br> 5. Trigger a manual sync.       | The console logs should show that `key1` is excluded from the sync.                            |
| **CM-06**    | **URL-based Configuration**     | Clear all sync data.                     | 1. Load the page with URL parameters: `?bucket=my-url-bucket&region=us-east-1&autoconfig`. <br> 2. The sync modal should open automatically.                                                            | The "Bucket Name" and "Region" fields are pre-filled with `my-url-bucket` and `us-east-1`.     |

---

## 3. Feature: UI and User Interaction

These tests cover the visual components and user interactions within the sync modal.

| Test Case ID | Test Scenario              | Prerequisites                      | Test Steps                                                                                                                                                                                          | Expected Result                                                                                                                                                         |
| :----------- | :------------------------- | :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI-01**    | **Sync Button Injection**  | Load the page.                     | 1. Observe the main page content after it loads.                                                                                                                                                    | A "Sync" button appears next to the "Chat" button.                                                                                                                      |
| **UI-02**    | **Open and Close Modal**   | Page is loaded.                    | 1. Click the "Sync" button. <br> 2. The modal appears. <br> 3. Click the "Close" button. <br> 4. The modal disappears. <br> 5. Re-open the modal and click the dark overlay area outside the modal. | The modal closes as expected in both cases.                                                                                                                             |
| **UI-03**    | **Sync Diagnostics Panel** | Configured with a valid S3 bucket. | 1. Open the Sync modal. <br> 2. Observe the "Sync Diagnostics" panel. <br> 3. Click the panel header.                                                                                               | The panel expands to show detailed stats (Local Items, Cloud Items, etc.). Clicking again collapses it. The overall status icon (✅/⚠️) should reflect the sync health. |
| **UI-04**    | **`noSync` Mode UI**       | Load page with `?nosync`.          | 1. Open the Sync modal.                                                                                                                                                                             | A banner "NoSync Mode Active" is visible. The "Sync Now" button is disabled.                                                                                            |
| **UI-05**    | **Snapshot Button State**  | Page is loaded.                    | 1. Clear config. Open modal. The "Snapshot" button is disabled. <br> 2. Configure and save valid AWS credentials. Re-open modal.                                                                    | The "Snapshot" button becomes enabled.                                                                                                                                  |
| **UI-06**    | **Backup Button States**   | Configure AWS and create a backup. | 1. Open Sync modal. Select a backup from the dropdown. <br> 2. Deselect the backup (if possible) or select the "No backups found" option if it exists.                                              | The "Download", "Restore", and "Delete" buttons are enabled when a backup is selected and disabled otherwise.                                                           |

---

## 4. Feature: Core Sync Logic

These tests verify the fundamental synchronization process between the local browser storage and the S3 bucket. Use two browser profiles/windows (Client A and Client B) to test.

| Test Case ID | Test Scenario                       | Prerequisites                                                                                                                                  | Test Steps                                                                                                                                                                                                                                                                      | Expected Result                                                                                                                                               |
| :----------- | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SYNC-01**  | **Initial Sync (First-time User)**  | 1. Clear all sync data on Client A. <br> 2. Ensure S3 bucket is empty. <br> 3. Configure sync on Client A.                                     | 1. On Client A, add some data: `localStorage.setItem('test1', 'hello')` and `indexedDB...` <br> 2. Trigger a manual sync. <br> 3. Check the S3 bucket.                                                                                                                          | `metadata.json` and `items/test1.json` (encrypted) are created in the bucket. Logs show a successful "initial sync".                                          |
| **SYNC-02**  | **Syncing a New Local Item**        | Both clients are synced.                                                                                                                       | 1. On Client A, add a new item: `localStorage.setItem('newItem', 'world')`. <br> 2. Wait for auto-sync or trigger manually. <br> 3. On Client B, trigger a manual sync.                                                                                                         | `items/newItem.json` appears in S3. After syncing, `localStorage.getItem('newItem')` on Client B returns `'world'`.                                           |
| **SYNC-03**  | **Syncing an Updated Local Item**   | Both clients are synced and have `localStorage.setItem('itemToUpdate', 'v1')`.                                                                 | 1. On Client A, update the item: `localStorage.setItem('itemToUpdate', 'v2')`. <br> 2. Trigger sync on Client A. <br> 3. Trigger sync on Client B.                                                                                                                              | The `items/itemToUpdate.json` file in S3 is updated. After syncing, `localStorage.getItem('itemToUpdate')` on Client B returns `'v2'`.                        |
| **SYNC-04**  | **Syncing from Cloud (New Client)** | 1. S3 bucket contains data from a previous sync. <br> 2. Client B is a new browser with cleared sync data. <br> 3. Configure sync on Client B. | 1. On Client B, trigger a manual sync. <br> 2. Check Client B's `localStorage` and `IndexedDB`.                                                                                                                                                                                 | All data from the cloud is downloaded to Client B. The browser storage on Client B matches Client A's.                                                        |
| **SYNC-05**  | **Conflict (Simultaneous Edit)**    | Both clients are synced.                                                                                                                       | 1. Disconnect both clients from the internet. <br> 2. On Client A, set `localStorage.setItem('conflictItem', 'clientA')`. <br> 3. On Client B, set `localStorage.setItem('conflictItem', 'clientB')`. <br> 4. Reconnect Client A and sync. <br> 5. Reconnect Client B and sync. | The script uses a last-write-wins approach based on size comparison. The version from the last client to sync will overwrite the other. Verify this behavior. |

---

## 5. Feature: Deletion Handling (Tombstones)

These tests ensure that when data is deleted on one client, the deletion is correctly propagated to others.

| Test Case ID | Test Scenario           | Prerequisites                                                                            | Test Steps                                                                                                                                                                                                                                                          | Expected Result                                                                                                                                                                                |
| :----------- | :---------------------- | :--------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DEL-01**   | **Local Deletion Sync** | Both clients are synced and have `localStorage.setItem('itemToDelete', 'data')`.         | 1. On Client A, delete the item: `localStorage.removeItem('itemToDelete')`. <br> 2. The deletion monitor should detect this after a few seconds, or trigger a manual sync on Client A. <br> 3. Check the `metadata.json` in S3. <br> 4. Trigger a sync on Client B. | `itemToDelete` is marked as `deleted` in `metadata.json`. The `items/itemToDelete.json` file might still exist but is ignored. After sync, the item is removed from Client B's `localStorage`. |
| **DEL-02**   | **Cloud Deletion Sync** | A tombstone for `itemToDelete` exists in the cloud. Client B still has the item locally. | 1. Trigger a sync on Client B.                                                                                                                                                                                                                                      | The item is removed from Client B's local storage.                                                                                                                                             |
| **DEL-03**   | **Deletion Monitor**    | Deletion monitoring is active (default).                                                 | 1. Create an item: `localStorage.setItem('monitoredDelete', 'data')`. <br> 2. Wait ~30 seconds for the monitor to register it. <br> 3. Manually delete it: `localStorage.removeItem('monitoredDelete')`. <br> 4. Observe console logs for the next ~30 seconds.     | Logs should show the item is "missing" and after 3 checks, a "CONFIRMED DELETION" log appears, and a tombstone is created and queued for sync.                                                 |
| **DEL-04**   | **Tombstone Cleanup**   | An S3 bucket contains tombstones older than 30 days.                                     | 1. Manually edit a tombstone's `deleted` timestamp in `metadata.json` to be 31 days in the past. <br> 2. Trigger a full sync.                                                                                                                                       | The periodic cleanup job runs. Logs should indicate that old tombstones were cleaned from both local metadata and cloud metadata.                                                              |

---

## 6. Feature: Backups and Snapshots

These tests cover the creation, restoration, and management of backups.

| Test Case ID | Test Scenario                     | Prerequisites                                                                                                                     | Test Steps                                                                                                                    | Expected Result                                                                                                                                                                             |
| :----------- | :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BCK-01**   | **Create Manual Snapshot**        | AWS is configured. Have some local data.                                                                                          | 1. Open the Sync modal. <br> 2. Click "Snapshot". <br> 3. Enter a name (e.g., "MyTestSnapshot"). <br> 4. Check the S3 bucket. | A new `.zip` file appears in the S3 bucket, named something like `s-MyTestSnapshot-TIMESTAMP.zip`.                                                                                          |
| **BCK-02**   | **List Backups**                  | At least one snapshot or daily backup exists in S3.                                                                               | 1. Open the Sync modal. <br> 2. Click the "Available Backups" dropdown.                                                       | The dropdown lists all available backups with formatted names (e.g., "📸 Snapshot: MyTestSnapshot", "🗓️ Daily Backup (10/26/2023)").                                                        |
| **BCK-03**   | **Restore from Snapshot**         | 1. A snapshot exists in S3. <br> 2. Clear all local data.                                                                         | 1. Open Sync modal. <br> 2. Select the desired snapshot from the dropdown. <br> 3. Click "Restore" and confirm.               | An alert "Backup restored successfully!" appears. The page reloads. After reload, all data from the snapshot is present in `localStorage` and `IndexedDB`.                                  |
| **BCK-04**   | **Delete a Backup**               | A snapshot exists in S3.                                                                                                          | 1. Open Sync modal. <br> 2. Select the snapshot to delete. <br> 3. Click "Delete" and confirm.                                | The file is removed from the S3 bucket. The backup list in the UI refreshes and no longer shows the deleted file.                                                                           |
| **BCK-05**   | **Automatic Daily Backup**        | Set the `tcs_last-daily-backup` in `localStorage` to yesterday's date string (e.g., "20231025").                                  | 1. Load the page. <br> 2. Wait for initialization to complete.                                                                | A daily backup is automatically created in S3. The `tcs_last-daily-backup` key in `localStorage` is updated to today's date string.                                                         |
| **BCK-06**   | **Chunked Snapshot (Large Data)** | (Hard to test without huge data) <br> Modify `this.chunkSizeLimit` in `BackupService` to a very small value (e.g., `1024` bytes). | 1. Add more than 1KB of data locally. <br> 2. Create a snapshot.                                                              | Logs indicate that a "chunked snapshot" is being created. In S3, you will find a `-metadata.json` file and multiple `-chunk-N.zip` files. Restoring this backup should also work correctly. |

---

## 7. Feature: Data Migration (V2 to V3)

These tests verify the one-time migration from the old v2 storage format.

| Test Case ID | Test Scenario             | Prerequisites                                                                                                                                                                        | Test Steps                                                  | Expected Result                                                                                                                                                                                        |
| :----------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MIG-01**   | **Local Key Migration**   | 1. Clear all `tcs_` keys. <br> 2. Manually add old v2 keys to `localStorage`: `localStorage.setItem('aws-bucket', 'v2-bucket')`, `localStorage.setItem('encryption-key', 'v2-key')`. | 1. Load the page. <br> 2. Observe logs and `localStorage`.  | Logs show "V2 to V3 migration" is running. The old keys (`aws-bucket`) are removed, and new keys (`tcs_aws_bucketname`) are created with the same values. A `tcs_localMigrated` flag is set to `true`. |
| **MIG-02**   | **Cloud Data Migration**  | 1. Perform MIG-01. <br> 2. Set up an S3 bucket with old v2 folder structures (e.g., `chats/`, `settings/`).                                                                          | 1. Load the page. <br> 2. The migration process should run. | Logs indicate cloud cleanup is happening. The `chats/` and `settings/` folders in S3 are deleted, and a new `items/` structure is created.                                                             |
| **MIG-03**   | **Migration Idempotency** | The `tcs_localMigrated` flag is set to `true`.                                                                                                                                       | 1. Reload the page.                                         | The migration logic is skipped. Logs show "migration already completed".                                                                                                                               |

---

## 8. Feature: Encryption

These tests verify that data is securely encrypted at rest in the S3 bucket.

| Test Case ID | Test Scenario                      | Prerequisites                                                                                                                                                          | Test Steps                                                                                                                                                                                     | Expected Result                                                                                                                         |
| :----------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **ENC-01**   | **Verify S3 Data is Encrypted**    | AWS is configured. Sync some data.                                                                                                                                     | 1. Go to your S3 bucket using the AWS console or S3 browser. <br> 2. Download one of the files from the `items/` directory (e.g., `items/test1.json`). <br> 3. Open the file in a text editor. | The content of the file should be gibberish/binary data, not readable JSON. The `metadata.json` file, however, should be readable JSON. |
| **ENC-02**   | **Data Unreadable with Wrong Key** | 1. Sync data with encryption key "KEY_A". <br> 2. Clear local data. <br> 3. Change the encryption key in settings to "KEY_B". <br> 4. Save and trigger a sync/restore. | The application fails to decrypt the data. The console shows decryption errors. Data is not restored.                                                                                          |

---

## 9. Feature: Robustness and Error Handling

These tests check how the script behaves under failure conditions.

| Test Case ID | Test Scenario                | Prerequisites                                                                | Test Steps                                                            | Expected Result                                                                                                                                        |
| :----------- | :--------------------------- | :--------------------------------------------------------------------------- | :-------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ERR-01**   | **Incorrect S3 Credentials** | Configure with invalid AWS Access Key or Secret Key.                         | 1. Save settings and trigger a manual sync.                           | Console logs show errors related to "InvalidAccessKeyId" or "SignatureDoesNotMatch". The sync fails gracefully. The UI sync status dot might turn red. |
| **ERR-02**   | **Network Disconnection**    | Use browser dev tools to go offline.                                         | 1. Trigger a manual sync while offline. <br> 2. Observe console logs. | The sync operation fails. Logs may show retries being queued. Once the network is restored, the queued operations should execute successfully.         |
| **ERR-03**   | **Invalid Backup File**      | Manually upload a corrupted or empty zip file to the backups location in S3. | 1. Try to restore from this corrupted file via the UI.                | The restoration fails with a descriptive error message in an alert and/or console log (e.g., "Invalid backup format"). The application does not crash. |

---

## 10. Conclusion

This testing guide provides a structured approach to validating the functionality of the TypingMind Cloud Sync script. By systematically executing these test cases, you can ensure that each feature works as expected, from basic configuration to complex data synchronization and error handling scenarios.

For best results, perform these tests in a controlled environment using dedicated test accounts and S3 buckets. Pay close attention to the browser's developer console for logs, especially when testing with the `?log` parameter enabled, as it provides invaluable insight into the script's internal operations.

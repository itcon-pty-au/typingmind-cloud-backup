<div align="center">💗 <a href="https://buymeacoffee.com/itcon">Countless hours have gone into coding this extension. If you found this useful, please consider donating so that I stay motivated to build and release  such awesome tools for free.</a> 💗<br/><br/><img src="Admin/bmc.png" alt="Buy Me A Coffee" height="40" /></div>
<br/>
<div align="center">

**Quick Navigation**

[Key Features](#-key-features) •
[Installation & Setup](#-installation--setup) •
[Migration to V3](#-migration-to-v3) •
[Operating Modes](#-operating-modes) •
[Using the Extension](#-using-the-extension) •
[Cloud Storage Setup](#️-cloud-storage-setup) •
[Troubleshooting](#-troubleshooting)

</div>

# TypingMind Cloud Sync V3

A comprehensive cloud backup and sync extension for TypingMind that automatically backs up and synchronizes your entire TypingMind data with AWS S3 or S3-compatible cloud storage services.

## ✨ Key Features

### 🔄 **Intelligent Sync System**

- **Bidirectional Sync**: Real-time synchronization between your local TypingMind data and cloud storage
- **Deletion Tracking**: Advanced tombstone system tracks deletions across devices to prevent data loss
- **Conflict Resolution**: Smart conflict resolution when the same data is modified on multiple devices
- **Auto-sync**: Configurable automatic sync intervals (minimum 15 seconds)

### 💾 **Advanced Backup Management**

- **Daily Automated Backups**: Automatic compressed daily backups with 30-day retention
- **On-demand Snapshots**: Create named snapshots of your data anytime
- **Chunked Backups**: Automatically handles large datasets by splitting into manageable chunks
- **ZIP Compression**: All backups are compressed using ZIP with high compression ratios
- **Smart Cleanup**: Automatic cleanup of old backups and tombstones

### 🔒 **Security & Encryption**

- **AES-GCM Encryption**: All data encrypted client-side with 256-bit keys
- **PBKDF2 Key Derivation**: Strong encryption keys derived from your password
- **No Plaintext Storage**: Your data is never stored unencrypted in the cloud

### 🛠 **Flexible Configuration**

- **URL Parameters**: Configure via URL for easy setup across devices
- **NoSync Mode**: Snapshot-only mode when you don't need real-time sync
- **Auto-configuration**: Automatic setup from URL parameters
- **Exclusion Lists**: Customize what data to exclude from sync

### 📊 **Monitoring & Debugging**

- **Comprehensive Logging**: Detailed console logging for troubleshooting
- **Sync Status Indicator**: Visual sync status in the UI
- **Operation Queue**: Robust operation handling with automatic retries
- **Memory Management**: Efficient resource usage and cleanup

## 🚀 Installation & Setup

### Prerequisites

⚠️ **Important**: Before installing, export your TypingMind data via "Settings > App Data & Storage > Export" as a backup.

### Step 1: Install the Extension

1. **Logout of TypingMind** (this disables native sync - the app works perfectly when logged out)
2. Go to **Menu > Preferences > Extensions** in TypingMind
3. Load this URL: `https://itcon-pty-au.github.io/typingmind-cloud-backup/s3-v3.js`

### Step 2: Configure Cloud Storage

After installation, you'll see a new **Sync** button in the sidebar. Click it to open the configuration modal.

> **First Time Setup**: If you haven't configured the mandatory fields (bucket name, region, access key, secret key, encryption key), the extension will show an alert prompting you to configure these settings. The extension needs these credentials to function.

**Required Fields** (marked with \*):

- **Bucket Name\*** - Your S3 bucket name
- **Region\*** - AWS region (use 'auto' for Cloudflare R2)
- **Access Key\*** - Your S3 access key ID
- **Secret Key\*** - Your S3 secret access key
- **Encryption Key\*** - Your encryption password (8+ characters) [⚠️ If you forget this key, there is no way to restore data from the backups created by this extension]

**Optional Fields**:

- **S3 Endpoint** - For S3-compatible services (leave empty for AWS S3)
- **Sync Interval** - How often to sync (minimum 15 seconds, default 15)
- **Exclusions** - Comma-separated list of additional keys to exclude from sync

  > **Note**: System keys (starting with `tcs_`) and sensitive keys are automatically excluded from sync

### Step 3: Quick Setup Options

#### Option A: Manual Configuration

1. Click the **Sync** button in the navigation menu
2. Fill in your cloud storage credentials
3. Click **Save** - the extension will:
   - Check if cloud backup exists and restore it if found
   - Create initial backup if no cloud data exists and push the app data to cloud
   - Start automatic sync monitoring and daily backups

#### Option B: URL Configuration (Recommended for multiple devices)

Add parameters to your TypingMind URL for automatic setup:

```
https://your-typingmind-url.com/?bucket=your-bucket&region=us-east-1&accesskey=your-key&secretkey=your-secret&encryptionkey=your-password&config
```

**Available URL Parameters**:

- `bucket` - S3 bucket name
- `region` - AWS region
- `accesskey` - Access key ID
- `secretkey` - Secret access key
- `endpoint` - S3 endpoint (for compatible services)
- `encryptionkey` - Encryption password
- `syncinterval` - Sync interval in seconds
- `exclusions` - Comma-separated exclusion list
- `config` - Auto-open config modal
- `log` - Enable console logging from startup
- `nosync` - Enable NoSync mode (snapshots only)

## 🎛 Operating Modes

### Standard Sync Mode (Default)

- Full bidirectional synchronization
- Automatic deletion tracking
- Real-time sync across devices
- Best for users with multiple devices

### NoSync Mode

Add `?nosync` to your URL when you open your typingmind app to enable no-sync mode:

- Disables automatic sync operations
- Only snapshot functionality available
- Ideal for users who want manual backup control

## 📱 Using the Extension

### Backup Management

The **Available Backups** section shows all your cloud backups:

**Backup Types**:

- 📸 **Snapshots** - Named backups you created manually
- 🗓️ **Daily Backups** - Automatic daily backups with date stamps
- **Simple** - Single file backups ( < 50 MB)
- **Chunked** - Multi-part backups for large datasets ( > 50 MB)

**Actions**:

- **Download** - Downloads and decrypts backup as JSON
- **Restore** - Restores backup data to TypingMind (overwrites current data)
- **Delete** - Removes backup from cloud storage

### Manual Operations

- **Save** - Saves configuration and performs initial sync
- **Sync Now** - Triggers immediate full synchronization
- **Snapshot** - Creates named snapshot of current data
- **Console Logging** - Toggle detailed logging for troubleshooting

### Sync Status Indicator

The sync button shows a colored dot indicating status:

- 🟢 **Green** - Sync successful
- 🔴 **Red** - Sync error
- 🟡 **Yellow** - Warning
- 🔵 **Blue** - Sync in progress

## 🔧 Advanced Features

### Deletion Monitoring

V3 includes sophisticated deletion tracking:

- Monitors for deleted chats, settings, and other data
- Creates "tombstones" to track deletions across devices
- Prevents accidental data loss during sync
- Automatic cleanup of old tombstones after 30 days

### Chunked Backups

For large datasets (>50MB), the system automatically:

- Splits data into manageable chunks
- Compresses each chunk individually
- Maintains metadata for reconstruction
- Enables backup of very large TypingMind instances

### 🚀 Migration to V3

V3 is a major rewrite with a new architecture and is **not backward compatible** with backups created by older versions (V1 or V2). However, migrating your live data is designed to be a seamless, automatic process.

#### What to Expect During Migration

When you load the V3 extension for the first time, it will automatically:

- **Preserve Your Data**: Your existing local TypingMind data (chats, folders, etc.) is safe and will be used as the source for the first sync.
- **Convert Configuration**: Old configuration keys (e.g., `aws-bucket`) are automatically renamed to the new `tcs_` prefixed format (`tcs_aws_bucketname`).
- **Clean Up Obsolete Data**: The old `V2/` folder structure in your S3 bucket will be ignored. V3 uses a new, more efficient structure.
- **Create New Metadata**: A fresh `metadata.json` file is created to track your data, enabling more robust sync logic.

#### ⚠️ Important Compatibility Notes

- **Old Backups Are Incompatible**: Backups created with V1 or V2 of this extension **cannot be restored** using V3 due to the new encryption and data format. It is recommended to delete old backup files from your S3 bucket.
- **Live Data Syncs Fine**: While old backups are not restorable, your current local data will sync correctly to the cloud when V3 is first run.
- **One-Way Upgrade**: The migration process is one-way. Once you upgrade to V3, you cannot revert to an older version without potentially causing data sync issues.

There is no manual migration required—the extension handles everything automatically on the first load. Just install, configure, and let it work.

### Error Handling & Recovery

- **Operation Queue**: Failed operations are retried automatically
- **Exponential Backoff**: Smart retry delays prevent service overload
- **Graceful Degradation**: Continues working even with partial failures
- **Comprehensive Logging**: Detailed logs help diagnose issues

## 🐛 Troubleshooting

### Enable Logging

For troubleshooting, enable detailed logging:

1. **Startup Logging**: Add `?log=true` to your URL
2. **Runtime Logging**: Toggle "Console Logging" in the config modal
3. Check browser console for detailed sync information

## ☁️ Cloud Storage Setup

### AWS Config

1. Create a user in Amazon IAM. In permissions option, select "Add user to group" but don't select any group. In next screen, "Create user".
2. Open the user. Create Access Key for the user. In Step 1, select "Other", you can skip Step 2 and directly create Access Key. Copy the Access key and Secret Key and store it securely. You will need this to configure the extension.
3. Create a bucket with the default settings. Due to security reasons, it is recommended to create a new bucket for Typingmind backup and ensure that no other files are stored in it.
4. Open Bucket > Permissions > Bucket Policy

```yaml
{
  "Version": "2012-10-17",
  "Statement":
    [
      {
        "Effect": "Allow",
        "Principal":
          { "AWS": "arn:aws:iam::<AWS Account ID>:user/<IAM username>" },
        "Action":
          [
            "s3:ListBucket",
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucketMultipartUploads",
            "s3:ListMultipartUploadParts",
            "s3:AbortMultipartUpload",
            "s3:GetBucketLocation",
            "s3:GetBucketVersioning",
            "s3:ListBucketVersions",
            "s3:DeleteObjectVersion",
          ],
        "Resource":
          [
            "arn:aws:s3:::<AWS bucket name>",
            "arn:aws:s3:::<AWS bucket name>/*",
          ],
      },
      {
        "Sid": "PreventSpecificFileDeletion",
        "Effect": "Deny",
        "Principal":
          { "AWS": "arn:aws:iam::<AWS Account ID>:user/<IAM username>" },
        "Action": "s3:DeleteObject",
        "Resource": "arn:aws:s3:::<AWS bucket name>/typingmind-backup.json",
      },
    ],
}
```

Update AWS Account ID, IAM username and AWS bucket name in the policy with your specific values.

5. Open Bucket > Permissions > CORS

```yaml
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["HEAD", "GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://*.hostname.com"],
    "ExposeHeaders":
      [
        "Access-Control-Allow-Origin",
        "ETag",
        "x-amz-server-side-encryption",
        "x-amz-request-id",
        "x-amz-id-2",
      ],
    "MaxAgeSeconds": 3000,
  },
]
```

If you are using typingmind cloud, use the below

```yaml
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["HEAD", "GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://www.typingmind.com"],
    "ExposeHeaders":
      [
        "Access-Control-Allow-Origin",
        "ETag",
        "x-amz-server-side-encryption",
        "x-amz-request-id",
        "x-amz-id-2",
      ],
    "MaxAgeSeconds": 3000,
  },
]
```

Update "https://\*.hostname.com" with your specific hostname in case you are self hosting Typingmind (e.g. https://chat.yourhostname.com). If you are using Typingmind cloud, hostname should be https://www.typingmind.com. This restricts executing S3 commands from only the specified hostname providing better security.

### S3 compatible storage services setup

Cloudflare R2 provides S3 compatible API with a generous 10GB free storage per month. Refer [How to setup Cloudflare R2 and use with this extension](https://github.com/itcon-pty-au/typingmind-cloud-backup/blob/main/HowTo/Cloudflare_R2_HowTo.docx)
iDrive E2 provides S3 compatible API with a generous 10GB free storage per month. Refer [How to setup iDrive E2 and use with this extension](https://github.com/itcon-pty-au/typingmind-cloud-backup/blob/main/HowTo/iDrive_E2_HowTo.docx)

## 🐛 Troubleshooting

### Sync Issues Between Devices

**Symptom**: Different item counts between devices (e.g., Device 1 has 467 items, Device 2 has 376 items)

**Root Cause**: Local metadata corruption/inconsistency

- Local metadata incorrectly shows items as "synced" when they're not in cloud
- Prevents items from being uploaded to cloud
- Other devices can't download what was never uploaded

**Diagnosis**:

1. Open the Sync settings modal - check the "Sync Diagnostics" table
2. Compare Local Items vs Cloud Items counts
3. Look for mismatches between devices

**Solutions** (in order of preference):

**Solution 1: Reset metadata on device with CORRECT data**

- Identify which device has the complete/correct dataset
- On that device only:
  ```javascript
  localStorage.removeItem("tcs_local-metadata");
  localStorage.removeItem("tcs_last-cloud-sync");
  // Reload page
  ```
- This forces re-upload of all items to cloud
- Other devices will then download missing items

**Solution 2: Reset metadata on device with MISSING data**

- On device with fewer items:
  ```javascript
  localStorage.removeItem("tcs_local-metadata");
  localStorage.removeItem("tcs_last-cloud-sync");
  // Reload page
  ```
- This forces download of missing items from cloud

**Solution 3: Complete sync reset** (if Solutions 1-2 don't work)

- Create backup/snapshot first on device with most data
- On ALL devices:
  ```javascript
  localStorage.removeItem("tcs_local-metadata");
  localStorage.removeItem("tcs_last-cloud-sync");
  localStorage.removeItem("tcs_last-daily-backup");
  // Reload all devices
  ```

**Prevention**:

- Monitor sync status indicator (colored dot on sync button)
- Avoid simultaneous syncing on multiple devices
- Check logs periodically with `?log=true`
- Create regular snapshots before major changes

### Using app in multiple devices simultaneously

> The extension will work reliably only when one device is active at a time. So if you are facing issues, ensure the app is active only on one device at a time.

### New Chats Disappearing

> - **Have you checked the setting**: "Alert if cloud backup is smaller during import"?
>   **Implication of not checking this**: Assuming you have the extension in "Sync" mode.
>   - You create a new chat.
>   - You immediately swap to a different tab/window (Backup to S3 did not happen yet).
>   - You come back to the app - At this point, data has been freshly imported from S3 and your new chat is now disappeared.
> - **Resolution**: Make the extension work in **Backup mode** (Not an option if you are using the app on multiple devices), then check the setting "Alert if cloud backup is smaller during import". This will prompt the user for confirmation if the cloud backup size is less than the local backup size. In the above scenario, the prompt will appear. You should click **Cancel** as you are certain that the local data is newer, and it will skip the cloud import.

## Warning

The extension encrypts the AWS credentials while its stored in the browser database. However, since the encryption key is still stored in plain text, sophisticated hackers who can get access to your browser data and could theoretically get access to your AWS credentials. So, be sure to provide minimum permissions to the AWS credentials. For Amazon S3, I have provided access policy above. However, for other S3 compatible providers, its up to you to setup proper access policies.

## About me

I am a passionate developer dedicated to creating useful tools that can benefit the community. My goal is to distribute all of my projects as open source, enabling others to learn, contribute, and innovate together. If you appreciate my work and want to support my efforts, feel free to [buy me a coffee](https://buymeacoffee.com/itcon) :heart:!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

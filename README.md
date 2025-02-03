<div align="center">💗 <a href="https://buymeacoffee.com/itcon">If you found this useful, please consider buying me a coffee</a> 💗<br/><br/></div>

# TypingMind Cloud Backup Extension

## Features
- Extension to enable automatic backup & restore of app data to AWS S3/S3 compatible cloud services. (Full backup, not incremental)
- Manual export/import of data to and from cloud.
- The entire typingmind data will be stored in S3 as a single JSON file. This file is overwritten each time a backup is written to S3.
- Automatically (subject to data loss prevention rules) restores the latest backup version from S3 to your TypingMind instance when you load the app (provided a backup exists).
- Enables automatic backing up of your TypingMind data to S3 throughout the session as per the configured backup interval.
- Last 30 days 'backup of backup' for a stress free experience. Apart from the single backup file, the extension now creates a daily 'no-touch' zipped backup of the main backup file. In case the main backup file gets corrupted, you can restore it using the previous day's backup.
- Snapshot lets you backup the current typingmind data to the cloud when you need it. This is a 'no-touch' zipped backup that will permanently exist in the cloud till you choose to delete it.
- A 'T-15 rolling snapshot' keeps a zipped snapshot of the typingmind instance from 15 minutes ago. This gives you a recent version of the backup that you can manually revert to in case of an unintended corruption of the main backup file. However, note that this is a rolling backup that gets overwritten every 15 minutes.
- Allows you to view all the backups in the cloud and lets you download it or restore from the UI itself. The snapshot backups can be deleted from the UI as well.
- The backup interval is now configurable (Minimum of 15 seconds).
- ✨ All backups are now encrypted! The backup system uses AES-GCM encryption with a 256-bit key derived using PBKDF2. All data is encrypted client-side before being uploaded to S3. The encryption key is derived from a user-provided password using 100,000 PBKDF2 iterations with SHA-256, providing strong protection for sensitive data.
- ✨ The system includes several safeguards to prevent unintended data loss.
    - Cloud-vs-local data size comparison with customizable tolerance during import
    - Cloud-vs-local data size comparison with customizable tolerance during export
    - User confirmation if Cloud backup is smaller than the local data
    - User confirmation prompts with detailed information when significant differences are detected
  
## Using this extension
WARNING: Ensure you take a local backup from "SETTINGS > APPDATA & STORAGE > EXPORT" before setting up the extension.
1. Logout of Typingmind
2. Load "https://itcon-pty-au.github.io/typingmind-cloud-backup/s3.js" into Menu > Preferences > Extension in Typingmind.
3. Once the extension is installed, a new Backup button will be added to the menu. Clicking on this will bring up the S3 backup configuration form.
4. Provide the AWS details in the configuration form. [These are stored locally in your browser]
   - Bucket Name
   - Region - Give the region where your bucket resides. For Cloudflare R2, give 'auto'
   - Access Key
   - Secret Key
   - S3 Compatible Storage Endpoint - If you are using AWS S3, skip this. For S3 compatible endpoints (Cloudflare, iDrive etc), you should provide a value here.
   - Backup Interval - Minimum is 15 seconds, default is 60 seconds.
   - Encryption Key - This is to encrypt your app data before saving to the cloud. Provide a 8 or more character long key. You will need this key for encrypting the backed up data. So ensure you remember this.
5. The save button checks if there is a backup already in S3, if yes it tries to restores the local app data using the cloud data. There are some rules implemented to prevent unintended corruption of data. In such detections, the extension will prompt you to confirm data import. When you are prompted, you should know which data is the latest... If cloud is having the latest data and you want your local app data to be synced with this cloud data, you click on 'Proceed'. When you do this, you local app data is overwritten with the cloud backup data. Whereas, if you know that the local app data is more recent and should not be overwritten with the cloud data, then click on 'Cancel'. Note that when you click cancel, the local app data will be pushed to the cloud to ensure cloud is in sync. 
6. Manually refresh the page to reflect the new data. CTRL + F5 if it does not.
7. Full backup to S3 is performed as per configured Backup interval automatically. Note that the backups in S3 are encrypted using a very strong algorithm. Hence you will not be able to download a file from the cloud and view it. You will need to use the Download button in the config form to download the decrypted version of the backup.
8. Along with the full backup to S3 - the following activities are also done
   - A T-15 backup is created once every 15 minutes. This is a rolling backup which is overwritten every 15 min. This is to provide you with a close to real time backup in case your main backup file gets corrupted. In case of an unintended corruption of main backup file, download the latest t-15 backup from the 'Available Backups' section of the extension config form. Unzip it and via the cloud UI, overwrite the main backup file. Then click on 'Import' to import the cloud backup. Your data should now be restored.
   - A daily 'no-touch' backup for last 30 days to provide you a second level backup in case the main backup file and the T-15 also gets corrupted.
10. If there is no backup in S3, it is expected that you click on the 'Export' button in the extension configuration form to kickstart the backup process.
11. You can do on demand cloud backups and restore using the respective buttons in the form - 'Export' and 'Import'. Clicking on Export pushes the local app data to the cloud. Import overwrites the local app data with the cloud data. 
12. To create a 'no-touch' backup of the app data, you can click on 'Snapshot'. It will create a data snapshot at that particular instance.
13. Whenever the page is loaded, it pulls the latest backed up version from S3 and refreshes the data. You may need to do a Ctrl + F5 (Force refresh) to make it reflect in the UI.
14. In the Available backups section, all the available backups in the cloud are listed. You can choose to select any of them and then either
    - Download
    - Restore
    - Delete

## Troubleshooting
- Add '?log=true' to the URL to initiate console logging. The log will start right from the beginning.
- You can also toggle the 'Console Logging' in the Backup & Sync configuration modal. But this starts the logging at that instant, anything that happened before won't be logged. 

## AWS Config
1. Create a user in Amazon IAM. In permissions option, select "Add user to group" but don't select any group. In next screen, "Create user".
2. Open the user. Create Access Key for the user. In Step 1, select "Other", you can skip Step 2 and directly create Access Key. Copy the Access key and Secret Key and store it securely. You will need this to configure the extension.
3. Create a bucket with the default settings. Due to security reasons, it is recommended to create a new bucket for Typingmind backup and ensure that no other files are stored in it.
4. Open Bucket > Permissions > Bucket Policy
```yaml
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<AWS Account ID>:user/<IAM username>"
      },
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::<AWS bucket name>",
        "arn:aws:s3:::<AWS bucket name>/*"
      ]
    },
    {
      "Sid": "PreventSpecificFileDeletion",
      "Effect": "Deny",
      "Principal": {
        "AWS": "arn:aws:iam::<AWS Account ID>:user/<IAM username>"
      },
      "Action": "s3:DeleteObject",
      "Resource": "arn:aws:s3:::<AWS bucket name>/typingmind-backup.json"
    }
  ]
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
    "ExposeHeaders": ["Access-Control-Allow-Origin", "ETag"],
    "MaxAgeSeconds": 3000
  }
]
```
If you are using typingmind cloud, use the below
```yaml
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["HEAD", "GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://www.typingmind.com"],
    "ExposeHeaders": ["Access-Control-Allow-Origin", "ETag"],
    "MaxAgeSeconds": 3000
  }
]
```
Update "https://*.hostname.com" with your specific hostname in case you are self hosting Typingmind (e.g. https://chat.yourhostname.com). If you are using Typingmind cloud, hostname should be https://www.typingmind.com. This restricts executing S3 commands from only the specified hostname providing better security.

## S3 compatible storage services setup
Cloudflare R2 provides S3 compatible API with a generous 10GB free storage per month. Refer [How to setup Cloudflare R2 and use with this extension](https://github.com/itcon-pty-au/typingmind-cloud-backup/blob/main/Cloudflare_R2_HowTo.docx)

iDrive E2 provides S3 compatible API with a generous 10GB free storage per month. Refer [How to setup iDrive E2 and use with this extension](https://github.com/itcon-pty-au/typingmind-cloud-backup/blob/main/iDrive_E2_HowTo.docx)

## Warning
The extension stores the storage provider credentials in the browser storage (like the original typingmind app) and this is not a secure method. The only option you have is to minimize damage caused if someone gets access to the credentials. i.e. Provide minimum permissions to the credentials. For Amazon S3, I have provided access policy above. However, for other S3 compatible providers, its up to you to setup proper access policies. 

## About me
I am a passionate developer dedicated to creating useful tools that can benefit the community. My goal is to distribute all of my projects as open source, enabling others to learn, contribute, and innovate together. If you appreciate my work and want to support my efforts, feel free to [buy me a coffee](https://buymeacoffee.com/itcon) :heart:!

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

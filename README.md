# TypingMind Cloud Backup Extension

## Features
- Automatically restores the latest version from the cloud to your TypingMind instance when you first open the app (provided a backup exists).
- Enables auto backing up of your TypingMind data to the cloud at a defined interval.

## How the Extension Works
- **WARNING:** Unlike the elegant in-house solution from TypingMind, this extension may have some rough edges due to the inherent limitations of what an extension can and cannot do.
- **PREREQUISITE:** Ensure you take a local backup using Menu > Backup & Sync > Export before using this plugin.
  
### Steps to Enable Backup
1. Once the extension is installed, the cloud button in the bottom of the left sidebar will use the new cloud backup logic. You can enable automatic backup by clicking on the **Cloud Backup** toggle.
2. Provide the mandatory parameters in the form.
3. You can do adhoc cloud backups and restore using the respective buttons.
4. When the app first loads (and if the Cloud Backup toggle is on), it will automatically import the latest backup from the cloud to the app. (Assuming form is saved with proper values) 
5. Subsequently, as per the Auto Backup Interval, the data is automatically backed up to the cloud. If no value is provided in the Backup Interval field, backups will occur every 5 minutes.
6. Before exiting the app, it is recommended to perform an ad-hoc backup to capture the latest app snapshot.

## Using This Extension on a Second Device to Sync Data
1. Assume this is a new instance of TypingMind that has no data to back up and all you want to do is restore the cloud backup to the new instance.
2. Install the extension.
3. Ensure Backup toggle is Off. Fill out the **Backup & Sync** form with the required details, ensuring the Document ID/Remote file name is populated. Refer to the other typingmind instance to get this detail. Or get it from the cloud.
4. Click “Import from Cloud/Google Drive” to do an adhoc sync from cloud.

## Contributing
Contributions are welcome! Please feel free to submit a pull request or open an issue to discuss changes or features.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

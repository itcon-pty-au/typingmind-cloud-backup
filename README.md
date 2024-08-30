# TypingMind Cloud Backup Extension

## Features
- Automatically restores the latest version from the cloud to your TypingMind instance when you first open the app (provided a backup exists).
- Enables auto backing up of your TypingMind data to MongoDB cloud at a defined interval.

## How the Extension Works
- **WARNING:** Unlike the elegant in-house solution from TypingMind, this extension may have some rough edges due to the inherent limitations of what an extension can and cannot do.
- **PREREQUISITE:** Ensure you take a local backup using Menu > Backup & Sync > Export before using this plugin.
  
### Steps to Enable Backup
1. Once the extension is installed, you can enable backup by clicking on the **Cloud Backup** toggle.
2. Provide the parameters (Document ID; Backup Interval is optional).
3. When the app first loads (and if the Cloud Backup toggle is on), it will automatically import the latest backup from the cloud to the app. 
4. Subsequently, as per the Backup Interval, the data is automatically backed up to the cloud. If no value is provided in the Backup Interval field, backups will occur every 5 minutes.
5. Before exiting the app, it is recommended to perform an ad-hoc backup to capture the latest app snapshot. You can use the “Export to Cloud” or “Import from Cloud” options to make ad-hoc backups or restores.

## Using This Extension on a Second Device to Sync Data
1. Assume this is a new instance of TypingMind that has no data to back up and all you want to do is restore the cloud backup to the new instance.
2. Install the extension.
3. Fill out the **Backup & Sync** form with the cloud details, ensuring the Document ID is populated.
   - [Login to MongoDB, open the database, and get the object ID of the document or obtain the Document ID from the other TypingMind instance.]
4. Immediately click “Import from Cloud.”

## Contributing
Contributions are welcome! Please feel free to submit a pull request or open an issue to discuss changes or features.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

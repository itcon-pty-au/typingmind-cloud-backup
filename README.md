<div align="center">⚠️ Important Notice ⚠️<br/><br/>
Please ensure that your Google Drive API is configured correctly to address issues with backup and restore functionality. Refer to the Setup Google Drive API section below. </div>

# TypingMind Cloud Backup Extension

[If you found this useful, please consider buying me a coffee](https://buymeacoffee.com/itcon):heart:!

## Features
- Extension to enable automatic backup & restore of app data to Google Drive. (Full backup, not incremental)
- The entire typingmind data is stored in Google Drive as a single JSON file. This file is overwritten each time a backup is written.
- Automatically restores the latest backup version from Google Drive to your TypingMind instance when you load the app (provided a backup exists).
- Enables automatic backing up of your TypingMind data throughout the session every minute.
- Last 30 days 'backup of backup' for a stress free experience. Apart from the single backup file, the extension creates a daily 'no-touch' zipped backup of the main backup file. In case the main backup file gets corrupted, you can restore it using the previous day's backup!
- Snapshot lets you backup the current typingmind data to the cloud when you need it. This is a 'no-touch' zipped backup that will permanently exist in your Google Drive until you choose to manually delete it.
- A 'T-15 rolling snapshot' keeps a zipped snapshot of the typingmind instance from 15 minutes ago. This gives you a recent version of the backup that you can manually revert to in case of an unintended corruption of the main backup file. However, note that this is a rolling backup that gets overwritten every 15 minutes.
- Allows you to view all the backups in Google Drive and lets you download it or restore from the UI itself. ✨The snapshot backups can be deleted from the UI as well.
- ✨The extension monitors the typingmind DB for changes and initiates backup automatically.
  
## Using this extension
WARNING: Ensure you take a local backup from "SETTINGS > APPDATA & STORAGE > EXPORT" before setting up the extension.

### Setup Google Drive API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the Google Drive API for your project
4. Configure the OAuth consent screen:
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" user type
   - Fill in the app name (e.g., "TypingMind Backup"), your email, and other required fields
   - Add your email as a test user
   - Save the configuration
5. Create OAuth credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add `https://chat.typingmind.com` to "Authorized JavaScript origins"
   - Copy the Client ID (you'll need it later)

### Install the Extension
1. Load "https://mvfolino68.github.io/tm-cloud-backup/gdrive.js" into Menu > Preferences > Extension in Typingmind.
2. Once the extension is installed, a new Backup button will be added to the menu. 
3. Click the button to start the Google Drive authentication process.
4. Grant the necessary permissions when prompted.
5. Your data will now automatically backup to a "TypingMindBackup" folder in your Google Drive.

## Privacy & Security
- The extension only requests access to files it creates (using `https://www.googleapis.com/auth/drive.file` scope)
- All data is stored in your personal Google Drive account
- No data is sent to any third-party servers
- OAuth credentials are stored securely in your browser
- You can revoke access at any time through your Google Account settings

## About me
I am a passionate developer dedicated to creating useful tools that can benefit the community. My goal is to distribute all of my projects as open source, enabling others to learn, contribute, and innovate together. If you appreciate my work and want to support my efforts, feel free to [buy me a coffee](https://buymeacoffee.com/mvfolino68) :heart:!

## Support
If you encounter any issues or need help, please [open an issue](https://github.com/mvfolino68/tm-cloud-backup/issues) on GitHub.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

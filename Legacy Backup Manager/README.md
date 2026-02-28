# TypingMind Legacy Backup Manager

A Chrome/Brave extension that lets you browse and selectively restore chats from legacy TypingMind backup files.

## What it does

- Opens as a **side panel** alongside your TypingMind tab
- Parses legacy backup files (v1/v2 cloud sync backups and TypingMind exports)
- Lets you **browse, search, and preview** individual chats
- **Selectively restore** chosen chats into TypingMind's IndexedDB storage
- Supports both encrypted (AES-GCM / PBKDF2) and unencrypted backups
- Supports `.json` and `.zip` backup files

## Supported backup formats

| Format | Description |
|--------|-------------|
| TypingMind export | `{ data: { chats: [...] } }` — exported from TypingMind UI |
| Cloud sync v1/v2 | `{ localStorage: {...}, indexedDB: { CHAT_*: {...} } }` — from the S3 cloud sync extension |
| `.zip` archives | ZIP files containing any of the above (legacy daily backups / snapshots) |

## Installation

1. Download or clone this repository
2. Open your browser's extension management page:
   - **Chrome**: Navigate to `chrome://extensions`
   - **Brave**: Navigate to `brave://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `Legacy backup Manager extension` folder
6. The extension icon will appear in your browser toolbar

## Usage

### 1. Open TypingMind

Navigate to your TypingMind instance (typingmind.com or your self-hosted URL). The extension verifies it's running on a TypingMind page by checking the web app manifest.

### 2. Open the side panel

Click the **extension icon** in the toolbar. The side panel will open on the right side of your browser. You can drag the left edge of the panel to make it wider.

### 3. Load a backup file

- **Encryption Key** — Enter your backup encryption key. Leave blank if the backup is not encrypted.
- **Backup File** — Click to browse and select your `.json` or `.zip` backup file.
- Click **Load Backup**.

The extension will decrypt (if needed), decompress (if ZIP), and parse the file. A progress indicator shows the current stage.

### 4. Browse chats

Once loaded, you'll see:

- A **stats bar** showing the number of chats found
- A **search bar** to filter chats by title or content
- A **chat list** sorted by creation date (newest first), with dynamic pagination

Each chat card shows:
- Chat title
- Creation date
- Message count
- A content preview

Click on a chat card to **expand it** and view the conversation inline, including user messages, assistant responses, and embedded images.

### 5. Select and restore

- Use the **checkbox** on each chat card to select it
- Use **Select all on this page** to select all chats on the current page
- Selected count is shown alongside the sticky **Restore** button at the bottom

Click **Restore Selected** to write the chosen chats into TypingMind's IndexedDB. Restored chats will display a **"Restored"** tag and their checkboxes will be disabled to prevent duplicate restores.

After restoring, **refresh the TypingMind page** to see the restored chats in the sidebar.

### 6. Load another file

Click the **Clear** button in the stats bar to reset and load a different backup file.

## Permissions

| Permission | Reason |
|------------|--------|
| `sidePanel` | Opens the extension UI as a browser side panel |
| `activeTab` | Access to the current tab for manifest verification |
| `scripting` | Inject the restore script into the TypingMind page to write to IndexedDB |
| `host_permissions: *://*/*` | Required because TypingMind can be self-hosted on any domain |

## Troubleshooting

**Extension icon does nothing**
- Make sure you're on a TypingMind page. The extension checks the page's web app manifest for `name: "TypingMind"`.

**"0 chats found" after loading**
- The backup format may not be recognized. The extension supports TypingMind exports (`{ data: { chats: [...] } }`) and cloud sync backups (`{ indexedDB: { CHAT_*: {...} } }`).

**"Decryption failed"**
- Double-check your encryption key. Legacy backups use PBKDF2 (100K iterations) + AES-256-GCM.

**"This backup is encrypted"**
- The file has an `ENCRYPTED:` marker but no key was provided. Enter your encryption key and try again.

**Restore error about permissions**
- Reload the extension in `chrome://extensions` and ensure it has the required permissions granted.

**Restored chats don't appear in TypingMind**
- Refresh the TypingMind page after restoring. The app reads from IndexedDB on page load.

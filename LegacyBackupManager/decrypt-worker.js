/*
  Web Worker for decrypting legacy TypingMind backup files (v1/v2).

  Encryption format:
    Binary: "ENCRYPTED:" (10 ASCII bytes) + IV (12 bytes) + AES-GCM ciphertext
    Key derivation: PBKDF2, 100K iterations, SHA-256, salt = "typingmind-backup-salt"

  Backup structure after decryption:
    { localStorage: { ... }, indexedDB: { ... } }
    Chat keys in indexedDB are prefixed with "CHAT_"

  Supports:
    - Raw .json files (encrypted binary despite .json extension)
    - .zip files (JSZip DEFLATE containing the encrypted binary)

  Messages:
    IN:  { type: 'decrypt', file: ArrayBuffer, key: string, fileName: string }
    OUT: { type: 'index', chats: [...], totalItems: number }
    IN:  { type: 'getChat', id: string }
    OUT: { type: 'chatData', id: string, data: object }
    OUT: { type: 'error', message: string }
    OUT: { type: 'progress', stage: string, detail: string }
*/

importScripts("vendor/jszip.min.js");

let parsedBackup = null; // Holds the full parsed backup (any format)
let chatMap = {};         // Normalized map: chatId → chat object (for quick lookup)
let detectedFormat = "";  // "export" | "cloud-sync" | "unknown"

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === "decrypt") {
    try {
      const { file, key, fileName } = e.data;
      postProgress("Reading file", `${(file.byteLength / 1048576).toFixed(1)} MB`);

      let encryptedData = new Uint8Array(file);

      // If ZIP, extract the encrypted content first
      if (fileName.toLowerCase().endsWith(".zip")) {
        postProgress("Extracting ZIP", "Decompressing archive...");
        encryptedData = await extractFromZip(encryptedData);
      }

      // Decrypt (or pass through if unencrypted)
      postProgress("Decrypting", "Checking encryption...");
      const jsonString = await decrypt(encryptedData, key);

      // Parse JSON
      postProgress("Parsing", "Parsing backup data...");
      parsedBackup = JSON.parse(jsonString);

      // Detect format and build chat index
      const result = detectAndBuildIndex(parsedBackup);
      detectedFormat = result.format;
      chatMap = result.chatMap;

      self.postMessage({
        type: "index",
        chats: result.chats,
        totalItems: result.totalItems,
        format: detectedFormat,
      });
    } catch (err) {
      self.postMessage({ type: "error", message: err.message });
    }
  }

  if (type === "getChat") {
    const { id } = e.data;
    if (!parsedBackup) {
      self.postMessage({ type: "error", message: "No backup loaded" });
      return;
    }
    const chatData = chatMap[id];
    if (!chatData) {
      self.postMessage({ type: "error", message: `Chat ${id} not found` });
      return;
    }
    self.postMessage({ type: "chatData", id, data: chatData });
  }

  if (type === "getChatsForRestore") {
    const { ids } = e.data;
    if (!parsedBackup) {
      self.postMessage({ type: "error", message: "No backup loaded" });
      return;
    }
    const chats = [];
    for (const id of ids) {
      const data = chatMap[id];
      if (data) {
        chats.push({ id, data });
      }
    }
    self.postMessage({ type: "restoreData", chats });
  }
};

function postProgress(stage, detail) {
  self.postMessage({ type: "progress", stage, detail });
}

// --- ZIP extraction ---

async function extractFromZip(data) {
  const zip = await JSZip.loadAsync(data);
  const fileNames = Object.keys(zip.files);

  if (fileNames.length === 0) {
    throw new Error("ZIP archive is empty");
  }

  // Take the first file (legacy backups contain a single .json file)
  const firstFile = fileNames[0];
  postProgress("Extracting ZIP", `Extracting ${firstFile}...`);
  const content = await zip.file(firstFile).async("uint8array");
  return content;
}

// --- Decryption (PBKDF2 + AES-GCM) ---

async function deriveKey(password) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("typingmind-backup-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decrypt(data, password) {
  const MARKER = "ENCRYPTED:";
  const markerBytes = new TextEncoder().encode(MARKER);

  // Verify marker
  const prefix = new TextDecoder().decode(data.slice(0, markerBytes.length));

  if (prefix !== MARKER) {
    // Not encrypted — try to parse as JSON directly
    postProgress("Parsing", "No encryption marker found, treating as plain JSON...");
    try {
      const text = new TextDecoder().decode(data);
      JSON.parse(text); // validate it's JSON
      return text;
    } catch {
      throw new Error(
        "Invalid backup file: not encrypted and not valid JSON"
      );
    }
  }

  // File is encrypted — require a key
  if (!password) {
    throw new Error(
      "This backup is encrypted. Please provide your encryption key and try again."
    );
  }

  const offset = markerBytes.length; // 10 bytes
  const iv = data.slice(offset, offset + 12);
  const ciphertext = data.slice(offset + 12);

  postProgress("Decrypting", "AES-GCM decryption in progress...");
  const key = await deriveKey(password);

  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error(
      "Decryption failed. Please check your encryption key is correct."
    );
  }

  return new TextDecoder().decode(decrypted);
}

// --- Format detection and chat index builder ---

/**
 * Detects the backup format and builds a normalized chat index + lookup map.
 *
 * Supported formats:
 *   1. TypingMind export:  { data: { chats: [ {id, messages, chatTitle, ...}, ... ] } }
 *   2. Cloud sync (v1/v2): { localStorage: {...}, indexedDB: { CHAT_xxx: {...}, ... } }
 *   3. Flat array:         [ {id, messages, ...}, ... ]
 *   4. Single chat object: { id, messages, ... }
 *
 * Returns: { format, chats (index array), chatMap (id→data), totalItems }
 */
function detectAndBuildIndex(backup) {
  // Format 1a: TypingMind export { data: { chats: [...] } }
  if (backup?.data?.chats && Array.isArray(backup.data.chats)) {
    postProgress("Indexing", `Found TypingMind export with ${backup.data.chats.length} chats`);
    return buildFromChatArray(backup.data.chats, "export");
  }

  // Format 1b: Legacy snapshot/export { chats: [...] } (no data wrapper)
  if (backup?.chats && Array.isArray(backup.chats)) {
    postProgress("Indexing", `Found legacy snapshot with ${backup.chats.length} chats`);
    return buildFromChatArray(backup.chats, "legacy-snapshot");
  }

  // Format 2: Cloud sync { indexedDB: { CHAT_xxx: {...} } }
  if (backup?.indexedDB && typeof backup.indexedDB === "object") {
    const idbKeys = Object.keys(backup.indexedDB);
    const chatKeys = idbKeys.filter((k) => k.startsWith("CHAT_"));
    postProgress("Indexing", `Found cloud sync backup with ${chatKeys.length} chats (${idbKeys.length} total items)`);

    const chatArray = chatKeys.map((key) => {
      const raw = backup.indexedDB[key];
      const chat = typeof raw === "string" ? tryParse(raw) : raw;
      if (chat && typeof chat === "object") {
        // Ensure the chat has an id for our lookup — use the key as reference
        chat._backupKey = key;
        return chat;
      }
      return null;
    }).filter(Boolean);

    return buildFromChatArray(chatArray, "cloud-sync", idbKeys.length);
  }

  // Format 3: Flat array of chats at the top level
  if (Array.isArray(backup) && backup.length > 0 && backup[0]?.messages) {
    postProgress("Indexing", `Found flat array with ${backup.length} chats`);
    return buildFromChatArray(backup, "flat-array");
  }

  // Format 4: Single chat object
  if (backup?.messages && (backup?.id || backup?.chatID)) {
    postProgress("Indexing", "Found single chat object");
    return buildFromChatArray([backup], "single-chat");
  }

  throw new Error(
    "Unrecognized backup format. Expected a TypingMind export or cloud sync backup file."
  );
}

function buildFromChatArray(chats, format, totalItemsOverride) {
  const indexEntries = [];
  const map = {};

  for (const chat of chats) {
    if (!chat || typeof chat !== "object") continue;

    const id = chat._backupKey || chat.chatID || chat.id || `unknown_${indexEntries.length}`;
    // Prefer messages over messagesArray; use messagesArray as fallback
    const messages = chat.messages || chat.messagesArray || chat.data?.messages || chat.data?.messagesArray || [];

    const title =
      chat.chatTitle ||
      chat.title ||
      chat.name ||
      chat.data?.title ||
      chat.data?.chatTitle ||
      extractTitleFromMessages(messages) ||
      "Untitled Chat";

    const createdAt =
      chat.createdAt ||
      chat.created_at ||
      chat.data?.createdAt ||
      messages[0]?.createdAt ||
      messages[0]?.created_at ||
      messages[0]?.timestamp ||
      0;

    const updatedAt =
      chat.updatedAt ||
      chat.updated_at ||
      chat.data?.updatedAt ||
      (messages.length > 0
        ? messages[messages.length - 1]?.createdAt ||
          messages[messages.length - 1]?.timestamp
        : null) ||
      createdAt;

    // Compute a fingerprint of the last message for cheap equality checks
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastMsgFingerprint = lastMsg ? buildMsgFingerprint(lastMsg) : null;

    // Store the full chat data in the lookup map
    map[id] = chat;

    indexEntries.push({
      id,
      title: truncate(title, 120),
      messageCount: messages.length,
      createdAt: normalizeTimestamp(createdAt),
      updatedAt: normalizeTimestamp(updatedAt),
      preview: extractPreview(messages),
      lastMsgFingerprint,
    });
  }

  // Sort newest first
  indexEntries.sort((a, b) => b.createdAt - a.createdAt);

  return {
    format,
    chats: indexEntries,
    chatMap: map,
    totalItems: totalItemsOverride || chats.length,
  };
}

function extractTitleFromMessages(messages) {
  if (!messages || messages.length === 0) return null;
  const first = messages[0];
  const content = first.content || first.text || "";
  if (typeof content === "string" && content.length > 0) {
    return truncate(content, 80);
  }
  return null;
}

function extractPreview(messages) {
  if (!messages || messages.length === 0) return "";
  const first = messages[0];
  const content = first.content || first.text || "";
  if (typeof content === "string") {
    return truncate(content, 200);
  }
  if (Array.isArray(content)) {
    // Multi-part message (text + images)
    const textPart = content.find(
      (p) => p.type === "text" || typeof p === "string"
    );
    if (textPart) {
      return truncate(typeof textPart === "string" ? textPart : textPart.text || "", 200);
    }
  }
  return "";
}

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen) + "…" : str;
}

function normalizeTimestamp(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return toMs(ts);
  const n = Number(ts);
  if (!isNaN(n)) return toMs(n);
  // Try parsing date string
  const parsed = Date.parse(ts);
  return isNaN(parsed) ? 0 : parsed;
}

/** Ensure a numeric timestamp is in milliseconds (not seconds). */
function toMs(n) {
  // Timestamps below 1e12 are almost certainly in seconds
  // (1e12 ms ≈ Mar 2001; 1e12 s ≈ year 33658)
  return n > 0 && n < 1e12 ? n * 1000 : n;
}

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Build a lightweight fingerprint for a message: role + content length + first 100 chars.
 * This MUST match the identical algorithm in sidepanel.js (readChatKeysFromIndexedDB).
 */
function buildMsgFingerprint(msg) {
  const role = msg.role || msg.type || '';
  const content = typeof msg.content === 'string'
    ? msg.content
    : JSON.stringify(msg.content || '');
  return role + ':' + content.length + ':' + content.substring(0, 100);
}

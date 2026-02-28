/*
  TypingMind Legacy Backup Manager — Side Panel Logic
  Handles: file upload, worker communication, chat browsing,
  search, pagination, selection, and restore via content script.
*/

(() => {
  "use strict";

  // --- State ---
  let worker = null;
  let allChats = [];        // Full chat index from worker
  let filteredChats = [];   // After search + tag filter
  let selectedIds = new Set();
  let restoredIds = new Set();
  let dbStatusMap = {};     // chatId → 'existing' | 'obsolete' | 'not-found'
  let expandedId = null;    // Currently expanded chat card
  let currentPage = 1;
  let pageSize = 20;        // Recalculated dynamically
  let currentTagFilter = 'all';

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const encKeyInput = $("#encryption-key");
  const fileInput = $("#file-input");
  const btnLoad = $("#btn-load");
  const progressArea = $("#progress-area");
  const progressFill = $("#progress-fill");
  const progressText = $("#progress-text");
  const errorArea = $("#error-area");
  const errorText = $("#error-text");
  const uploadSection = $("#upload-section");
  const chatSection = $("#chat-section");
  const statsText = $("#stats-text");
  const btnClear = $("#btn-clear");
  const searchInput = $("#search-input");
  const selectAllCb = $("#select-all");
  const selectionCount = $("#selection-count");
  const tagFilter = $("#tag-filter");
  const chatList = $("#chat-list");
  const pagination = $("#pagination");
  const restoreFooter = $("#restore-footer");
  const btnRestore = $("#btn-restore");
  const restoreCount = $("#restore-count");

  // --- DOM refs (extra) ---
  const tabWarning = $("#tab-warning");
  const btnReset = $("#btn-reset");

  // --- Init ---

  init();

  async function init() {
    // Check if the active tab is a TypingMind instance
    await checkActiveTab();

    // Enable load button when both fields have values
    fileInput.addEventListener("change", updateLoadButton);

    btnLoad.addEventListener("click", loadBackup);
    btnClear.addEventListener("click", clearBackup);
    btnReset.addEventListener("click", resetExtension);
    searchInput.addEventListener("input", debounce(onSearch, 250));
    selectAllCb.addEventListener("change", onSelectAll);
    tagFilter.addEventListener("change", onTagFilter);
    btnRestore.addEventListener("click", restoreSelected);

    calculatePageSize();
    window.addEventListener("resize", debounce(() => {
      const oldSize = pageSize;
      calculatePageSize();
      if (oldSize !== pageSize && allChats.length > 0) {
        currentPage = 1;
        renderChatList();
      }
    }, 200));
  }

  /**
   * Check if the current active tab is a TypingMind instance.
   * If not, show a blocking warning overlay.
   */
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showTabWarning();
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try {
            const link = document.querySelector('link[rel="manifest"]');
            if (!link) return false;
            return fetch(link.href)
              .then(r => r.ok ? r.json() : null)
              .then(m => m?.name === "TypingMind")
              .catch(() => false);
          } catch {
            return false;
          }
        },
      });

      const isTypingMind = results?.[0]?.result === true;
      if (!isTypingMind) {
        showTabWarning();
      }
    } catch {
      // executeScript fails on restricted pages (chrome://, etc.)
      showTabWarning();
    }
  }

  function showTabWarning() {
    tabWarning.classList.remove("hidden");
    // Disable the rest of the UI
    uploadSection.style.pointerEvents = "none";
    uploadSection.style.opacity = "0.3";
  }

  function hideTabWarning() {
    tabWarning.classList.add("hidden");
    uploadSection.style.pointerEvents = "";
    uploadSection.style.opacity = "";
  }

  function updateLoadButton() {
    btnLoad.disabled = !(fileInput.files.length > 0);
  }

  // --- Dynamic page size ---

  function calculatePageSize() {
    // Estimate: header ~80, upload ~180, stats ~36, search ~44, selectAll ~32,
    // pagination ~44, footer ~56 = ~472px overhead
    // Each chat card is ~62px
    const available = window.innerHeight - 472;
    const cardHeight = 62;
    pageSize = Math.max(5, Math.floor(available / cardHeight));
  }

  // --- Load backup ---

  async function loadBackup() {
    const key = encKeyInput.value.trim();
    const file = fileInput.files[0];
    if (!file) return;

    showProgress("Reading file...");
    hideError();
    btnLoad.disabled = true;

    // Terminate previous worker if any
    if (worker) worker.terminate();

    worker = new Worker("decrypt-worker.js");
    worker.onmessage = onWorkerMessage;
    worker.onerror = (e) => {
      showError(`Worker error: ${e.message}`);
      hideProgress();
      btnLoad.disabled = false;
    };

    // Read file and send to worker
    try {
      const arrayBuffer = await file.arrayBuffer();
      worker.postMessage(
        { type: "decrypt", file: arrayBuffer, key, fileName: file.name },
        [arrayBuffer] // Transfer ownership for efficiency
      );
    } catch (err) {
      showError(`Failed to read file: ${err.message}`);
      hideProgress();
      btnLoad.disabled = false;
    }
  }

  function onWorkerMessage(e) {
    const msg = e.data;

    if (msg.type === "progress") {
      showProgress(`${msg.stage}: ${msg.detail}`);
    }

    if (msg.type === "index") {
      allChats = msg.chats;
      selectedIds.clear();
      restoredIds.clear();
      dbStatusMap = {};
      expandedId = null;
      currentPage = 1;
      currentTagFilter = 'all';
      tagFilter.value = 'all';

      hideProgress();
      statsText.textContent = `${allChats.length} chats found (${msg.totalItems} total items in backup)`;
      chatSection.classList.remove("hidden");
      restoreFooter.classList.remove("hidden");
      searchInput.value = "";

      // Check IndexedDB status for all chats before rendering
      checkDbStatus().then(() => {
        applyFilters();
        renderChatList();
        updateSelectionUI();
      });
    }

    if (msg.type === "chatData") {
      renderChatDetail(msg.id, msg.data);
    }

    if (msg.type === "restoreData") {
      performRestore(msg.chats);
    }

    if (msg.type === "error") {
      showError(msg.message);
      hideProgress();
      btnLoad.disabled = false;
    }
  }

  // --- Clear / Reset ---

  function resetExtension() {
    clearBackup();
    hideTabWarning();
    // Re-check active tab
    checkActiveTab();
  }

  function clearBackup() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    allChats = [];
    filteredChats = [];
    selectedIds.clear();
    restoredIds.clear();
    expandedId = null;
    currentPage = 1;

    chatSection.classList.add("hidden");
    restoreFooter.classList.add("hidden");
    chatList.innerHTML = "";
    pagination.innerHTML = "";
    encKeyInput.value = "";
    fileInput.value = "";
    btnLoad.disabled = true;
    dbStatusMap = {};
    currentTagFilter = 'all';
    tagFilter.value = 'all';
    hideError();
    hideProgress();
  }

  // --- Search & Filter ---

  function onSearch() {
    currentPage = 1;
    applyFilters();
    renderChatList();
    updateSelectionUI();
  }

  function onTagFilter() {
    currentTagFilter = tagFilter.value;
    currentPage = 1;
    applyFilters();
    renderChatList();
    updateSelectionUI();
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    filteredChats = allChats.filter((c) => {
      // Tag filter
      const status = getDisplayStatus(c.id);
      if (currentTagFilter !== 'all' && status !== currentTagFilter) return false;

      // Text search
      if (query) {
        return (
          c.title.toLowerCase().includes(query) ||
          c.preview.toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }

  function getDisplayStatus(chatId) {
    if (restoredIds.has(chatId)) return 'restored';
    return dbStatusMap[chatId] || 'not-found';
  }

  function renderStatusTag(chatId) {
    const status = getDisplayStatus(chatId);
    const labels = {
      'existing':      'Existing',
      'backup-newer':  'Backup is newer',
      'not-found':     'Not in browser',
      'restored':      'Restored',
    };
    const tips = {
      'existing':      'This chat is already in the browser with the same or newer messages',
      'backup-newer':  'The backup contains newer messages than what\u2019s in the browser',
      'not-found':     'This chat does not exist in the browser yet',
      'restored':      'This chat was restored during this session',
    };
    const classes = {
      'existing':      'tag-existing',
      'backup-newer':  'tag-backup-newer',
      'not-found':     'tag-not-found',
      'restored':      'tag-restored',
    };
    return `<span class="tag ${classes[status]}" title="${tips[status]}">${labels[status]}</span>`;
  }

  /**
   * Query the active TypingMind tab's IndexedDB for all CHAT_* keys
   * and compare updatedAt timestamps to determine status.
   */
  async function checkDbStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readChatKeysFromIndexedDB,
      });

      const dbChats = results?.[0]?.result;
      if (!dbChats || typeof dbChats !== 'object') return;

      for (const chat of allChats) {
        // Normalize key: ensure CHAT_ prefix
        let dbKey = chat.id;
        if (dbKey && !dbKey.startsWith("CHAT_")) {
          dbKey = `CHAT_${dbKey}`;
        }

        const dbEntry = dbChats[dbKey];
        if (!dbEntry) {
          dbStatusMap[chat.id] = 'not-found';
        } else if (chat.updatedAt && dbEntry.updatedAt) {
          // Compare timestamps — normalize both to ms
          const backupTs = normalizeTs(chat.updatedAt);
          const dbTs = normalizeTs(dbEntry.updatedAt);
          if (backupTs === dbTs) {
            dbStatusMap[chat.id] = 'existing';
          } else if (backupTs > dbTs) {
            // Timestamp says backup is newer — verify with message-level check
            // to eliminate false positives from metadata-only changes
            if (messagesMatch(chat, dbEntry)) {
              dbStatusMap[chat.id] = 'existing';     // same messages, metadata-only diff
            } else {
              dbStatusMap[chat.id] = 'backup-newer';  // backup has actual message updates
            }
          } else {
            dbStatusMap[chat.id] = 'existing';       // browser already has newer version
          }
        } else {
          // Can't compare timestamps, treat as existing
          dbStatusMap[chat.id] = 'existing';
        }
      }
    } catch (err) {
      console.warn('[LBM] Could not check IndexedDB status:', err);
      // Silently fail — all chats default to 'not-found'
    }
  }

  function normalizeTs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return toMs(val);
    const n = Number(val);
    if (!isNaN(n)) return toMs(n);
    const d = new Date(val).getTime();
    return isNaN(d) ? 0 : d;
  }

  /** Ensure a numeric timestamp is in milliseconds (not seconds). */
  function toMs(n) {
    // Timestamps below 1e12 are almost certainly in seconds
    // (1e12 ms ≈ Mar 2001; 1e12 s ≈ year 33658)
    return n > 0 && n < 1e12 ? n * 1000 : n;
  }

  /**
   * Compare backup chat index entry against the DB entry to determine
   * if the actual messages are the same. Uses message count + last message
   * fingerprint for an efficient check without full content diffing.
   *
   * @param {object} backupChat  - Index entry from allChats (has messageCount, id)
   * @param {object} dbEntry     - From readChatKeysFromIndexedDB (has messageCount, lastMsgFingerprint)
   * @returns {boolean} true if messages appear identical
   */
  function messagesMatch(backupChat, dbEntry) {
    // If DB didn't provide message data, we can't verify — assume different
    if (typeof dbEntry.messageCount !== 'number') return false;

    // Different message counts = definitely different content
    if (backupChat.messageCount !== dbEntry.messageCount) return false;

    // Both have zero messages — they match
    if (backupChat.messageCount === 0) return true;

    // Compare last message fingerprint (computed at index time by the worker)
    if (!backupChat.lastMsgFingerprint || !dbEntry.lastMsgFingerprint) return false;

    return backupChat.lastMsgFingerprint === dbEntry.lastMsgFingerprint;
  }

  /**
   * Injected into the TypingMind page to read all CHAT_* entries and
   * return a map of key → { updatedAt, messageCount, lastMsgFingerprint }.
   * The fingerprint is a lightweight hash of the last message's role + content
   * length + first 100 chars, used to detect false-positive "backup newer" tags.
   */
  function readChatKeysFromIndexedDB() {
    return new Promise((resolve) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => resolve({});
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("keyval")) {
          resolve({});
          return;
        }
        const tx = db.transaction("keyval", "readonly");
        const store = tx.objectStore("keyval");
        const getAll = store.getAll();
        const getAllKeys = store.getAllKeys();

        const result = {};
        tx.oncomplete = () => {
          const keys = getAllKeys.result || [];
          const values = getAll.result || [];
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (typeof key === 'string' && key.startsWith('CHAT_')) {
              const val = values[i];
              const msgs = val?.messages || val?.data?.messages || [];
              const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
              // Convert timestamps to numbers BEFORE returning — Date objects
              // don't survive chrome.scripting.executeScript serialization
              const rawTs = val?.updatedAt || val?.updated_at || null;
              result[key] = {
                updatedAt: tsToNumber(rawTs),
                messageCount: msgs.length,
                lastMsgFingerprint: lastMsg ? msgFingerprint(lastMsg) : null,
              };
            }
          }
          resolve(result);
        };
        tx.onerror = () => resolve({});
      };
      request.onupgradeneeded = () => resolve({});
    });

    /** Convert any timestamp (Date object, number, string) to a plain number (ms). */
    function tsToNumber(ts) {
      if (ts == null) return null;
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number') return ts;
      const n = Number(ts);
      if (!isNaN(n)) return n;
      const d = Date.parse(ts);
      return isNaN(d) ? null : d;
    }

    function msgFingerprint(msg) {
      const role = msg.role || msg.type || '';
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content || '');
      return role + ':' + content.length + ':' + content.substring(0, 100);
    }
  }

  // --- Render chat list ---

  function renderChatList() {
    const totalPages = Math.max(1, Math.ceil(filteredChats.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, filteredChats.length);
    const pageChats = filteredChats.slice(start, end);

    chatList.innerHTML = "";

    if (pageChats.length === 0) {
      chatList.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:24px;">No chats found.</p>`;
      pagination.innerHTML = "";
      return;
    }

    for (const chat of pageChats) {
      chatList.appendChild(createChatCard(chat));
    }

    renderPagination(totalPages);
    updateSelectAllCheckbox();
  }

  function createChatCard(chat) {
    const card = document.createElement("div");
    card.className = "chat-card";
    card.dataset.id = chat.id;

    if (restoredIds.has(chat.id)) card.classList.add("restored");
    if (expandedId === chat.id) card.classList.add("expanded");

    const isSelected = selectedIds.has(chat.id);
    const isRestored = restoredIds.has(chat.id);

    const date = chat.createdAt
      ? new Date(chat.createdAt).toLocaleDateString(undefined, {
          year: "numeric", month: "short", day: "numeric",
        })
      : "Unknown date";

    card.innerHTML = `
      <div class="chat-card-header">
        <input type="checkbox" ${isSelected ? "checked" : ""} ${isRestored ? "disabled" : ""} data-id="${chat.id}">
        <div class="chat-card-info">
          <div class="chat-title" title="${escapeHtml(chat.title)}">${escapeHtml(chat.title)}</div>
          <div class="chat-meta">
            <span>${date}</span>
            <span>${chat.messageCount} message${chat.messageCount !== 1 ? "s" : ""}</span>
            ${renderStatusTag(chat.id)}
          </div>
          ${chat.preview ? `<div class="chat-preview">${escapeHtml(chat.preview)}</div>` : ""}
        </div>
        <span class="chat-expand-icon">▼</span>
      </div>
      <div class="chat-detail">
        <div class="detail-loading">Loading conversation...</div>
      </div>
    `;

    // Checkbox click (stop propagation so it doesn't toggle expand)
    const cb = card.querySelector('input[type="checkbox"]');
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) {
        selectedIds.add(chat.id);
      } else {
        selectedIds.delete(chat.id);
      }
      updateSelectionUI();
    });

    // Card header click → toggle expand
    const header = card.querySelector(".chat-card-header");
    header.addEventListener("click", () => toggleExpand(chat.id, card));

    return card;
  }

  // --- Expand / Collapse ---

  function toggleExpand(chatId, card) {
    if (expandedId === chatId) {
      expandedId = null;
      card.classList.remove("expanded");
      return;
    }

    // Collapse previous
    const prev = chatList.querySelector(".chat-card.expanded");
    if (prev) prev.classList.remove("expanded");

    expandedId = chatId;
    card.classList.add("expanded");

    // Load chat detail from worker
    const detail = card.querySelector(".chat-detail");
    detail.innerHTML = `<div class="detail-loading">Loading conversation...</div>`;
    worker.postMessage({ type: "getChat", id: chatId });
  }

  function renderChatDetail(chatId, chatData) {
    const card = chatList.querySelector(`[data-id="${chatId}"]`);
    if (!card) return;

    const detail = card.querySelector(".chat-detail");
    const messages = chatData?.messages || chatData?.data?.messages || [];

    if (messages.length === 0) {
      detail.innerHTML = `<div class="detail-loading">No messages in this chat.</div>`;
      return;
    }

    detail.innerHTML = "";

    // Render up to 100 messages (for performance)
    const limit = Math.min(messages.length, 100);
    for (let i = 0; i < limit; i++) {
      detail.appendChild(createMessageEl(messages[i]));
    }

    if (messages.length > limit) {
      const more = document.createElement("div");
      more.className = "detail-loading";
      more.textContent = `... and ${messages.length - limit} more messages`;
      detail.appendChild(more);
    }
  }

  function createMessageEl(msg) {
    const role = msg.role || "unknown";
    const el = document.createElement("div");
    el.className = `message message-${role === "user" ? "user" : role === "assistant" ? "assistant" : "system"}`;

    const roleLabel = document.createElement("div");
    roleLabel.className = "message-role";
    roleLabel.textContent = role;

    const content = document.createElement("div");
    content.className = "message-content";

    const rawContent = msg.content || msg.text || "";

    if (typeof rawContent === "string") {
      content.innerHTML = renderContent(rawContent);
    } else if (Array.isArray(rawContent)) {
      // Multi-part message (text + images)
      for (const part of rawContent) {
        if (typeof part === "string") {
          const p = document.createElement("div");
          p.innerHTML = renderContent(part);
          content.appendChild(p);
        } else if (part.type === "text") {
          const p = document.createElement("div");
          p.innerHTML = renderContent(part.text || "");
          content.appendChild(p);
        } else if (part.type === "image_url" && part.image_url?.url) {
          const img = document.createElement("img");
          img.src = part.image_url.url;
          img.alt = "Image";
          img.loading = "lazy";
          content.appendChild(img);
        }
      }
    }

    el.appendChild(roleLabel);
    el.appendChild(content);
    return el;
  }

  function renderContent(text) {
    // Basic rendering: escape HTML, convert newlines, detect code blocks
    let html = escapeHtml(text);

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold (**...**)
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Newlines
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  // --- Pagination ---

  function renderPagination(totalPages) {
    pagination.innerHTML = "";
    if (totalPages <= 1) return;

    // Previous
    const prev = createPageBtn("◀", currentPage > 1, () => {
      currentPage--;
      renderChatList();
    });
    pagination.appendChild(prev);

    // Page numbers (show max 7 pages with ellipsis)
    const pages = getPaginationRange(currentPage, totalPages, 7);
    for (const p of pages) {
      if (p === "...") {
        const ellipsis = document.createElement("span");
        ellipsis.textContent = "…";
        ellipsis.style.padding = "4px 6px";
        ellipsis.style.color = "var(--text-muted)";
        pagination.appendChild(ellipsis);
      } else {
        const btn = createPageBtn(p, true, () => {
          currentPage = p;
          renderChatList();
        });
        if (p === currentPage) btn.classList.add("active");
        pagination.appendChild(btn);
      }
    }

    // Next
    const next = createPageBtn("▶", currentPage < totalPages, () => {
      currentPage++;
      renderChatList();
    });
    pagination.appendChild(next);
  }

  function createPageBtn(label, enabled, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.disabled = !enabled;
    if (enabled) btn.addEventListener("click", onClick);
    return btn;
  }

  function getPaginationRange(current, total, maxVisible) {
    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [];
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(2, current - half);
    let end = Math.min(total - 1, current + half);

    if (current <= half + 1) {
      end = Math.min(maxVisible - 1, total - 1);
    }
    if (current >= total - half) {
      start = Math.max(2, total - maxVisible + 2);
    }

    pages.push(1);
    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("...");
    pages.push(total);

    return pages;
  }

  // --- Selection ---

  function onSelectAll() {
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, filteredChats.length);
    const pageChats = filteredChats.slice(start, end);

    if (selectAllCb.checked) {
      for (const c of pageChats) {
        if (!restoredIds.has(c.id)) selectedIds.add(c.id);
      }
    } else {
      for (const c of pageChats) {
        selectedIds.delete(c.id);
      }
    }

    // Update checkboxes in DOM
    chatList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      if (!cb.disabled) {
        cb.checked = selectedIds.has(cb.dataset.id);
      }
    });

    updateSelectionUI();
  }

  function updateSelectAllCheckbox() {
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, filteredChats.length);
    const pageChats = filteredChats.slice(start, end);
    const selectableOnPage = pageChats.filter((c) => !restoredIds.has(c.id));
    const selectedOnPage = selectableOnPage.filter((c) => selectedIds.has(c.id));

    selectAllCb.checked =
      selectableOnPage.length > 0 &&
      selectedOnPage.length === selectableOnPage.length;
    selectAllCb.indeterminate =
      selectedOnPage.length > 0 &&
      selectedOnPage.length < selectableOnPage.length;
  }

  function updateSelectionUI() {
    const count = selectedIds.size;
    restoreCount.textContent = count;
    btnRestore.disabled = count === 0;
    selectionCount.textContent = count > 0 ? `${count} selected` : "";
    updateSelectAllCheckbox();
  }

  // --- Restore ---

  async function restoreSelected() {
    if (selectedIds.size === 0) return;

    const ids = [...selectedIds];
    btnRestore.disabled = true;
    btnRestore.textContent = `Restoring ${ids.length} chat${ids.length > 1 ? "s" : ""}...`;

    // Request full chat data from worker
    worker.postMessage({ type: "getChatsForRestore", ids });
  }

  async function performRestore(chats) {
    try {
      // Get the active TypingMind tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showError("No active tab found. Please ensure TypingMind is open.");
        resetRestoreButton();
        return;
      }

      // Inject restore function into the page and execute
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: writeChatsToIndexedDB,
        args: [chats],
      });

      const result = results?.[0]?.result;
      if (result?.success) {
        // Mark as restored
        for (const chat of chats) {
          restoredIds.add(chat.id);
          selectedIds.delete(chat.id);
        }
        applyFilters();
        renderChatList();
        updateSelectionUI();
        resetRestoreButton();
      } else {
        showError(result?.error || "Restore failed. Unknown error.");
        resetRestoreButton();
      }
    } catch (err) {
      showError(`Restore failed: ${err.message}`);
      resetRestoreButton();
    }
  }

  function resetRestoreButton() {
    btnRestore.innerHTML = `Restore Selected (<span id="restore-count">${selectedIds.size}</span>)`;
    btnRestore.disabled = selectedIds.size === 0;
    // Re-bind ref since innerHTML replaced the span
    // restoreCount is now stale, so we query again
  }

  /**
   * This function is injected into the TypingMind page via chrome.scripting.executeScript.
   * It runs in the page's context and writes chat objects to IndexedDB.
   *
   * Each chat has { id, data } where:
   *   - id: the key used in our index (could be "CHAT_xxx" or just "xxx")
   *   - data: the full chat object from the backup
   *
   * TypingMind stores chats in IndexedDB keyval-store with key = "CHAT_<id>"
   */
  function writeChatsToIndexedDB(chats) {
    return new Promise((resolve) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () =>
        resolve({ success: false, error: `Failed to open IndexedDB: ${request.error?.message}` });

      request.onsuccess = () => {
        const db = request.result;

        // Check if 'keyval' object store exists
        if (!db.objectStoreNames.contains("keyval")) {
          resolve({ success: false, error: "IndexedDB 'keyval' store not found. Is this a TypingMind page?" });
          return;
        }

        const tx = db.transaction("keyval", "readwrite");
        const store = tx.objectStore("keyval");

        let written = 0;
        for (const chat of chats) {
          try {
            // Determine the correct IndexedDB key
            // TypingMind uses "CHAT_<id>" as the key in keyval store
            let dbKey = chat.id;
            if (dbKey && !dbKey.startsWith("CHAT_")) {
              dbKey = `CHAT_${dbKey}`;
            }

            // The value stored is the full chat object
            // Remove internal/legacy fields that should not be imported
            const data = { ...chat.data };
            delete data._backupKey;
            delete data.messagesArray;  // legacy duplicate of messages — never import

            // Strip duplicate messagesArray to avoid DB bloat
            // TypingMind legacy exports often contain both messages and messagesArray
            // with identical content — keep only messages
            if (data.messages && data.messagesArray) {
              delete data.messagesArray;
            } else if (!data.messages && data.messagesArray) {
              // messagesArray is the only source — promote it to messages
              data.messages = data.messagesArray;
              delete data.messagesArray;
            }

            // Convert timestamp fields to Date objects to match TypingMind's
            // native IndexedDB storage format
            if (data.updatedAt != null) {
              data.updatedAt = numToDate(data.updatedAt);
            }
            if (data.createdAt != null) {
              data.createdAt = numToDate(data.createdAt);
            }

            store.put(data, dbKey);
            written++;
          } catch (e) {
            console.error(`[TCS-LBM] Failed to write ${chat.id}:`, e);
          }
        }

        tx.oncomplete = () => resolve({ success: true, count: written });
        tx.onerror = () =>
          resolve({ success: false, error: `Transaction failed: ${tx.error?.message}` });
      };

      // If DB needs upgrading (shouldn't happen on TypingMind page)
      request.onupgradeneeded = () => {
        resolve({ success: false, error: "IndexedDB needs upgrade — unexpected on a TypingMind page." });
      };
    });

    /** Convert a numeric/string timestamp to a Date object for IndexedDB storage. */
    function numToDate(val) {
      if (val instanceof Date) return val;
      if (typeof val === 'number') {
        // Normalize seconds → ms if needed
        const ms = val > 0 && val < 1e12 ? val * 1000 : val;
        return new Date(ms);
      }
      if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? val : d;  // return original if unparseable
      }
      return val;
    }
  }

  // --- UI helpers ---

  function showProgress(text) {
    progressArea.classList.remove("hidden");
    progressText.textContent = text;
    errorArea.classList.add("hidden");
  }

  function hideProgress() {
    progressArea.classList.add("hidden");
  }

  function showError(text) {
    errorArea.classList.remove("hidden");
    errorText.textContent = text;
  }

  function hideError() {
    errorArea.classList.add("hidden");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }
})();

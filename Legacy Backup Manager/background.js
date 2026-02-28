/*
  Background service worker for TypingMind Legacy Backup Manager.
  - Checks if the active tab is a TypingMind instance (via web app manifest)
  - Controls side panel availability
*/

console.log("[TCS-LBM] Background service worker loaded");

// Make clicking the extension icon open/close the side panel directly
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log("[TCS-LBM] Panel behavior set: openPanelOnActionClick"))
  .catch((err) => console.error("[TCS-LBM] setPanelBehavior failed:", err));

/**
 * Checks if the given tab is running a TypingMind instance by
 * fetching and inspecting the web app manifest's name field.
 */
async function checkIfTypingMind(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          const link = document.querySelector('link[rel="manifest"]');
          if (!link) {
            console.log("[TCS-LBM] No manifest link found");
            return false;
          }
          console.log("[TCS-LBM] Found manifest link:", link.href);
          const resp = await fetch(link.href);
          if (!resp.ok) {
            console.log("[TCS-LBM] Manifest fetch failed:", resp.status);
            return false;
          }
          const manifest = await resp.json();
          console.log("[TCS-LBM] Manifest name:", manifest.name);
          return manifest.name === "TypingMind";
        } catch (e) {
          console.error("[TCS-LBM] Error checking manifest:", e);
          return false;
        }
      },
    });
    return results?.[0]?.result === true;
  } catch (e) {
    console.error("[TCS-LBM] executeScript failed:", e);
    return false;
  }
}

// When a tab finishes loading, proactively check and enable/disable the panel
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    try {
      const isTypingMind = await checkIfTypingMind(tabId);
      await chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: isTypingMind,
      });
    } catch {
      // Tab may have been closed or is a restricted page
    }
  }
});

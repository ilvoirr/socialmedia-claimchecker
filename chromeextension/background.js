// background.js — Service Worker for Claim Radar Extension

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── 1. Popup clicked "Snip Screen" ──────────────────────────────────
  if (msg.type === "START_SNIP") {
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        console.error("Capture failed:", chrome.runtime.lastError?.message);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;

        // ✅ THE FIX: inject content.js on-demand instead of relying on
        // manifest content_scripts (which only run on page load after install)
        chrome.scripting.executeScript(
          { target: { tabId }, files: ["content.js"] },
          () => {
            if (chrome.runtime.lastError) {
              console.error("Injection failed:", chrome.runtime.lastError.message);
              return;
            }
            // Give script 80ms to initialise, then send the screenshot
            setTimeout(() => {
              chrome.tabs.sendMessage(
                tabId,
                { type: "CLAIM_RADAR_SNIP", screenshotUrl: dataUrl },
                (res) => {
                  if (chrome.runtime.lastError) {
                    console.error("sendMessage failed:", chrome.runtime.lastError.message);
                  }
                }
              );
            }, 80);
          }
        );
      });
    });
    return true;
  }

  // ── 2. Content script finished cropping — store + reopen popup ──────
  if (msg.type === "SNIP_COMPLETE") {
    chrome.storage.session.set(
      { cr_snipImage: msg.croppedDataUrl, cr_snipState: "complete" },
      () => {
        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#000000" });
        try {
          chrome.action.openPopup();
        } catch (_) {
          // Chrome < 127: user clicks the icon manually to reopen
        }
      }
    );
    sendResponse({ ok: true });
    return true;
  }

  // ── 3. Popup opened — clear badge ───────────────────────────────────
  if (msg.type === "POPUP_READY") {
    chrome.action.setBadgeText({ text: "" });
  }
});
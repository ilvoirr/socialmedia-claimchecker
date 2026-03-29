// content.js — Screen Snipping Overlay for Claim Radar Extension

if (window.__claimRadarInjected) {
  // already injected — skip
} else {
  window.__claimRadarInjected = true;

  (function () {
    'use strict';

    let overlay = null, screenshot = null, isSelecting = false;
    let startX, startY, endX, endY, selectionBox;

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'CLAIM_RADAR_SNIP') {
        screenshot = msg.screenshotUrl;
        showSnipOverlay();
        sendResponse({ success: true });
      }
    });

    function showSnipOverlay() {
      if (overlay) return;

      overlay = document.createElement('div');
      overlay.setAttribute('tabindex', '-1');  // ← THE KEY FIX for ESC to work
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.45);
        z-index: 2147483647; cursor: crosshair;
        user-select: none; outline: none;
      `;

      const banner = document.createElement('div');
      banner.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #000; color: #fff; padding: 10px 24px;
        font-family: ui-monospace, monospace; font-size: 12px;
        font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
        z-index: 2147483648; pointer-events: none; white-space: nowrap;
        box-shadow: 4px 4px 0 rgba(255,255,255,0.2);
      `;
      banner.textContent = 'Drag to select area  ·  ESC to cancel';
      overlay.appendChild(banner);

      selectionBox = document.createElement('div');
      selectionBox.style.cssText = `
        position: absolute; border: 2px dashed #fff;
        background: rgba(255,255,255,0.08);
        pointer-events: none; display: none;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
      `;
      overlay.appendChild(selectionBox);
      document.body.appendChild(overlay);

      overlay.addEventListener('mousedown', handleMouseDown);
      overlay.addEventListener('mousemove', handleMouseMove);
      overlay.addEventListener('mouseup',   handleMouseUp);
      overlay.addEventListener('keydown',   handleKeyDown);
      document.addEventListener('keydown',  handleKeyDownDoc);
      overlay.focus();
    }

    function handleMouseDown(e) {
      if (e.button !== 0) return;
      isSelecting = true;
      startX = endX = e.clientX;
      startY = endY = e.clientY;
      selectionBox.style.cssText += '; display:block; left:' + startX + 'px; top:' + startY + 'px; width:0; height:0';
    }

    function handleMouseMove(e) {
      if (!isSelecting) return;
      endX = e.clientX; endY = e.clientY;
      const l = Math.min(startX, endX), t = Math.min(startY, endY);
      const w = Math.abs(endX - startX), h = Math.abs(endY - startY);
      selectionBox.style.left = l + 'px'; selectionBox.style.top    = t + 'px';
      selectionBox.style.width = w + 'px'; selectionBox.style.height = h + 'px';
    }

    function handleMouseUp(e) {
      if (!isSelecting) return;
      isSelecting = false;
      const l = Math.min(startX, endX), t = Math.min(startY, endY);
      const w = Math.abs(endX - startX), h = Math.abs(endY - startY);
      if (w < 10 || h < 10) { cleanup(); return; }
      cropAndSend(l, t, w, h);
    }

    function handleKeyDown(e)    { if (e.key === 'Escape') { e.stopPropagation(); cleanup(); } }
    function handleKeyDownDoc(e) { if (e.key === 'Escape' && overlay) cleanup(); }

    function cropAndSend(x, y, width, height) {
      if (!screenshot) { cleanup(); return; }
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        const sx = img.width / window.innerWidth;
        const sy = img.height / window.innerHeight;
        canvas.width = width; canvas.height = height;
        ctx.drawImage(img, x*sx, y*sy, width*sx, height*sy, 0, 0, width, height);
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // ✅ Send to background.js — background does the storage + popup open
        chrome.runtime.sendMessage({ type: "SNIP_COMPLETE", croppedDataUrl }, () => cleanup());
      };
      img.onerror = () => cleanup();
      img.src = screenshot;
    }

    function cleanup() {
      document.removeEventListener('keydown', handleKeyDownDoc);
      if (overlay) { overlay.remove(); overlay = null; }
      selectionBox = null; screenshot = null; isSelecting = false;
    }
  })();
}
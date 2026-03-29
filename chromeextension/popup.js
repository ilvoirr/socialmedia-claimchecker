// popup.js — ClaimRadar Extension Popup Logic

const API_URL = "https://socialmedia-claimchecker.vercel.app/api/verify";

// ── Agent config ─────────────────────────────────────────────────────
const AGENT_STYLES = {
  INTEL_CRAWLER:   { badge: "badge-black",   card: "card-normal" },
  DEVILS_ADVOCATE: { badge: "badge-zinc",    card: "card-normal" },
  VERDICT_ENGINE:  { badge: "badge-outline", card: "card-verdict-agent" },
};

const AGENT_STATUS = {
  INTEL_CRAWLER:   "thinking",
  DEVILS_ADVOCATE: "thinking",
  VERDICT_ENGINE:  "deliberating",
};

const VERDICT_META = {
  SUPPORTED: { label: "↳ THE CLAIM IS TRUE",     sub: "Evidence corroborates the assertion" },
  REFUTED:   { label: "↳ THE CLAIM IS FALSE",    sub: "Evidence contradicts the assertion" },
  ERROR:     { label: "↳ PROCESS FAILED",        sub: "System encountered a critical fault" },
  UNCERTAIN: { label: "↳ INSUFFICIENT EVIDENCE", sub: "Claim could not be conclusively verified" },
};

// ── State ─────────────────────────────────────────────────────────────
let inputData     = "";
let image         = null;
let isProcessing  = false;
let streamText    = "";
let thinkingAgent = null;
let turnCount     = 0;
let blockCount    = 0;

// ── DOM Refs ──────────────────────────────────────────────────────────
const phaseInput       = document.getElementById("phase-input");
const phaseProcessing  = document.getElementById("phase-processing");
const phaseVerdict     = document.getElementById("phase-verdict");
const textarea         = document.getElementById("claim-input");
const charCountEl      = document.getElementById("char-count");
const imagePreview     = document.getElementById("image-preview");
const previewImg       = document.getElementById("preview-img");
const analyzeBtn       = document.getElementById("analyze-btn");
const snipBtn          = document.getElementById("snip-btn");
const attachBtn        = document.getElementById("attach-btn");
const fileInput        = document.getElementById("file-input");
const analyzeIndicator = document.getElementById("analyze-indicator");
const dialogueArea     = document.getElementById("dialogue-area");
const progressFill     = document.getElementById("progress-fill");
const progressRight    = document.getElementById("progress-right");
const turnCountLabel   = document.getElementById("turn-count-label");
const thinkingRow      = document.getElementById("thinking-row");
const thinkingLabel    = document.getElementById("thinking-label");
const scrollContainer  = document.getElementById("scroll-container");
const verdictCard      = document.getElementById("verdict-card");
const verdictTextEl    = document.getElementById("verdict-text");
const verdictMetaEl    = document.getElementById("verdict-meta");
const confidenceVal    = document.getElementById("confidence-val");
const confidenceBar    = document.getElementById("confidence-bar");
const summaryTextEl    = document.getElementById("summary-text");
const verdictSub       = document.getElementById("verdict-sub");
const newQueryBtn      = document.getElementById("new-query-btn");

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  chrome.runtime.sendMessage({ type: "POPUP_READY" });

  try {
    const result = await chrome.storage.session.get(["cr_snipImage", "cr_snipState"]);
    if (result.cr_snipState === "complete" && result.cr_snipImage) {
      applyImage(result.cr_snipImage);
      await chrome.storage.session.set({ cr_snipImage: null, cr_snipState: null });
    }
  } catch (e) {}

  showPhase("input");
});

// ── Phase Management ──────────────────────────────────────────────────
function showPhase(phase) {
  phaseInput.style.display       = phase === "input"      ? "flex" : "none";
  phaseProcessing.style.display  = phase === "processing" ? "flex" : "none";
  phaseVerdict.style.display     = phase === "verdict"    ? "flex" : "none";
  analyzeIndicator.style.display = isProcessing           ? "flex" : "none";
}

// ── Image Helpers ─────────────────────────────────────────────────────
function applyImage(dataUrl) {
  image = dataUrl;
  previewImg.src = dataUrl;
  imagePreview.style.display = "flex";
  attachBtn.textContent = "⊕ Change Image";
  updateBtn();
}

function clearImage() {
  image = null;
  imagePreview.style.display = "none";
  previewImg.src = "";
  attachBtn.textContent = "⊕ Image";
  updateBtn();
}

function processFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 800;
      let { width, height } = img;
      if (width > height) { if (width > MAX) { height = height * MAX / width; width = MAX; } }
      else { if (height > MAX) { width = width * MAX / height; height = MAX; } }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      applyImage(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function updateBtn() {
  analyzeBtn.disabled = !inputData.trim() && !image;
}

// ── Event Listeners ───────────────────────────────────────────────────
textarea.addEventListener("input", () => {
  inputData = textarea.value;
  charCountEl.textContent = inputData.length > 0 ? inputData.length : "";
  updateBtn();
});

textarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!analyzeBtn.disabled) executeAnalysis();
  }
});

textarea.addEventListener("paste", (e) => {
  const items = Array.from(e.clipboardData.items);
  const imgItem = items.find(i => i.type.startsWith("image/"));
  if (imgItem) {
    e.preventDefault();
    processFile(imgItem.getAsFile());
  }
});

attachBtn.addEventListener("click",   () => fileInput.click());
fileInput.addEventListener("change",  (e) => { processFile(e.target.files?.[0]); fileInput.value = ""; });
document.getElementById("remove-image-btn").addEventListener("click", clearImage);
analyzeBtn.addEventListener("click",  executeAnalysis);

snipBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_SNIP" }, (response) => {
    if (chrome.runtime.lastError) console.error("Failed to send START_SNIP:", chrome.runtime.lastError);
  });
  window.close();
});

newQueryBtn.addEventListener("click", resetAll);

// ── Reset ─────────────────────────────────────────────────────────────
function resetAll() {
  inputData = ""; image = null; isProcessing = false;
  streamText = ""; thinkingAgent = null; turnCount = 0; blockCount = 0;
  textarea.value = "";
  charCountEl.textContent = "";
  clearImage();
  dialogueArea.innerHTML = "";
  thinkingRow.style.display = "none";
  progressRight.style.display = "none";
  progressFill.style.width = "0%";
  updateBtn();
  showPhase("input");
}

// ── Analysis ──────────────────────────────────────────────────────────
async function executeAnalysis() {
  if (!inputData.trim() && !image) return;

  isProcessing = true;
  streamText = ""; turnCount = 0; blockCount = 0;
  dialogueArea.innerHTML = "";
  thinkingRow.style.display = "none";
  progressRight.style.display = "none";
  progressFill.style.width = "0%";

  showPhase("processing");
  analyzeIndicator.style.display = "flex";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: inputData, image }),
    });

    if (!res.body) throw new Error("No stream body");

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false, buffer = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.replace("data: ", ""));
            handleEvent(data);
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    appendStream("\n\n[SYSTEM]: Connection interrupted.");
    endProcessing();
  }
}

function handleEvent(data) {
  if (data.type === "thinking") {
    if (thinkingAgent !== null) hideThinking();
    appendStream(data.content);

  } else if (data.type === "agent_thinking") {
    if (data.agent) setTurnCount(turnCount + 1);
    showThinking(data.agent);

  } else if (data.type === "final") {
    hideThinking();
    renderVerdict(data);
    endProcessing();
    showPhase("verdict");

  } else if (data.type === "error") {
    hideThinking();
    renderVerdict({ verdict: "ERROR", confidence: 0, summary: data.message || "A system fault occurred." });
    endProcessing();
    showPhase("verdict");
  }
}

function endProcessing() {
  isProcessing = false;
  analyzeIndicator.style.display = "none";
}

// ── Streaming dialogue ────────────────────────────────────────────────
function appendStream(text) {
  streamText += text;
  renderDialogue();
}

// ─────────────────────────────────────────────────────────────────────
//  THE FIX: freeze completed blocks IN PLACE instead of appending them
//  at the bottom. This fixes both the ordering bug and the instant-
//  render bug for subsequent agents.
//
//  Root cause of both bugs was the old renderDialogue doing:
//    1. appendChild(makeBlock(blocks[i]))  ← appended AFTER the liveEl
//    2. reuse the same liveEl for next agent ← looked "instant" because
//       it already contained the previous agent's full text
//
//  Now: when a block completes, we call freezeBlock() which strips the
//  "dialogue-live" class from the existing element (leaving it exactly
//  where it is in the DOM) and locks its final styling. A new, empty
//  liveEl is then created and appended for the next streaming block.
// ─────────────────────────────────────────────────────────────────────
function renderDialogue() {
  const blocks = streamText.split("\n\n").filter(b => b.trim());
  if (blocks.length === 0) return;

  const completedUpto = blocks.length - 1;

  for (let i = blockCount; i < completedUpto; i++) {
    const liveEl = dialogueArea.querySelector(".dialogue-live");
    if (liveEl) {
      // Freeze this element exactly where it sits — no re-appending.
      freezeBlock(liveEl, blocks[i]);
    } else {
      // No live element exists yet (edge case: first batch of completed blocks)
      const el = document.createElement("div");
      applyBlockStyle(el, blocks[i], false);
      dialogueArea.appendChild(el);
    }
    blockCount++;
  }

  // Create or update the live element for the currently-streaming block
  let liveEl = dialogueArea.querySelector(".dialogue-live");
  if (!liveEl) {
    liveEl = document.createElement("div");
    dialogueArea.appendChild(liveEl);
  }
  applyBlockStyle(liveEl, blocks[blocks.length - 1], true);

  scrollContainer.scrollTop = scrollContainer.scrollHeight;
}

// Applies block styling to any element. isLive=true keeps "dialogue-live"
// class so querySelector can find it; isLive=false finalises the element.
function applyBlockStyle(el, block, isLive) {
  const livePrefix = isLive ? "dialogue-live " : "";

  if (block.startsWith("◦") || block.startsWith("[SYSTEM]")) {
    el.className = livePrefix + "dialogue-system";
    el.innerHTML = `<span class="sys-dot"></span><span>${esc(block.replace(/^◦+\s*/, "").replace("[SYSTEM]: ", ""))}</span>`;
    return;
  }

  const m = block.match(/^(\[[A-Z_]+\]:?)\s*([\s\S]*)/i);
  if (m) {
    const tag = m[1].replace(/[\[\]:]/g, "");
    const s = AGENT_STYLES[tag] || { badge: "badge-default", card: "card-normal" };
    el.className = livePrefix + `dialogue-agent ${s.card}`;
    el.innerHTML = `<span class="agent-badge ${s.badge}">${tag.replace(/_/g, " ")}</span><p class="agent-text">${esc(m[2])}</p>`;
    return;
  }

  el.className = livePrefix + "dialogue-partial";
  el.textContent = block;
}

// Freezes a live element in-place by removing the live class.
function freezeBlock(el, block) {
  applyBlockStyle(el, block, false);
}

// ── Thinking indicator ────────────────────────────────────────────────
function showThinking(agent) {
  thinkingAgent = agent;
  if (agent) {
    const status = AGENT_STATUS[agent] || "thinking";
    thinkingLabel.innerHTML = `<strong>[${agent.replace(/_/g, " ")}]</strong> <span style="font-weight:400;color:#a1a1aa">${status}...</span>`;
    thinkingRow.style.display = "flex";
  } else {
    hideThinking();
  }
}

function hideThinking() {
  thinkingAgent = null;
  thinkingRow.style.display = "none";
}

function setTurnCount(n) {
  turnCount = n;
  progressRight.style.display = "flex";
  const pct = Math.min(n / 6, 1) * 100;
  progressFill.style.width = pct + "%";
  turnCountLabel.textContent = `${Math.min(n, 6)} / 6`;
}

// ── Verdict Rendering ─────────────────────────────────────────────────
function renderVerdict(data) {
  const v    = data.verdict || "UNCERTAIN";
  const meta = VERDICT_META[v] || VERDICT_META.UNCERTAIN;

  verdictCard.className = "verdict-card " + (
    (v === "SUPPORTED" || v === "REFUTED") ? "verdict-strong" : "verdict-weak"
  );

  verdictTextEl.textContent = v;
  verdictTextEl.style.textDecoration = v === "REFUTED" ? "line-through" : "none";
  verdictTextEl.style.opacity         = v === "REFUTED" ? "0.6"         : "1";
  verdictMetaEl.textContent  = meta.label;
  confidenceVal.textContent  = data.confidence;
  summaryTextEl.textContent  = data.summary;
  verdictSub.textContent     = meta.sub;

  setTimeout(() => { confidenceBar.style.width = data.confidence + "%"; }, 150);
}

// ── Util ──────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
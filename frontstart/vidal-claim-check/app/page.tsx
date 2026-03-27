"use client";

import React, { useState, useRef, useEffect } from "react";

const AGENT_STYLES: Record<string, { badge: string; card: string }> = {
  INTEL_CRAWLER:   { badge: "bg-black text-white",                      card: "border-zinc-200 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.08)]" },
  DEVILS_ADVOCATE: { badge: "bg-zinc-600 text-white",                    card: "border-zinc-200 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.08)]" },
  VERDICT_ENGINE:  { badge: "bg-white text-black border-2 border-black", card: "border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" },
};

const AGENT_STATUS: Record<string, string> = {
  INTEL_CRAWLER:   "thinking",
  DEVILS_ADVOCATE: "thinking",
  VERDICT_ENGINE:  "deliberating",
};

const VERDICT_META: Record<string, { label: string; sub: string }> = {
  SUPPORTED: { label: "↳ THE CLAIM IS TRUE",        sub: "Evidence corroborates the assertion"      },
  REFUTED:   { label: "↳ THE CLAIM IS FALSE",       sub: "Evidence contradicts the assertion"       },
  ERROR:     { label: "↳ PROCESS FAILED",           sub: "System encountered a critical fault"      },
  UNCERTAIN: { label: "↳ INSUFFICIENT EVIDENCE",    sub: "Claim could not be conclusively verified" },
};

export default function ClaimRadar() {
  const [inputData,     setInputData]     = useState("");
  const [image,         setImage]         = useState<string | null>(null);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [streamText,    setStreamText]    = useState("");
  const [thinkingAgent, setThinkingAgent] = useState<string | null>(null);
  const [turnCount,     setTurnCount]     = useState(0);
  const [verdict,       setVerdict]       = useState<{
    verdict: string; confidence: number; summary: string;
  } | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamText, thinkingAgent]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let { width, height } = img;
        if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
        else                { if (height > MAX) { width *= MAX / height; height = MAX; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        setImage(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const executeAnalysis = async () => {
    if (!inputData.trim() && !image) return;
    setIsProcessing(true);
    setVerdict(null);
    setStreamText("");
    setThinkingAgent(null);
    setTurnCount(0);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputData, image }),
      });
      if (!response.body) throw new Error("No stream body");

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false, buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.replace("data: ", ""));
              if (data.type === "thinking") {
                setThinkingAgent(null);
                setStreamText((prev) => prev + data.content);
              } else if (data.type === "agent_thinking") {
                if (data.agent) setTurnCount((p) => p + 1);
                setThinkingAgent(data.agent || null);
              } else if (data.type === "final") {
                setThinkingAgent(null);
                setVerdict({ verdict: data.verdict, confidence: data.confidence, summary: data.summary });
                setIsProcessing(false);
              } else if (data.type === "error") {
                setThinkingAgent(null);
                setVerdict({ verdict: "ERROR", confidence: 0, summary: data.message || "A system fault occurred." });
                setIsProcessing(false);
              }
            } catch (_) {}
          }
        }
      }
    } catch {
      setThinkingAgent(null);
      setStreamText((p) => p + "\n\n[SYSTEM]: Connection interrupted.");
      setIsProcessing(false);
    }
  };

  const renderDialogue = () => {
    const blocks = streamText.split("\n\n").filter((b) => b.trim());
    return blocks.map((block, idx) => {
      if (block.startsWith("◦") || block.startsWith("[SYSTEM]")) {
        return (
          <div key={idx} className="mb-2 flex items-center gap-2 px-1 animate-in fade-in duration-200">
            <div className="w-1 h-1 bg-zinc-300 rounded-full flex-shrink-0" />
            <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest leading-relaxed">
              {block.replace(/^◦+\s*/, "").replace("[SYSTEM]: ", "")}
            </span>
          </div>
        );
      }
      const agentMatch = block.match(/^(\[[A-Z_]+\]:?)\s*([\s\S]*)/i);
      if (agentMatch) {
        const tag   = agentMatch[1].replace(/[\[\]:]/g, "");
        const style = AGENT_STYLES[tag] || { badge: "bg-zinc-200 text-zinc-700", card: "border-zinc-100" };
        return (
          <div key={idx} className={`mb-4 p-5 border-2 bg-white animate-in fade-in slide-in-from-bottom-2 duration-300 ${style.card}`}>
            <span className={`font-mono font-bold text-xs uppercase tracking-widest px-2 py-1 inline-block mb-3 ${style.badge}`}>
              {tag.replace(/_/g, " ")}
            </span>
            <p className="font-sans text-sm leading-relaxed text-zinc-800">{agentMatch[2]}</p>
          </div>
        );
      }
      return (
        <div key={idx} className="mb-2 p-3 border border-zinc-100 bg-zinc-50 font-mono text-xs leading-relaxed text-zinc-400 animate-in fade-in">
          {block}
        </div>
      );
    });
  };

  const isDisabled = !inputData.trim() && !image;

  return (
    <>
      <style>{`
        .no-sb::-webkit-scrollbar { display: none; }
        .no-sb { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div className="min-h-screen bg-[#F5F5F3] text-black font-sans selection:bg-black selection:text-white">
        {/* Dot grid */}
        <div className="fixed inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle, #c8c8c6 1px, transparent 1px)",
          backgroundSize: "22px 22px", opacity: 0.55,
        }} />

        {/* KEY FIX: max-w-4xl gives desktop room to breathe, px-6 sm:px-10 for comfortable gutters */}
        <div className="relative min-h-screen flex flex-col max-w-4xl mx-auto px-5 sm:px-10">

          {/* ── HEADER ── */}
          <header className="flex-shrink-0 pt-7 pb-5 border-b-2 border-black flex items-center justify-between gap-6">

            {/* Left: Logo + title */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-8 h-8 bg-black flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 bg-[#F5F5F3]" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none">SOCIAL MEDIA Claim Radar</h1>
                <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest mt-0.5">
                   Fact-Checking Copilot Protocol
                </p>
              </div>
            </div>

            {/* Right: pills + analyzing — all on one line, never wraps */}
            <div className="flex items-center gap-6 flex-shrink-0">
              {/* Pills — single row, hidden only on very small mobile */}
              <div className="hidden sm:flex items-center gap-3 whitespace-nowrap">
                <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest">LangChain</span>
                <div className="w-1 h-1 bg-zinc-300 rounded-full" />
                <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest">Multi-Agent Parliament</span>
              </div>

              {isProcessing && (
                <div className="flex items-center gap-1.5 border-2 border-black px-3 py-1.5 bg-white animate-in fade-in whitespace-nowrap">
                  {[0, 120, 240].map((d) => (
                    <div key={d} className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                  <span className="font-mono text-xs font-bold uppercase tracking-widest ml-1">Analyzing</span>
                </div>
              )}
            </div>
          </header>

          {/* ── INPUT PHASE ── */}
          {!isProcessing && !verdict && (
            <div className="flex-grow flex flex-col items-center justify-center py-12 animate-in fade-in duration-300">
              <div className="w-full flex flex-col gap-4">

                {/* Textarea */}
                <div className="relative">
                  <textarea
                    className="w-full h-40 sm:h-48 bg-white border-2 border-black p-6 text-base font-sans text-black focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] resize-none placeholder-zinc-300 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    placeholder="Enter a claim or statement to verify..."
                    value={inputData}
                    onChange={(e) => setInputData(e.target.value)}
                  />
                  {inputData.length > 0 && (
                    <span className="absolute bottom-3 right-4 font-mono text-xs text-zinc-300 pointer-events-none">
                      {inputData.length}
                    </span>
                  )}
                </div>

                {/* Image preview */}
                {image && (
                  <div className="flex items-center gap-4 p-4 border-2 border-black bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 duration-200">
                    <img src={image} alt="Uploaded" className="w-12 h-12 object-cover border border-zinc-100 flex-shrink-0" />
                    <div className="flex-grow min-w-0">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest block">Image attached</span>
                      <span className="font-mono text-xs text-zinc-400 mt-0.5 block">Will be decoded before analysis</span>
                    </div>
                    <button
                      onClick={() => setImage(null)}
                      className="font-mono text-xs text-red-400 hover:text-red-600 uppercase font-bold px-2 py-1 border border-red-200 hover:border-red-400 transition-colors flex-shrink-0"
                    >
                      ✕ Remove
                    </button>
                  </div>
                )}

                {/* Controls row */}
                <div className="flex justify-between items-center">
                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-black transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-sm">⊕</span>
                    {image ? "Change Image" : "Attach Image"}
                  </button>

                  <button
                    onClick={executeAnalysis}
                    disabled={isDisabled}
                    className="px-7 py-3 bg-black text-white font-bold uppercase tracking-widest text-xs hover:bg-zinc-800 disabled:opacity-20 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                  >
                    Run Verification →
                  </button>
                </div>

                {/* Footer note */}
                <p className="text-center font-mono text-xs text-zinc-300 uppercase tracking-widest pt-4">
                  LangChain · Multi-Agent Parliament · Debate Inference
                </p>
              </div>
            </div>
          )}

          {/* ── PROCESSING PHASE ── */}
          {isProcessing && (
            <div className="flex-grow flex flex-col py-6" style={{ minHeight: "calc(100vh - 80px)" }}>
              {/* Progress bar */}
              <div className="flex-shrink-0 flex items-center justify-between mb-5">
                <span className="font-mono text-xs text-zinc-400 uppercase tracking-widest">Debate in progress</span>
                {turnCount > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-5 h-1 transition-all duration-500 ${i < turnCount ? "bg-black" : "bg-zinc-200"}`} />
                      ))}
                    </div>
                    <span className="font-mono text-xs font-bold text-zinc-500 uppercase tracking-widest">
                      {Math.min(turnCount, 6)} / 6
                    </span>
                  </div>
                )}
              </div>

              {/* Scroll area */}
              <div className="relative flex-grow min-h-0" style={{ height: "calc(100vh - 180px)" }}>
                <div className="absolute inset-0 overflow-y-auto no-sb pb-16">
                  {renderDialogue()}

                  {thinkingAgent && (
                    <div className="mb-4 flex items-center gap-3 p-3 border-2 border-dashed border-zinc-300 bg-white/70 animate-in fade-in duration-150">
                      <div className="flex gap-1">
                        {[0, 140, 280].map((d) => (
                          <span key={d} className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                      <span className="font-mono text-xs uppercase tracking-widest text-zinc-500 font-bold">
                        [{thinkingAgent.replace(/_/g, " ")}]{" "}
                        <span className="font-normal text-zinc-400">
                          {AGENT_STATUS[thinkingAgent] ?? "thinking"}...
                        </span>
                      </span>
                    </div>
                  )}

                  <div ref={terminalEndRef} className="h-4" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#F5F5F3] to-transparent pointer-events-none" />
              </div>
            </div>
          )}

          {/* ── VERDICT PHASE ── */}
          {verdict && !isProcessing && (
            <div className="flex-grow flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in-95 duration-500">
              <div className={`w-full border-4 bg-white p-6 sm:p-10 ${
                verdict.verdict === "SUPPORTED" ? "border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" :
                verdict.verdict === "REFUTED"   ? "border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" :
                                                  "border-zinc-300 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.12)]"
              }`}>

                {/* Top: verdict + confidence */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 pb-6 mb-6 border-b-2 border-zinc-100">
                  <div>
                    <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Conclusion</span>
                    <h2 className={`text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none ${
                      verdict.verdict === "REFUTED" ? "line-through decoration-[3px] decoration-black opacity-60" : ""
                    }`}>
                      {verdict.verdict}
                    </h2>
                    <span className="font-mono text-xs font-bold uppercase tracking-widest mt-2 block text-zinc-600">
                      {VERDICT_META[verdict.verdict]?.label ?? "↳ UNKNOWN"}
                    </span>
                  </div>

                  <div className="text-left sm:text-right flex-shrink-0">
                    <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">Confidence</span>
                    <div className="flex items-baseline gap-0.5 sm:justify-end">
                      <span className="text-4xl sm:text-5xl font-black tabular-nums leading-none">{verdict.confidence}</span>
                      <span className="text-xl font-black">%</span>
                    </div>
                    <div className="mt-2 w-20 h-1 bg-zinc-100 sm:ml-auto overflow-hidden">
                      <div className="h-full bg-black transition-all duration-1000 ease-out" style={{ width: `${verdict.confidence}%` }} />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="mb-6">
                  <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-3">Summary Report</span>
                  <p className="font-sans text-base sm:text-lg leading-relaxed text-zinc-800 font-medium">
                    {verdict.summary}
                  </p>
                </div>

                {/* Bottom row */}
                <div className="pt-5 border-t border-zinc-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <span className="font-mono text-xs text-zinc-300 uppercase tracking-widest">
                    {VERDICT_META[verdict.verdict]?.sub}
                  </span>
                  <button
                    onClick={() => { setVerdict(null); setInputData(""); setImage(null); setThinkingAgent(null); setTurnCount(0); }}
                    className="font-mono text-xs font-bold uppercase tracking-widest px-5 py-2.5 border-2 border-black hover:bg-black hover:text-white transition-all"
                  >
                    ← New Query
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
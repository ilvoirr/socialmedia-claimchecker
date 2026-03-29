"use client";

import React, { useState, useRef, useEffect } from "react";

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
  
  const [isDark, setIsDark] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const AGENT_STYLES: Record<string, { badge: string; card: string; text: string }> = {
    INTEL_CRAWLER: { 
      badge: isDark ? "bg-zinc-200 text-zinc-900" : "bg-black text-white",                      
      card: isDark ? "border-zinc-700 bg-[#1A1A1A] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : "border-zinc-200 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.08)]",
      text: isDark ? "text-zinc-300" : "text-zinc-800"
    },
    DEVILS_ADVOCATE: { 
      badge: isDark ? "bg-zinc-700 text-zinc-100" : "bg-zinc-600 text-white",                    
      card: isDark ? "border-zinc-700 bg-[#1A1A1A] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : "border-zinc-200 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.08)]",
      text: isDark ? "text-zinc-300" : "text-zinc-800"
    },
    VERDICT_ENGINE: { 
      badge: isDark ? "bg-[#1A1A1A] text-zinc-100 border-2 border-zinc-500" : "bg-white text-black border-2 border-black", 
      card: isDark ? "border-zinc-500 bg-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" : "border-black bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
      text: isDark ? "text-zinc-100" : "text-zinc-800"
    },
  };

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
            <div className={`w-1 h-1 rounded-full flex-shrink-0 ${isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
            <span className={`font-mono text-xs uppercase tracking-widest leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {block.replace(/^◦+\s*/, "").replace("[SYSTEM]: ", "")}
            </span>
          </div>
        );
      }
      const agentMatch = block.match(/^(\[[A-Z_]+\]:?)\s*([\s\S]*)/i);
      if (agentMatch) {
        const tag   = agentMatch[1].replace(/[\[\]:]/g, "");
        const style = AGENT_STYLES[tag] || { 
          badge: isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700", 
          card: isDark ? "border-zinc-800 bg-[#1A1A1A]" : "border-zinc-100 bg-white",
          text: isDark ? "text-zinc-400" : "text-zinc-800"
        };
        return (
          <div key={idx} className={`mb-4 p-5 border-2 animate-in fade-in slide-in-from-bottom-2 duration-300 ${style.card}`}>
            <span className={`font-mono font-bold text-xs uppercase tracking-widest px-2 py-1 inline-block mb-3 ${style.badge}`}>
              {tag.replace(/_/g, " ")}
            </span>
            <p className={`font-sans text-sm leading-relaxed ${style.text}`}>{agentMatch[2]}</p>
          </div>
        );
      }
      return (
        <div key={idx} className={`mb-2 p-3 border font-mono text-xs leading-relaxed animate-in fade-in ${isDark ? "border-zinc-800 bg-[#1A1A1A] text-zinc-500" : "border-zinc-100 bg-zinc-50 text-zinc-400"}`}>
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

      <div className={`min-h-screen font-sans transition-colors duration-300 ${isDark ? "bg-[#121212] text-zinc-100 selection:bg-zinc-100 selection:text-black" : "bg-[#F5F5F3] text-black selection:bg-black selection:text-white"}`}>
        {/* Dot grid */}
        <div className="fixed inset-0 pointer-events-none transition-colors duration-300" style={{
          backgroundImage: `radial-gradient(circle, ${isDark ? '#333333' : '#c8c8c6'} 1px, transparent 1px)`,
          backgroundSize: "22px 22px", opacity: 0.55,
        }} />

        {/* ── CHANGE 2: max-w-4xl → max-w-5xl ── */}
        <div className="relative min-h-screen flex flex-col max-w-[60rem] mx-auto px-5 sm:px-10">

          {/* ── HEADER ── */}
          {/* ── CHANGE 3: removed sm:flex-nowrap so the pill always wraps inward and never bleeds past the border ── */}
          <header className={`flex-shrink-0 pt-7 pb-5 border-b-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 transition-colors duration-300 ${isDark ? "border-zinc-700" : "border-black"}`}>

            {/* Left: Logo + title */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className={`w-8 h-8 flex items-center justify-center flex-shrink-0 transition-colors ${isDark ? "bg-zinc-100" : "bg-black"}`}>
                <div className={`w-3 h-3 transition-colors ${isDark ? "bg-[#121212]" : "bg-[#F5F5F3]"}`} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none">SOCIAL MEDIA Claim Radar</h1>
                <p className={`text-xs font-mono uppercase tracking-widest mt-0.5 transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                   Fact-Checking Copilot Protocol
                </p>
              </div>
            </div>

            {/* Right: pills + toggle + analyzing */}
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-3 whitespace-nowrap">
                <span className={`font-mono text-xs uppercase tracking-widest transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>LangChain</span>
                <div className={`w-1 h-1 rounded-full transition-colors ${isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
                <span className={`font-mono text-xs uppercase tracking-widest transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Multi-Agent Parliament</span>
              </div>

              {/* ── CHANGE 1: removed border-2 and all border-color classes from the toggle button ── */}
              <button
                onClick={() => setIsDark(!isDark)}
                className={`p-1.5 flex items-center justify-center rounded-sm transition-all ${isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-400 hover:text-black"}`}
                aria-label="Toggle dark mode"
              >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                )}
              </button>

              {isProcessing && (
                <div className={`flex items-center gap-1.5 border-2 px-3 py-1.5 animate-in fade-in whitespace-nowrap transition-colors ${isDark ? "border-zinc-500 bg-[#1A1A1A]" : "border-black bg-white"}`}>
                  {[0, 120, 240].map((d) => (
                    <div key={d} className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? "bg-zinc-100" : "bg-black"}`} style={{ animationDelay: `${d}ms` }} />
                  ))}
                  <span className={`font-mono text-xs font-bold uppercase tracking-widest ml-1 ${isDark ? "text-zinc-100" : "text-black"}`}>Analyzing</span>
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
                    className={`w-full h-40 sm:h-48 p-6 text-base font-sans border-2 focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] resize-none transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isDark ? "bg-[#1A1A1A] border-zinc-600 text-zinc-100 placeholder-zinc-500" : "bg-white border-black text-black placeholder-zinc-300"}`}
                    placeholder="Enter a claim... (Enter to submit · Shift+Enter for newline · Paste image directly)"
                    value={inputData}
                    onChange={(e) => setInputData(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!isDisabled) executeAnalysis();
                      }
                    }}
                    onPaste={(e) => {
                      const items = Array.from(e.clipboardData.items);
                      const imageItem = items.find((item) => item.type.startsWith("image/"));
                      if (imageItem) {
                        e.preventDefault();
                        const file = imageItem.getAsFile();
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
                      }
                    }}
                  />
                  {inputData.length > 0 && (
                    <span className={`absolute bottom-3 right-4 font-mono text-xs pointer-events-none transition-colors ${isDark ? "text-zinc-600" : "text-zinc-300"}`}>
                      {inputData.length}
                    </span>
                  )}
                </div>

                {/* Image preview */}
                {image && (
                  <div className={`flex items-center gap-4 p-4 border-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 duration-200 transition-colors ${isDark ? "border-zinc-500 bg-[#1A1A1A]" : "border-black bg-white"}`}>
                    <img src={image} alt="Uploaded" className={`w-12 h-12 object-cover border flex-shrink-0 ${isDark ? "border-zinc-700" : "border-zinc-100"}`} />
                    <div className="flex-grow min-w-0">
                      <span className={`font-mono text-xs font-bold uppercase tracking-widest block ${isDark ? "text-zinc-100" : "text-black"}`}>Image attached</span>
                      <span className={`font-mono text-xs mt-0.5 block ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Will be decoded before analysis</span>
                    </div>
                    <button
                      onClick={() => setImage(null)}
                      className={`font-mono text-xs uppercase font-bold px-2 py-1 border transition-colors flex-shrink-0 ${isDark ? "text-red-400 border-red-900/50 hover:text-red-300 hover:border-red-400 bg-red-950/20" : "text-red-400 hover:text-red-600 border-red-200 hover:border-red-400"}`}
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
                    className={`font-mono text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${isDark ? "text-zinc-500 hover:text-zinc-200" : "text-zinc-400 hover:text-black"}`}
                  >
                    <span className="text-sm">⊕</span>
                    {image ? "Change Image" : "Attach Image"}
                  </button>

                  <button
                    onClick={executeAnalysis}
                    disabled={isDisabled}
                    className={`px-7 py-3 font-bold uppercase tracking-widest text-xs transition-all border-2 ${
                      isDark
                        ? "bg-zinc-100 text-black border-zinc-100 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)] hover:bg-white hover:border-white hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.15)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] disabled:bg-[#2A2A2A] disabled:text-zinc-500 disabled:border-[#2A2A2A] disabled:opacity-100 disabled:shadow-none disabled:transform-none"
                        : "bg-black text-white border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] hover:bg-zinc-800 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] disabled:opacity-20 hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                    }`}
                  >
                    Run Verification →
                  </button>
                </div>

                {/* Footer note */}
                <p className={`text-center font-mono text-xs uppercase tracking-widest pt-4 transition-colors ${isDark ? "text-zinc-600" : "text-zinc-300"}`}>
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
                <span className={`font-mono text-xs uppercase tracking-widest transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Debate in progress</span>
                {turnCount > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`w-5 h-1 transition-all duration-500 ${i < turnCount ? (isDark ? "bg-zinc-200" : "bg-black") : (isDark ? "bg-zinc-700" : "bg-zinc-200")}`} />
                      ))}
                    </div>
                    <span className={`font-mono text-xs font-bold uppercase tracking-widest transition-colors ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
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
                    <div className={`mb-4 flex items-center gap-3 p-3 border-2 border-dashed animate-in fade-in duration-150 transition-colors ${isDark ? "border-zinc-700 bg-[#1A1A1A]/70" : "border-zinc-300 bg-white/70"}`}>
                      <div className="flex gap-1">
                        {[0, 140, 280].map((d) => (
                          <span key={d} className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? "bg-zinc-500" : "bg-zinc-400"}`} style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                      <span className={`font-mono text-xs uppercase tracking-widest font-bold transition-colors ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                        [{thinkingAgent.replace(/_/g, " ")}]{" "}
                        <span className={`font-normal transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                          {AGENT_STATUS[thinkingAgent] ?? "thinking"}...
                        </span>
                      </span>
                    </div>
                  )}

                  <div ref={terminalEndRef} className="h-4" />
                </div>
                <div className={`absolute bottom-0 left-0 right-0 h-16 pointer-events-none transition-colors duration-300 ${isDark ? "bg-gradient-to-t from-[#121212] to-transparent" : "bg-gradient-to-t from-[#F5F5F3] to-transparent"}`} />
              </div>
            </div>
          )}

          {/* ── VERDICT PHASE ── */}
          {verdict && !isProcessing && (
            <div className="flex-grow flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in-95 duration-500">
              <div className={`w-full border-4 p-6 sm:p-10 transition-colors duration-300 ${
                isDark
                  ? (verdict.verdict === "SUPPORTED" || verdict.verdict === "REFUTED" ? "bg-[#1A1A1A] border-zinc-400 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" : "bg-[#1A1A1A] border-zinc-700 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]")
                  : (verdict.verdict === "SUPPORTED" || verdict.verdict === "REFUTED" ? "bg-white border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" : "bg-white border-zinc-300 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.12)]")
              }`}>

                {/* Top: verdict + confidence */}
                <div className={`flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 pb-6 mb-6 border-b-2 transition-colors ${isDark ? "border-zinc-800" : "border-zinc-100"}`}>
                  <div>
                    <span className={`font-mono text-xs font-bold uppercase tracking-widest block mb-2 transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Conclusion</span>
                    <h2 className={`text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none ${
                      verdict.verdict === "REFUTED" ? `line-through decoration-[3px] ${isDark ? "decoration-zinc-100" : "decoration-black"} opacity-60` : ""
                    }`}>
                      {verdict.verdict}
                    </h2>
                    <span className={`font-mono text-xs font-bold uppercase tracking-widest mt-2 block transition-colors ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      {VERDICT_META[verdict.verdict]?.label ?? "↳ UNKNOWN"}
                    </span>
                  </div>

                  <div className="text-left sm:text-right flex-shrink-0">
                    <span className={`font-mono text-xs font-bold uppercase tracking-widest block mb-2 transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Confidence</span>
                    <div className="flex items-baseline gap-0.5 sm:justify-end">
                      <span className="text-4xl sm:text-5xl font-black tabular-nums leading-none">{verdict.confidence}</span>
                      <span className="text-xl font-black">%</span>
                    </div>
                    <div className={`mt-2 w-20 h-1 sm:ml-auto overflow-hidden transition-colors ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
                      <div className={`h-full transition-all duration-1000 ease-out ${isDark ? "bg-zinc-200" : "bg-black"}`} style={{ width: `${verdict.confidence}%` }} />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="mb-6">
                  <span className={`font-mono text-xs font-bold uppercase tracking-widest block mb-3 transition-colors ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Summary Report</span>
                  <p className={`font-sans text-base sm:text-lg leading-relaxed font-medium transition-colors ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>
                    {verdict.summary}
                  </p>
                </div>

                {/* Bottom row */}
                <div className={`pt-5 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors ${isDark ? "border-zinc-800" : "border-zinc-100"}`}>
                  <span className={`font-mono text-xs uppercase tracking-widest transition-colors ${isDark ? "text-zinc-600" : "text-zinc-300"}`}>
                    {VERDICT_META[verdict.verdict]?.sub}
                  </span>
                  <button
                    onClick={() => { setVerdict(null); setInputData(""); setImage(null); setThinkingAgent(null); setTurnCount(0); }}
                    className={`font-mono text-xs font-bold uppercase tracking-widest px-5 py-2.5 border-2 transition-all ${isDark ? "border-zinc-100 hover:bg-zinc-100 hover:text-[#121212]" : "border-black hover:bg-black hover:text-white"}`}
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
import { NextRequest } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractContextFromImage(imageBase64: string): Promise<string> {
  const cleanBase64 = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;
  const mimeType = imageBase64.startsWith("data:")
    ? imageBase64.split(";")[0].split(":")[1]
    : "image/jpeg";

  const response = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${cleanBase64}`,
            },
          },
          {
            type: "text",
            text: `You are a precision image analysis system. Do the following in order:
1. Extract ALL visible text from this image verbatim (headlines, captions, dates, usernames, sources, fine print).
2. Identify the media format (news article, tweet, WhatsApp forward, video thumbnail, etc).
3. State the single core factual claim or assertion this image is making.
4. Note any visual cues that add credibility or suggest manipulation (logos, verified badges, font inconsistencies, blurry areas).
Return a dense, exhaustive factual report. Be thorough.`,
          },
        ],
      },
    ],
  });

  const extracted = response.choices[0]?.message?.content || "";
  if (!extracted) throw new Error("Groq vision returned empty content");
  return extracted;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, image } = body;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const closeStream = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      try {
        let claimContext = text?.trim() || "";

        // --- STEP 1: Image → Groq Vision → rich text context ---
        if (image) {
          send({
            type: "thinking",
            content: "◦◦◦ Vision module online — routing image to Groq for deep extraction...\n\n",
          });
          try {
            const imageContext = await extractContextFromImage(image);
            // claimContext now contains EVERYTHING — user text + full image breakdown
            claimContext = text?.trim()
              ? `User submitted claim: ${text.trim()}\n\nFull image context extracted:\n${imageContext}`
              : imageContext;
            send({
              type: "thinking",
              content: "◦◦◦ Image decoded successfully. Full context forwarded to analysis pipeline.\n\n",
            });
          } catch (e: any) {
            console.error("[GROQ VISION ERROR]", e.message);
            send({
              type: "thinking",
              content: `◦◦◦ Vision extraction failed: ${e.message}. Proceeding with any available text.\n\n`,
            });
          }
        }

        if (!claimContext) {
          send({
            type: "thinking",
            content: "◦◦◦ No content could be extracted. Please attach a clearer image or type a claim manually.\n\n",
          });
          send({
            type: "final",
            verdict: "UNCERTAIN",
            confidence: 0,
            summary: "Could not extract content from the image. Try a clearer image or type the claim directly.",
          });
          closeStream();
          return;
        }

        send({
          type: "thinking",
          content: "[SYSTEM]: Full context routed to Python Scrutinizer. Debate chamber initializing in parallel...\n\n",
        });

        // --- STEP 2: Fire Python backend in parallel with the FULL claimContext ---
        // Python gets the same complete picture the debate agents will get
        const pythonPromise = fetch("https://socialmedia-claimchecker.onrender.com/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: claimContext }),
        }).then((r) => {
          if (!r.ok) throw new Error(`Python backend HTTP ${r.status}`);
          return r.json();
        });

        // --- STEP 3: Generate full debate — agents receive the FULL claimContext ---
        // This is the key fix: debate prompt uses the entire decoded context, not just
        // a truncated topic string, so agents argue about the actual image content
        const debateResponse = await groq.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `You are coordinating a rigorous fact-checking debate between 3 elite AI research agents. They have been given the following content to analyze:

---BEGIN CONTENT---
${claimContext}
---END CONTENT---

Generate exactly 6 debate turns between these agents: [INTEL_CRAWLER], [DEVILS_ADVOCATE], and [VERDICT_ENGINE].

RULES:
1. All agents must argue specifically about the content above — every claim, date, name, and detail in it.
2. Each turn must be a dense combative paragraph of at least 4 sentences grounded in real-world facts, data, or historical precedent.
3. Agents must directly challenge each other's specific points by name.
4. Never use tech-process jargon like "payload", "tokens", "metadata", "database". Argue like elite academic researchers.
5. [VERDICT_ENGINE] speaks only in the final 2 turns — first weighing both sides, then delivering a decisive conclusion.

OUTPUT FORMAT — exactly 6 blocks, one blank line between each:
[INTEL_CRAWLER]: paragraph

[DEVILS_ADVOCATE]: paragraph

[INTEL_CRAWLER]: paragraph

[DEVILS_ADVOCATE]: paragraph

[VERDICT_ENGINE]: paragraph

[VERDICT_ENGINE]: paragraph`,
            },
          ],
          model: "llama-3.3-70b-versatile",
          stream: false,
          temperature: 0.85,
        });

        const fullDebateText = debateResponse.choices[0]?.message?.content || "";

        // Parse into individual agent turn blocks
        const agentTurns = fullDebateText
          .split(/\n{2,}/)
          .map((b) => b.trim())
          .filter((b) => /^\[[A-Z_]+\]:/.test(b));

        // --- STEP 4: Per turn — thinking pause → word-by-word typewriter ---
        for (const turn of agentTurns) {
          const agentMatch = turn.match(/^\[([A-Z_]+)\]/);
          const agentName = agentMatch ? agentMatch[1] : "AGENT";

          // Show thinking indicator
          send({ type: "agent_thinking", agent: agentName });

          // Randomized pause 1000ms – 3000ms
          const pauseMs = Math.floor(Math.random() * 2000) + 1000;
          await new Promise((r) => setTimeout(r, pauseMs));

          // Clear thinking indicator — agent now speaks
          send({ type: "agent_thinking", agent: null });

          // Word-by-word typewriter at 8ms per token
          const tokens = turn.split(/(\s+)/);
          for (const token of tokens) {
            send({ type: "thinking", content: token });
            await new Promise((r) => setTimeout(r, 8));
          }

          // Paragraph break between turns
          send({ type: "thinking", content: "\n\n" });
          await new Promise((r) => setTimeout(r, 250));
        }

        // --- STEP 5: Collect Python verdict ---
        send({
          type: "thinking",
          content: "◦◦◦ Multi-agent deliberation complete. Awaiting Scrutinizer verdict...\n\n",
        });

        const realVerdict = await pythonPromise;
        send({ type: "final", ...realVerdict });

      } catch (e: any) {
        console.error("[ROUTE ERROR]", e);
        send({ type: "error", message: `System fault: ${e.message}` });
      } finally {
        closeStream();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
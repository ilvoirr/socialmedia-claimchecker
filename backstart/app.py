import os
import json
import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools.tavily_search import TavilySearchResults

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm_reasoning = ChatGroq(temperature=0.1, model_name="llama-3.3-70b-versatile")

# Tavily web search — returns top 5 results with content snippets
search_tool = TavilySearchResults(
    max_results=5,
    search_depth="advanced",
    include_answer=True,
    include_raw_content=False,
)


class ClaimRequest(BaseModel):
    text: str = ""


def run_web_search(claim: str) -> str:
    """Search the web for the claim and return formatted results."""
    try:
        results = search_tool.invoke(claim[:400])  # Tavily has query length limits
        if not results:
            return "No web search results found."

        formatted = []
        for i, r in enumerate(results, 1):
            url     = r.get("url", "")
            content = r.get("content", "").strip()
            title   = r.get("title", "Source")
            if content:
                formatted.append(f"[{i}] {title}\n{url}\n{content}")

        return "\n\n".join(formatted) if formatted else "No usable search results found."
    except Exception as e:
        print(f"TAVILY ERROR: {e}")
        return f"Web search failed: {str(e)}"


@app.post("/api/verify")
async def verify_claim(request: ClaimRequest):
    if not request.text.strip():
        return {
            "verdict": "UNCERTAIN",
            "confidence": 0,
            "summary": "No claim text was provided for analysis.",
        }

    # --- STEP 1: Live web search for current evidence ---
    print(f"[SEARCH] Querying Tavily for: {request.text[:100]}")
    web_evidence = run_web_search(request.text)
    print(f"[SEARCH] Got evidence: {web_evidence[:200]}")

    # --- STEP 2: Scrutinizer prompt now grounded with real web results ---
    scrutinizer_prompt = ChatPromptTemplate.from_template(
        """You are an elite Fact-Checking AI operating in 2026. You have just retrieved the following LIVE WEB SEARCH RESULTS for this claim:

CLAIM:
\"\"\"{claim}\"\"\"

LIVE WEB EVIDENCE (retrieved right now, treat as current):
{web_evidence}

Using the web evidence above as your PRIMARY source of truth, analyze the claim.
- If multiple credible sources confirm the claim → SUPPORTED
- If sources contradict the claim → REFUTED  
- If sources are missing, ambiguous, or the claim cannot be verified → UNCERTAIN

Provide a JSON response with EXACTLY these three keys:
- "verdict": Must be exactly one of "SUPPORTED", "REFUTED", or "UNCERTAIN".
- "confidence": An integer between 55 and 97. Weight this heavily based on how many sources confirm or deny the claim. Never output 100.
- "summary": Exactly 2 cold, factual sentences. Reference specific source findings from the web evidence above.

Respond ONLY with valid JSON. No markdown, no backticks, no explanation outside the JSON."""
    )

    chain = scrutinizer_prompt | llm_reasoning

    try:
        raw_result = chain.invoke({
            "claim": request.text,
            "web_evidence": web_evidence,
        }).content

        cleaned = raw_result.replace("```json", "").replace("```", "").strip()
        final_analysis = json.loads(cleaned)

        confidence = int(final_analysis.get("confidence", 70))
        if confidence >= 99:
            final_analysis["confidence"] = random.randint(88, 97)
        elif confidence < 10:
            final_analysis["confidence"] = random.randint(40, 60)
        else:
            final_analysis["confidence"] = confidence

        if final_analysis.get("verdict") not in ("SUPPORTED", "REFUTED", "UNCERTAIN"):
            final_analysis["verdict"] = "UNCERTAIN"

        return final_analysis

    except json.JSONDecodeError:
        verdict = "UNCERTAIN"
        if "SUPPORTED" in raw_result.upper():
            verdict = "SUPPORTED"
        elif "REFUTED" in raw_result.upper():
            verdict = "REFUTED"
        return {
            "verdict": verdict,
            "confidence": 45,
            "summary": "Structural anomaly in analysis output. Verdict inferred from partial data.",
        }
    except Exception as e:
        print(f"SCRUTINIZER ERROR: {e}")
        return {
            "verdict": "UNCERTAIN",
            "confidence": 0,
            "summary": "A critical fault occurred in the scrutinizer chain. Check server logs.",
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
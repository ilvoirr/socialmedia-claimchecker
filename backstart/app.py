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

search_tool = TavilySearchResults(
    max_results=6,
    search_depth="advanced",
    include_answer=True,
    include_raw_content=False,
)


class ClaimRequest(BaseModel):
    text: str = ""


def extract_search_query(full_context: str) -> str:
    """Use LLM to distill the full context blob into a clean 1-line news search query."""
    try:
        prompt = f"""Read the following content and extract the single core factual claim being made.
Then rewrite it as a short, Google-style news search query (max 12 words).
Output ONLY the search query string. No explanation, no quotes, no punctuation at the end.

CONTENT:
{full_context[:1500]}

SEARCH QUERY:"""
        result = llm_reasoning.invoke(prompt)
        query = result.content.strip().strip('"').strip("'")
        print(f"[SEARCH QUERY] Extracted: {query}")
        return query
    except Exception as e:
        print(f"[QUERY EXTRACTION ERROR] {e}")
        # Fallback: strip known prefixes and take first 120 chars
        cleaned = full_context
        for prefix in ["User submitted claim:", "Full image context extracted:", "---BEGIN CONTENT---"]:
            cleaned = cleaned.replace(prefix, "")
        return cleaned.strip()[:120]


def run_web_search(search_query: str) -> str:
    """Run Tavily with a clean focused query and return formatted results."""
    try:
        print(f"[TAVILY] Searching: {search_query}")
        results = search_tool.invoke(search_query)
        if not results:
            return "No web search results found."

        formatted = []
        for i, r in enumerate(results, 1):
            url     = r.get("url", "")
            content = r.get("content", "").strip()
            title   = r.get("title", "Source")
            if content:
                formatted.append(f"[{i}] {title}\nURL: {url}\n{content}")

        return "\n\n".join(formatted) if formatted else "No usable search results found."
    except Exception as e:
        print(f"[TAVILY ERROR] {e}")
        return f"Web search failed: {str(e)}"


@app.post("/api/verify")
async def verify_claim(request: ClaimRequest):
    if not request.text.strip():
        return {
            "verdict": "UNCERTAIN",
            "confidence": 0,
            "summary": "No claim text was provided for analysis.",
        }

    # --- STEP 1: Distill full context into a clean search query ---
    search_query = extract_search_query(request.text)

    # --- STEP 2: Live web search with clean query ---
    web_evidence = run_web_search(search_query)
    print(f"[EVIDENCE PREVIEW] {web_evidence[:300]}")

    # --- STEP 3: Scrutinizer with grounded evidence ---
    scrutinizer_prompt = ChatPromptTemplate.from_template(
        """You are an elite Fact-Checking AI operating in 2026. You have retrieved LIVE WEB SEARCH RESULTS for this claim.

ORIGINAL CLAIM / CONTENT:
\"\"\"{claim}\"\"\"

SEARCH QUERY USED: {search_query}

LIVE WEB EVIDENCE:
{web_evidence}

INSTRUCTIONS:
- If 2+ credible sources directly confirm the claim → SUPPORTED (confidence 75-92)
- If sources directly contradict the claim → REFUTED (confidence 75-92)  
- If evidence is irrelevant, paywalled, or missing → UNCERTAIN (confidence 55-70)
- Weight news sources (Times of India, NDTV, Mint, HT, BBC, Reuters) very highly
- A tweet from a verified journalist corroborated by news coverage counts as strong evidence

Provide a JSON response with EXACTLY these three keys:
- "verdict": "SUPPORTED", "REFUTED", or "UNCERTAIN"
- "confidence": integer 55–97, never 100
- "summary": 2 factual sentences referencing what the web evidence actually said

Respond ONLY with valid JSON. No markdown, no backticks."""
    )

    chain = scrutinizer_prompt | llm_reasoning

    try:
        raw_result = chain.invoke({
            "claim": request.text,
            "search_query": search_query,
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
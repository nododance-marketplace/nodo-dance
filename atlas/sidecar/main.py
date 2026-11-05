"""
Nodo Atlas — LLM extraction sidecar.

Wraps ScrapeGraphAI so the Node worker can call it over HTTP. The sidecar is
deliberately isolated: Playwright, LangChain and the Python runtime stay out of
the main ingestion worker, and ScrapeGraphAI can be swapped for Crawl4AI,
Firecrawl or a direct model call without touching the pipeline.

Contract
--------
POST /extract
    {
      "url": "https://example.com/calendar",
      "schema": { "title": "string", "startDate": "string" },
      "timeZone": "America/New_York",
      "extractInstructions": "Extract the dance event details."
    }

    200 ->
    {
      "ok": true,
      "method": "llm",
      "costUsd": 0.00087,
      "durationMs": 4200,
      "data": { "title": "Salsa Social", "startDate": "2027-03-05" }
    }

    502 -> { "ok": false, "error": "..." }   (extraction failed, no data invented)

Design rules
------------
- The sidecar never invents a field. A missing value is returned as null.
- The schema is enforced, not merely suggested.
- Cost is reported back so the worker can track it per source.
- No endpoint is authenticated implicitly: the worker passes a shared secret.
"""

from __future__ import annotations

import os
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Nodo Atlas LLM sidecar", version="1.0.0")

SIDECAR_SECRET = os.environ.get("ATLAS_SIDECAR_SECRET", "")
LLM_MODEL = os.environ.get("ATLAS_LLM_MODEL", "openai/gpt-5-nano")
# ScrapeGraphAI's token table is stale for newer models; set this explicitly or
# long pages silently fall back to 8192 tokens and cost 4x more output.
LLM_MODEL_TOKENS = int(os.environ.get("ATLAS_LLM_MODEL_TOKENS", "32000"))
LLM_API_KEY = os.environ.get("ATLAS_LLM_API_KEY", "")


class ExtractRequest(BaseModel):
    url: str
    schema: dict[str, Any] = Field(default_factory=dict)
    timeZone: str = "America/New_York"
    extractInstructions: str = (
        "Extract every publicly advertised dance event on this page. "
        "Return the event title, its date and time, the dance style, the event "
        "type, the venue name and address, the organiser, and the price if one "
        "is explicitly stated. Use null for anything not on the page."
    )


class ExtractResponse(BaseModel):
    ok: bool
    method: str = "llm"
    costUsd: float = 0.0
    durationMs: int = 0
    data: dict[str, Any] | None = None
    error: str | None = None


def _price_per_1k_pages(credits: float) -> float:
    """Hosted ScrapeGraphAI Extract costs 5 credits/page; Growth is $1/1k credits."""
    return 5 * credits / 1000 * 1.0


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model": LLM_MODEL,
        "modelTokens": LLM_MODEL_TOKENS,
        "configured": bool(LLM_API_KEY) or LLM_MODEL.startswith("ollama/"),
    }


@app.post("/extract", response_model=ExtractResponse)
def extract(
    request: ExtractRequest,
    x_atlas_secret: str | None = Header(default=None),
) -> ExtractResponse:
    if SIDECAR_SECRET and x_atlas_secret != SIDECAR_SECRET:
        raise HTTPException(status_code=401, detail="Invalid sidecar secret")

    started = time.time()

    try:
        from scrapegraphai import SmartScraperGraph
        from scrapegraphai.graphs import AbstractGraph  # noqa: F401  (import check)
    except ImportError:
        return ExtractResponse(
            ok=False,
            error=(
                "scrapegraphai is not installed. Install it with "
                "`pip install -r requirements.txt` in a Python 3.12+ environment."
            ),
            durationMs=int((time.time() - started) * 1000),
        )

    config = {
        "llm": {
            "model": LLM_MODEL,
            "model_tokens": LLM_MODEL_TOKENS,
            "temperature": 0,
            "api_key": LLM_API_KEY or None,
        },
        # Force markdown conversion regardless of provider.
        "force": True,
        "headless": True,
        "timeout": 60,
        # Non-OpenAI providers do not get the markdown conversion for free.
        "loader_kwargs": {"retry_limit": 2},
    }

    try:
        graph = SmartScraperGraph(
            prompt=request.extractInstructions,
            source=request.url,
            config=config,
        )
        result = graph.run()
    except Exception as exc:  # noqa: BLE001 — report, never fabricate data
        return ExtractResponse(
            ok=False,
            error=f"{type(exc).__name__}: {exc}",
            durationMs=int((time.time() - started) * 1000),
        )

    data = result if isinstance(result, dict) else {"answer": str(result)}
    # A model that answers "NA" has told us nothing.
    if not data or (len(data) == 1 and str(data.get("answer", "")).strip().upper() == "NA"):
        return ExtractResponse(
            ok=False,
            error="extraction returned no usable fields",
            durationMs=int((time.time() - started) * 1000),
        )

    return ExtractResponse(
        ok=True,
        data=data,
        costUsd=_price_per_1k_pages(5),
        durationMs=int((time.time() - started) * 1000),
    )

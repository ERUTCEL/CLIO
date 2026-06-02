import json
import os
import re

import anthropic
import structlog

from generation.citation_formatter import compute_confidence
from generation.prompt_builder import build_messages
from retrieval.hybrid_search import HybridSearch, SearchFilters
from retrieval.reranker import Reranker

log = structlog.get_logger()

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 2048


def parse_llm_response(raw: str) -> dict:
    match = re.search(r"```json\s*(.*?)\s*```", raw, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return json.loads(raw)


class RAGPipeline:
    """End-to-end RAG: search → rerank → generate."""

    def __init__(
        self,
        search: HybridSearch,
        reranker: Reranker | None = None,
        anthropic_api_key: str | None = None,
    ) -> None:
        self.search = search
        self.reranker = reranker
        self._client = anthropic.Anthropic(api_key=anthropic_api_key or os.getenv("ANTHROPIC_API_KEY"))

    def answer(
        self,
        query: str,
        filters: SearchFilters | None = None,
        conversation_history: list[dict] | None = None,
        top_k: int = 5,
    ) -> dict:
        # 1. Retrieve
        candidates = self.search.search(query, n_results=20, filters=filters)

        # 2. Rerank
        if self.reranker and candidates:
            results = self.reranker.rerank(query, candidates, top_k=top_k)
        else:
            results = candidates[:top_k]

        confidence = compute_confidence(results)

        # 3. Skip LLM if no sources — saves API cost
        if confidence == "no_source":
            log.info("rag_no_source", query=query[:80])
            return {
                "answer": "내 라이브러리에서 관련 논문을 찾지 못했습니다. / No relevant papers found in your library.",
                "citations": [],
                "confidence": "no_source",
            }

        # 4. Generate
        system, messages = build_messages(query, results, conversation_history)
        log.info("rag_calling_llm", query=query[:80], sources=len(results), model=_MODEL)

        response = self._client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=messages,
        )

        try:
            parsed = parse_llm_response(response.content[0].text)
            return {
                "answer": parsed["answer"],
                "citations": parsed.get("citations", []),
                "confidence": confidence,
            }
        except (json.JSONDecodeError, KeyError) as exc:
            log.warning("llm_response_parse_failed", error=str(exc))
            return {
                "answer": response.content[0].text,
                "citations": [],
                "confidence": confidence,
            }

import json
import os
import re
from typing import AsyncGenerator

import structlog

from generation.citation_formatter import compute_confidence, format_citations
from generation.prompt_builder import build_messages
from generation.providers import (
    BaseLLMProvider,
    build_fallback_provider,
    build_provider,
    is_local_provider,
)
from retrieval.hybrid_search import HybridSearch, SearchFilters
from retrieval.reranker import Reranker

log = structlog.get_logger()

_MAX_TOKENS = 2048


def _source_preview(results: list[dict]) -> list[dict]:
    previews: list[dict] = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        previews.append({
            "index": i,
            "title": meta.get("title") or "Untitled source",
            "author": meta.get("author") or None,
            "year": meta.get("year") or None,
            "source_type": meta.get("source_type", "pdf"),
            "source": meta.get("source") or None,
            "page": meta.get("page_number") or None,
            "bbox": meta.get("bbox") or None,
            "content_type": meta.get("content_type", "text"),
            "figure_type": meta.get("figure_type") or None,
            "caption": meta.get("caption") or None,
            "is_user_memo": bool(meta.get("is_user_memo", False)),
        })
    return previews


def _enriched_citations(results: list[dict], llm_citations: list[dict] | None = None) -> list[dict]:
    by_index = {int(c["index"]): c for c in format_citations(results) if c.get("index") is not None}
    if not llm_citations:
        return list(by_index.values())

    enriched: list[dict] = []
    used: set[int] = set()
    for llm_citation in llm_citations:
        try:
            index = int(llm_citation.get("index"))
        except (TypeError, ValueError):
            continue
        base = by_index.get(index)
        if not base:
            continue
        merged = dict(base)
        for key, value in llm_citation.items():
            if value not in ("", None, [], {}):
                merged[key] = value
        for key in ("source", "page", "bbox"):
            if base.get(key):
                merged[key] = base[key]
        enriched.append(merged)
        used.add(index)

    for index, citation in by_index.items():
        if index not in used:
            enriched.append(citation)
    return enriched


def _friendly_llm_error(provider: BaseLLMProvider, exc: Exception) -> str:
    if is_local_provider(provider):
        return (
            "로컬 AI(Ollama)에 연결할 수 없습니다. Ollama 앱이 실행 중인지 확인하거나, "
            f"좌측 하단 ⚙️ 설정에서 클라우드 API 키를 등록해 주세요. (원인: {exc})"
        )
    return f"AI 응답 오류: {exc}"


class _AnswerStreamParser:
    """LLM이 내보내는 JSON 스트림에서 "answer" 필드 텍스트만 실시간 추출."""

    _PREFIX = '"answer": "'

    def __init__(self) -> None:
        self._buf = ""
        self._in_answer = False
        self._escaped = False
        self.answer_done = False

    def feed(self, chunk: str) -> str:
        if self.answer_done:
            return ""

        if not self._in_answer:
            self._buf += chunk
            idx = self._buf.find(self._PREFIX)
            if idx == -1:
                return ""
            self._in_answer = True
            chunk = self._buf[idx + len(self._PREFIX):]
            self._buf = ""

        out: list[str] = []
        for ch in chunk:
            if self._escaped:
                if ch == "n":
                    out.append("\n")
                elif ch == "t":
                    out.append("\t")
                elif ch == '"':
                    out.append('"')
                elif ch == "\\":
                    out.append("\\")
                else:
                    out.append(ch)
                self._escaped = False
            elif ch == "\\":
                self._escaped = True
            elif ch == '"':
                self.answer_done = True
                break
            else:
                out.append(ch)
        return "".join(out)


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
        provider: BaseLLMProvider | None = None,
    ) -> None:
        self.search = search
        self.reranker = reranker
        self._provider = provider or build_provider()

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
        log.info("rag_calling_llm", query=query[:80], sources=len(results),
                 provider=type(self._provider).__name__, model=getattr(self._provider, 'model', '?'))

        try:
            raw_text = self._provider.complete(system, messages, _MAX_TOKENS)
        except Exception as exc:
            log.error("rag_llm_error", provider=type(self._provider).__name__, error=str(exc))
            fallback = build_fallback_provider(self._provider)
            if fallback is None:
                return {
                    "answer": _friendly_llm_error(self._provider, exc),
                    "citations": [],
                    "confidence": confidence,
                }
            log.info("rag_llm_fallback", fallback=type(fallback).__name__,
                     model=getattr(fallback, "model", "?"))
            try:
                raw_text = fallback.complete(system, messages, _MAX_TOKENS)
            except Exception as fallback_exc:
                log.error("rag_llm_fallback_error", error=str(fallback_exc))
                return {
                    "answer": _friendly_llm_error(self._provider, exc),
                    "citations": [],
                    "confidence": confidence,
                }

        try:
            parsed = parse_llm_response(raw_text)
            return {
                "answer": parsed["answer"],
                "citations": _enriched_citations(results, parsed.get("citations", [])),
                "confidence": confidence,
            }
        except (json.JSONDecodeError, KeyError) as exc:
            log.warning("llm_response_parse_failed", error=str(exc))
            return {
                "answer": raw_text,
                "citations": _enriched_citations(results),
                "confidence": confidence,
            }

    async def answer_stream(
        self,
        query: str,
        filters: SearchFilters | None = None,
        conversation_history: list[dict] | None = None,
        top_k: int = 5,
    ) -> AsyncGenerator[dict, None]:
        """Yield SSE-ready dicts: {type: 'token'|'done'|'no_source', ...}"""
        candidates = self.search.search(query, n_results=20, filters=filters)
        results = self.reranker.rerank(query, candidates, top_k=top_k) if self.reranker and candidates else candidates[:top_k]
        confidence = compute_confidence(results)

        if confidence == "no_source":
            yield {"type": "no_source", "answer": "내 라이브러리에서 관련 논문을 찾지 못했습니다. / No relevant papers found in your library.", "citations": [], "confidence": "no_source"}
            return

        yield {"type": "sources", "sources": _source_preview(results)}

        system, messages = build_messages(query, results, conversation_history)

        # 1차: 설정된 provider, 실패 시(토큰을 하나도 못 받았을 때만) 클라우드 폴백 1회.
        providers: list[BaseLLMProvider] = [self._provider]
        fallback = build_fallback_provider(self._provider)
        if fallback is not None:
            providers.append(fallback)

        full_text = ""
        for attempt, provider in enumerate(providers):
            log.info("rag_streaming_llm", query=query[:80], sources=len(results),
                     provider=type(provider).__name__, model=getattr(provider, 'model', '?'),
                     attempt=attempt + 1)
            full_text = ""
            parser = _AnswerStreamParser()
            emitted = False
            try:
                async for chunk in provider.stream_text(system, messages, _MAX_TOKENS):
                    full_text += chunk
                    text = parser.feed(chunk)
                    if text:
                        emitted = True
                        yield {"type": "token", "text": text}
                break  # 스트리밍 성공
            except Exception as exc:
                log.error("rag_stream_error", provider=type(provider).__name__, error=str(exc))
                is_last = attempt == len(providers) - 1
                if emitted or is_last:
                    # 이미 토큰을 내보냈으면 provider를 바꿔 다시 시작할 수 없다
                    yield {
                        "type": "error",
                        "answer": _friendly_llm_error(self._provider, exc),
                        "citations": [],
                        "confidence": "no_source",
                    }
                    return
                log.info("rag_stream_fallback", fallback=type(providers[attempt + 1]).__name__)

        try:
            parsed = parse_llm_response(full_text)
            yield {"type": "done", "citations": _enriched_citations(results, parsed.get("citations", [])), "confidence": confidence}
        except (json.JSONDecodeError, KeyError):
            yield {"type": "done", "citations": _enriched_citations(results), "confidence": confidence}
        except Exception as exc:
            log.error("rag_stream_error", error=str(exc))
            yield {"type": "error", "answer": f"AI 응답 오류: {exc}", "citations": [], "confidence": "no_source"}

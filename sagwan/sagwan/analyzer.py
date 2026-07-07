"""Claude API wrapper for the analysis modes.

Each analysis mode maps to one prompt template (see ``sagwan/prompts/``).
Requests stream by default — analyses are long-form — and the shared system
prompt carries a cache breakpoint so repeated analyses in the same mode
reuse the prompt cache.
"""

from collections.abc import Callable
from dataclasses import dataclass

import anthropic

from sagwan.documents import SourceDocument, format_docs
from sagwan.templates import build_prompt

DEFAULT_MODEL = "claude-opus-4-8"
DEFAULT_MAX_TOKENS = 64000


@dataclass
class AnalysisResult:
    text: str
    mode: str
    model: str
    stop_reason: str | None
    input_tokens: int
    output_tokens: int

    @property
    def truncated(self) -> bool:
        return self.stop_reason == "max_tokens"


class HistoryAnalyzer:
    def __init__(
        self,
        client: anthropic.Anthropic | None = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ):
        # Zero-arg Anthropic() resolves credentials from the environment
        # (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login`
        # profile).
        self.client = client or anthropic.Anthropic()
        self.model = model
        self.max_tokens = max_tokens

    def analyze(
        self,
        mode: str,
        variables: dict[str, str],
        on_text: Callable[[str], None] | None = None,
    ) -> AnalysisResult:
        """Run one analysis. ``on_text`` receives streamed text deltas."""
        system, user = build_prompt(mode, variables)
        with self.client.messages.stream(
            model=self.model,
            max_tokens=self.max_tokens,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user}],
        ) as stream:
            for text in stream.text_stream:
                if on_text is not None:
                    on_text(text)
            response = stream.get_final_message()

        answer = "".join(b.text for b in response.content if b.type == "text")
        return AnalysisResult(
            text=answer,
            mode=mode,
            model=response.model,
            stop_reason=response.stop_reason,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    def causal(
        self,
        event_name: str,
        event_date: str,
        docs: list[SourceDocument],
        analysis_type: str = "전체",
        on_text: Callable[[str], None] | None = None,
    ) -> AnalysisResult:
        """사건 인과관계 분석 (전체 / 원인만 / 결과만 / 국제관계)."""
        return self.analyze(
            "causal",
            {
                "event_name": event_name,
                "event_date": event_date,
                "analysis_type": analysis_type,
                "retrieved_docs": format_docs(docs),
            },
            on_text=on_text,
        )

    def compare(
        self,
        topic: str,
        source_a: SourceDocument,
        source_b: SourceDocument,
        on_text: Callable[[str], None] | None = None,
    ) -> AnalysisResult:
        """두 사료 비교·대조 (사료 비평)."""
        variables = {"comparison_topic": topic}
        for suffix, doc in (("a", source_a), ("b", source_b)):
            variables[f"source_{suffix}_name"] = doc.source_name
            variables[f"author_{suffix}"] = doc.author_or_org
            variables[f"date_{suffix}"] = doc.created_date
            variables[f"source_{suffix}_type"] = doc.source_type
            variables[f"source_{suffix}_viewpoint"] = doc.viewpoint
            variables[f"source_{suffix}_content"] = (
                doc.translation or doc.punctuated_text or doc.original_text
            )
        return self.analyze("compare", variables, on_text=on_text)

    def period_context(
        self,
        period: str,
        docs: list[SourceDocument],
        depth: str = "표준",
        on_text: Callable[[str], None] | None = None,
    ) -> AnalysisResult:
        """시대 맥락 종합 분석 (개요 / 표준 / 심층)."""
        return self.analyze(
            "context",
            {
                "period": period,
                "depth": depth,
                "retrieved_docs": format_docs(docs),
            },
            on_text=on_text,
        )

    def graph(
        self,
        docs: list[SourceDocument],
        focal_person: str = "",
        time_range: str = "",
        on_text: Callable[[str], None] | None = None,
    ) -> AnalysisResult:
        """인물·단체·사건 관계망 추출 (그래프 JSON)."""
        return self.analyze(
            "graph",
            {
                "retrieved_docs": format_docs(docs),
                "focal_person": focal_person or "(지정 없음)",
                "time_range": time_range or "(지정 없음)",
            },
            on_text=on_text,
        )

    def hanja_preprocess(
        self,
        hanja_text: str,
        source_name: str = "",
        author_or_org: str = "",
        date: str = "",
        source_reference: str = "",
        purpose: str = "역사 분석 RAG 저장",
        on_text: Callable[[str], None] | None = None,
    ) -> AnalysisResult:
        """한자·한문 사료 전처리 (원문 보존, 표점, 번역, 개체명·메타데이터)."""
        return self.analyze(
            "hanja_preprocess",
            {
                "hanja_text": hanja_text,
                "source_name": source_name,
                "author_or_org": author_or_org,
                "date": date,
                "source_reference": source_reference,
                "purpose": purpose,
            },
            on_text=on_text,
        )

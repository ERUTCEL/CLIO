"""Analyzer tests against a fake Anthropic client (no network)."""

from types import SimpleNamespace

from sagwan.analyzer import HistoryAnalyzer
from sagwan.documents import SourceDocument


class FakeStream:
    def __init__(self, request: dict):
        self.request = request
        self.text_stream = iter(["### 1. 사건 개요\n", "* 시기: 1894\n"])

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return SimpleNamespace(
            content=[
                SimpleNamespace(type="thinking", thinking=""),
                SimpleNamespace(type="text", text="### 1. 사건 개요\n* 시기: 1894\n"),
            ],
            model="claude-opus-4-8",
            stop_reason="end_turn",
            usage=SimpleNamespace(input_tokens=1200, output_tokens=340),
        )


class FakeClient:
    def __init__(self):
        self.requests: list[dict] = []
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs):
        self.requests.append(kwargs)
        return FakeStream(kwargs)


def make_analyzer() -> tuple[HistoryAnalyzer, FakeClient]:
    client = FakeClient()
    return HistoryAnalyzer(client=client), client


def test_causal_builds_request_and_result():
    analyzer, client = make_analyzer()
    docs = [SourceDocument(source_name="매천야록", source_type="1차 사료")]
    chunks: list[str] = []

    result = analyzer.causal(
        "동학농민운동", "1894", docs, analysis_type="원인만", on_text=chunks.append
    )

    request = client.requests[0]
    assert request["model"] == "claude-opus-4-8"
    assert request["thinking"] == {"type": "adaptive"}
    assert request["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "공통 분석 원칙" in request["system"][0]["text"]

    user = request["messages"][0]["content"]
    assert "사건명: 동학농민운동" in user
    assert "분석 유형: 원인만" in user
    assert "[DOC-1]\n사료명: 매천야록" in user

    assert result.text.startswith("### 1. 사건 개요")
    assert result.stop_reason == "end_turn"
    assert not result.truncated
    assert "".join(chunks) == result.text


def test_compare_maps_both_sources():
    analyzer, client = make_analyzer()
    a = SourceDocument(source_name="사료A", author_or_org="갑", translation="번역A")
    b = SourceDocument(source_name="사료B", author_or_org="을", original_text="原文B")

    analyzer.compare("전주성 입성", a, b)

    user = client.requests[0]["messages"][0]["content"]
    assert "출처: 사료A" in user and "출처: 사료B" in user
    assert "번역A" in user  # translation preferred
    assert "原文B" in user  # falls back to original text


def test_graph_defaults_for_unspecified_focus():
    analyzer, client = make_analyzer()
    analyzer.graph([SourceDocument(source_name="독립신문")])

    user = client.requests[0]["messages"][0]["content"]
    assert "(지정 없음)" in user

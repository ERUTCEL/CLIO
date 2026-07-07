"""Command-line interface: ``sagwan <mode> ...``."""

import argparse
import sys
from pathlib import Path

from sagwan.analyzer import DEFAULT_MAX_TOKENS, DEFAULT_MODEL, HistoryAnalyzer
from sagwan.documents import load_documents


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sagwan",
        description="사관(Sagwan) — 근현대 한국사 사료 분석 어시스턴트",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS)
    parser.add_argument(
        "-o", "--output", type=Path, help="분석 결과를 저장할 파일 (기본: stdout)"
    )
    parser.add_argument(
        "-q", "--quiet", action="store_true",
        help="스트리밍 출력을 끄고 완료 후 한 번에 출력",
    )
    sub = parser.add_subparsers(dest="mode", required=True)

    causal = sub.add_parser("causal", help="사건 인과관계 분석")
    causal.add_argument("--event-name", required=True)
    causal.add_argument("--event-date", required=True)
    causal.add_argument(
        "--analysis-type", default="전체",
        choices=["전체", "원인만", "결과만", "국제관계"],
    )
    causal.add_argument("--docs", required=True, help="사료 JSON 파일 또는 디렉토리")

    compare = sub.add_parser("compare", help="두 사료 비교·대조")
    compare.add_argument("--topic", required=True)
    compare.add_argument("--source-a", required=True, help="사료 A JSON 파일")
    compare.add_argument("--source-b", required=True, help="사료 B JSON 파일")

    context = sub.add_parser("context", help="시대 맥락 종합 분석")
    context.add_argument("--period", required=True)
    context.add_argument("--depth", default="표준", choices=["개요", "표준", "심층"])
    context.add_argument("--docs", required=True)

    graph = sub.add_parser("graph", help="인물 관계망 추출 (그래프 JSON)")
    graph.add_argument("--docs", required=True)
    graph.add_argument("--focal-person", default="")
    graph.add_argument("--time-range", default="")

    hanja = sub.add_parser("hanja", help="한자·한문 사료 전처리")
    hanja.add_argument("--input", required=True, help="원문 또는 OCR 결과 텍스트 파일")
    hanja.add_argument("--source-name", default="")
    hanja.add_argument("--author", default="")
    hanja.add_argument("--date", default="")
    hanja.add_argument("--reference", default="")
    hanja.add_argument("--purpose", default="역사 분석 RAG 저장")

    return parser


def _load_single(path: str) -> "SourceDocument":
    docs = load_documents(path)
    if len(docs) != 1:
        raise SystemExit(f"{path}: 사료가 정확히 1개인 파일이어야 합니다 (현재 {len(docs)}개)")
    return docs[0]


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    analyzer = HistoryAnalyzer(model=args.model, max_tokens=args.max_tokens)

    on_text = None
    if not args.quiet and args.output is None:
        on_text = lambda t: print(t, end="", flush=True)

    if args.mode == "causal":
        result = analyzer.causal(
            args.event_name, args.event_date, load_documents(args.docs),
            analysis_type=args.analysis_type, on_text=on_text,
        )
    elif args.mode == "compare":
        result = analyzer.compare(
            args.topic, _load_single(args.source_a), _load_single(args.source_b),
            on_text=on_text,
        )
    elif args.mode == "context":
        result = analyzer.period_context(
            args.period, load_documents(args.docs), depth=args.depth,
            on_text=on_text,
        )
    elif args.mode == "graph":
        result = analyzer.graph(
            load_documents(args.docs),
            focal_person=args.focal_person, time_range=args.time_range,
            on_text=on_text,
        )
    else:  # hanja
        result = analyzer.hanja_preprocess(
            Path(args.input).read_text(encoding="utf-8"),
            source_name=args.source_name, author_or_org=args.author,
            date=args.date, source_reference=args.reference,
            purpose=args.purpose, on_text=on_text,
        )

    if args.output is not None:
        args.output.write_text(result.text, encoding="utf-8")
        print(f"저장됨: {args.output}", file=sys.stderr)
    elif on_text is None:
        print(result.text)
    else:
        print()  # trailing newline after the stream

    if result.truncated:
        print(
            "경고: max_tokens에 도달하여 분석이 잘렸습니다. --max-tokens를 늘려 재시도하십시오.",
            file=sys.stderr,
        )
    print(
        f"[{result.mode}] model={result.model} "
        f"tokens={result.input_tokens}→{result.output_tokens}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

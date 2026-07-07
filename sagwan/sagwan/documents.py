"""Source document model and [DOC-N] block formatting.

A :class:`SourceDocument` mirrors the reference-document input format that
``common_rules.txt`` defines for ``{retrieved_docs}``. Documents are loaded
from JSON files (a single object, a list of objects, or a directory of
``.json`` files) and rendered into numbered ``[DOC-N]`` blocks.
"""

import json
from dataclasses import dataclass, field, fields
from pathlib import Path

# (field name, Korean label) in the order defined by common_rules.txt
_FIELD_LABELS: list[tuple[str, str]] = [
    ("source_name", "사료명"),
    ("author_or_org", "작성자/기관"),
    ("created_date", "작성 시기"),
    ("event_date", "사건 관련 시기"),
    ("source_type", "사료 유형"),
    ("viewpoint", "작성 주체 입장"),
    ("language", "원문 언어"),
    ("original_text", "원문"),
    ("punctuated_text", "표점문"),
    ("translation", "현대 한국어 번역"),
    ("people", "주요 인물"),
    ("organizations", "주요 단체"),
    ("places", "주요 장소"),
    ("keywords", "핵심 키워드"),
    ("reference", "출처 URL 또는 서지"),
    ("license", "라이선스/이용 조건"),
]


@dataclass
class SourceDocument:
    source_name: str = ""
    author_or_org: str = ""
    created_date: str = ""
    event_date: str = ""
    source_type: str = ""
    viewpoint: str = ""
    language: str = ""
    original_text: str = ""
    punctuated_text: str = ""
    translation: str = ""
    people: list[str] = field(default_factory=list)
    organizations: list[str] = field(default_factory=list)
    places: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    reference: str = ""
    license: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "SourceDocument":
        known = {f.name for f in fields(cls)}
        unknown = set(data) - known
        if unknown:
            raise ValueError(
                f"unknown document field(s): {', '.join(sorted(unknown))}; "
                f"valid fields: {', '.join(sorted(known))}"
            )
        return cls(**data)

    def to_block(self, index: int) -> str:
        lines = [f"[DOC-{index}]"]
        for name, label in _FIELD_LABELS:
            value = getattr(self, name)
            if isinstance(value, list):
                value = ", ".join(value)
            if value:
                lines.append(f"{label}: {value}")
        return "\n".join(lines)


def format_docs(docs: list[SourceDocument]) -> str:
    """Render documents as newline-separated [DOC-1], [DOC-2], ... blocks."""
    return "\n\n".join(doc.to_block(i) for i, doc in enumerate(docs, 1))


def load_documents(path: str | Path) -> list[SourceDocument]:
    """Load documents from a JSON file or a directory of ``.json`` files.

    Each file may contain one document object or a list of them.
    """
    path = Path(path)
    if path.is_dir():
        docs: list[SourceDocument] = []
        for file in sorted(path.glob("*.json")):
            docs.extend(load_documents(file))
        if not docs:
            raise FileNotFoundError(f"no .json files found in {path}")
        return docs

    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]
    return [SourceDocument.from_dict(item) for item in data]

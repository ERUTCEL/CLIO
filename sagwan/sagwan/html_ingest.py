"""HTML source-file ingestion.

Converts an HTML file (e.g. a saved archive page or scanned-source viewer
export) into a :class:`SourceDocument` draft: ``<title>`` becomes the source
name (falling back to the file name) and the visible body text becomes
``original_text``. Metadata fields (author, date, source type, ...) are left
empty for the researcher to fill in — use ``sagwan ingest-html`` to write
editable JSON drafts.

Stdlib-only (html.parser); no external dependencies.
"""

import json
from dataclasses import asdict
from html.parser import HTMLParser
from pathlib import Path

from sagwan.documents import SourceDocument

_SKIP_TAGS = {"script", "style", "noscript", "template"}
_BLOCK_TAGS = {
    "p", "div", "section", "article", "header", "footer", "li", "tr",
    "table", "blockquote", "pre", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self._in_title = False
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in _BLOCK_TAGS:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in _BLOCK_TAGS:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_title:
            self.title_parts.append(data)
        else:
            self.text_parts.append(data)


def extract_text(html: str) -> tuple[str, str]:
    """Return (title, visible text) extracted from HTML markup."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    title = " ".join("".join(parser.title_parts).split())
    lines = ("".join(parser.text_parts)).splitlines()
    cleaned = [" ".join(line.split()) for line in lines]
    text = "\n".join(line for line in cleaned if line)
    return title, text


def html_to_document(path: str | Path) -> SourceDocument:
    """Convert one HTML file to a SourceDocument draft."""
    path = Path(path)
    title, text = extract_text(path.read_text(encoding="utf-8", errors="replace"))
    return SourceDocument(
        source_name=title or path.stem,
        original_text=text,
        reference=path.name,
    )


def write_json_draft(path: str | Path, output_dir: str | Path) -> Path:
    """Convert one HTML file to an editable JSON draft; return the new path."""
    path = Path(path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = html_to_document(path)
    out = output_dir / f"{path.stem}.json"
    out.write_text(
        json.dumps(asdict(doc), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return out

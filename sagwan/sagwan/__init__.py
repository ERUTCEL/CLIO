"""Sagwan (사관) — Korean history source analysis assistant.

Named after the Joseon-dynasty court historiographers (史官), Sagwan turns a
set of prompt templates for rigorous historical source criticism into a
working analysis tool backed by the Claude API.
"""

from sagwan.analyzer import AnalysisResult, HistoryAnalyzer
from sagwan.documents import SourceDocument, format_docs, load_documents
from sagwan.templates import build_prompt, list_templates

__all__ = [
    "AnalysisResult",
    "HistoryAnalyzer",
    "SourceDocument",
    "build_prompt",
    "format_docs",
    "list_templates",
    "load_documents",
]

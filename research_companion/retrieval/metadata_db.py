import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import structlog

from ingestion.models import ChunkMetadata

log = structlog.get_logger()

_DB_PATH = os.getenv("SQLITE_DB_PATH", "./metadata.db")

_DDL = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id            TEXT PRIMARY KEY,
    source            TEXT NOT NULL,
    source_type       TEXT NOT NULL,
    title             TEXT DEFAULT '',
    author            TEXT DEFAULT '',
    year              INTEGER DEFAULT 0,
    journal           TEXT DEFAULT '',
    doi               TEXT DEFAULT '',
    collection        TEXT DEFAULT '',
    parse_quality     TEXT DEFAULT 'high',
    parser_used       TEXT DEFAULT '',
    importance_weight REAL DEFAULT 1.0,
    chunk_count       INTEGER DEFAULT 0,
    ingested_at       TEXT
);
"""


class MetadataDB:
    def __init__(self, db_path: str = _DB_PATH) -> None:
        self.db_path = db_path
        self._init()

    def _init(self) -> None:
        with self._conn() as conn:
            conn.executescript(_DDL)
        log.info("metadata_db_ready", path=self.db_path)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def upsert_chunks(self, chunks: list[tuple[str, ChunkMetadata]]) -> None:
        """Upsert one row per unique document derived from chunk metadata."""
        docs: dict[str, dict] = {}
        for _, meta in chunks:
            base_id = meta.doc_id.split("__chunk_")[0]
            if base_id not in docs:
                docs[base_id] = {
                    "doc_id": base_id,
                    "source": meta.source,
                    "source_type": meta.source_type,
                    "title": meta.title,
                    "author": meta.author,
                    "year": meta.year,
                    "journal": meta.journal,
                    "doi": meta.doi,
                    "collection": meta.collection,
                    "parse_quality": meta.parse_quality,
                    "parser_used": meta.parser_used,
                    "importance_weight": meta.importance_weight,
                    "chunk_count": 0,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                }
            docs[base_id]["chunk_count"] += 1

        with self._conn() as conn:
            conn.executemany(
                """
                INSERT INTO documents
                    (doc_id, source, source_type, title, author, year, journal, doi,
                     collection, parse_quality, parser_used, importance_weight,
                     chunk_count, ingested_at)
                VALUES
                    (:doc_id, :source, :source_type, :title, :author, :year, :journal,
                     :doi, :collection, :parse_quality, :parser_used, :importance_weight,
                     :chunk_count, :ingested_at)
                ON CONFLICT(doc_id) DO UPDATE SET
                    title             = excluded.title,
                    author            = excluded.author,
                    year              = excluded.year,
                    journal           = excluded.journal,
                    doi               = excluded.doi,
                    parse_quality     = excluded.parse_quality,
                    parser_used       = excluded.parser_used,
                    importance_weight = excluded.importance_weight,
                    chunk_count       = excluded.chunk_count,
                    ingested_at       = excluded.ingested_at
                """,
                list(docs.values()),
            )
        log.info("metadata_db_upserted", doc_count=len(docs))

    def delete_by_source(self, source: str) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM documents WHERE source = ?", (source,))
        log.info("metadata_db_deleted", source=source)

    def list_docs(self, source_type: str | None = None) -> list[dict]:
        query = "SELECT * FROM documents"
        params: list = []
        if source_type:
            query += " WHERE source_type = ?"
            params.append(source_type)
        query += " ORDER BY ingested_at DESC"
        with self._conn() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]

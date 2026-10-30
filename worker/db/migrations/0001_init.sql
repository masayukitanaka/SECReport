-- architect.md §3 データモデル（D1）概要 に対応する初期スキーマ。
-- 対象は filings / chunks と、chunks の全文検索用 FTS5 仮想テーブルのみ（索引化の実装範囲）。
-- golden_questions / eval_runs / usage_logs / ingestion_runs は Eval Runner 実装時に追加する。

CREATE TABLE IF NOT EXISTS filings (
  accession_number TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  form_type TEXT NOT NULL CHECK (form_type IN ('10-Q', '10-K')),
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter TEXT CHECK (fiscal_quarter IN ('Q1', 'Q2', 'Q3', NULL)),
  filing_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
  chunk_id TEXT PRIMARY KEY,
  accession_number TEXT NOT NULL REFERENCES filings(accession_number),
  item TEXT NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  has_table INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chunks_accession ON chunks(accession_number);

-- BM25相当のキーワード検索用（architect.md §2 の Keyword Index）
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED,
  text,
  content='chunks',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, chunk_id, text) VALUES (new.rowid, new.chunk_id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, chunk_id, text) VALUES ('delete', old.rowid, old.chunk_id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, chunk_id, text) VALUES ('delete', old.rowid, old.chunk_id, old.text);
  INSERT INTO chunks_fts(rowid, chunk_id, text) VALUES (new.rowid, new.chunk_id, new.text);
END;

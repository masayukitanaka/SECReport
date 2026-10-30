-- docs_jp/todo.md: ティッカー追加後の取得トリガーUI（暫定実装）。
-- ingestFromEdgar は複数レポートを逐次fetchするため、ctx.waitUntil でレスポンス後も
-- バックグラウンド継続させる。本テーブルはその進捗・結果を記録し、UIがポーリングで参照する。
-- 本格的な非同期基盤（Cron/Workflows）導入までの暫定。

CREATE TABLE IF NOT EXISTS ingest_jobs (
  job_id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  accession_number TEXT,
  status TEXT NOT NULL DEFAULT 'running', -- running | success | failed
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_ticker ON ingest_jobs (ticker, created_at DESC);

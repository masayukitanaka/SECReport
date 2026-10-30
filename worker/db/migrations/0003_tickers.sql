-- architect.md §2 EDGAR Fetcher に対応する対象ティッカー管理（docs_jp/todo.md フェーズ3の先）。
-- /admin/ticker から追加・削除できる。CIK・企業名は SEC EDGAR の company_tickers.json から自動解決する。

CREATE TABLE IF NOT EXISTS tickers (
  ticker TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  company_name TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

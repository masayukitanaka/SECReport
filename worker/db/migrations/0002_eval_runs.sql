-- architect.md §3 eval_runs: 評価実行ごとの指標とモデル/設定のスナップショット。
-- 初期版（Eval Runner 最小構成）は検索指標（Recall@k, MRR）のみ。faithfulness・拒否精度等は
-- Answer Generator 実装後に追加する。

CREATE TABLE IF NOT EXISTS eval_runs (
  run_id TEXT PRIMARY KEY,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  config TEXT NOT NULL,
  metrics TEXT NOT NULL,
  details TEXT NOT NULL
);

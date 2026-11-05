-- 過去の質問履歴（ChatGPT/Claude的な左メニューの履歴表示、docs_jp/todo.md参照）。
-- user_id は Auth0 の user.sub をそのまま使う。バックエンドAPIのJWT検証は未実装のため、
-- 現状はクライアントが申告する user_id をそのまま信頼する（issues.md参照、将来のJWT検証対応で解消する）。

CREATE TABLE IF NOT EXISTS question_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  filter_json TEXT,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_question_history_user ON question_history (user_id, created_at DESC);

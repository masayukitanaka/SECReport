-- P2-B: Workflows化（docs_jp/tasks.md参照）。
-- ingest_jobs の実処理を Cloudflare Workflows（IngestFilingWorkflow）に移行するにあたり、
-- 各ジョブがどの Workflow instance に対応するかを記録する（UIのポーリング・障害調査用）。

ALTER TABLE ingest_jobs ADD COLUMN workflow_instance_id TEXT;

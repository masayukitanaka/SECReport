// ティッカー追加後の取得トリガーUI（暫定実装、docs_jp/todo.md参照）。
// ingestFromEdgar はレポート数が多い書類（GOOGLで85件等）だと数十秒かかりうるため、
// ctx.waitUntil でレスポンス後もバックグラウンド継続させ、進捗はこのテーブル経由でポーリングする。
// 本格的な非同期基盤（Cron/Workflows）を入れるまでの暫定措置。
import { ingestFromEdgar, type EdgarIngestResult } from "./index.js";

export type IngestJobStatus = "running" | "success" | "failed";

export interface IngestJob {
  jobId: string;
  ticker: string;
  accessionNumber: string | null;
  status: IngestJobStatus;
  resultJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export async function createIngestJob(
  env: Env,
  ticker: string,
  accessionNumber?: string,
): Promise<string> {
  const jobId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO ingest_jobs (job_id, ticker, accession_number, status) VALUES (?1, ?2, ?3, 'running')`,
  )
    .bind(jobId, ticker.toUpperCase(), accessionNumber ?? null)
    .run();
  return jobId;
}

/** waitUntil に渡す実処理。例外を内部で捕捉し、必ずジョブ状態を確定させる。 */
export async function runIngestJob(
  env: Env,
  jobId: string,
  ticker: string,
  accessionNumber?: string,
): Promise<void> {
  try {
    const result: EdgarIngestResult = await ingestFromEdgar(env, ticker, { accessionNumber });
    await env.DB.prepare(
      `UPDATE ingest_jobs SET status = 'success', result_json = ?2, finished_at = datetime('now') WHERE job_id = ?1`,
    )
      .bind(jobId, JSON.stringify(result))
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      `UPDATE ingest_jobs SET status = 'failed', error_message = ?2, finished_at = datetime('now') WHERE job_id = ?1`,
    )
      .bind(jobId, message)
      .run();
  }
}

export async function getIngestJob(env: Env, jobId: string): Promise<IngestJob | null> {
  const row = await env.DB.prepare(
    `SELECT job_id as jobId, ticker, accession_number as accessionNumber, status,
            result_json as resultJson, error_message as errorMessage,
            created_at as createdAt, finished_at as finishedAt
     FROM ingest_jobs WHERE job_id = ?1`,
  )
    .bind(jobId)
    .first<IngestJob>();
  return row ?? null;
}

/** ティッカー管理画面での一覧表示用。直近のジョブから新しい順に返す。 */
export async function listIngestJobs(env: Env, limit = 30): Promise<IngestJob[]> {
  const { results } = await env.DB.prepare(
    `SELECT job_id as jobId, ticker, accession_number as accessionNumber, status,
            result_json as resultJson, error_message as errorMessage,
            created_at as createdAt, finished_at as finishedAt
     FROM ingest_jobs ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<IngestJob>();
  return results;
}

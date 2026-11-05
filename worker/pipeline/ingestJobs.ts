// ティッカー追加後の取得トリガーUI（docs_jp/tasks.md参照）。
// 実処理はCloudflare Workflows（IngestFilingWorkflow、ingestWorkflow.ts）に委譲し、
// このファイルはジョブのキュー投入・一覧取得（UIポーリング用）のみを担当する。
//
// 遡及取得（複数四半期の一括取得、docs_jp/tasks.md参照）は、複数ジョブを status='queued' で
// 一括投入し、1件のWorkflowが完了するたびに同一ティッカーの次の queued ジョブのWorkflowを
// 起動することで「順次実行」を実現する（SEC EDGARへの同時アクセスを避けるため、並列実行はしない。
// 昇格ロジック自体はWorkflow側・ingestWorkflow.tsのpromoteNextQueuedJobにある）。
import { listFilings } from "./fetcher.js";
import { resolveCik } from "./tickers.js";
import { isAccessionNumberIngested } from "./filingsRepo.js";

export type IngestJobStatus = "queued" | "running" | "success" | "failed";

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

/** ジョブを1件作成し、対応するWorkflow instanceを起動する（instance idはjob_idと同一にする）。 */
export async function createIngestJob(
  env: Env,
  ticker: string,
  accessionNumber?: string,
): Promise<string> {
  const jobId = crypto.randomUUID();
  const normalizedTicker = ticker.toUpperCase();
  await env.DB.prepare(
    `INSERT INTO ingest_jobs (job_id, ticker, accession_number, status, workflow_instance_id) VALUES (?1, ?2, ?3, 'queued', ?1)`,
  )
    .bind(jobId, normalizedTicker, accessionNumber ?? null)
    .run();
  await env.INGEST_FILING_WORKFLOW.create({
    id: jobId,
    params: { jobId, ticker: normalizedTicker, accessionNumber },
  });
  return jobId;
}

/**
 * 遡及取得：複数の accessionNumber を status='queued' として一括投入し、最初の1件だけ
 * Workflowを起動する。2件目以降は、各WorkflowのpromoteNextQueuedJob（ingestWorkflow.ts）が
 * 完了時に自動的に次のWorkflowを起動することで順次実行される。
 */
export async function enqueueIngestJobs(
  env: Env,
  ticker: string,
  accessionNumbers: string[],
): Promise<{ queuedJobIds: string[]; firstJobId: string | null }> {
  const normalizedTicker = ticker.toUpperCase();
  const jobIds = accessionNumbers.map(() => crypto.randomUUID());

  const statements = accessionNumbers.map((accessionNumber, i) =>
    env.DB.prepare(
      `INSERT INTO ingest_jobs (job_id, ticker, accession_number, status, workflow_instance_id) VALUES (?1, ?2, ?3, 'queued', ?1)`,
    ).bind(jobIds[i], normalizedTicker, accessionNumber),
  );
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const firstJobId = jobIds[0] ?? null;
  if (firstJobId) {
    await env.INGEST_FILING_WORKFLOW.create({
      id: firstJobId,
      params: { jobId: firstJobId, ticker: normalizedTicker, accessionNumber: accessionNumbers[0] },
    });
  }

  return { queuedJobIds: jobIds, firstJobId };
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

export class NoNewFilingsToBackfillError extends Error {
  constructor(ticker: string, fromYear: number) {
    super(`${ticker}: ${fromYear}年以降の未取得10-Qが見つかりませんでした（すべて取得済み、または対象期間に提出がありません）。`);
  }
}

/**
 * 遡及取得（docs_jp/tasks.md「ティッカー追加時のバックフィル範囲」参照）。
 * 指定ティッカーについて、SEC EDGAR上の10-Q一覧のうち reportDate が fromYear 年1月1日以降で、
 * まだ filings テーブルに取り込まれていないものを全てキューに積み、最初の1件の実行を開始する。
 * 古い四半期から順に取り込む方が自然なため、キューには古い順（reportDate昇順）で積む。
 */
export async function enqueueBackfillJobs(
  env: Env,
  ticker: string,
  fromYear: number,
): Promise<{ queuedJobIds: string[]; firstJobId: string | null; accessionNumbers: string[] }> {
  const cik = await resolveCik(env, ticker);
  if (!cik) {
    throw new Error(`Unknown ticker: ${ticker}. Add it via /admin/ticker first.`);
  }

  const filings = await listFilings(cik, env.SEC_EDGAR_USER_AGENT, "10-Q");
  const candidates = filings
    .filter((f) => Number(f.reportDate.slice(0, 4)) >= fromYear)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  const toIngest: string[] = [];
  for (const filing of candidates) {
    const alreadyIngested = await isAccessionNumberIngested(env, filing.accessionNumber);
    if (!alreadyIngested) {
      toIngest.push(filing.accessionNumber);
    }
  }

  if (toIngest.length === 0) {
    throw new NoNewFilingsToBackfillError(ticker, fromYear);
  }

  const { queuedJobIds, firstJobId } = await enqueueIngestJobs(env, ticker, toIngest);
  return { queuedJobIds, firstJobId, accessionNumbers: toIngest };
}

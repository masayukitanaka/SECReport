// 資料の自動取り込み（ポーリング、docs_jp/tasks.md P2-A参照）。
// Cloudflare Cron Triggers（wrangler.jsoncの`triggers.crons`）から呼ばれる想定。
// 対象ティッカー全件に対し、SEC EDGAR上の最新10-Qが未取得であれば取得を開始する。
// 実処理はCloudflare Workflows（IngestFilingWorkflow、P2-B参照）に委譲するため、
// ここでの「取得」はWorkflowの起動を指し、完了を待たない。
import { listTickers } from "./tickers.js";
import { listFilings } from "./fetcher.js";
import { createIngestJob } from "./ingestJobs.js";
import { isAccessionNumberIngested } from "./filingsRepo.js";

export interface TickerPollResult {
  ticker: string;
  outcome: "ingest_started" | "already_up_to_date" | "skipped_running_job" | "no_filings_found" | "error";
  accessionNumber?: string;
  errorMessage?: string;
}

export interface PollResult {
  startedAt: string;
  finishedAt: string;
  results: TickerPollResult[];
}

/**
 * tickersテーブル全件について、SEC EDGAR上の最新10-Qのaccession_numberを確認し、
 * filingsテーブルに未取得であれば取得・索引化する。
 *
 * 冪等性の担保：
 * - 「最新のaccession_numberが既にfilingsテーブルに存在するか」を毎回チェックしてから
 *   ingestFromEdgarを呼ぶため、同じ書類を何度ポーリングしても二重取得・重複コストは発生しない
 *   （indexFiling側もON CONFLICT DO UPDATEで冪等だが、そもそも無駄なSEC EDGARへのfetch・
 *   embedding・Vectorize upsertを避けるためにここで事前にスキップする）
 * - 同一ティッカーに対して実行中（status='running'）のジョブが既にあれば、今回の実行はスキップする
 *   （Cronの実行間隔よりingestFromEdgarの処理時間が長引いた場合の多重実行を防ぐ）
 */
export async function pollAllTickersForNewFilings(env: Env): Promise<PollResult> {
  const startedAt = new Date().toISOString();
  const tickers = await listTickers(env);
  const results: TickerPollResult[] = [];

  for (const { ticker, cik } of tickers) {
    try {
      const result = await pollSingleTicker(env, ticker, cik);
      results.push(result);
    } catch (error) {
      results.push({
        ticker,
        outcome: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { startedAt, finishedAt: new Date().toISOString(), results };
}

async function pollSingleTicker(env: Env, ticker: string, cik: string): Promise<TickerPollResult> {
  const hasRunningJob = await hasRunningIngestJob(env, ticker);
  if (hasRunningJob) {
    return { ticker, outcome: "skipped_running_job" };
  }

  const filings = await listFilings(cik, env.SEC_EDGAR_USER_AGENT, "10-Q");
  if (filings.length === 0) {
    return { ticker, outcome: "no_filings_found" };
  }

  const latest = filings[0];
  const alreadyIngested = await isAccessionNumberIngested(env, latest.accessionNumber);
  if (alreadyIngested) {
    return { ticker, outcome: "already_up_to_date", accessionNumber: latest.accessionNumber };
  }

  await createIngestJob(env, ticker, latest.accessionNumber);
  return { ticker, outcome: "ingest_started", accessionNumber: latest.accessionNumber };
}

async function hasRunningIngestJob(env: Env, ticker: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM ingest_jobs WHERE ticker = ?1 AND status = 'running' LIMIT 1`,
  )
    .bind(ticker.toUpperCase())
    .first();
  return row !== null;
}

// EDGAR Fetcher〜索引化のWorkflow化（docs_jp/tasks.md P2-B参照）。
// 従来の ingestFromEdgar（1関数内でFetch→Parse→Chunk→Indexを同期直列実行）は、
// 複数レポートのうち1件がSEC EDGAR側の一時的な503等で失敗すると、既に取得済みの
// 他レポート分も含めて全てやり直しになっていた（実例：docs_jp/tasks.md参照、GOOGLで
// 40件弱あるレポートの1件で503が続き、他の成功分も含めてジョブ全体が失敗）。
//
// Cloudflare Workflowsのstepは個別に結果が永続化され、失敗時は失敗したstepのみ
// リトライ・再開されるため、レポート取得を1件ずつ個別のstepに分割することでこの問題を解消する。
//
// 注意：Workflowはstep間で休止・再起動されうるため、モジュールレベルの変数による
// レート制限（secEdgarFetch.ts の通常版）はstepをまたぐと信頼できない。そのため、
// レポート取得には secEdgarFetchWithRetry（レート制限なし、リトライのみ）を使い、
// レート制限は各step間で明示的な step.sleep により行う。
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { secEdgarFetchWithRetry, MIN_REQUEST_INTERVAL_MS } from "./secEdgarFetch.js";
import { listFilings, inferFiscalQuarter, padCik, parseFilingSummary, type FilingListItem } from "./fetcher.js";
import { parseFilingFromReports, type RawReport } from "./parser.js";
import { chunkFiling } from "./chunker.js";
import { indexFiling, type IndexResult } from "./indexer.js";
import { resolveCik } from "./tickers.js";
import type { FilingMeta } from "./types.js";

export interface IngestFilingWorkflowParams {
  jobId: string;
  ticker: string;
  accessionNumber?: string;
}

export interface IngestFilingWorkflowResult extends IndexResult {
  accessionNumber: string;
  reportsFetched: number;
}

const STEP_RETRY_CONFIG = { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } } as const;

export class IngestFilingWorkflow extends WorkflowEntrypoint<Env, IngestFilingWorkflowParams> {
  async run(event: WorkflowEvent<IngestFilingWorkflowParams>, step: WorkflowStep): Promise<IngestFilingWorkflowResult> {
    const { jobId, ticker, accessionNumber } = event.payload;
    const env = this.env;

    await step.do("mark-running", async () => {
      await env.DB.prepare(`UPDATE ingest_jobs SET status = 'running' WHERE job_id = ?1`).bind(jobId).run();
    });

    try {
      const result = await this.runIngest(step, ticker, accessionNumber);

      await step.do("mark-success", async () => {
        await env.DB.prepare(
          `UPDATE ingest_jobs SET status = 'success', result_json = ?2, finished_at = datetime('now') WHERE job_id = ?1`,
        )
          .bind(jobId, JSON.stringify(result))
          .run();
      });

      await this.promoteNextQueuedJob(step, ticker);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await step.do("mark-failed", async () => {
        await env.DB.prepare(
          `UPDATE ingest_jobs SET status = 'failed', error_message = ?2, finished_at = datetime('now') WHERE job_id = ?1`,
        )
          .bind(jobId, message)
          .run();
      });

      await this.promoteNextQueuedJob(step, ticker);
      throw error;
    }
  }

  private async runIngest(
    step: WorkflowStep,
    ticker: string,
    accessionNumber: string | undefined,
  ): Promise<IngestFilingWorkflowResult> {
    const env = this.env;
    const userAgent = env.SEC_EDGAR_USER_AGENT;

    const cik = await step.do("resolve-cik", STEP_RETRY_CONFIG, async () => {
      const resolved = await resolveCik(env, ticker);
      if (!resolved) {
        throw new Error(`Unknown ticker: ${ticker}. Add it via /admin/ticker first.`);
      }
      return resolved;
    });

    const target = await step.do("list-filings", STEP_RETRY_CONFIG, async () => {
      const filings = await listFilings(cik, userAgent, "10-Q");
      if (filings.length === 0) {
        throw new Error(`No 10-Q filings found for ${ticker} (CIK ${cik})`);
      }
      const found: FilingListItem | undefined = accessionNumber
        ? filings.find((f) => f.accessionNumber === accessionNumber)
        : filings[0];
      if (!found) {
        throw new Error(`accession_number ${accessionNumber} not found for ${ticker}`);
      }
      return found;
    });

    const paddedCik = padCik(cik);
    const accessionNoDash = target.accessionNumber.replace(/-/g, "");
    const baseUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNoDash}`;

    const entries = await step.do("fetch-filing-summary", STEP_RETRY_CONFIG, async () => {
      const response = await secEdgarFetchWithRetry(`${baseUrl}/FilingSummary.xml`, userAgent);
      const xml = await response.text();
      return parseFilingSummary(xml);
    });

    // レポートを1件ずつ個別のstepとしてfetchする。あるレポートで一時的な503等が発生しても
    // Workflowがそのstepだけリトライするため、既に取得済みの他レポート分はやり直しにならない。
    const reports: RawReport[] = [];
    const rawFiles: { key: string; body: string }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (i > 0) {
        // SEC EDGARのレート上限（10 req/sec）に対する安全マージン。Workflowのstepは
        // 休止・再起動されうるためモジュール変数でのレート制限は使わず、step.sleepで待つ。
        // WorkflowSleepDurationの文字列形式は秒・分単位のラベルのみでミリ秒指定がないため、
        // number型（ミリ秒）で渡す。
        await step.sleep("rate-limit-wait", MIN_REQUEST_INTERVAL_MS);
      }
      const report = await step.do(`fetch-report-${i}`, STEP_RETRY_CONFIG, async () => {
        const response = await secEdgarFetchWithRetry(`${baseUrl}/${entry.htmlFileName}`, userAgent);
        const html = await response.text();
        return { title: entry.shortName, html, htmlFileName: entry.htmlFileName };
      });
      reports.push({ title: report.title, html: report.html });
      rawFiles.push({ key: `${paddedCik}/${accessionNoDash}/${report.htmlFileName}`, body: report.html });
    }

    await step.do("save-raw-to-r2", STEP_RETRY_CONFIG, async () => {
      await Promise.all(rawFiles.map((file) => env.FILINGS_BUCKET.put(file.key, file.body)));
    });

    const { fiscalYear, fiscalQuarter } = inferFiscalQuarter(target.reportDate);
    const meta: FilingMeta = {
      ticker: ticker.toUpperCase(),
      formType: "10-Q",
      fiscalYear,
      fiscalQuarter,
      filingUrl: `${baseUrl}/${target.primaryDocument}`,
      accessionNumber: target.accessionNumber,
    };

    const chunks = await step.do("parse-and-chunk", STEP_RETRY_CONFIG, async () => {
      const sections = parseFilingFromReports(reports);
      return chunkFiling(meta.accessionNumber, sections);
    });

    const indexResult = await step.do("index", STEP_RETRY_CONFIG, async () => indexFiling(env, meta, chunks));

    return { ...indexResult, accessionNumber: target.accessionNumber, reportsFetched: reports.length };
  }

  /**
   * 遡及取得（複数四半期の一括取得）の順次実行。同一ティッカーの次のqueuedジョブがあれば
   * 新しいWorkflow instanceを起動する。これにより別途Cron等を用意せず「1件完了したら次へ」を実現する
   * （docs_jp/tasks.md P2-A参照。従来はrunIngestJobの再帰呼び出しで実現していたロジックの移植）。
   */
  private async promoteNextQueuedJob(step: WorkflowStep, ticker: string): Promise<void> {
    const env = this.env;
    const next = await step.do("promote-next-queued", async () => {
      const row = await env.DB.prepare(
        `SELECT job_id as jobId, accession_number as accessionNumber FROM ingest_jobs
         WHERE ticker = ?1 AND status = 'queued' ORDER BY created_at ASC LIMIT 1`,
      )
        .bind(ticker.toUpperCase())
        .first<{ jobId: string; accessionNumber: string | null }>();
      return row ?? null;
    });
    if (!next) return;

    await step.do("start-next-workflow", async () => {
      await env.INGEST_FILING_WORKFLOW.create({
        id: next.jobId,
        params: { jobId: next.jobId, ticker, accessionNumber: next.accessionNumber ?? undefined },
      });
    });
  }
}

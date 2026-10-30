import { parseFiling, parseFilingFromReports } from "./parser.js";
import { chunkFiling } from "./chunker.js";
import { indexFiling, type IndexResult } from "./indexer.js";
import { listFilings, fetchFiling, type FilingListItem } from "./fetcher.js";
import { resolveCik } from "./tickers.js";
import type { FilingMeta } from "./types.js";

export type { FilingMeta, Chunk, ParsedSection, FormType, FiscalQuarter } from "./types.js";
export { parseFiling, parseFilingFromReports } from "./parser.js";
export { chunkFiling } from "./chunker.js";
export { indexFiling, deleteFiling, listIndexedFilings, type IndexedFiling } from "./indexer.js";
export { embedQuery, embedTexts } from "./embedder.js";
export { hybridSearch, type RetrievedChunk, type RetrieverFilter } from "./retriever.js";
export { generateAnswer, type GeneratedAnswer } from "./generator.js";
export { listFilings, fetchFiling, type FilingListItem } from "./fetcher.js";
export {
  resolveCik,
  resolveCompanyName,
  listTickers,
  addTicker,
  removeTicker,
  TickerNotFoundError,
  TickerAlreadyExistsError,
  type TickerInfo,
} from "./tickers.js";
export {
  createIngestJob,
  runIngestJob,
  getIngestJob,
  listIngestJobs,
  type IngestJob,
  type IngestJobStatus,
} from "./ingestJobs.js";

/**
 * Parser → Chunking Service → Indexing Workflow を直列に実行する。
 * ローカルサンプル（R-reports結合済みHTML）を渡す経路。オンライン取得は ingestFromEdgar を使う。
 */
export async function ingestFiling(env: Env, meta: FilingMeta, html: string): Promise<IndexResult> {
  const sections = parseFiling(html);
  const chunks = await chunkFiling(meta.accessionNumber, sections);
  return indexFiling(env, meta, chunks);
}

export interface EdgarIngestResult extends IndexResult {
  accessionNumber: string;
  reportsFetched: number;
}

/**
 * architect.md §2 EDGAR Fetcher 〜 Indexing Workflow を一気通貫で実行する（docs_jp/todo.md フェーズ1）。
 * ticker から対象の10-Q一覧を取得し、指定（または最新）の accession_number の書類を
 * 取得・R2保存・パース・チャンク化・索引化する。
 */
export async function ingestFromEdgar(
  env: Env,
  ticker: string,
  options?: { accessionNumber?: string },
): Promise<EdgarIngestResult> {
  const cik = await resolveCik(env, ticker);
  if (!cik) {
    throw new Error(`Unknown ticker: ${ticker}. Add it via /admin/ticker first.`);
  }

  const userAgent = env.SEC_EDGAR_USER_AGENT;
  const filings = await listFilings(cik, userAgent, "10-Q");
  if (filings.length === 0) {
    throw new Error(`No 10-Q filings found for ${ticker} (CIK ${cik})`);
  }

  const target: FilingListItem | undefined = options?.accessionNumber
    ? filings.find((f) => f.accessionNumber === options.accessionNumber)
    : filings[0];
  if (!target) {
    throw new Error(`accession_number ${options?.accessionNumber} not found for ${ticker}`);
  }

  const fetched = await fetchFiling(cik, target, userAgent);

  await Promise.all(
    fetched.rawFiles.map((file) => env.FILINGS_BUCKET.put(file.key, file.body)),
  );

  const meta: FilingMeta = {
    ticker: ticker.toUpperCase(),
    formType: "10-Q",
    fiscalYear: fetched.fiscalYear,
    fiscalQuarter: fetched.fiscalQuarter,
    filingUrl: fetched.filingUrl,
    accessionNumber: fetched.accessionNumber,
  };

  const sections = parseFilingFromReports(fetched.reports);
  const chunks = await chunkFiling(meta.accessionNumber, sections);
  const indexResult = await indexFiling(env, meta, chunks);

  return { ...indexResult, accessionNumber: fetched.accessionNumber, reportsFetched: fetched.reports.length };
}

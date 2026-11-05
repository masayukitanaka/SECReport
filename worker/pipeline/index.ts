import { parseFiling } from "./parser.js";
import { chunkFiling } from "./chunker.js";
import { indexFiling, type IndexResult } from "./indexer.js";
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
  getIngestJob,
  listIngestJobs,
  enqueueBackfillJobs,
  NoNewFilingsToBackfillError,
  type IngestJob,
  type IngestJobStatus,
} from "./ingestJobs.js";
export {
  recordQuestionHistory,
  listQuestionHistorySummaries,
  getQuestionHistoryEntry,
  deleteQuestionHistoryEntry,
  type QuestionHistoryEntry,
  type QuestionHistorySummary,
} from "./questionHistory.js";
export { pollAllTickersForNewFilings, type PollResult, type TickerPollResult } from "./polling.js";
export { IngestFilingWorkflow, type IngestFilingWorkflowResult } from "./ingestWorkflow.js";

/**
 * Parser → Chunking Service → Indexing Workflow を直列に実行する。
 * ローカルサンプル（R-reports結合済みHTML）を渡す経路。
 * オンライン取得（EDGAR Fetcher経由）はIngestFilingWorkflow（ingestWorkflow.ts、P2-B参照）を使う。
 */
export async function ingestFiling(env: Env, meta: FilingMeta, html: string): Promise<IndexResult> {
  const sections = parseFiling(html);
  const chunks = await chunkFiling(meta.accessionNumber, sections);
  return indexFiling(env, meta, chunks);
}

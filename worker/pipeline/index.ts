import { parseFiling } from "./parser.js";
import { chunkFiling } from "./chunker.js";
import { indexFiling, type IndexResult } from "./indexer.js";
import type { FilingMeta } from "./types.js";

export type { FilingMeta, Chunk, ParsedSection, FormType, FiscalQuarter } from "./types.js";
export { parseFiling } from "./parser.js";
export { chunkFiling } from "./chunker.js";
export { indexFiling } from "./indexer.js";
export { embedQuery, embedTexts } from "./embedder.js";
export { hybridSearch, type RetrievedChunk, type RetrieverFilter } from "./retriever.js";
export { generateAnswer, type GeneratedAnswer } from "./generator.js";

/**
 * Parser → Chunking Service → Indexing Workflow を直列に実行する。
 * EDGAR Fetcher（SEC EDGAR への fetch・R2 への原本保存）は未実装のため、
 * 呼び出し元が HTML 原本と書類メタデータを渡す前提（docs_jp/issues.md 参照）。
 */
export async function ingestFiling(env: Env, meta: FilingMeta, html: string): Promise<IndexResult> {
  const sections = parseFiling(html);
  const chunks = await chunkFiling(meta.accessionNumber, sections);
  return indexFiling(env, meta, chunks);
}

import type { Chunk, FilingMeta } from "./types.js";
import { embedTexts } from "./embedder.js";

// Vectorize へのバッチ upsert は一度に送れる件数に実務上の上限があるため分割する。
const EMBED_BATCH_SIZE = 50;

export interface IndexResult {
  filingsWritten: number;
  chunksWritten: number;
}

/** architect.md §2 Indexing Workflow。チャンクの埋め込み生成・Vectorize upsert・D1 格納を行う。 */
export async function indexFiling(env: Env, meta: FilingMeta, chunks: Chunk[]): Promise<IndexResult> {
  await upsertFilingMeta(env.DB, meta);

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedTexts(env.AI, batch.map((c) => c.text));

    await env.VECTORIZE.upsert(
      batch.map((chunk, j) => ({
        id: chunk.chunkId,
        values: vectors[j],
        metadata: {
          accessionNumber: chunk.accessionNumber,
          ticker: meta.ticker,
          formType: meta.formType,
          fiscalYear: meta.fiscalYear,
          fiscalQuarter: meta.fiscalQuarter ?? "",
          item: chunk.item,
        },
      })),
    );

    await insertChunks(env.DB, batch);
  }

  return { filingsWritten: 1, chunksWritten: chunks.length };
}

// Vectorize の delete API は1リクエストあたり最大100件まで。
const VECTORIZE_DELETE_BATCH_SIZE = 100;

/** 重複・古い索引データの削除（例：再取り込みや、旧 accession_number 体系からの移行）。 */
export async function deleteFiling(env: Env, accessionNumber: string): Promise<{ chunksDeleted: number }> {
  const { results } = await env.DB.prepare(`SELECT chunk_id FROM chunks WHERE accession_number = ?1`)
    .bind(accessionNumber)
    .all<{ chunk_id: string }>();

  const chunkIds = results.map((r) => r.chunk_id);
  for (let i = 0; i < chunkIds.length; i += VECTORIZE_DELETE_BATCH_SIZE) {
    await env.VECTORIZE.deleteByIds(chunkIds.slice(i, i + VECTORIZE_DELETE_BATCH_SIZE));
  }
  if (chunkIds.length > 0) {
    await env.DB.prepare(`DELETE FROM chunks WHERE accession_number = ?1`).bind(accessionNumber).run();
  }
  await env.DB.prepare(`DELETE FROM filings WHERE accession_number = ?1`).bind(accessionNumber).run();

  return { chunksDeleted: chunkIds.length };
}

export interface IndexedFiling {
  accessionNumber: string;
  ticker: string;
  formType: string;
  fiscalYear: number;
  fiscalQuarter: string | null;
  filingUrl: string;
  chunkCount: number;
}

/** UI の企業・四半期絞り込み（FilterPanel）を動的に生成するための、投入済み書類一覧。 */
export async function listIndexedFilings(env: Env): Promise<IndexedFiling[]> {
  const { results } = await env.DB.prepare(
    `SELECT f.accession_number as accessionNumber, f.ticker, f.form_type as formType,
            f.fiscal_year as fiscalYear, f.fiscal_quarter as fiscalQuarter, f.filing_url as filingUrl,
            COUNT(c.chunk_id) as chunkCount
     FROM filings f
     LEFT JOIN chunks c ON c.accession_number = f.accession_number
     GROUP BY f.accession_number
     ORDER BY f.ticker, f.fiscal_year DESC, f.fiscal_quarter DESC`,
  ).all<IndexedFiling>();
  return results;
}

async function upsertFilingMeta(db: D1Database, meta: FilingMeta): Promise<void> {
  await db
    .prepare(
      `INSERT INTO filings (accession_number, ticker, form_type, fiscal_year, fiscal_quarter, filing_url)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(accession_number) DO UPDATE SET
         ticker = excluded.ticker,
         form_type = excluded.form_type,
         fiscal_year = excluded.fiscal_year,
         fiscal_quarter = excluded.fiscal_quarter,
         filing_url = excluded.filing_url`,
    )
    .bind(meta.accessionNumber, meta.ticker, meta.formType, meta.fiscalYear, meta.fiscalQuarter, meta.filingUrl)
    .run();
}

async function insertChunks(db: D1Database, chunks: Chunk[]): Promise<void> {
  const statements = chunks.map((chunk) =>
    db
      .prepare(
        `INSERT INTO chunks (chunk_id, accession_number, item, seq, text, vector_id, has_table)
         VALUES (?1, ?2, ?3, ?4, ?5, ?1, ?6)
         ON CONFLICT(chunk_id) DO UPDATE SET
           text = excluded.text,
           has_table = excluded.has_table`,
      )
      .bind(chunk.chunkId, chunk.accessionNumber, chunk.item, chunk.seq, chunk.text, chunk.hasTable ? 1 : 0),
  );
  await db.batch(statements);
}

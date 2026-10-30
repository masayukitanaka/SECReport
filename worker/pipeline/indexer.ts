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

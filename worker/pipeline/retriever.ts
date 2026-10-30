import { embedQuery } from "./embedder.js";
import { translateToEnglishIfNeeded } from "./translator.js";

export interface RetrievedChunk {
  chunkId: string;
  accessionNumber: string;
  item: string;
  text: string;
  score: number;
}

export interface RetrieverFilter {
  ticker?: string;
  formType?: string;
  fiscalYear?: number;
  fiscalQuarter?: string;
}

const VECTOR_TOP_K = 20;
const KEYWORD_TOP_K = 20;
// RRF（architect.md §6.1 で確定した統合方法）の定数。ランクのみを使い、スコアスケールの差異を無視する。
const RRF_K = 60;

/** Vectorize（密ベクトル）と D1 FTS5（キーワード）の結果を RRF で統合する（architect.md §2 Hybrid Retriever）。 */
export async function hybridSearch(env: Env, query: string, topK: number, filter?: RetrieverFilter): Promise<RetrievedChunk[]> {
  // チャンク本体（英語）とのマッチ精度を上げるため、検索前に質問を英語化する（docs_jp/issues.md 参照）。
  const searchQuery = await translateToEnglishIfNeeded(env.AI, query);

  const [vectorRanked, keywordRanked] = await Promise.all([
    vectorSearch(env, searchQuery, filter),
    keywordSearch(env, searchQuery, filter),
  ]);

  const rrfScore = new Map<string, number>();
  const chunkInfo = new Map<string, { accessionNumber: string; item: string; text: string }>();

  for (const [rank, row] of vectorRanked.entries()) {
    rrfScore.set(row.chunkId, (rrfScore.get(row.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
    chunkInfo.set(row.chunkId, row);
  }
  for (const [rank, row] of keywordRanked.entries()) {
    rrfScore.set(row.chunkId, (rrfScore.get(row.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
    chunkInfo.set(row.chunkId, row);
  }

  return Array.from(rrfScore.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([chunkId, score]) => ({
      chunkId,
      score,
      ...chunkInfo.get(chunkId)!,
    }));
}

interface RankedRow {
  chunkId: string;
  accessionNumber: string;
  item: string;
  text: string;
}

async function vectorSearch(env: Env, query: string, filter?: RetrieverFilter): Promise<RankedRow[]> {
  const vector = await embedQuery(env.AI, query);
  const vectorizeFilter = buildVectorizeFilter(filter);
  const result = await env.VECTORIZE.query(vector, {
    topK: VECTOR_TOP_K,
    returnMetadata: "all",
    ...(vectorizeFilter ? { filter: vectorizeFilter } : {}),
  });

  if (result.matches.length === 0) return [];

  // Vectorize のメタデータには本文を含めていないため（容量節約）、D1 からテキストを引く。
  const ids = result.matches.map((m) => m.id);
  const rows = await fetchChunksByIds(env.DB, ids);
  return result.matches
    .map((m) => rows.get(m.id))
    .filter((row): row is RankedRow => row !== undefined);
}

async function keywordSearch(env: Env, query: string, filter?: RetrieverFilter): Promise<RankedRow[]> {
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  const conditions: string[] = [];
  const params: unknown[] = [ftsQuery];
  if (filter?.ticker) {
    conditions.push("f.ticker = ?");
    params.push(filter.ticker);
  }
  if (filter?.formType) {
    conditions.push("f.form_type = ?");
    params.push(filter.formType);
  }
  if (filter?.fiscalYear !== undefined) {
    conditions.push("f.fiscal_year = ?");
    params.push(filter.fiscalYear);
  }
  if (filter?.fiscalQuarter) {
    conditions.push("f.fiscal_quarter = ?");
    params.push(filter.fiscalQuarter);
  }
  const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT c.chunk_id as chunkId, c.accession_number as accessionNumber, c.item as item, c.text as text
     FROM chunks_fts
     JOIN chunks c ON c.rowid = chunks_fts.rowid
     JOIN filings f ON f.accession_number = c.accession_number
     WHERE chunks_fts MATCH ? ${whereClause}
     ORDER BY rank
     LIMIT ${KEYWORD_TOP_K}`,
  )
    .bind(...params)
    .all<RankedRow>();

  return results;
}

async function fetchChunksByIds(db: D1Database, ids: string[]): Promise<Map<string, RankedRow>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT chunk_id as chunkId, accession_number as accessionNumber, item, text
       FROM chunks WHERE chunk_id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<RankedRow>();
  return new Map(results.map((row) => [row.chunkId, row]));
}

function buildVectorizeFilter(filter?: RetrieverFilter): VectorizeVectorMetadataFilter | undefined {
  if (!filter) return undefined;
  const clauses: VectorizeVectorMetadataFilter = {};
  if (filter.ticker) clauses.ticker = filter.ticker;
  if (filter.formType) clauses.formType = filter.formType;
  if (filter.fiscalYear !== undefined) clauses.fiscalYear = filter.fiscalYear;
  if (filter.fiscalQuarter) clauses.fiscalQuarter = filter.fiscalQuarter;
  return Object.keys(clauses).length > 0 ? clauses : undefined;
}

// FTS5 の MATCH 構文で特別な意味を持つ記号を除去し、質問文の単語をそのまま OR 検索できるようにする。
// チャンク本体は英語の財務諸表原文のため、質問文（日本語）から拾えるのは主に英数字トークン（企業名・数値等）。
// 日本語は単語境界が無く空白区切りでは分割できないため（CJK文字列全体が1トークンになり誤って0件化する
// 不具合があった。docs_jp/issues.md 参照）、CJK連続文字列は2文字の重複 bigram に分割してから OR 結合する。
function sanitizeFtsQuery(query: string): string {
  const tokens: string[] = [];
  const asciiOrNumberRun = /[\p{Script=Latin}\p{N}]+/gu;
  let lastIndex = 0;

  for (const match of query.matchAll(asciiOrNumberRun)) {
    if (match.index! > lastIndex) {
      tokens.push(...bigrams(query.slice(lastIndex, match.index)));
    }
    tokens.push(match[0]);
    lastIndex = match.index! + match[0].length;
  }
  if (lastIndex < query.length) {
    tokens.push(...bigrams(query.slice(lastIndex)));
  }

  return tokens.filter((t) => t.trim().length > 0).join(" OR ");
}

function bigrams(text: string): string[] {
  const chars = Array.from(text).filter((c) => /[\p{L}\p{N}]/u.test(c));
  if (chars.length === 0) return [];
  if (chars.length === 1) return [chars[0]];
  const grams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    grams.push(chars[i] + chars[i + 1]);
  }
  return grams;
}

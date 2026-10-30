// 対象ティッカー管理（docs_jp/todo.md フェーズ3の先、/admin/ticker から追加・削除）。
// D1 の tickers テーブルで管理する。追加時は SEC EDGAR の company_tickers.json から
// CIK・企業名を自動解決する（ユーザーはティッカー文字列を入力するだけでよい）。
import { secEdgarFetch } from "./secEdgarFetch.js";

export interface TickerInfo {
  ticker: string;
  cik: string;
  companyName: string;
  addedAt: string;
}

export async function listTickers(env: Env): Promise<TickerInfo[]> {
  const { results } = await env.DB.prepare(
    `SELECT ticker, cik, company_name as companyName, added_at as addedAt FROM tickers ORDER BY ticker`,
  ).all<TickerInfo>();
  return results;
}

export async function resolveCik(env: Env, ticker: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT cik FROM tickers WHERE ticker = ?1`)
    .bind(ticker.toUpperCase())
    .first<{ cik: string }>();
  return row?.cik ?? null;
}

export async function resolveCompanyName(env: Env, ticker: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT company_name as companyName FROM tickers WHERE ticker = ?1`)
    .bind(ticker.toUpperCase())
    .first<{ companyName: string }>();
  return row?.companyName ?? null;
}

interface SecCompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

// company_tickers.json（約780KB・全上場企業分）への SEC EDGAR 側の 403 が、通常の EDGAR
// アクセス（FilingSummary.xml・RN.htm 等）より頻発する事例を確認した（issues.md §16参照）。
// 毎回フルダウンロードする代わりに R2 にキャッシュし、有効期限内は SEC EDGAR への再取得を避ける。
const TICKER_CACHE_KEY = "_cache/company_tickers.json";
const TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間

async function fetchCompanyTickersWithCache(
  env: Env,
): Promise<Record<string, SecCompanyTickerEntry>> {
  const cached = await env.FILINGS_BUCKET.get(TICKER_CACHE_KEY);
  if (cached) {
    const fetchedAt = new Date(cached.customMetadata?.fetchedAt ?? 0).getTime();
    if (Date.now() - fetchedAt < TICKER_CACHE_TTL_MS) {
      return JSON.parse(await cached.text());
    }
  }

  try {
    const response = await secEdgarFetch("https://www.sec.gov/files/company_tickers.json", env.SEC_EDGAR_USER_AGENT);
    const body = await response.text();
    await env.FILINGS_BUCKET.put(TICKER_CACHE_KEY, body, {
      customMetadata: { fetchedAt: new Date().toISOString() },
    });
    return JSON.parse(body);
  } catch (error) {
    // SEC EDGAR 側が403等で継続的に拒否している場合でも、期限切れの古いキャッシュがあれば
    // それを使って動作を継続する（新規上場企業は見つからない可能性があるが、全滅よりはよい）。
    if (cached) {
      return JSON.parse(await cached.text());
    }
    throw error;
  }
}

/** SEC EDGAR が配布する全上場企業のティッカー一覧から、指定ティッカーの CIK・企業名を引く。
 * 一覧自体は R2 にキャッシュする（fetchCompanyTickersWithCache 参照）。 */
async function lookupOnSecEdgar(
  env: Env,
  ticker: string,
): Promise<{ cik: string; companyName: string } | null> {
  const data = await fetchCompanyTickersWithCache(env);

  const upper = ticker.toUpperCase();
  for (const entry of Object.values(data)) {
    if (entry.ticker.toUpperCase() === upper) {
      return { cik: String(entry.cik_str).padStart(10, "0"), companyName: entry.title };
    }
  }
  return null;
}

export class TickerNotFoundError extends Error {
  constructor(ticker: string) {
    super(`Ticker not found on SEC EDGAR: ${ticker}`);
  }
}

export class TickerAlreadyExistsError extends Error {
  constructor(ticker: string) {
    super(`Ticker already registered: ${ticker}`);
  }
}

/** ティッカーを対象ティッカー一覧に追加する。CIK・企業名は SEC EDGAR から自動解決する。 */
export async function addTicker(env: Env, ticker: string): Promise<TickerInfo> {
  const normalized = ticker.trim().toUpperCase();
  const existing = await env.DB.prepare(`SELECT ticker FROM tickers WHERE ticker = ?1`).bind(normalized).first();
  if (existing) {
    throw new TickerAlreadyExistsError(normalized);
  }

  const resolved = await lookupOnSecEdgar(env, normalized);
  if (!resolved) {
    throw new TickerNotFoundError(normalized);
  }

  await env.DB.prepare(`INSERT INTO tickers (ticker, cik, company_name) VALUES (?1, ?2, ?3)`)
    .bind(normalized, resolved.cik, resolved.companyName)
    .run();

  const row = await env.DB.prepare(`SELECT ticker, cik, company_name as companyName, added_at as addedAt FROM tickers WHERE ticker = ?1`)
    .bind(normalized)
    .first<TickerInfo>();
  return row!;
}

export async function removeTicker(env: Env, ticker: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM tickers WHERE ticker = ?1`).bind(ticker.trim().toUpperCase()).run();
}

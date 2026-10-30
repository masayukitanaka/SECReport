// SEC EDGAR 向けの共通 fetch ラッパー。architect.md §6.1 の方針（レート制限は Cloudflare 内で完結、
// リトライは exponential backoff）に従う。EDGAR Fetcher（fetcher.ts）・ティッカー解決（tickers.ts）の
// 両方から使う。
const MAX_REQUESTS_PER_SECOND = 8; // SEC上限10 req/secに安全マージンを確保
const MIN_REQUEST_INTERVAL_MS = Math.ceil(1000 / MAX_REQUESTS_PER_SECOND);
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// 403 はボット対策等による一時的な拒否のことがある（issues.md 参照：Cloudflare Workers の IP が
// 一時的に弾かれたと見られる事例を確認）。恒久的な拒否（User-Agent不正等）の可能性もあるため、
// 429/5xx と同列の無制限リトライではなく、403のみ少ない回数（2回）で区切って様子を見る。
const MAX_403_RETRIES = 2;

let lastRequestAt = 0;

export async function secEdgarFetch(url: string, userAgent: string): Promise<Response> {
  const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();

  let lastError: unknown;
  let forbiddenCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "*/*" },
      });
      if (response.ok) return response;

      if (response.status === 403) {
        forbiddenCount++;
        lastError = new Error(
          `SEC EDGAR returned 403 (Forbidden) for ${url}. This can be a transient block; retried ${forbiddenCount} time(s).`,
        );
        if (forbiddenCount > MAX_403_RETRIES) {
          throw lastError;
        }
      } else if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`SEC EDGAR returned ${response.status} for ${url}`);
      } else {
        throw new Error(`SEC EDGAR returned ${response.status} for ${url}`);
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

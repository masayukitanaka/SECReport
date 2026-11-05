import {
  ingestFiling,
  deleteFiling,
  listFilings,
  listIndexedFilings,
  resolveCik,
  resolveCompanyName,
  listTickers,
  addTicker,
  removeTicker,
  TickerNotFoundError,
  TickerAlreadyExistsError,
  hybridSearch,
  generateAnswer,
  createIngestJob,
  getIngestJob,
  listIngestJobs,
  enqueueBackfillJobs,
  NoNewFilingsToBackfillError,
  recordQuestionHistory,
  listQuestionHistorySummaries,
  getQuestionHistoryEntry,
  deleteQuestionHistoryEntry,
  pollAllTickersForNewFilings,
  type FilingMeta,
  type RetrieverFilter,
} from "./pipeline/index.js";
import { runAndRecordEval, runAndRecordGenerationEval } from "./eval/index.js";
import { requireAuth, UnauthorizedError, type AuthenticatedUser } from "./auth.js";

// Cloudflare Workflows はwrangler.jsoncのclass_nameで指定したクラスをWorkerのエントリポイント
// （このファイル）からexportしている必要がある（P2-B Workflows化、docs_jp/tasks.md参照）。
export { IngestFilingWorkflow } from "./pipeline/index.js";

interface IngestRequestBody {
  meta: FilingMeta;
  html: string;
}

interface SearchRequestBody {
  query: string;
  topK?: number;
  filter?: RetrieverFilter;
}

interface AskRequestBody {
  query: string;
  topK?: number;
  filter?: RetrieverFilter;
}

async function handleIngest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: IngestRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.meta || typeof body.html !== "string") {
    return Response.json({ error: "meta and html are required" }, { status: 400 });
  }

  const result = await ingestFiling(env, body.meta, body.html);
  return Response.json(result);
}

async function handleEdgarFilings(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker");
  if (!ticker) {
    return Response.json({ error: "ticker query param is required" }, { status: 400 });
  }

  const cik = await resolveCik(env, ticker);
  if (!cik) {
    return Response.json({ error: `Unknown ticker: ${ticker}` }, { status: 400 });
  }

  const filings = await listFilings(cik, env.SEC_EDGAR_USER_AGENT, "10-Q");
  return Response.json({ ticker: ticker.toUpperCase(), cik, filings });
}

interface CreateIngestJobRequestBody {
  ticker: string;
  accessionNumber?: string;
}

/**
 * 取得トリガー（docs_jp/tasks.md P2-B参照）。実処理はCloudflare Workflowsに委譲し、即座に202・jobIdを返す。
 * /api/ingest-from-edgar（開発・動作確認用、UIからは使われていない）も同じ実装を共有する。
 */
async function handleCreateIngestJob(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: CreateIngestJobRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.ticker !== "string" || body.ticker.trim().length === 0) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }

  const jobId = await createIngestJob(env, body.ticker, body.accessionNumber);
  return Response.json({ jobId }, { status: 202 });
}

async function handleIngestJobs(request: Request, env: Env): Promise<Response> {
  if (request.method === "POST") {
    return handleCreateIngestJob(request, env);
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (jobId) {
    const job = await getIngestJob(env, jobId);
    if (!job) {
      return Response.json({ error: `Unknown jobId: ${jobId}` }, { status: 404 });
    }
    return Response.json(job);
  }

  const jobs = await listIngestJobs(env);
  return Response.json({ jobs });
}

interface BackfillRequestBody {
  ticker: string;
  fromYear: number;
}

/**
 * 遡及取得（docs_jp/tasks.md「ティッカー追加時のバックフィル範囲」参照）。
 * 指定年度以降の未取得10-Qを全てキューに積み、最初の1件のWorkflowを起動する。
 * 2件目以降は、各WorkflowのpromoteNextQueuedJob（ingestWorkflow.ts）により順次実行される。
 */
async function handleBackfill(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: BackfillRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.ticker !== "string" || body.ticker.trim().length === 0) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }
  if (typeof body.fromYear !== "number" || !Number.isInteger(body.fromYear) || body.fromYear < 2001) {
    return Response.json({ error: "fromYear must be an integer year (2001 or later)" }, { status: 400 });
  }

  try {
    const { queuedJobIds } = await enqueueBackfillJobs(env, body.ticker, body.fromYear);
    return Response.json({ queuedJobIds, queuedCount: queuedJobIds.length }, { status: 202 });
  } catch (error) {
    if (error instanceof NoNewFilingsToBackfillError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `遡及取得の開始に失敗しました。（${message}）` }, { status: 502 });
  }
}

async function handleDeleteFiling(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: { accessionNumber?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.accessionNumber !== "string" || body.accessionNumber.trim().length === 0) {
    return Response.json({ error: "accessionNumber is required" }, { status: 400 });
  }

  const result = await deleteFiling(env, body.accessionNumber);
  return Response.json(result);
}

async function handleFilings(_request: Request, env: Env): Promise<Response> {
  const filings = await listIndexedFilings(env);
  const withCompanyName = await Promise.all(
    filings.map(async (f) => ({ ...f, companyName: await resolveCompanyName(env, f.ticker) })),
  );
  return Response.json({ filings: withCompanyName });
}

async function handleTickers(_request: Request, env: Env): Promise<Response> {
  const tickers = await listTickers(env);
  return Response.json({ tickers });
}

async function handleAddTicker(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: { ticker?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.ticker !== "string" || body.ticker.trim().length === 0) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    const info = await addTicker(env, body.ticker);
    return Response.json(info);
  } catch (error) {
    if (error instanceof TickerNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof TickerAlreadyExistsError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    // SEC EDGAR への接続エラー（一時的な403拒否のリトライ上限超過等）。docs_jp/tasks.md参照。
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `SEC EDGARとの通信に失敗しました。時間をおいて再度お試しください。（${message}）` },
      { status: 502 },
    );
  }
}

async function handleRemoveTicker(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: { ticker?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.ticker !== "string" || body.ticker.trim().length === 0) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }

  await removeTicker(env, body.ticker);
  return Response.json({ ok: true });
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: SearchRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const results = await hybridSearch(env, body.query, body.topK ?? 10, body.filter);
  return Response.json({ results });
}

async function handleAsk(request: Request, env: Env, ctx: ExecutionContext, user: AuthenticatedUser): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: AskRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const retrieved = await hybridSearch(env, body.query, body.topK ?? 10, body.filter);
  const answer = await generateAnswer(env, body.query, retrieved);
  const responseBody = {
    ...answer,
    retrieved: retrieved.map((r) => ({ chunkId: r.chunkId, item: r.item, score: r.score, filingUrl: r.filingUrl })),
  };

  // 過去の質問履歴（左メニュー表示、docs_jp/tasks.md参照）。保存先は検証済みJWTのsub
  // （クライアント申告値は使わない。他人の履歴に書き込めてしまう脆弱性を避けるため）。
  // レスポンスを遅らせないよう保存は waitUntil で行う。
  ctx.waitUntil(recordQuestionHistory(env, user.sub, body.query, body.filter, responseBody));

  return Response.json(responseBody);
}

/**
 * 過去の質問履歴（左メニュー・専用ページ表示用、docs_jp/tasks.md参照）。
 * ?id= を指定すると1件分の詳細（再表示用のresponse_jsonを含む）、指定しなければ一覧（概要のみ）を返す。
 * 対象は常に検証済みJWTのsub（クエリの userId は受け付けない。他人の履歴の閲覧を防ぐため）。
 */
async function handleHistory(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const url = new URL(request.url);

  const id = url.searchParams.get("id");
  if (id) {
    const entry = await getQuestionHistoryEntry(env, user.sub, id);
    if (!entry) {
      return Response.json({ error: `Unknown history id: ${id}` }, { status: 404 });
    }
    return Response.json(entry);
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const items = await listQuestionHistorySummaries(env, user.sub, limit);
  return Response.json({ items });
}

async function handleDeleteHistory(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "string" || body.id.trim().length === 0) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  await deleteQuestionHistoryEntry(env, user.sub, body.id);
  return Response.json({ ok: true });
}

/**
 * 認証不要なAPI（Auth0のJWT発行自体に依存しないもの）。それ以外の /api/* はすべて認証必須にする
 * （docs_jp/tasks.md P0参照）。新しいエンドポイントを追加したら、保護対象かどうかをここで明示すること。
 */
const PUBLIC_API_PATHS = new Set<string>([]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }

    if (!PUBLIC_API_PATHS.has(url.pathname)) {
      let user: AuthenticatedUser;
      try {
        user = await requireAuth(request, env);
      } catch (error) {
        const message = error instanceof UnauthorizedError ? error.message : "認証に失敗しました。";
        return Response.json({ error: message }, { status: 401 });
      }

      if (url.pathname === "/api/ask") {
        return handleAsk(request, env, ctx, user);
      }
      if (url.pathname === "/api/history") {
        return handleHistory(request, env, user);
      }
      if (url.pathname === "/api/history/delete") {
        return handleDeleteHistory(request, env, user);
      }
    }

    if (url.pathname === "/api/ingest") {
      return handleIngest(request, env);
    }

    if (url.pathname === "/api/edgar/filings") {
      return handleEdgarFilings(request, env);
    }

    if (url.pathname === "/api/ingest-from-edgar") {
      return handleCreateIngestJob(request, env);
    }

    if (url.pathname === "/api/ingest-jobs") {
      return handleIngestJobs(request, env);
    }

    if (url.pathname === "/api/ingest-jobs/backfill") {
      return handleBackfill(request, env);
    }

    if (url.pathname === "/api/filings/delete") {
      return handleDeleteFiling(request, env);
    }

    if (url.pathname === "/api/filings") {
      return handleFilings(request, env);
    }

    if (url.pathname === "/api/tickers") {
      return handleTickers(request, env);
    }

    if (url.pathname === "/api/tickers/add") {
      return handleAddTicker(request, env);
    }

    if (url.pathname === "/api/tickers/delete") {
      return handleRemoveTicker(request, env);
    }

    if (url.pathname === "/api/search") {
      return handleSearch(request, env);
    }

    if (url.pathname === "/api/eval/run") {
      if (request.method !== "POST") {
        return Response.json({ error: "POST required" }, { status: 405 });
      }
      const { runId, result } = await runAndRecordEval(env);
      return Response.json({ runId, ...result });
    }

    if (url.pathname === "/api/eval/run-generation") {
      if (request.method !== "POST") {
        return Response.json({ error: "POST required" }, { status: 405 });
      }
      const { runId, result } = await runAndRecordGenerationEval(env);
      return Response.json({ runId, ...result });
    }

    if (url.pathname === "/api/poll") {
      if (request.method !== "POST") {
        return Response.json({ error: "POST required" }, { status: 405 });
      }
      const result = await pollAllTickersForNewFilings(env);
      return Response.json(result);
    }

    return Response.json({
      name: "Cloudflare",
    });
  },

  /**
   * 資料の自動取り込み（ポーリング、docs_jp/tasks.md P2-A参照）。
   * 実行スケジュールは wrangler.jsonc の `triggers.crons` でソースコード管理する。
   * 冪等性は pollAllTickersForNewFilings 側で担保（未取得のaccession_numberのみ取得、
   * 実行中ジョブがあればスキップ）しているため、Cronの実行間隔や多重起動を気にせず呼べる。
   */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(pollAllTickersForNewFilings(env));
  },
} satisfies ExportedHandler<Env>;

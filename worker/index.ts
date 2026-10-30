import {
  ingestFiling,
  ingestFromEdgar,
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
  runIngestJob,
  getIngestJob,
  listIngestJobs,
  type FilingMeta,
  type RetrieverFilter,
} from "./pipeline/index.js";
import { runAndRecordEval, runAndRecordGenerationEval } from "./eval/index.js";

interface IngestRequestBody {
  meta: FilingMeta;
  html: string;
}

interface IngestFromEdgarRequestBody {
  ticker: string;
  accessionNumber?: string;
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

async function handleIngestFromEdgar(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let body: IngestFromEdgarRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.ticker !== "string" || body.ticker.trim().length === 0) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await ingestFromEdgar(env, body.ticker, { accessionNumber: body.accessionNumber });
  return Response.json(result);
}

interface CreateIngestJobRequestBody {
  ticker: string;
  accessionNumber?: string;
}

/** 暫定の非同期取得トリガー（docs_jp/todo.md参照）。ctx.waitUntil でレスポンス後もバックグラウンド実行する。 */
async function handleCreateIngestJob(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
  ctx.waitUntil(runIngestJob(env, jobId, body.ticker, body.accessionNumber));
  return Response.json({ jobId }, { status: 202 });
}

async function handleIngestJobs(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "POST") {
    return handleCreateIngestJob(request, env, ctx);
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
    // SEC EDGAR への接続エラー（一時的な403拒否のリトライ上限超過等）。issues.md §16 参照。
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

async function handleAsk(request: Request, env: Env): Promise<Response> {
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
  return Response.json({ ...answer, retrieved: retrieved.map((r) => ({ chunkId: r.chunkId, item: r.item, score: r.score })) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ingest") {
      return handleIngest(request, env);
    }

    if (url.pathname === "/api/edgar/filings") {
      return handleEdgarFilings(request, env);
    }

    if (url.pathname === "/api/ingest-from-edgar") {
      return handleIngestFromEdgar(request, env);
    }

    if (url.pathname === "/api/ingest-jobs") {
      return handleIngestJobs(request, env, ctx);
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

    if (url.pathname === "/api/ask") {
      return handleAsk(request, env);
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

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

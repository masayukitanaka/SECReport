import { ingestFiling, hybridSearch, generateAnswer, type FilingMeta, type RetrieverFilter } from "./pipeline/index.js";
import { runAndRecordEval, runAndRecordGenerationEval } from "./eval/index.js";

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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ingest") {
      return handleIngest(request, env);
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

import type {
  AskResponse,
  BackfillResponse,
  CreateIngestJobResponse,
  FilingsResponse,
  GenerationEvalResponse,
  IngestJob,
  IngestJobsResponse,
  QuestionHistoryEntry,
  QuestionHistoryListResponse,
  RetrievalEvalResponse,
  RetrieverFilter,
  TickerInfo,
  TickersResponse,
} from "../types/api";

export class ApiError extends Error {
  status: number;
  requestId: string;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.requestId = `req_${Math.random().toString(16).slice(2, 10)}`;
  }
}

// バックエンドAPIのJWT検証（docs_jp/tasks.md P0参照）に伴い、全APIコールにAuth0のaccess tokenを
// 付与する必要がある。api.ts はReactコンポーネント外の純粋関数群で useAuth0 を直接呼べないため、
// AuthTokenProvider（src/components/AuthTokenProvider.tsx）が getAccessTokenSilently をここに登録する。
type TokenGetter = () => Promise<string>;
let tokenGetter: TokenGetter | null = null;

export function setTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

async function authHeaders(): Promise<HeadersInit> {
  if (!tokenGetter) {
    throw new ApiError("ログインが必要です。", 401);
  }
  let token: string;
  try {
    token = await tokenGetter();
  } catch {
    throw new ApiError("認証トークンの取得に失敗しました。再度ログインしてください。", 401);
  }
  return { Authorization: `Bearer ${token}` };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string") return body.error;
  } catch {
    // レスポンスボディがJSONでない場合はフォールバックへ
  }
  return `${response.status} ${response.statusText}`;
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("ネットワークエラーが発生しました", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { headers: await authHeaders() });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("ネットワークエラーが発生しました", 0);
  }
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return response.json() as Promise<T>;
}

export function askQuestion(query: string, filter?: RetrieverFilter): Promise<AskResponse> {
  const body: { query: string; filter?: RetrieverFilter } = { query };
  if (filter && Object.keys(filter).length > 0) body.filter = filter;
  return postJson<AskResponse>("/api/ask", body, 30000);
}

export function runRetrievalEval(): Promise<RetrievalEvalResponse> {
  return postJson<RetrievalEvalResponse>("/api/eval/run", {}, 60000);
}

export function runGenerationEval(): Promise<GenerationEvalResponse> {
  return postJson<GenerationEvalResponse>("/api/eval/run-generation", {}, 120000);
}

export function fetchFilings(): Promise<FilingsResponse> {
  return getJson<FilingsResponse>("/api/filings");
}

export function fetchTickers(): Promise<TickersResponse> {
  return getJson<TickersResponse>("/api/tickers");
}

export function addTicker(ticker: string): Promise<TickerInfo> {
  return postJson<TickerInfo>("/api/tickers/add", { ticker }, 15000);
}

export function removeTicker(ticker: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/tickers/delete", { ticker }, 15000);
}

export function createIngestJob(ticker: string, accessionNumber?: string): Promise<CreateIngestJobResponse> {
  const body: { ticker: string; accessionNumber?: string } = { ticker };
  if (accessionNumber) body.accessionNumber = accessionNumber;
  return postJson<CreateIngestJobResponse>("/api/ingest-jobs", body, 15000);
}

export function fetchIngestJobs(): Promise<IngestJobsResponse> {
  return getJson<IngestJobsResponse>("/api/ingest-jobs");
}

export function fetchIngestJob(jobId: string): Promise<IngestJob> {
  return getJson<IngestJob>(`/api/ingest-jobs?jobId=${encodeURIComponent(jobId)}`);
}

export function backfillIngest(ticker: string, fromYear: number): Promise<BackfillResponse> {
  return postJson<BackfillResponse>("/api/ingest-jobs/backfill", { ticker, fromYear }, 15000);
}

export function fetchQuestionHistory(limit?: number): Promise<QuestionHistoryListResponse> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return getJson<QuestionHistoryListResponse>(`/api/history${qs ? `?${qs}` : ""}`);
}

export function fetchQuestionHistoryEntry(id: string): Promise<QuestionHistoryEntry> {
  const params = new URLSearchParams({ id });
  return getJson<QuestionHistoryEntry>(`/api/history?${params.toString()}`);
}

export function deleteQuestionHistoryEntry(id: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/history/delete", { id }, 15000);
}

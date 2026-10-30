import type {
  AskResponse,
  CreateIngestJobResponse,
  FilingsResponse,
  GenerationEvalResponse,
  IngestJob,
  IngestJobsResponse,
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
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
    response = await fetch(path);
  } catch {
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

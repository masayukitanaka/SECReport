import type {
  AskResponse,
  GenerationEvalResponse,
  RetrievalEvalResponse,
  RetrieverFilter,
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
    throw new ApiError(`${response.status} ${response.statusText}`, response.status);
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

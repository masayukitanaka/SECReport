import { runRetrievalEval, type RetrievalEvalResult } from "./retrievalEval.js";
import { runGenerationEval, type GenerationEvalResult } from "./generationEval.js";

export { runRetrievalEval, type RetrievalEvalResult };
export { runGenerationEval, type GenerationEvalResult };

export async function runAndRecordEval(env: Env, topK?: number): Promise<{ runId: string; result: RetrievalEvalResult }> {
  const result = await runRetrievalEval(env, topK);
  const runId = crypto.randomUUID();

  await env.DB.prepare(`INSERT INTO eval_runs (run_id, config, metrics, details) VALUES (?1, ?2, ?3, ?4)`)
    .bind(
      runId,
      JSON.stringify({ kind: "retrieval", topK: result.topK, embeddingModel: "@cf/baai/bge-base-en-v1.5", fusionMethod: "rrf" }),
      JSON.stringify({ recallAtK: result.recallAtK, mrr: result.mrr, evaluatedQuestions: result.evaluatedQuestions, totalQuestions: result.totalQuestions }),
      JSON.stringify(result.results),
    )
    .run();

  return { runId, result };
}

export async function runAndRecordGenerationEval(env: Env, topK?: number): Promise<{ runId: string; result: GenerationEvalResult }> {
  const result = await runGenerationEval(env, topK);
  const runId = crypto.randomUUID();

  await env.DB.prepare(`INSERT INTO eval_runs (run_id, config, metrics, details) VALUES (?1, ?2, ?3, ?4)`)
    .bind(
      runId,
      JSON.stringify({ kind: "generation", generationModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }),
      JSON.stringify({
        refusalAccuracy: result.refusalAccuracy,
        falseRefusalRate: result.falseRefusalRate,
        missedRefusalRate: result.missedRefusalRate,
        totalQuestions: result.totalQuestions,
      }),
      JSON.stringify(result.results),
    )
    .run();

  return { runId, result };
}

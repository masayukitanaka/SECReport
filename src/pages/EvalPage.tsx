import { useState } from "react";
import { runRetrievalEval, runGenerationEval, ApiError } from "../lib/api";
import type { GenerationEvalResponse, RetrievalEvalResponse } from "../types/api";
import { EvalSection, type EvalStatus } from "../components/EvalSection";
import { MetricCardRow, type Metric } from "../components/MetricCard";
import { RetrievalResultTable, GenerationResultTable } from "../components/EvalResultTable";

interface RunState<T> {
  status: EvalStatus;
  startedAt: number | null;
  lastRunAt: string | null;
  result: T | null;
  errorText: string | null;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EvalPage() {
  const [retrieval, setRetrieval] = useState<RunState<RetrievalEvalResponse>>({
    status: "idle",
    startedAt: null,
    lastRunAt: null,
    result: null,
    errorText: null,
  });
  const [generation, setGeneration] = useState<RunState<GenerationEvalResponse>>({
    status: "idle",
    startedAt: null,
    lastRunAt: null,
    result: null,
    errorText: null,
  });

  const runRetrieval = async () => {
    setRetrieval((s) => ({ ...s, status: "running", startedAt: Date.now() }));
    try {
      const result = await runRetrievalEval();
      setRetrieval({ status: "done", startedAt: null, lastRunAt: formatTimestamp(new Date()), result, errorText: null });
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setRetrieval((s) => ({
        ...s,
        status: "error",
        errorText: `POST /api/eval/run · ${apiError.status || "network error"} ${apiError.message}`,
      }));
    }
  };

  const runGeneration = async () => {
    setGeneration((s) => ({ ...s, status: "running", startedAt: Date.now() }));
    try {
      const result = await runGenerationEval();
      setGeneration({ status: "done", startedAt: null, lastRunAt: formatTimestamp(new Date()), result, errorText: null });
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setGeneration((s) => ({
        ...s,
        status: "error",
        errorText: `POST /api/eval/run-generation · ${apiError.status || "network error"} ${apiError.message}`,
      }));
    }
  };

  const retrievalMetrics: Metric[] = retrieval.result
    ? [
        { label: "Recall@k", value: `${Math.round(retrieval.result.recallAtK * 100)}%`, sub: `recallAtK = ${retrieval.result.recallAtK.toFixed(2)}`, color: "var(--green-fg)" },
        { label: "MRR", value: retrieval.result.mrr.toFixed(3), sub: "mrr", color: "var(--green-fg)" },
        {
          label: "評価対象問題数",
          value: `${retrieval.result.evaluatedQuestions} / ${retrieval.result.totalQuestions}`,
          sub: "evaluated / total",
          color: "var(--text)",
        },
        {
          label: "対象外",
          value: String(retrieval.result.totalQuestions - retrieval.result.evaluatedQuestions),
          sub: "citation なし",
          color: "var(--muted)",
        },
      ]
    : [];

  const generationMetrics: Metric[] = generation.result
    ? [
        {
          label: "拒否判定の正解率",
          value: `${(generation.result.refusalAccuracy * 100).toFixed(1)}%`,
          sub: `refusalAccuracy = ${generation.result.refusalAccuracy.toFixed(4)}`,
          color: "var(--green-fg)",
        },
        {
          label: "誤って拒否した割合",
          value: `${Math.round(generation.result.falseRefusalRate * 100)}%`,
          sub: `falseRefusalRate = ${generation.result.falseRefusalRate.toFixed(2)}`,
          color: generation.result.falseRefusalRate > 0 ? "var(--red-fg)" : "var(--green-fg)",
        },
        {
          label: "拒否すべきなのに回答",
          value: `${Math.round(generation.result.missedRefusalRate * 100)}%`,
          sub: `missedRefusalRate = ${generation.result.missedRefusalRate.toFixed(2)}`,
          color: generation.result.missedRefusalRate > 0 ? "var(--red-fg)" : "var(--green-fg)",
        },
        { label: "評価対象問題数", value: String(generation.result.totalQuestions), sub: "totalQuestions", color: "var(--text)" },
      ]
    : [];

  return (
    <main style={{ flex: 1, maxWidth: 1320, width: "100%", margin: "0 auto", padding: "40px 40px 72px", display: "flex", flexDirection: "column", gap: 48 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, borderBottom: "1px solid var(--border)", paddingBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 500, lineHeight: 1.1 }}>評価結果</h1>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
            ゴールデンセット <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>evals/golden_set.jsonl</span>
            （16問）に対する自動評価。ボタンを押すとその場で再評価が実行されます。
          </p>
        </div>
      </div>

      <EvalSection
        kicker="RETRIEVAL · POST /api/eval/run"
        title="検索評価"
        note="citation を持つ問題のみが評価対象。正解チャンクが上位 k 件に含まれるかを測定します。"
        btnLabel="検索評価を実行"
        runningTitle="検索評価を実行しています"
        runningNote="16問それぞれについて検索を行い、正解チャンクの順位を記録しています。"
        eta="数秒〜数十秒"
        errorText={retrieval.errorText ?? ""}
        status={retrieval.status}
        startedAt={retrieval.startedAt}
        lastRunAt={retrieval.lastRunAt}
        onRun={runRetrieval}
      >
        {retrieval.result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <MetricCardRow metrics={retrievalMetrics} />
            <RetrievalResultTable results={retrieval.result.results} />
          </div>
        )}
      </EvalSection>

      <EvalSection
        kicker="GENERATION · POST /api/eval/run-generation"
        title="生成・拒否評価"
        note="LLM 呼び出しを伴うため、検索評価より時間がかかります（約1分）。"
        btnLabel="生成・拒否評価を実行"
        runningTitle="生成・拒否評価を実行しています"
        runningNote="各問題で回答を生成し、拒否すべき質問を正しく拒否できたかを判定しています。完了まで約1分かかります。"
        eta="約1分"
        errorText={generation.errorText ?? ""}
        status={generation.status}
        startedAt={generation.startedAt}
        lastRunAt={generation.lastRunAt}
        onRun={runGeneration}
      >
        {generation.result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <MetricCardRow metrics={generationMetrics} />
            <GenerationResultTable results={generation.result.results} />
          </div>
        )}
      </EvalSection>
    </main>
  );
}

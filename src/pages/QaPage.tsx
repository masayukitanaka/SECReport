import { useState } from "react";
import { askQuestion, ApiError } from "../lib/api";
import type { AskResponse } from "../types/api";
import { EMPTY_FILTER, FilterPanel, filterStateToApi, type FilterState } from "../components/FilterPanel";
import { QuestionBox } from "../components/QuestionBox";
import { AnswerArea, type QaError, type QaStatus } from "../components/AnswerArea";

export function QaPage() {
  const [filter, setFilter] = useState<FilterState>({ ...EMPTY_FILTER, ticker: "AMZN", formType: "10-Q", fiscalYear: "2026", fiscalQuarter: "Q2" });
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<QaStatus>("idle");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<QaError | null>(null);

  const submit = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || status === "loading") return;

    setStatus("loading");
    setAskedQuestion(q);
    setQuestion(q);
    setLoadingStartedAt(Date.now());
    setError(null);

    try {
      const result = await askQuestion(q, filterStateToApi(filter));
      setResponse(result);
      setStatus(result.refused ? "refused" : "answered");
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setError({ status: apiError.status, message: apiError.message, requestId: apiError.requestId });
      setStatus("error");
    }
  };

  return (
    <main
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "272px minmax(0,1fr)",
        maxWidth: 1320,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <FilterPanel value={filter} onChange={setFilter} />
      <section style={{ padding: "36px 48px 64px", display: "flex", flexDirection: "column", gap: 32, minWidth: 0 }}>
        <QuestionBox value={question} onChange={setQuestion} onSubmit={() => submit()} loading={status === "loading"} />
        <AnswerArea
          status={status}
          askedQuestion={askedQuestion}
          loadingStartedAt={loadingStartedAt}
          response={response}
          error={error}
          onRetry={() => submit(askedQuestion)}
          onExampleClick={(text) => submit(text)}
        />
      </section>
    </main>
  );
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { askQuestion, fetchQuestionHistoryEntry, ApiError } from "../lib/api";
import type { AskResponse } from "../types/api";
import { EMPTY_FILTER, FilterPanel, filterStateToApi, type FilterState } from "../components/FilterPanel";
import { QuestionBox } from "../components/QuestionBox";
import { AnswerArea, type ExampleFilter, type QaError, type QaStatus } from "../components/AnswerArea";

export function QaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterState>({ ...EMPTY_FILTER, formType: "10-Q" });
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<QaStatus>("idle");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<QaError | null>(null);

  const historyId = searchParams.get("historyId");

  // 左メニュー・履歴専用ページ（/history）からの ?historyId= 指定で、過去の質問・回答を復元表示する。
  useEffect(() => {
    if (!historyId) return;

    setStatus("loading");
    setLoadingStartedAt(Date.now());
    fetchQuestionHistoryEntry(historyId)
      .then((entry) => {
        const result = JSON.parse(entry.responseJson) as AskResponse;
        setAskedQuestion(entry.question);
        setQuestion(entry.question);
        setResponse(result);
        setStatus(result.refused ? "refused" : "answered");
      })
      .catch((e) => {
        const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
        setError({ status: apiError.status, message: apiError.message, requestId: apiError.requestId });
        setStatus("error");
      });
  }, [historyId]);

  const submit = async (overrideQuestion?: string, overrideFilter?: FilterState) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || status === "loading") return;

    // 新規に質問したら、復元中だった履歴指定は外す（URLに残り続けると再読み込みで古い回答に戻ってしまうため）。
    if (historyId) {
      searchParams.delete("historyId");
      setSearchParams(searchParams, { replace: true });
    }

    const effectiveFilter = overrideFilter ?? filter;
    if (overrideFilter) setFilter(overrideFilter);

    setStatus("loading");
    setAskedQuestion(q);
    setQuestion(q);
    setLoadingStartedAt(Date.now());
    setError(null);

    try {
      const result = await askQuestion(q, filterStateToApi(effectiveFilter));
      setResponse(result);
      setStatus(result.refused ? "refused" : "answered");
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setError({ status: apiError.status, message: apiError.message, requestId: apiError.requestId });
      setStatus("error");
    }
  };

  // 「質問の例」クリック時は、対応する企業・期間フィルタも同時に適用する
  // （docs_jp/tasks.md 参照：フィルタ未指定だと他社データが混入して誤回答になる事故が実際に発生した）。
  const handleExampleClick = (text: string, exampleFilter: ExampleFilter) => {
    submit(text, exampleFilter);
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
          onExampleClick={handleExampleClick}
        />
      </section>
    </main>
  );
}

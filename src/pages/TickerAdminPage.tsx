import { useEffect, useRef, useState } from "react";
import { fetchTickers, addTicker, removeTicker, fetchFilings, fetchIngestJobs, createIngestJob, ApiError } from "../lib/api";
import type { IndexedFiling, IngestJob, TickerInfo } from "../types/api";
import { Tag } from "../components/Tag";
import { Spinner } from "../components/Spinner";
import { Plus, Trash2, Play } from "../components/icons";

const JOB_POLL_INTERVAL_MS = 5000;

export function TickerAdminPage() {
  const [tickers, setTickers] = useState<TickerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [removingTicker, setRemovingTicker] = useState<string | null>(null);

  const [filings, setFilings] = useState<IndexedFiling[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(true);
  const [filingsError, setFilingsError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [triggeringTicker, setTriggeringTicker] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchTickers();
      setTickers(res.tickers);
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setLoadError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFilings = async () => {
    setFilingsLoading(true);
    setFilingsError(null);
    try {
      const res = await fetchFilings();
      setFilings(res.filings);
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setFilingsError(apiError.message);
    } finally {
      setFilingsLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      const res = await fetchIngestJobs();
      setJobs(res.jobs);
      setJobsError(null);
      return res.jobs;
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setJobsError(apiError.message);
      return [];
    }
  };

  // running のジョブがある間だけポーリングし、完了したら取得済みデータも再読込する。
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const latestJobs = await loadJobs();
      if (cancelled) return;
      const stillRunning = latestJobs.some((j) => j.status === "running");
      if (stillRunning) {
        pollTimer.current = setTimeout(tick, JOB_POLL_INTERVAL_MS);
      } else if (latestJobs.length > 0) {
        await loadFilings();
      }
    };

    load();
    loadFilings();
    tick();

    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const handleAdd = async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker || adding) return;

    setAdding(true);
    setAddError(null);
    try {
      await addTicker(ticker);
      setInput("");
      await load();
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setAddError(apiError.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (ticker: string) => {
    setRemovingTicker(ticker);
    try {
      await removeTicker(ticker);
      await load();
    } catch {
      // 削除失敗時も一覧を再読込して最新状態を表示する
      await load();
    } finally {
      setRemovingTicker(null);
    }
  };

  const handleTriggerIngest = async (ticker: string) => {
    setTriggeringTicker(ticker);
    setTriggerError(null);
    try {
      await createIngestJob(ticker);
      await loadJobs();
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(async function tick() {
        const latestJobs = await loadJobs();
        const stillRunning = latestJobs.some((j) => j.status === "running");
        if (stillRunning) {
          pollTimer.current = setTimeout(tick, JOB_POLL_INTERVAL_MS);
        } else if (latestJobs.length > 0) {
          await loadFilings();
        }
      }, JOB_POLL_INTERVAL_MS);
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setTriggerError(`${ticker}: ${apiError.message}`);
    } finally {
      setTriggeringTicker(null);
    }
  };

  return (
    <main style={{ flex: 1, maxWidth: 1320, width: "100%", margin: "0 auto", padding: "40px 40px 72px", display: "flex", flexDirection: "column", gap: 40 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, borderBottom: "1px solid var(--border)", paddingBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 500, lineHeight: 1.1 }}>ティッカー管理</h1>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
            索引化の対象企業（ティッカー）を追加・削除します。追加時は CIK・企業名を SEC EDGAR から自動解決します。
          </p>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag color="blue" style={{ alignSelf: "flex-start" }}>
            POST /api/tickers/add
          </Tag>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>ティッカーを追加</h2>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", maxWidth: 480 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            disabled={adding}
            placeholder="例: NVDA"
            style={{
              flex: 1,
              font: "inherit",
              fontSize: 14,
              padding: "8px 10px",
              border: "1px solid var(--border-input)",
              borderRadius: 4,
              background: "var(--surface)",
              color: "var(--text)",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              color: "var(--accent-deep)",
              fontSize: 14,
              opacity: adding || !input.trim() ? 0.45 : 1,
              flex: "none",
            }}
            onMouseEnter={(e) => !adding && input.trim() && (e.currentTarget.style.background = "var(--accent-hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {adding ? <Spinner size={14} /> : <Plus size={14} />}
            追加
          </button>
        </div>

        {addError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: "1px solid var(--error)",
              borderRadius: 4,
              fontSize: 13,
              maxWidth: 480,
            }}
          >
            <Tag color="red">エラー</Tag>
            <span>{addError}</span>
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag color="blue" style={{ alignSelf: "flex-start" }}>
            GET /api/tickers
          </Tag>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>対象ティッカー一覧</h2>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
            <Spinner />
            <span style={{ color: "var(--muted)", fontSize: 14 }}>読み込んでいます…</span>
          </div>
        ) : loadError ? (
          <div style={{ border: "1px solid var(--error)", borderRadius: 4, padding: "16px 20px", fontSize: 14 }}>
            一覧の取得に失敗しました：{loadError}
          </div>
        ) : tickers.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--border-input)",
              borderRadius: 4,
              padding: 32,
              textAlign: "center",
              color: "var(--muted)",
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontStyle: "italic",
            }}
          >
            登録されているティッカーはありません。
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>ティッカー</th>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>企業名</th>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>CIK</th>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>追加日時</th>
                <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)", width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {tickers.map((t) => {
                const hasRunningJob = jobs.some((j) => j.ticker === t.ticker && j.status === "running");
                return (
                  <tr key={t.ticker}>
                    <td style={{ padding: "10px 16px 10px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                      {t.ticker}
                    </td>
                    <td style={{ padding: "10px 16px 10px 0", borderBottom: "1px solid var(--border-weak)" }}>{t.companyName}</td>
                    <td style={{ padding: "10px 16px 10px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                      {t.cik}
                    </td>
                    <td style={{ padding: "10px 16px 10px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                      {t.addedAt}
                    </td>
                    <td style={{ padding: "10px 0", borderBottom: "1px solid var(--border-weak)", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <button
                          onClick={() => handleTriggerIngest(t.ticker)}
                          disabled={triggeringTicker === t.ticker || hasRunningJob}
                          title={`${t.ticker} の最新10-Qを取得`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 4,
                            color: "var(--accent-deep)",
                            fontSize: 12,
                            opacity: triggeringTicker === t.ticker || hasRunningJob ? 0.45 : 1,
                          }}
                          onMouseEnter={(e) => !hasRunningJob && (e.currentTarget.style.background = "var(--accent-hover-bg)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {triggeringTicker === t.ticker || hasRunningJob ? <Spinner size={13} /> : <Play size={13} />}
                          取得実行
                        </button>
                        <button
                          onClick={() => handleRemove(t.ticker)}
                          disabled={removingTicker === t.ticker}
                          title={`${t.ticker} を削除`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: 6,
                            borderRadius: 4,
                            color: "var(--error)",
                            opacity: removingTicker === t.ticker ? 0.45 : 1,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--red-bg)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {removingTicker === t.ticker ? <Spinner size={14} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {triggerError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: "1px solid var(--error)",
              borderRadius: 4,
              fontSize: 13,
              maxWidth: 480,
            }}
          >
            <Tag color="red">エラー</Tag>
            <span>{triggerError}</span>
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag color="blue" style={{ alignSelf: "flex-start" }}>
            GET /api/ingest-jobs
          </Tag>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>取得ジョブ履歴</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
            「取得実行」で開始した取得・索引化ジョブの状況です（暫定実装：Cron等の定期実行基盤導入までの手動トリガー）。
          </p>
        </div>

        {jobsError ? (
          <div style={{ border: "1px solid var(--error)", borderRadius: 4, padding: "16px 20px", fontSize: 14 }}>
            一覧の取得に失敗しました：{jobsError}
          </div>
        ) : jobs.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--border-input)",
              borderRadius: 4,
              padding: 32,
              textAlign: "center",
              color: "var(--muted)",
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontStyle: "italic",
            }}
          >
            実行されたジョブはありません。
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>ティッカー</th>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>状態</th>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>開始</th>
                <th style={{ fontWeight: 400, padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-strong)" }}>終了</th>
                <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)" }}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.jobId}>
                  <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                    {j.ticker}
                  </td>
                  <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)" }}>
                    <Tag color={j.status === "success" ? "green" : j.status === "failed" ? "red" : "blue"}>
                      {j.status === "success" ? "成功" : j.status === "failed" ? "失敗" : "実行中"}
                    </Tag>
                  </td>
                  <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                    {j.createdAt}
                  </td>
                  <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                    {j.finishedAt ?? "—"}
                  </td>
                  <td style={{ padding: "8px 0", borderBottom: "1px solid var(--border-weak)", fontSize: 12.5, color: j.status === "failed" ? "var(--error)" : "var(--muted)" }}>
                    {j.status === "failed" ? j.errorMessage : j.status === "success" ? summarizeJobResult(j.resultJson) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag color="blue" style={{ alignSelf: "flex-start" }}>
            GET /api/filings
          </Tag>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>取得済みデータ</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
            ティッカーごとに、SEC EDGARから取得・索引化済みの会計年度・四半期を表示します（新規取得は API 経由）。
          </p>
        </div>

        {filingsLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
            <Spinner />
            <span style={{ color: "var(--muted)", fontSize: 14 }}>読み込んでいます…</span>
          </div>
        ) : filingsError ? (
          <div style={{ border: "1px solid var(--error)", borderRadius: 4, padding: "16px 20px", fontSize: 14 }}>
            一覧の取得に失敗しました：{filingsError}
          </div>
        ) : filings.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--border-input)",
              borderRadius: 4,
              padding: 32,
              textAlign: "center",
              color: "var(--muted)",
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontStyle: "italic",
            }}
          >
            取得済みのデータはありません。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {groupFilingsByTicker(filings).map(({ ticker, companyName, items }) => (
              <div key={ticker} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 14 }}>{ticker}</span>
                  {companyName && <span style={{ fontSize: 13, color: "var(--muted)" }}>{companyName}</span>}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
                      <th style={{ fontWeight: 400, padding: "6px 16px 6px 0", borderBottom: "1px solid var(--border-strong)" }}>書類種別</th>
                      <th style={{ fontWeight: 400, padding: "6px 16px 6px 0", borderBottom: "1px solid var(--border-strong)" }}>会計年度</th>
                      <th style={{ fontWeight: 400, padding: "6px 16px 6px 0", borderBottom: "1px solid var(--border-strong)" }}>四半期</th>
                      <th style={{ fontWeight: 400, padding: "6px 16px 6px 0", borderBottom: "1px solid var(--border-strong)" }}>チャンク数</th>
                      <th style={{ fontWeight: 400, padding: "6px 0", borderBottom: "1px solid var(--border-strong)" }}>Accession Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((f) => (
                      <tr key={f.accessionNumber}>
                        <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)" }}>{f.formType}</td>
                        <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)" }}>
                          {f.fiscalYear}
                        </td>
                        <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)" }}>
                          {f.fiscalQuarter ?? "—"}
                        </td>
                        <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                          {f.chunkCount}
                        </td>
                        <td style={{ padding: "8px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                          {f.accessionNumber}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function summarizeJobResult(resultJson: string | null): string {
  if (!resultJson) return "—";
  try {
    const result = JSON.parse(resultJson) as { accessionNumber?: string; chunksWritten?: number };
    return `${result.accessionNumber ?? "?"}（${result.chunksWritten ?? "?"}チャンク）`;
  } catch {
    return "—";
  }
}

function groupFilingsByTicker(
  filings: IndexedFiling[],
): { ticker: string; companyName: string | null; items: IndexedFiling[] }[] {
  const byTicker = new Map<string, { ticker: string; companyName: string | null; items: IndexedFiling[] }>();
  for (const filing of filings) {
    const group = byTicker.get(filing.ticker);
    if (group) {
      group.items.push(filing);
    } else {
      byTicker.set(filing.ticker, { ticker: filing.ticker, companyName: filing.companyName, items: [filing] });
    }
  }
  return Array.from(byTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

import { useEffect, useState } from "react";
import type { IndexedFiling, RetrieverFilter } from "../types/api";
import { fetchFilings } from "../lib/api";
import { Tag } from "./Tag";

export type FilterState = {
  ticker: string;
  formType: string;
  fiscalYear: string;
  fiscalQuarter: string;
};

export const EMPTY_FILTER: FilterState = { ticker: "", formType: "", fiscalYear: "", fiscalQuarter: "" };

export function filterStateToApi(f: FilterState): RetrieverFilter {
  const out: RetrieverFilter = {};
  if (f.ticker) out.ticker = f.ticker;
  if (f.formType) out.formType = f.formType;
  if (f.fiscalYear) out.fiscalYear = Number(f.fiscalYear);
  if (f.fiscalQuarter) out.fiscalQuarter = f.fiscalQuarter;
  return out;
}

function filterSummary(f: FilterState): string {
  const parts = [f.ticker, f.formType, f.fiscalYear && `FY${f.fiscalYear}`, f.fiscalQuarter].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "なし（全件検索）";
}

const selectStyle: React.CSSProperties = {
  fontSize: 14,
  padding: "8px 10px",
  border: "1px solid var(--border-input)",
  borderRadius: 4,
  background: "var(--bg)",
  color: "var(--text)",
  width: "100%",
  minWidth: 0,
};

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, color: "var(--muted)" };

function uniqueSorted<T>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

export function FilterPanel({ value, onChange }: { value: FilterState; onChange: (f: FilterState) => void }) {
  const [filings, setFilings] = useState<IndexedFiling[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchFilings()
      .then((res) => setFilings(res.filings))
      .catch(() => setLoadError(true));
  }, []);

  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...value, [key]: e.target.value });

  const tickers = uniqueSorted(filings.map((f) => f.ticker));
  const companyNameByTicker = new Map(filings.map((f) => [f.ticker, f.companyName]));
  const filingsForTicker = value.ticker ? filings.filter((f) => f.ticker === value.ticker) : filings;
  const years = uniqueSorted(filingsForTicker.map((f) => f.fiscalYear)).sort((a, b) => b - a);
  const quarters = uniqueSorted(filingsForTicker.map((f) => f.fiscalQuarter).filter((q): q is string => Boolean(q)));

  return (
    <aside
      style={{
        borderRight: "1px solid var(--border)",
        padding: "36px 28px 36px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>絞り込み</h2>
        <button
          onClick={() => onChange(EMPTY_FILTER)}
          style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "underline", textUnderlineOffset: 3 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent-deep)")}
        >
          クリア
        </button>
      </div>

      <label style={labelStyle}>
        <span style={{ ...fieldLabelStyle, display: "flex", justifyContent: "space-between" }}>
          企業ティッカー
          <Tag color="gray" style={{ fontSize: 10, padding: "1px 6px" }}>
            ticker
          </Tag>
        </span>
        <select value={value.ticker} onChange={set("ticker")} style={selectStyle}>
          <option value="">指定なし（全件）</option>
          {tickers.map((ticker) => (
            <option key={ticker} value={ticker}>
              {ticker} — {companyNameByTicker.get(ticker) ?? ticker}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        <span style={{ ...fieldLabelStyle, display: "flex", justifyContent: "space-between" }}>
          書類種別
          <Tag color="gray" style={{ fontSize: 10, padding: "1px 6px" }}>
            formType
          </Tag>
        </span>
        <select value={value.formType} onChange={set("formType")} style={selectStyle}>
          <option value="">指定なし</option>
          <option value="10-Q">10-Q（四半期報告書）</option>
          <option value="10-K" disabled>
            10-K（今後対応）
          </option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <label style={labelStyle}>
          <span style={fieldLabelStyle}>会計年度</span>
          <select value={value.fiscalYear} onChange={set("fiscalYear")} style={selectStyle}>
            <option value="">—</option>
            {years.map((year) => (
              <option key={year} value={year}>
                FY{year}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={fieldLabelStyle}>四半期</span>
          <select value={value.fiscalQuarter} onChange={set("fiscalQuarter")} style={selectStyle}>
            <option value="">—</option>
            {(["Q1", "Q2", "Q3"] as const).map((q) => (
              <option key={q} value={q} disabled={!quarters.includes(q)}>
                {q}
                {!quarters.includes(q) ? "（なし）" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 18,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={fieldLabelStyle}>送信される絞り込み</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6 }}>{filterSummary(value)}</span>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <Tag color="teal" style={{ alignSelf: "flex-start" }}>
          収録データ
        </Tag>
        {loadError ? (
          <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>読み込みに失敗しました。</span>
        ) : filings.length === 0 ? (
          <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>読み込み中…</span>
        ) : (
          <span style={{ fontSize: 13, lineHeight: 1.6 }}>
            {tickers.map((ticker) => {
              const rows = filings.filter((f) => f.ticker === ticker);
              const quartersLabel = rows.map((r) => `${r.formType} · FY${r.fiscalYear}${r.fiscalQuarter ? ` ${r.fiscalQuarter}` : ""}`);
              return (
                <span key={ticker} style={{ display: "block", marginBottom: 4 }}>
                  {companyNameByTicker.get(ticker) ?? ticker}
                  <br />
                  {quartersLabel.join(" · ")} · {rows.length}件
                </span>
              );
            })}
          </span>
        )}
        <span style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--muted)" }}>
          企業・四半期は順次追加予定です。
        </span>
      </div>
    </aside>
  );
}

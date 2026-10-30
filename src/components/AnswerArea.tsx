import { useState } from "react";
import type { AskResponse } from "../types/api";
import { useElapsed } from "../lib/useElapsed";
import { Tag } from "./Tag";
import { Spinner, IndeterminateBar } from "./Spinner";
import { ChevronDown, CircleX, ExternalLink, TriangleAlert } from "./icons";

export type QaStatus = "idle" | "loading" | "answered" | "refused" | "error";

export interface QaError {
  status: number;
  message: string;
  requestId: string;
}

// evals/golden_set.jsonl（gs-001, gs-006, gs-008）からそのまま採用。
// 投入済みデータ（Amazon 10-Q、2026年Q2のみ）で実際に動作確認済みの質問文に限定する
// （デザインモック由来の例文は、言い回しが変わると検索でヒットせず回答が得られないことがあった）。
const EXAMPLES = [
  "Amazonの2026年第2四半期（Q2、2026年6月30日終了の3ヶ月間）の売上高（Net sales）はいくらですか？",
  "Amazonの2026年第2四半期における事業セグメント別（North America, International, AWS）の売上高をそれぞれ教えてください。",
  "Amazonは2026年第2四半期に株主へ配当を支払いましたか？支払った場合、1株当たりの配当額はいくらですか？",
];

export function AnswerArea({
  status,
  askedQuestion,
  loadingStartedAt,
  response,
  error,
  onRetry,
  onExampleClick,
}: {
  status: QaStatus;
  askedQuestion: string;
  loadingStartedAt: number | null;
  response: AskResponse | null;
  error: QaError | null;
  onRetry: () => void;
  onExampleClick: (text: string) => void;
}) {
  const [retrievedOpen, setRetrievedOpen] = useState(false);

  return (
    <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 0 }}>
      {status === "idle" && <IdleState onExampleClick={onExampleClick} />}

      {status !== "idle" && <AskedQuestionRow question={askedQuestion} />}

      {status === "loading" && <LoadingState startedAt={loadingStartedAt} />}
      {status === "answered" && response && <AnsweredState response={response} />}
      {status === "refused" && response && <RefusedState response={response} />}
      {status === "error" && error && <ErrorState error={error} onRetry={onRetry} />}

      {(status === "answered" || status === "refused") && response && (
        <RetrievedAccordion
          response={response}
          open={retrievedOpen}
          onToggle={() => setRetrievedOpen((v) => !v)}
        />
      )}
    </div>
  );
}

function IdleState({ onExampleClick }: { onExampleClick: (text: string) => void }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "48px 0", display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontStyle: "italic", color: "var(--muted)" }}>
        質問を入力してください。回答は提出書類の該当箇所を引用して示されます。
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Tag color="gray" style={{ alignSelf: "flex-start", marginBottom: 6 }}>
          質問の例
        </Tag>
        {EXAMPLES.map((text) => (
          <button
            key={text}
            onClick={() => onExampleClick(text)}
            style={{
              padding: "10px 0",
              borderBottom: "1px solid var(--border-weak)",
              fontSize: 14.5,
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-deep)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text)")}
          >
            {text}
            <span style={{ color: "var(--accent)" }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AskedQuestionRow({ question }: { question: string }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "22px 0 18px", display: "flex", gap: 16, alignItems: "baseline" }}>
      <span style={{ flex: "none", width: 56 }}>
        <Tag color="gray">質問</Tag>
      </span>
      <span style={{ fontSize: 15, lineHeight: 1.7 }}>{question}</span>
    </div>
  );
}

const LOADING_STEPS: [string, number, number][] = [
  ["関連セクションを検索", 0, 1.2],
  ["回答と引用を生成", 1.2, 99],
  ["根拠の整合性を確認", 99, 99],
];

function LoadingState({ startedAt }: { startedAt: number | null }) {
  const elapsed = useElapsed(startedAt, true);

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "32px 0 40px", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Spinner />
        <span style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>回答を作成しています</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--muted)",
            marginLeft: "auto",
            fontFeatureSettings: "'tnum'",
          }}
        >
          {elapsed.toFixed(1)} 秒経過
        </span>
      </div>
      <IndeterminateBar />
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
        {LOADING_STEPS.map(([label, a, b]) => {
          const done = elapsed >= b;
          const active = elapsed >= a && elapsed < b;
          const color = done ? "green" : active ? "gold" : "gray";
          const mark = done ? "完了" : active ? "実行中" : "待機";
          const textColor = done ? "var(--muted)" : active ? "var(--text)" : "var(--disabled)";
          return (
            <li key={label} style={{ display: "flex", gap: 14, alignItems: "baseline", color: textColor }}>
              <span style={{ width: 56 }}>
                <Tag color={color} style={{ padding: "1px 7px" }}>
                  {mark}
                </Tag>
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
        通常は数秒〜十数秒で完了します。このページを離れずにお待ちください。
      </span>
    </div>
  );
}

function AnsweredState({ response }: { response: AskResponse }) {
  const itemByChunkId = new Map(response.retrieved.map((r) => [r.chunkId, r.item]));

  return (
    <article style={{ borderTop: "1px solid var(--border-strong)", paddingTop: 26, display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <span style={{ flex: "none", width: 56, paddingTop: 6 }}>
          <Tag color="gold" style={{ background: "var(--accent)", color: "#fff", fontWeight: 600 }}>
            回答
          </Tag>
        </span>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontSize: 21,
            fontWeight: 500,
            lineHeight: 1.65,
            fontFeatureSettings: "'tnum','lnum'",
          }}
        >
          {response.answer}
        </p>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <span style={{ flex: "none", width: 56 }}>
          <Tag color="gold">根拠</Tag>
        </span>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 22, flex: 1, minWidth: 0 }}>
          {response.citations.map((c, i) => (
            <li key={c.chunkId + i} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 13 }}>
                <Tag color="gold" style={{ padding: "1px 7px" }}>
                  {i + 1}
                </Tag>
                <span style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>{itemByChunkId.get(c.chunkId) ?? "—"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{c.chunkId}</span>
                <span
                  title="SEC原本へのリンク（filing_url 接続後に有効化）"
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--disabled)",
                    cursor: "not-allowed",
                  }}
                >
                  SEC原本
                  <ExternalLink size={13} />
                </span>
              </div>
              <blockquote
                lang="en"
                style={{
                  margin: 0,
                  borderLeft: "1px solid var(--accent)",
                  padding: "4px 0 4px 18px",
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "var(--text-3)",
                  fontStyle: "italic",
                  whiteSpace: "pre-wrap",
                  overflowX: "auto",
                }}
              >
                {c.quote}
              </blockquote>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function RefusedState({ response }: { response: AskResponse }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      <div style={{ border: "1px dashed var(--accent)", borderRadius: 4, padding: "22px 24px", display: "flex", gap: 18 }}>
        <TriangleAlert size={22} color="var(--accent)" style={{ flex: "none", marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <Tag color="gold" style={{ alignSelf: "flex-start" }}>
            拒否 · 回答を控えました
          </Tag>
          <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.45 }}>
            提出書類からは、この質問に根拠をもって答えられませんでした。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>理由</span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, overflowWrap: "anywhere" }}>{response.refusalReason}</p>
          </div>
          <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
            将来の予測・投資判断・書類に記載のない事項にはお答えできません。対象期間や表現を変えて質問してみてください。
          </span>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: QaError; onRetry: () => void }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      <div style={{ border: "1px solid var(--error)", borderRadius: 4, padding: "20px 24px", display: "flex", gap: 18, alignItems: "flex-start" }}>
        <CircleX size={20} color="var(--error)" style={{ flex: "none", marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <Tag color="red" style={{ alignSelf: "flex-start" }}>
            システムエラー
          </Tag>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            サーバーとの通信に失敗したため、回答を取得できませんでした。時間をおいて再度お試しください。
          </p>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
            POST /api/ask · {error.status || "network error"} · {error.requestId}
          </span>
        </div>
        <button
          onClick={onRetry}
          style={{ padding: "7px 14px", border: "1px solid var(--border-input)", borderRadius: 4, fontSize: 13, flex: "none" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent-deep)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-input)";
            e.currentTarget.style.color = "var(--text)";
          }}
        >
          再試行
        </button>
      </div>
    </div>
  );
}

function RetrievedAccordion({
  response,
  open,
  onToggle,
}: {
  response: AskResponse;
  open: boolean;
  onToggle: () => void;
}) {
  const citedIds = new Set(response.citations.map((c) => c.chunkId));
  const citedOrder = response.citations.map((c) => c.chunkId);

  return (
    <div style={{ marginTop: 36, borderTop: "1px solid var(--border)" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 0",
          width: "100%",
          fontSize: 13,
          color: "var(--muted)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
      >
        <ChevronDown size={14} rotateDeg={open ? 0 : -90} />
        参考情報：検索でヒットしたセクション（{response.retrieved.length}件）
        <span style={{ marginLeft: "auto" }}>
          <Tag color="blue">retrieved</Tag>
        </span>
      </button>
      {open && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
              <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)", width: 40 }}>#</th>
              <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)" }}>セクション（item）</th>
              <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)" }}>chunkId</th>
              <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)", textAlign: "right" }}>score</th>
              <th style={{ fontWeight: 400, padding: "8px 0", borderBottom: "1px solid var(--border-strong)", textAlign: "right", width: 70 }}>引用</th>
            </tr>
          </thead>
          <tbody>
            {response.retrieved.map((r, i) => {
              const isCited = citedIds.has(r.chunkId);
              return (
                <tr key={r.chunkId}>
                  <td style={{ padding: "9px 0", borderBottom: "1px solid var(--border-weak)", fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "9px 0", borderBottom: "1px solid var(--border-weak)" }}>{r.item}</td>
                  <td
                    style={{
                      padding: "9px 0",
                      borderBottom: "1px solid var(--border-weak)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--muted)",
                    }}
                  >
                    {r.chunkId}
                  </td>
                  <td
                    style={{
                      padding: "9px 0",
                      borderBottom: "1px solid var(--border-weak)",
                      fontFamily: "var(--font-mono)",
                      textAlign: "right",
                      fontFeatureSettings: "'tnum'",
                    }}
                  >
                    {r.score.toFixed(3)}
                  </td>
                  <td style={{ padding: "9px 0", borderBottom: "1px solid var(--border-weak)", textAlign: "right" }}>
                    {isCited && (
                      <Tag color="gold" style={{ padding: "1px 7px" }}>
                        引用 {citedOrder.indexOf(r.chunkId) + 1}
                      </Tag>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

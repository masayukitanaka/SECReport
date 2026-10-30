import { useElapsed } from "../lib/useElapsed";
import { Tag } from "./Tag";
import { Spinner, IndeterminateBar } from "./Spinner";
import { Play } from "./icons";
import type { ReactNode } from "react";

export type EvalStatus = "idle" | "running" | "done" | "error";

export function EvalSection({
  kicker,
  title,
  note,
  btnLabel,
  runningTitle,
  runningNote,
  eta,
  errorText,
  status,
  startedAt,
  lastRunAt,
  onRun,
  children,
}: {
  kicker: string;
  title: string;
  note: string;
  btnLabel: string;
  runningTitle: string;
  runningNote: string;
  eta: string;
  errorText: string;
  status: EvalStatus;
  startedAt: number | null;
  lastRunAt: string | null;
  onRun: () => void;
  children: ReactNode;
}) {
  const running = status === "running";
  const elapsed = useElapsed(startedAt, running);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tag color="blue" style={{ alignSelf: "flex-start" }}>
            {kicker}
          </Tag>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600 }}>{title}</h2>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, maxWidth: 440 }}>{note}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {status === "done" && lastRunAt && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
              最終実行 {lastRunAt}
            </span>
          )}
          <button
            onClick={onRun}
            disabled={running}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              color: "var(--accent-deep)",
              fontSize: 14,
              opacity: running ? 0.45 : 1,
            }}
            onMouseEnter={(e) => !running && (e.currentTarget.style.background = "var(--accent-hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onMouseDown={(e) => !running && (e.currentTarget.style.background = "var(--accent-active-bg)")}
          >
            <Play size={13} />
            {running ? "実行中…" : btnLabel}
          </button>
        </div>
      </div>

      {status === "idle" && (
        <div
          style={{
            border: "1px dashed var(--border-input)",
            borderRadius: 4,
            padding: 40,
            textAlign: "center",
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontStyle: "italic",
            color: "var(--muted)",
          }}
        >
          評価を実行してください。結果はここに表示されます。
        </div>
      )}

      {status === "running" && (
        <div style={{ border: "1px solid var(--banner-border)", borderRadius: 4, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Spinner />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{runningTitle}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
              {elapsed.toFixed(1)} 秒経過 · 目安 {eta}
            </span>
          </div>
          <IndeterminateBar height={2} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{runningNote}</span>
        </div>
      )}

      {status === "error" && (
        <div style={{ border: "1px solid var(--error)", borderRadius: 4, padding: "20px 24px", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 15 }}>評価の実行に失敗しました。</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>{errorText}</span>
          </div>
        </div>
      )}

      {status === "done" && children}
    </section>
  );
}

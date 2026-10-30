import type { CSSProperties, ReactNode } from "react";

export type TagColor = "gold" | "teal" | "blue" | "gray" | "violet" | "red" | "green";

const COLORS: Record<TagColor, { bg: string; fg: string }> = {
  gold: { bg: "var(--gold-bg)", fg: "var(--gold-fg)" },
  teal: { bg: "var(--teal-bg)", fg: "var(--teal-fg)" },
  blue: { bg: "var(--blue-bg)", fg: "var(--blue-fg)" },
  gray: { bg: "var(--gray-label-bg)", fg: "var(--gray-fg)" },
  violet: { bg: "var(--violet-bg)", fg: "var(--violet-fg)" },
  red: { bg: "var(--red-bg)", fg: "var(--red-fg)" },
  green: { bg: "var(--green-bg)", fg: "var(--green-fg)" },
};

export function Tag({
  color,
  children,
  style,
}: {
  color: TagColor;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const c = COLORS[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: ".04em",
        padding: "3px 8px",
        borderRadius: 3,
        background: c.bg,
        color: c.fg,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Chip({
  color,
  children,
  style,
}: {
  color: TagColor | "none";
  children: ReactNode;
  style?: CSSProperties;
}) {
  const c = color === "none" ? { bg: "transparent", fg: "var(--disabled)" } : COLORS[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 3,
        background: c.bg,
        color: c.fg,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// 質問タイプごとの配色（README §Design Tokens「タグ・チップ配色」のマッピング）
export const QUESTION_TYPE_COLOR: Record<string, TagColor> = {
  simple_fact: "gold",
  table_reading: "teal",
  period_comparison: "blue",
  unanswerable: "gray",
  ambiguous: "violet",
  prompt_injection: "red",
};

export function QuestionTypeTag({ type }: { type: string }) {
  const color = QUESTION_TYPE_COLOR[type] ?? "gray";
  return <Tag color={color}>{type}</Tag>;
}

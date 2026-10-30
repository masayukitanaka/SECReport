import { ArrowUp } from "./icons";

export function QuestionBox({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 860 }}>
      <label htmlFor="q" style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 500, lineHeight: 1.15 }}>
        提出書類について質問する
      </label>
      <div
        style={{
          border: "1px solid var(--border-input)",
          borderRadius: 4,
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <textarea
          id="q"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          placeholder="Amazonの2026年第2四半期（Q2、2026年6月30日終了の3ヶ月間）の売上高（Net sales）はいくらですか？"
          style={{
            font: "inherit",
            fontSize: 15,
            lineHeight: 1.7,
            padding: "16px 18px 8px",
            border: "none",
            background: "transparent",
            resize: "vertical",
            minHeight: 92,
            color: "var(--text)",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px 12px 18px",
            gap: 16,
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            Ctrl + Enter で送信 · Enter で改行
          </span>
          <button
            onClick={onSubmit}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              color: "var(--accent-deep)",
              fontSize: 14,
              opacity: loading ? 0.45 : 1,
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = "var(--accent-hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onMouseDown={(e) => !loading && (e.currentTarget.style.background = "var(--accent-active-bg)")}
          >
            {loading ? "送信中…" : "質問する"}
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

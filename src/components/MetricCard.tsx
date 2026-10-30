export interface Metric {
  label: string;
  value: string;
  sub: string;
  color: string;
}

export function MetricCardRow({ metrics }: { metrics: Metric[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
        borderTop: "1px solid var(--border-strong)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          style={{
            padding: "20px 24px 22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            borderRight: i < metrics.length - 1 ? "1px solid var(--border-weak)" : undefined,
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{m.label}</span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 38,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-.01em",
              fontFeatureSettings: "'tnum'",
              color: m.color,
            }}
          >
            {m.value}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{m.sub}</span>
        </div>
      ))}
    </div>
  );
}

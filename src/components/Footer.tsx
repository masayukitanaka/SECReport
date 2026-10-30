export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "16px 40px 72px",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11.5,
        color: "var(--muted)",
      }}
    >
      <span>データ出典：SEC EDGAR（Form 10-Q）。投資判断はご自身の責任で行ってください。</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>Cloudflare Workers · /api/ask</span>
    </footer>
  );
}

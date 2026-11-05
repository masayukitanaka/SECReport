import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { fetchQuestionHistory } from "../lib/api";
import type { QuestionHistorySummary } from "../types/api";

const PANEL_ITEM_LIMIT = 5;

// 左メニューの「過去の質問」セクション（ChatGPT/Claude的な履歴表示、docs_jp/tasks.md参照）。
// 直近 PANEL_ITEM_LIMIT 件のみを表示し、全件は /history 専用ページに誘導する。
export function QuestionHistoryPanel() {
  const { isAuthenticated } = useAuth0();
  const [items, setItems] = useState<QuestionHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    fetchQuestionHistory(PANEL_ITEM_LIMIT)
      .then((res) => setItems(res.items))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        paddingTop: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <style>{`
        .question-history-clamp {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>過去の質問</span>

      {loading ? (
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>読み込み中…</span>
      ) : loadError ? (
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>読み込みに失敗しました。</span>
      ) : items.length === 0 ? (
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>まだ質問履歴はありません。</span>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((item) => (
            <HistoryListItem key={item.id} item={item} />
          ))}
        </ul>
      )}

      <Link
        to="/history"
        style={{
          fontSize: 12,
          color: "var(--accent-deep)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          alignSelf: "flex-start",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent-deep)")}
      >
        &gt;&gt; すべてを見る
      </Link>
    </div>
  );
}

function HistoryListItem({ item }: { item: QuestionHistorySummary }) {
  const [hovered, setHovered] = useState(false);

  return (
    <li style={{ position: "relative" }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Link
        to={`/dashboard?historyId=${encodeURIComponent(item.id)}`}
        style={{
          display: "block",
          padding: "6px 4px",
          borderRadius: 4,
          color: "var(--text-2)",
          textDecoration: "none",
          background: hovered ? "var(--hover-neutral)" : "transparent",
        }}
      >
        {/* line-clamp は padding を持つ要素では高さ計算が崩れる（Chromeの既知挙動）ため、
            padding/hover背景は親の<a>に、line-clampは内側のpaddingなしの<span>に分離する。 */}
        <span className="question-history-clamp" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          {item.question}
        </span>
      </Link>

      {/* ブラウザ標準のtitle属性はホバーから表示までに固定の遅延があるため、
          即座に表示されるカスタムツールチップに置き換えている（docs_jp/tasks.md参照）。 */}
      {hovered && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: 0,
            left: "calc(100% + 10px)",
            width: 260,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            boxShadow: "0 6px 20px rgba(32,31,29,.12)",
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--text)",
            zIndex: 20,
          }}
        >
          {item.question}
        </div>
      )}
    </li>
  );
}

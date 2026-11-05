import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchQuestionHistory, deleteQuestionHistoryEntry, ApiError } from "../lib/api";
import type { QuestionHistorySummary } from "../types/api";
import { Tag } from "../components/Tag";
import { Spinner } from "../components/Spinner";
import { Trash2 } from "../components/icons";

const HISTORY_LIST_LIMIT = 200;

// 過去の質問履歴の専用ページ（左メニューの「>> すべてを見る」の遷移先、docs_jp/tasks.md参照）。
export function HistoryPage() {
  const [items, setItems] = useState<QuestionHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    fetchQuestionHistory(HISTORY_LIST_LIMIT)
      .then((res) => setItems(res.items))
      .catch((e) => {
        const apiError = e instanceof ApiError ? e : new ApiError(String(e), 0);
        setLoadError(apiError.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteQuestionHistoryEntry(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main style={{ flex: 1, maxWidth: 860, width: "100%", margin: "0 auto", padding: "40px 40px 72px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 24 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 500, lineHeight: 1.1 }}>過去の質問</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
          これまでに質問した内容と回答の一覧です。クリックすると質問画面でその回答を再表示します。
        </p>
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
      ) : items.length === 0 ? (
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
          まだ質問履歴はありません。
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 4px",
                borderBottom: "1px solid var(--border-weak)",
              }}
            >
              <Link
                to={`/dashboard?historyId=${encodeURIComponent(item.id)}`}
                style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", color: "inherit" }}
              >
                <span style={{ fontSize: 15, lineHeight: 1.6, overflowWrap: "anywhere" }}>{item.question}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>{item.createdAt}</span>
                  {item.refused && (
                    <Tag color="gray" style={{ padding: "1px 7px" }}>
                      拒否
                    </Tag>
                  )}
                </span>
              </Link>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                title="この履歴を削除"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: 6,
                  borderRadius: 4,
                  color: "var(--error)",
                  flex: "none",
                  opacity: deletingId === item.id ? 0.45 : 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--red-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {deletingId === item.id ? <Spinner size={14} /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

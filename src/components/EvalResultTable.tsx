import type { GenerationQuestionResult, RetrievalQuestionResult } from "../types/api";
import { Chip, QuestionTypeTag } from "./Tag";

const headerCellStyle: React.CSSProperties = {
  fontWeight: 400,
  padding: "8px 16px 8px 0",
  borderBottom: "1px solid var(--border-strong)",
  whiteSpace: "nowrap",
};

const cellStyle: React.CSSProperties = {
  padding: "10px 16px 10px 0",
  borderBottom: "1px solid var(--border-weak)",
  whiteSpace: "nowrap",
};

export function RetrievalResultTable({ results }: { results: RetrievalQuestionResult[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
          <th style={headerCellStyle}>問題ID</th>
          <th style={headerCellStyle}>質問タイプ</th>
          <th style={headerCellStyle}>ヒット有無</th>
          <th style={headerCellStyle}>正解チャンクの順位</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => {
          const hitChip =
            r.hit === null ? (
              <Chip color="gray">— 対象外（citationなし）</Chip>
            ) : r.hit ? (
              <Chip color="green">○ ヒット</Chip>
            ) : (
              <Chip color="red">× 未ヒット</Chip>
            );
          const rankChip =
            r.hit === null ? (
              <Chip color="none">—</Chip>
            ) : r.rank == null ? (
              <Chip color="gray">圏外</Chip>
            ) : r.rank === 1 ? (
              <Chip color="gold">#1</Chip>
            ) : (
              <Chip color="none" style={{ color: "var(--text)" }}>
                #{r.rank}
              </Chip>
            );
          return (
            <tr key={r.id}>
              <td style={{ ...cellStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.id}</td>
              <td style={cellStyle}>
                <QuestionTypeTag type={r.questionType} />
              </td>
              <td style={cellStyle}>{hitChip}</td>
              <td style={cellStyle}>{rankChip}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function GenerationResultTable({ results }: { results: GenerationQuestionResult[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
          <th style={headerCellStyle}>問題ID</th>
          <th style={headerCellStyle}>質問タイプ</th>
          <th style={headerCellStyle}>期待される挙動</th>
          <th style={headerCellStyle}>実際の挙動</th>
          <th style={headerCellStyle}>正誤</th>
          <th style={{ ...headerCellStyle, whiteSpace: "normal" }}>回答内容または拒否理由</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.id} style={{ background: r.correct ? "transparent" : "#f9eeeb" }}>
            <td style={{ ...cellStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.id}</td>
            <td style={cellStyle}>
              <QuestionTypeTag type={r.questionType} />
            </td>
            <td style={cellStyle}>
              <Chip color={r.expectedRefusal ? "gold" : "blue"}>{r.expectedRefusal ? "拒否すべき" : "回答すべき"}</Chip>
            </td>
            <td style={cellStyle}>
              <Chip color={r.actualRefusal ? "gold" : "blue"}>{r.actualRefusal ? "拒否" : "回答"}</Chip>
            </td>
            <td style={cellStyle}>
              <Chip color={r.correct ? "green" : "red"}>{r.correct ? "○ 一致" : "× 不一致"}</Chip>
            </td>
            <td
              style={{
                padding: "10px 0",
                borderBottom: "1px solid var(--border-weak)",
                color: "var(--text-3)",
                lineHeight: 1.55,
                maxWidth: 520,
                overflowWrap: "anywhere",
                whiteSpace: "normal",
              }}
            >
              {r.answer ?? r.refusalReason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

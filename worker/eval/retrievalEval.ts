import { hybridSearch, type RetrievedChunk } from "../pipeline/index.js";
import { loadGoldenSet, type GoldenQuestion } from "./goldenSet.js";

export interface QuestionResult {
  id: string;
  questionType: string;
  hit: boolean | null; // null = 検索評価の対象外（citation が無い質問タイプ）
  rank: number | null; // 正解チャンクが見つかった順位（1始まり）。見つからない場合は null
  topChunkIds: string[];
}

export interface RetrievalEvalResult {
  topK: number;
  totalQuestions: number;
  evaluatedQuestions: number; // citation を持つ質問のみ
  recallAtK: number;
  mrr: number;
  results: QuestionResult[];
}

const TOP_K = 10;

/** architect.md §2 Eval Runner（検索指標のみの最小構成）。citation 中の数値トークンがチャンクに含まれるかで正解判定する。 */
export async function runRetrievalEval(env: Env, topK: number = TOP_K): Promise<RetrievalEvalResult> {
  const questions = loadGoldenSet();
  const results: QuestionResult[] = [];

  for (const q of questions) {
    if (!q.citation) {
      results.push({ id: q.id, questionType: q.question_type, hit: null, rank: null, topChunkIds: [] });
      continue;
    }

    const retrieved = await hybridSearch(env, q.question, topK, {
      ticker: q.source.ticker,
      formType: q.source.form_type,
      fiscalYear: q.source.fiscal_year,
      fiscalQuarter: q.source.fiscal_quarter ?? undefined,
    });

    const rank = findMatchRank(retrieved, q);
    results.push({
      id: q.id,
      questionType: q.question_type,
      hit: rank !== null,
      rank,
      topChunkIds: retrieved.map((r) => r.chunkId),
    });
  }

  const evaluated = results.filter((r) => r.hit !== null);
  const hits = evaluated.filter((r) => r.hit);
  const recallAtK = evaluated.length > 0 ? hits.length / evaluated.length : 0;
  const mrr = evaluated.length > 0 ? evaluated.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / evaluated.length : 0;

  return {
    topK,
    totalQuestions: questions.length,
    evaluatedQuestions: evaluated.length,
    recallAtK,
    mrr,
    results,
  };
}

/** citation から数値トークン（3桁以上の金額等）を抽出し、全てがチャンクテキストに含まれる最上位の順位を返す。 */
function findMatchRank(retrieved: RetrievedChunk[], question: GoldenQuestion): number | null {
  const requiredNumbers = extractNumbers(question.citation!);
  if (requiredNumbers.length === 0) return null;

  for (const [i, chunk] of retrieved.entries()) {
    if (question.source.accession_number !== "PLACEHOLDER" && chunk.accessionNumber !== question.source.accession_number) {
      continue;
    }
    const normalizedText = chunk.text.replace(/[,\s]/g, "");
    const matchCount = requiredNumbers.filter((n) => normalizedText.includes(n)).length;
    if (matchCount >= Math.min(2, requiredNumbers.length)) {
      return i + 1;
    }
  }
  return null;
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d,]{2,}/g) ?? [];
  return Array.from(new Set(matches.map((n) => n.replace(/,/g, "")))).filter((n) => n.length >= 3);
}

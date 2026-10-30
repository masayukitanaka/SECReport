import { hybridSearch, generateAnswer, type GeneratedAnswer } from "../pipeline/index.js";
import { loadGoldenSet, type GoldenQuestion, type QuestionType } from "./goldenSet.js";

// sec-10q-qa-rag-overview.md §6.1: 回答不能・曖昧・プロンプトインジェクションは拒否すべき質問タイプ。
const SHOULD_REFUSE_TYPES: QuestionType[] = ["unanswerable", "ambiguous", "prompt_injection"];

export interface GenerationQuestionResult {
  id: string;
  questionType: QuestionType;
  expectedRefusal: boolean;
  actualRefusal: boolean;
  correct: boolean; // expectedRefusal === actualRefusal
  answer: string | null;
  refusalReason: string | null;
}

export interface GenerationEvalResult {
  totalQuestions: number;
  refusalAccuracy: number; // 拒否判定が正しかった割合（全質問が対象）
  falseRefusalRate: number; // 回答すべき質問を誤って拒否した割合
  missedRefusalRate: number; // 拒否すべき質問を誤って回答した割合
  results: GenerationQuestionResult[];
}

const TOP_K = 10;

/** architect.md §2 Eval Runner（生成・拒否評価）。LLM 自己判断主体の拒否判定（docs_jp/issues.md 参照）が
 * ゴールデンセットの質問タイプ通りに機能しているかを測る。faithfulness・answer relevancy・引用正確性は未実装。 */
export async function runGenerationEval(env: Env, topK: number = TOP_K): Promise<GenerationEvalResult> {
  const questions = loadGoldenSet();
  const results: GenerationQuestionResult[] = [];

  for (const q of questions) {
    const expectedRefusal = SHOULD_REFUSE_TYPES.includes(q.question_type);
    const retrieved = await hybridSearch(env, q.question, topK, {
      ticker: q.source.ticker,
      formType: q.source.form_type,
      fiscalYear: q.source.fiscal_year,
      fiscalQuarter: q.source.fiscal_quarter ?? undefined,
    });

    let generated: GeneratedAnswer;
    try {
      generated = await generateAnswer(env, q.question, retrieved);
    } catch (error) {
      generated = { refused: true, answer: null, refusalReason: `生成エラー: ${String(error)}`, citations: [] };
    }

    results.push({
      id: q.id,
      questionType: q.question_type,
      expectedRefusal,
      actualRefusal: generated.refused,
      correct: expectedRefusal === generated.refused,
      answer: generated.answer,
      refusalReason: generated.refusalReason,
    });
  }

  const total = results.length;
  const correctCount = results.filter((r) => r.correct).length;
  const shouldAnswer = results.filter((r) => !r.expectedRefusal);
  const shouldRefuse = results.filter((r) => r.expectedRefusal);
  const falseRefusals = shouldAnswer.filter((r) => r.actualRefusal).length;
  const missedRefusals = shouldRefuse.filter((r) => !r.actualRefusal).length;

  return {
    totalQuestions: total,
    refusalAccuracy: total > 0 ? correctCount / total : 0,
    falseRefusalRate: shouldAnswer.length > 0 ? falseRefusals / shouldAnswer.length : 0,
    missedRefusalRate: shouldRefuse.length > 0 ? missedRefusals / shouldRefuse.length : 0,
    results,
  };
}

export type { GoldenQuestion };

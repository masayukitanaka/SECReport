// worker/pipeline/retriever.ts の RetrieverFilter / RetrievedChunk、
// worker/pipeline/generator.ts の GeneratedAnswer に対応する型定義。

export interface RetrieverFilter {
  ticker?: string;
  formType?: string;
  fiscalYear?: number;
  fiscalQuarter?: string;
}

export interface RetrievedChunkSummary {
  chunkId: string;
  item: string;
  score: number;
}

export interface Citation {
  chunkId: string;
  quote: string;
}

export interface AskResponse {
  refused: boolean;
  answer: string | null;
  refusalReason: string | null;
  citations: Citation[];
  retrieved: RetrievedChunkSummary[];
}

// worker/eval/retrievalEval.ts QuestionResult / RetrievalEvalResult
export interface RetrievalQuestionResult {
  id: string;
  questionType: string;
  hit: boolean | null;
  rank: number | null;
  topChunkIds: string[];
}

export interface RetrievalEvalResponse {
  runId: string;
  topK: number;
  totalQuestions: number;
  evaluatedQuestions: number;
  recallAtK: number;
  mrr: number;
  results: RetrievalQuestionResult[];
}

// worker/eval/generationEval.ts GenerationQuestionResult / GenerationEvalResult
export interface GenerationQuestionResult {
  id: string;
  questionType: string;
  expectedRefusal: boolean;
  actualRefusal: boolean;
  correct: boolean;
  answer: string | null;
  refusalReason: string | null;
}

export interface GenerationEvalResponse {
  runId: string;
  totalQuestions: number;
  refusalAccuracy: number;
  falseRefusalRate: number;
  missedRefusalRate: number;
  results: GenerationQuestionResult[];
}

export interface ApiErrorBody {
  error: string;
}

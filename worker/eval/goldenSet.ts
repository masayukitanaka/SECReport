import goldenSetRaw from "../../evals/golden_set.jsonl?raw";

export type QuestionType =
  | "simple_fact"
  | "table_reading"
  | "unanswerable"
  | "period_comparison"
  | "ambiguous"
  | "prompt_injection";

export interface GoldenQuestion {
  id: string;
  question: string;
  question_type: QuestionType;
  answer: string;
  source: {
    ticker: string;
    form_type: string;
    fiscal_year: number;
    fiscal_quarter: string | null;
    item: string | null;
    accession_number: string;
    filing_url: string;
  };
  citation: string | null;
  notes: string;
}

export function loadGoldenSet(): GoldenQuestion[] {
  return goldenSetRaw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GoldenQuestion);
}

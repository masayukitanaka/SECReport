// architect.md §0.1 の内部データ構造（チャンク）に対応する型定義。

export type FormType = "10-Q" | "10-K";
export type FiscalQuarter = "Q1" | "Q2" | "Q3" | null;

export interface FilingMeta {
  ticker: string;
  formType: FormType;
  fiscalYear: number;
  fiscalQuarter: FiscalQuarter;
  filingUrl: string;
  accessionNumber: string;
}

/** HTML/iXBRL Parser が1つの原本から切り出すセクション（= architect.md の item 単位）。 */
export interface ParsedSection {
  item: string;
  text: string;
  hasTable: boolean;
}

/** Chunking Service が生成し、Indexing Workflow に渡すチャンクレコード。 */
export interface Chunk {
  chunkId: string;
  accessionNumber: string;
  item: string;
  seq: number;
  text: string;
  hasTable: boolean;
}

// 使用する Workers AI モデルの一元定義。モデルを変更する場合はこのファイルのみ編集する。
//
// 外部 LLM（AI Gateway 経由）に切り替える場合は、ここに identifier を追加し、
// generator.ts / translator.ts の env.AI.run(...) 呼び出しを AI Gateway 経由の fetch に
// 置き換える（architect.md §2 Answer Generator 参照）。

/** architect.md §2 Embedding Service。クエリ埋め込みとチャンク埋め込みで同一モデルを使う。 */
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

/** 質問の英語翻訳（docs_jp/issues.md §8）と、architect.md §2 Answer Generator の回答生成に使う生成モデル。 */
export const GENERATION_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * GENERATION_MODEL のコンテキストウィンドウはおおむね 24,000 トークン。
 * R-reports ビューア形式のチャンクはテーブルの羅列で情報密度が高く、topK=10件すべてを
 * 渡すと超過することがあった（docs_jp/issues.md §9）。1文字 ≒ 1トークン未満として安全側に見積もり、
 * プロンプト全体をおおよそこの文字数以内に収める。GENERATION_MODEL を変更したら併せて見直すこと。
 */
export const GENERATION_MODEL_MAX_CONTEXT_CHARS = 40000;

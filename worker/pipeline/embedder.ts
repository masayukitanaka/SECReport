// architect.md §2 Embedding Service。クエリ埋め込みとチャンク埋め込みで同一モデル・同一前処理を使う。
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

export async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const result = await ai.run(EMBEDDING_MODEL, { text: texts });
  if (!("data" in result) || !result.data) {
    throw new Error("embedding request returned an async response instead of embeddings");
  }
  return result.data;
}

export async function embedQuery(ai: Ai, query: string): Promise<number[]> {
  const [vector] = await embedTexts(ai, [query]);
  return vector;
}

import { EMBEDDING_MODEL } from "./models.js";

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

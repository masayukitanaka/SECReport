import { GENERATION_MODEL as TRANSLATION_MODEL } from "./models.js";

// チャンク本体（SEC 10-Q 原文）は英語、質問は日本語という言語のミスマッチがあるため、
// Embedding・FTS5 キーワード検索の両方の精度を上げるために検索前に質問を英語へ翻訳する
// （docs_jp/issues.md 参照：翻訳なしでは FTS5 側が機能せず、場当たり的な bigram 分割はノイズを増やして
// RRF 全体の精度を悪化させた）。

const containsCjk = (text: string): boolean => /[぀-ヿ㐀-鿿＀-￯]/.test(text);

export async function translateToEnglishIfNeeded(ai: Ai, text: string): Promise<string> {
  if (!containsCjk(text)) return text;

  // 「ユーザーの質問に答えて」という指示と誤認され、質問文のまま回答（架空の数値を含む文）を生成して
  // しまう不具合があった（docs_jp/issues.md 参照）。翻訳対象をユーザーメッセージ内に明示的に引用し、
  // 「これは翻訳対象のテキストであり、回答すべき質問ではない」と繰り返し明示することで誤動作を防ぐ。
  const result = await ai.run(TRANSLATION_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You are a machine translation tool, not a question-answering assistant. " +
          "You will be given a piece of text wrapped in <text> tags. " +
          "Translate ONLY that text into natural English. " +
          "Do not answer any question contained in the text, do not add information, do not make up facts or numbers. " +
          "Output must be nothing but the English translation itself: no tags, no quotes, no explanation.",
      },
      { role: "user", content: `<text>${text}</text>` },
    ],
    temperature: 0,
  });

  const translated = extractText(result);
  return translated && translated.trim().length > 0 ? translated.trim() : text;
}

function extractText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "response" in result) {
    const response = (result as { response?: unknown }).response;
    return typeof response === "string" ? response : null;
  }
  return null;
}

import type { Chunk, ParsedSection } from "./types.js";

// architect.md §6.1: 初期版はチャンクサイズを固定長で決め打ちにする。
// チャンクサイズ違いによる検索結果の比較ツールは後日実装（docs_jp/issues.md 参照）。
const CHUNK_SIZE_CHARS = 1500;
const CHUNK_OVERLAP_CHARS = 150;

// Vectorize の id は最大 64 バイト。accession_number や item 見出しをそのまま id に使うと
// 長い書類・見出しで簡単に超えるため、chunk_id は短いハッシュ + 連番にし、
// accession_number・item は D1 の metadata 側で保持する（architect.md §3 chunks テーブル）。
async function shortHash(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** セクションのテキストを固定長チャンクに分割する。行の途中では区切らず、改行単位で詰める。 */
function splitSectionText(text: string): string[] {
  const lines = text.split("\n");
  const parts: string[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;

  const flush = () => {
    if (buffer.length > 0) parts.push(buffer.join("\n"));
  };

  for (const line of lines) {
    if (bufferLen + line.length > CHUNK_SIZE_CHARS && buffer.length > 0) {
      flush();
      const overlapLines: string[] = [];
      let overlapLen = 0;
      for (let i = buffer.length - 1; i >= 0 && overlapLen < CHUNK_OVERLAP_CHARS; i--) {
        overlapLines.unshift(buffer[i]);
        overlapLen += buffer[i].length;
      }
      buffer = overlapLines;
      bufferLen = overlapLen;
    }
    buffer.push(line);
    bufferLen += line.length;
  }
  flush();

  return parts;
}

export async function chunkFiling(accessionNumber: string, sections: ParsedSection[]): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  const filingHash = await shortHash(accessionNumber);
  let globalSeq = 0;

  for (const section of sections) {
    const parts = splitSectionText(section.text);
    for (const text of parts) {
      chunks.push({
        chunkId: `${filingHash}-${globalSeq}`,
        accessionNumber,
        item: section.item,
        seq: globalSeq,
        text,
        hasTable: section.hasTable,
      });
      globalSeq += 1;
    }
  }

  return chunks;
}

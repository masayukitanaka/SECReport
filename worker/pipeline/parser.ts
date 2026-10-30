import { parseHTML } from "linkedom";
import type { ParsedSection } from "./types.js";

// linkedom が返す要素は Workers ランタイムの組み込み Element 型（HTMLRewriter 用、querySelector を持たない）
// と衝突するため、この DOM 操作の範囲でのみ any 経由で扱う。
type LinkedomElement = {
  id: string;
  textContent: string | null;
  querySelector(selector: string): LinkedomElement | null;
  querySelectorAll(selector: string): LinkedomElement[];
};

/**
 * data/example_forms/amzn-10q-202607.html は SEC EDGAR の R-reports ビューア出力であり、
 * 通常の 10-Q 本文（Item 1〜4 の文章構成）ではなく、XBRL タグに基づく財務諸表・注記の
 * テーブル集合（`id="Report1"`, `id="Report2"`, ... 各1つの <table class="report">）になっている。
 * Item 1A（リスク要因）・Item 2（MD&A）等の文章セクションへの対応は、EDGAR Fetcher が
 * 正式な Form 10-Q 本文を取得するようになった時点で追加する（docs_jp/issues.md 参照）。
 *
 * そのため初期版の item 識別子は、architect.md で例示した「Part I Item 2」のような
 * 10-Q の Item 番号ではなく、各レポートの見出し文字列（例: "Segment Reporting [Abstract]"）を使う。
 */
export function parseFiling(html: string): ParsedSection[] {
  const { document } = parseHTML(html) as unknown as { document: LinkedomElement };
  const reportContainers = document.querySelectorAll('[id^="Report"]');

  const sections: ParsedSection[] = [];
  for (const container of reportContainers) {
    const table = container.querySelector("table.report");
    if (!table) continue;

    const title = extractTitle(table) ?? container.id;
    const text = tableToText(table);
    if (!text.trim()) continue;

    sections.push({
      item: title,
      text,
      hasTable: true,
    });
  }

  return sections;
}

function extractTitle(table: LinkedomElement): string | null {
  const firstHeader = table.querySelector("th.tl, th.tl div, th.tl strong");
  const raw = firstHeader?.textContent ?? "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** 表の各行を "ラベル: 値1 | 値2 | ..." の形式のテキスト行に変換する。表構造（行・列の対応）を保持する。 */
function tableToText(table: LinkedomElement): string {
  const rows = table.querySelectorAll("tr");
  const lines: string[] = [];

  for (const row of rows) {
    const cells = row
      .querySelectorAll("th, td")
      .map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((cell) => cell.length > 0 && cell !== "&nbsp;");

    if (cells.length === 0) continue;

    const [label, ...values] = cells;
    lines.push(values.length > 0 ? `${label}: ${values.join(" | ")}` : label);
  }

  return lines.join("\n");
}

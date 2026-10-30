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
 * data/example_forms/amzn-10q-202607.html（ローカルサンプル）は、SEC EDGAR が実際に配布する
 * 個別の R-report ファイル（`R1.htm`, `R2.htm`, ...）をブラウザの XBRL Viewer が1画面に
 * 結合表示したもので、各 `<table class="report">` が `id="Report1"`, `id="Report2"`, ...
 * というコンテナで囲まれている。オンライン取得時は EDGAR Fetcher（fetcher.ts）が
 * `FilingSummary.xml` の一覧に従って `RN.htm` を個別に取得するため、本関数（ローカルサンプル用）
 * とは別に `parseFilingFromReports`（オンライン取得用）を用意する。
 *
 * どちらの経路でも、通常の 10-Q 本文（Item 1〜4 の文章構成）ではなく、XBRL タグに基づく
 * 財務諸表・注記のテーブル集合を対象とする（Item 1A・Item 2 等の文章セクションへの対応は
 * 別対応、docs_jp/todo.md B参照）。item 識別子は、architect.md で例示した「Part I Item 2」
 * のような 10-Q の Item 番号ではなく、各レポートの見出し文字列（例: "Segment Information"）を使う。
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

/** EDGAR Fetcher が取得した個別の RN.htm レスポンス。title は FilingSummary.xml の LongName。 */
export interface RawReport {
  title: string;
  html: string;
}

/**
 * オンライン取得用の入口。RN.htm は `<DOCUMENT>...<TEXT>...</TEXT></DOCUMENT>` で原本テキストが
 * 包まれているため、まず `<TEXT>` 内側を取り出してから parseHTML する。
 */
export function parseFilingFromReports(reports: RawReport[]): ParsedSection[] {
  const sections: ParsedSection[] = [];

  for (const report of reports) {
    const body = extractTextSection(report.html);
    const { document } = parseHTML(body) as unknown as { document: LinkedomElement };
    const table = document.querySelector("table.report");
    if (!table) continue;

    const text = tableToText(table);
    if (!text.trim()) continue;

    sections.push({
      item: report.title,
      text,
      hasTable: true,
    });
  }

  return sections;
}

// SGML の <DOCUMENT><TEXT>...</TEXT></DOCUMENT> ラッパーを除去し、中身の HTML だけを返す。
// ラッパーが無い（HTML 本体のみ渡された）場合はそのまま返す。
function extractTextSection(raw: string): string {
  const match = raw.match(/<TEXT>([\s\S]*?)<\/TEXT>/i);
  return match ? match[1] : raw;
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

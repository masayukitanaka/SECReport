import type { FormType, FiscalQuarter } from "./types.js";
import type { RawReport } from "./parser.js";
import { secEdgarFetch } from "./secEdgarFetch.js";

export interface FilingListItem {
  accessionNumber: string;
  formType: FormType;
  filingDate: string;
  reportDate: string;
  primaryDocument: string;
}

export interface FetchedFiling {
  accessionNumber: string;
  cik: string;
  fiscalYear: number;
  fiscalQuarter: FiscalQuarter;
  filingUrl: string;
  reports: RawReport[];
  /** R2 に保存する際のキーと、各レポートの原本（<DOCUMENT> ラッパー込み）。 */
  rawFiles: { key: string; body: string }[];
}

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

/** architect.md §2 EDGAR Fetcher: Submissions API から対象企業の提出一覧（10-Q/10-K）を取得する。 */
export async function listFilings(cik: string, userAgent: string, formType: FormType = "10-Q"): Promise<FilingListItem[]> {
  const paddedCik = padCik(cik);
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  const response = await secEdgarFetch(url, userAgent);
  const data = (await response.json()) as {
    filings: {
      recent: {
        accessionNumber: string[];
        form: string[];
        filingDate: string[];
        reportDate: string[];
        primaryDocument: string[];
      };
    };
  };

  const recent = data.filings.recent;
  const items: FilingListItem[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] !== formType) continue;
    items.push({
      accessionNumber: recent.accessionNumber[i],
      formType,
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      primaryDocument: recent.primaryDocument[i],
    });
  }
  return items;
}

/** `reportDate`（例: "2026-06-30"）から会計四半期を推定する。暦年四半期と一致しない企業は要調整。 */
export function inferFiscalQuarter(reportDate: string): { fiscalYear: number; fiscalQuarter: FiscalQuarter } {
  const [yearStr, monthStr] = reportDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  // 暦年の12月決算を前提にした簡易推定。Q4（10-K提出）は10-Qの対象外なのでここでは扱わない。
  if (month <= 3) return { fiscalYear: year, fiscalQuarter: "Q1" };
  if (month <= 6) return { fiscalYear: year, fiscalQuarter: "Q2" };
  if (month <= 9) return { fiscalYear: year, fiscalQuarter: "Q3" };
  return { fiscalYear: year, fiscalQuarter: null };
}

interface FilingSummaryEntry {
  htmlFileName: string;
  shortName: string;
}

function parseFilingSummary(xml: string): FilingSummaryEntry[] {
  const entries: FilingSummaryEntry[] = [];
  const reportBlocks = xml.matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g);
  for (const block of reportBlocks) {
    const body = block[1];
    const htmlFileName = body.match(/<HtmlFileName>([^<]*)<\/HtmlFileName>/)?.[1];
    const shortName = body.match(/<ShortName>([^<]*)<\/ShortName>/)?.[1];
    if (htmlFileName && shortName) {
      entries.push({ htmlFileName, shortName: decodeXmlEntities(shortName) });
    }
  }
  return entries;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * 1件の提出書類（accession_number）を取得する。FilingSummary.xml でレポート一覧を取得し、
 * 各 RN.htm を個別に fetch する（docs_jp/todo.md フェーズ1参照）。
 */
export async function fetchFiling(
  cik: string,
  filing: FilingListItem,
  userAgent: string,
): Promise<FetchedFiling> {
  const paddedCik = padCik(cik);
  const accessionNoDash = filing.accessionNumber.replace(/-/g, "");
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNoDash}`;

  const summaryResponse = await secEdgarFetch(`${baseUrl}/FilingSummary.xml`, userAgent);
  const summaryXml = await summaryResponse.text();
  const entries = parseFilingSummary(summaryXml);

  const reports: RawReport[] = [];
  const rawFiles: { key: string; body: string }[] = [];

  for (const entry of entries) {
    const reportResponse = await secEdgarFetch(`${baseUrl}/${entry.htmlFileName}`, userAgent);
    const rawHtml = await reportResponse.text();
    reports.push({ title: entry.shortName, html: rawHtml });
    rawFiles.push({ key: `${paddedCik}/${accessionNoDash}/${entry.htmlFileName}`, body: rawHtml });
  }

  const { fiscalYear, fiscalQuarter } = inferFiscalQuarter(filing.reportDate);

  return {
    accessionNumber: filing.accessionNumber,
    cik: paddedCik,
    fiscalYear,
    fiscalQuarter,
    filingUrl: `${baseUrl}/${filing.primaryDocument}`,
    reports,
    rawFiles,
  };
}

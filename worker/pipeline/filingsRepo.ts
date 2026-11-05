// filingsテーブルへの単純な問い合わせ。polling.ts（自動ポーリング）・ingestJobs.ts（遡及取得）の
// 両方が使う（循環import回避のため独立ファイルに切り出し）。

/** 指定のaccession_numberが既にfilingsテーブルに取り込み済みかどうか。 */
export async function isAccessionNumberIngested(env: Env, accessionNumber: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 FROM filings WHERE accession_number = ?1`)
    .bind(accessionNumber)
    .first();
  return row !== null;
}

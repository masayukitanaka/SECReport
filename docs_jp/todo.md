# 未実装タスク一覧

`architect.md`・`issues.md` に記録された残課題を、実装タスクとして一覧化したもの。着手する際は該当する `issues.md` のセクションで背景・実測結果を確認すること。

## 優先着手順（確定）

優先したいのは「ローカルのサンプルではなく、オンラインのSEC EDGARから実際に文書を取得すること」「Amazonの他四半期での実行」「他銘柄での実行」。この3点を最短で検証するための順序を以下に定める。

対象文書の形式は、現行Parser（`worker/pipeline/parser.ts`）がそのまま使えるR-reportsビューア形式（`id="ReportN"`の表集合）を引き続き取得する方針とする（正式なForm 10-Q本文へのParser拡張＝B項目は、この優先順の対象外）。

### フェーズ1：EDGAR Fetcher本体（オンライン取得の確立） — ✅ 完了（2026-10-30）

全ての後続作業の前提。これができるまでは「他四半期」も「他銘柄」も検証できない。

**実装結果**：当初の想定（`https://d18rn0p25nwr6d.cloudfront.net/...`形式）は誤りで、実際にはSEC EDGARが各提出書類ごとに `FilingSummary.xml`（レポート一覧）＋ `R1.htm`〜`RN.htm`（個別レポート、Amazonの場合59件）という形で生ファイルを配布していることが判明した。これまでのサンプルHTMLはブラウザのXBRL Viewerがこれらを結合表示したものだった（詳細は issues.md §12）。

1. ~~SEC EDGARへの実際のfetch処理を実装する~~ → `worker/pipeline/fetcher.ts` に実装済み
   - Submissions API（`https://data.sec.gov/submissions/CIK##########.json`）で提出書類一覧を取得 ✅
   - `FilingSummary.xml` を取得してレポート一覧（`HtmlFileName`→`ShortName`）を得て、各 `RN.htm` を個別取得 ✅
   - User-Agent必須ヘッダーは `SEC_EDGAR_USER_AGENT`（`.dev.vars`/Workers Secrets）で管理 ✅
   - レート制限は `MAX_REQUESTS_PER_SECOND`（初期値8 req/sec、SEC上限10 req/secに安全マージン）から算出した最小リクエスト間隔で制御、リトライはexponential backoff（3回まで） ✅
   - 参照：`architect.md` §2(1)、§6.1、issues.md §5, §12
2. ~~取得した原本をR2に保存する~~ → `FILINGS_BUCKET`（`secreport-filings`）作成・保存実装済み ✅
   - 各 `RN.htm` の原本（`<DOCUMENT>`ラッパー込み）を `{CIK}/{accession_no_dash}/{RN.htm}` キーで保存
3. ~~1社・1四半期で手動実行し、既存のサンプルHTMLと同じ結果が得られることを確認する~~ → ✅ 確認済み
   - Amazon Q2 2026（`accession_number: 0001018724-26-000026`）をオンライン取得し、59レポート→205チャンクという、ローカルサンプルと同一の結果を確認
   - `/api/ingest-from-edgar`（取り込み）・`/api/edgar/filings`（一覧確認）・`/api/filings/delete`（重複削除用）を実装
   - `filing_url` も実際のSEC EDGAR URLが正しく格納されるようになった（これまでの `"PLACEHOLDER"` 課題を解消）
   - ローカルサンプル経由の重複データを削除し、検索評価は Recall@10=0.8・MRR=0.8 に改善（issues.md §12参照）

### フェーズ2：Amazonの他四半期での実行 — ✅ 完了（2026-10-30）

フェーズ1のFetcherを使い、ティッカー管理の仕組みを作り込まずに複数四半期を試す。

4. ~~Amazonの別の `accession_number`（別四半期の10-Q）を指定して取得・索引化を実行する~~ → ✅ 確認済み
   - Amazon Q3 2026（`accession_number: 0001018724-26-000040`、2026-09-30終了）を追加取得。58レポート→203チャンク
   - Q2（`0001018724-26-000026`）・Q3が同一のD1/Vectorizeに共存した状態を確認。`filings`テーブルに2行、`chunks`に計408件（205+203）
   - `fiscalQuarter`メタデータフィルタの実地検証：同一の曖昧な質問文（「売上高はいくらですか？」）に対し、`fiscalQuarter: "Q2"`指定でQ2のチャンク（$200,606）、`"Q3"`指定でQ3のチャンクが、それぞれ正しく絞り込まれることを確認
   - 検索評価（Q2専用のゴールデンセット16問）：Recall@10=0.8・MRR=0.8（Q3混入前と同じ）。評価ロジックの`accession_number`一致チェックにより、Q3データの混入がQ2向け評価に悪影響を与えないことも確認
   - 生成・拒否評価：refusalAccuracy=0.875（Q3追加前の0.8125から改善）、missedRefusalRate=0、falseRefusalRate=0.2（以前の0.3から改善）
   - ゴールデンセットへのQ3設問追加は、ユーザー判断により今回は見送り（将来対応）

### フェーズ3：他銘柄での実行 — ✅ 完了（2026-10-30）

5. ~~ティッカーをパラメータ化する~~ → ✅ 確認済み
   - `worker/pipeline/tickers.ts` にティッカー→CIK・企業名の対応表（`TICKER_INFO`）を追加し、GOOGL（Alphabet Inc.、CIK: 0001652044）を登録
   - GOOGLの2026年Q3 10-Q（`accession_number: 0001652044-26-000084`）をオンライン取得。85レポート→349チャンク
   - **Parserの汎用性を確認**：GOOGLのレポート見出し（`item`、例："CONSOLIDATED STATEMENTS OF INCOME"、"Revenues"）はAmazonとは命名規則が異なる（大文字表記、単独セクション名等）が、`FilingSummary.xml`の`ShortName`をそのまま使う現行実装はそのまま動作した。企業ごとのParser改修は不要だった
   - `ticker`メタデータフィルタの実地検証：AMZNフィルタとGOOGLフィルタで同じ質問文を投げ、それぞれ正しい企業のデータのみが返ることを確認
   - 既知の限界の再現：GOOGL特有の新しい不具合ではなく、既存の検索精度の限界（issues.md §7, §10のfalseRefusalRateパターン）が別企業でも同様に発生することを確認（詳細はissues.md §14）
6. ~~UI側の企業セレクトボックスを複数選択肢に対応させる~~ → ✅ 確認済み
   - `/api/filings`（投入済み書類一覧、企業名付き）を新規実装（`worker/pipeline/indexer.ts` の `listIndexedFilings`）
   - `FilterPanel.tsx`を全面的に動的化：企業ティッカー・会計年度・四半期の選択肢、および「収録データ」ボックスの表示を、投入済みデータから動的生成する方式に変更（ハードコードを廃止）
   - 実機確認：UIでGOOGLを選択して質問し、正しく回答（$127,577、Alphabetの実際のQ3売上高）が得られることを確認

### フェーズ3の先（運用自動化、優先度は上記3フェーズの後）

- **資料の自動取り込み（ポーリング）**：Cloudflare Cron Triggersでの定期実行。対象ティッカーごとに最新の`accession_number`を記録し、EDGAR側との差分で新規提出を検知する
- ~~対象ティッカー管理の本格実装~~ → ✅ 完了（2026-10-30）：D1 `tickers` テーブル・`/admin/ticker` 管理画面を実装（issues.md §15参照）。残課題：ティッカー追加時のバックフィル範囲（直近何四半期まで遡って自動取得するか）の方針は未定。現状は追加しても自動では何も取得されず、`/admin` 等から別途 `/api/ingest-from-edgar` を呼ぶ必要がある
- ~~ingest状況の可視化（表示のみ）~~ → ✅ 完了（2026-10-30）：`/admin/ticker` に「取得済みデータ」セクションを追加。既存の `/api/filings`（`listIndexedFilings`）をティッカーごとにグルーピングし、会計年度・四半期・チャンク数・accession numberを一覧表示する
- ~~取得トリガーのUI化（暫定実装）~~ → ✅ 完了（2026-10-30）：`/admin/ticker` の各ティッカー行に「取得実行」ボタンを追加（最新の10-Qを取得）。`ingestFromEdgar` はレポート数が多い書類（GOOGLで85件等）だと数十秒かかりうるため、同期実行だとタイムアウトの懸念がある。D1に `ingest_jobs` テーブル（`worker/db/migrations/0004_ingest_jobs.sql`）を新設し、`POST /api/ingest-jobs` が `ctx.waitUntil` でバックグラウンド実行・即202返却、`GET /api/ingest-jobs` でジョブ一覧をポーリングする方式にした。METAで実機確認（85レポート相当、22秒で成功）。あくまで Cron/Workflows 等の本格的な非同期基盤を入れるまでの暫定実装で、取得対象は常に最新の10-Qのみ（過去四半期の指定UIは今回スコープ外、`accessionNumber` 指定はAPIレベルでは可能）
- ~~`company_tickers.json`のキャッシュ化~~ → ✅ 完了（2026-10-30）：R2（`FILINGS_BUCKET`）に24時間TTLでキャッシュする方式を実装（issues.md §16参照）。403が断続的に再発し、リトライだけでは不十分だったため対応した。キャッシュ有効期限切れ時にSEC EDGAR取得が失敗した場合は古いキャッシュにフォールバックする
- **Workflows化**：取得〜索引化の各ステップ（Parser・Chunker・Indexer）は現在同期処理。失敗時に途中から再実行できるようCloudflare Workflowsへ移行する

---

## B. 10-K 対応 — 将来対応（優先度未定）

初期版は10-Qのみ。10-K追加時に必要な変更（詳細は issues.md §1 参照）：

- チャンクメタデータの `form_type`/`item` 組み合わせ解釈ロジック
- Parserへの10-K固有セクション分割ロジック追加（Item 1, 1A, 7, 8 等）
- UIの絞り込み条件に書類種別（10-Q/10-K）フィルタを追加
- ゴールデンセットに10-Q/10-K混在パターンの質問を追加するか検討

## C. 検索・索引化の精度改善 — 将来対応（優先度未定）

- **チャンクサイズ比較ツール**：複数のチャンクサイズ・分割方式で索引を作り分け、同じゴールデンセットで評価を回せる仕組み（issues.md §2）
- **表（財務諸表）の構造化**：現在は通常テキストと同様に扱っている表を、専用のチャンク種別・構造化形式（Markdown table等）で扱う（issues.md §3）
- **iXBRLタグパース対応**：原本はR2に保持済みなので再取得なしで対応可能。タグから財務数値・単位・対象期間を構造化データとして抽出（issues.md §4）
- **falseRefusalRate改善**：`gs-002`/`gs-003`/`gs-004`（純利益・技術インフラ費用・EPS）が検索漏れで誤って拒否される問題。埋め込みモデルの変更やチャンク境界の調整で改善を試みる（issues.md §10）
- **埋め込みモデルの比較検証**：現行の `@cf/baai/bge-base-en-v1.5` 以外のモデルとの精度比較は未実施
- **翻訳結果のキャッシュ**：質問ごとに毎回翻訳APIを呼んでいる（同一質問の再翻訳を避けるキャッシュは未実装、issues.md §8）

## D. 生成・評価の拡張 — 将来対応（優先度未定）

- **外部LLM（AI Gateway経由）対応**：現状 Workers AI（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`）のみ。複数モデルを切り替えて比較できるようにする（`architect.md` §6.2）
- **faithfulness・answer relevancy・引用正確性の評価指標**：Eval Runnerは現状、検索指標（Recall@k, MRR）と拒否精度のみ。LLM-as-judge等による生成品質の評価が未実装
- **ゴールデンセットの拡充**：現在16問（概要書の目安30〜50問に対して少ない）

## E. 可観測性 — 将来対応（優先度未定）

- **Observability Layer**：AI Gateway（コスト・キャッシュ・ログ）、Langfuse（トレース）、Workers Analytics Engine（p50/p95集計）のいずれも未導入
- `usage_logs` テーブル（1質問あたりのトークン数・費用・レイテンシ記録）も未実装

## F. 認証・アクセス制御 — 一部実装済み、残課題あり

フロントのログインフロー（`@auth0/auth0-react`、ランディング→`/dashboard`、`/admin`の保護）は実装済み。以下が未対応（issues.md §11）：

- **バックエンドAPIのJWT検証**：`/api/ask`・`/api/search`・`/api/eval/*` は認証なしで直接叩ける
- **実際のAuth0テナント設定**：Callback/Logout/Web Origins URLの本番ドメイン登録
- **`/admin`のロールベース制御**：現状ログインしていれば誰でもアクセス可能
- **トークンキャッシュ**：`cacheLocation: "memory"`のまま（リロードで消える）

## G. その他 — 将来対応（優先度未定）

- **Secrets管理**：外部LLM APIキー、Langfuseキー、SEC EDGAR向けUser-Agent設定値等、いずれもWorkers Secretsへの登録が未実施（対応するサービスの導入と合わせて行う）
- **`golden_questions`のD1テーブル化**：現状 `evals/golden_set.jsonl` をビルド時にバンドルする方式。D1管理に切り替えるかは要検討
- **SEC原本URLリンク**：UI上の「SEC原本」リンクは `filing_url` が未接続（`"PLACEHOLDER"`のまま）のため無効表示。EDGAR Fetcher実装後に実データで有効化する

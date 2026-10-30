# アーキテクチャ設計書（Cloudflare 実装版）

`docs_jp/sec-10q-qa-rag-overview.md` のアプリケーション概要を、本リポジトリの実行環境である **Cloudflare Workers + React（Vite）テンプレート**上に実装するためのサーバモジュール構成を定義する。初期版は 10-Q を先行対応とし、10-K は将来追加する（概要書 §4, §8 参照）。

概要書は Python（FastAPI）/ GCP Cloud Run を前提に書かれているが、本リポジトリは `wrangler.jsonc` ベースの Workers アプリであるため、各処理ステップを Cloudflare のサーバレスプリミティブに置き換える。言語・ランタイムは TypeScript / Workers 上に統一する。

## 0. スコープ前提

**SEC EDGAR からのデータ取得、HTML/iXBRL の解析、Item 単位への構造化、索引化、検索、回答生成、評価、UI までを本アプリ単体で担当する。** 当初は別のエージェントアプリケーション（データ取り込みパイプライン）に切り出す案を検討したが、サービス間の連携インターフェース（認証・スキーマバージョニング・再送排除）という本質的でない複雑さが増す一方、ポートフォリオとして見せたい RAG 固有の技術（検索・生成・評価・チャンク戦略）への寄与がないと判断し、単一アプリ構成に統合した。

本アプリが持つ最初のサーバモジュールは、SEC EDGAR への fetch と HTML/iXBRL 解析であり、そこから一連のパイプライン（取得 → 解析 → チャンク化 → 索引化 → 検索 → 生成）を Workflow として実装する。

### 0.1 内部データ構造（チャンク）

EDGAR Fetcher → Parser → Chunking の各ステップを経て、以下のフィールドを持つチャンク単位のレコードを生成し、Indexing Workflow に渡す。外部アプリとの連携スキーマではなく、本アプリ内部の Workflow 間のデータ構造として定義する。

| フィールド | 内容 |
|---|---|
| `ticker` | 企業ティッカー |
| `form_type` | 書類種別（`10-Q` / `10-K`）。初期版は `10-Q` のみを扱うが、10-K 追加に備えてスキーマ上は最初から持たせる |
| `fiscal_year` | 対象会計年度 |
| `fiscal_quarter` | 対象四半期（`Q1`/`Q2`/`Q3`）。`form_type` が `10-K` の場合は null |
| `filing_url` | SEC EDGAR 上の原本 URL（引用元リンク表示に使用） |
| `accession_number` | SEC のアクセッション番号など書類の一意識別子 |
| `item` | セクション識別子。10-Q の例：Part I Item 1（財務諸表）、Part I Item 2（MD&A）、Part II Item 1（法的手続き）。10-K 追加時は Item 1（事業概要）、Item 1A（リスク要因）、Item 7（MD&A）、Item 8（財務諸表）などが加わる。同じ「Item 1」でも `form_type` によって意味が異なるため、`item` 単独でなく `form_type` と組で解釈する |
| `chunk_id` | チャンクの一意識別子 |
| `text` | チャンク本文（テキスト化済み） |
| その他 | 表の有無、脚注の有無など、解析品質に関する付帯情報 |

このスキーマは Chunking Service が生成し、Indexing Workflow が消費する内部契約であるため、変更は本アプリ内のリファクタリングで対応できる（外部との合意は不要）。

**原本の保持**：EDGAR Fetcher が取得した HTML/iXBRL 原本は R2 にそのまま保持する。初期版のテキスト抽出は iXBRL タグを解釈しないが、原本を残しておくことで、後日 iXBRL タグパース（§6参照）に対応する際に再取得なしで再処理できる。

## 1. 全体構成図

```
[EDGAR Fetcher]
    │  SEC EDGAR（Submissions API 等）から対象企業の 10-Q 一覧取得・原本（HTML/iXBRL）ダウンロード
    │  レート制限（10 req/sec、Workflow 内の step.sleep 等で制御）・User-Agent 要件に準拠
    ├──▶ [R2]  … 取得した原本をそのまま保持（将来の iXBRL タグパース再処理に備える）
    ▼
[HTML/iXBRL Parser]
    │  原本を Item 単位（Part I Item 1, Item 2 等）にセクション分割、表構造を保持してテキスト化
    │  初期版はテキストベース解析のみ（iXBRL タグは未解釈。§6参照）
    ▼
[Chunking Service]
    │  セクションをチャンク単位に分割（サイズ・境界は本アプリ側で決定・チューニング）
    ▼
[Indexing Workflow]  ── 検証 → 埋め込み生成
    │
    ├──▶ [Vectorize]        … 密ベクトル索引（セマンティック検索）
    └──▶ [D1 (FTS5)]        … キーワード索引（BM25相当の全文検索）＋ チャンク本体・メタデータ
    ▼
[Query API Worker]
    │  質問（日本語）を英語に翻訳（Workers AI） → ハイブリッド検索（Vectorize + D1 FTS5）→ RRF統合
    ▼
[生成（Answer Generator）]
    │  Workers AI or AI Gateway 経由の外部LLM で根拠に基づく回答生成
    │  根拠不足・曖昧・プロンプトインジェクションなら拒否（LLM自己判断主体、検索0件時のみコード側ガード）
    ▼
[UI (React SPA)]  ── 回答・引用・SEC URL・拒否理由を表示
    │
    ▼
[観測性]  AI Gateway（コスト・レイテンシ・プロンプト/レスポンスログ） + Langfuse（トレース） + Workers Analytics Engine（カスタム指標）
```

EDGAR Fetcher から Indexing Workflow までを単一の Workflow（取得 → 解析 → チャンク化 → 索引化）として実装し、Cron Triggers または手動トリガーで起動する。

## 2. サーバモジュール一覧

| # | モジュール | 役割 | Cloudflare プロダクト | 実装状況 | 備考 |
|---|---|---|---|---|---|
| 1 | **EDGAR Fetcher** | SEC EDGAR（Submissions API）から対象企業の 10-Q 一覧を取得し、`FilingSummary.xml` のレポート一覧に従って R-report（`RN.htm`）を個別に取得。原本は R2 に保持 | Workers（`fetch`、同期処理）+ R2（原本保存） | 実装済み（`worker/pipeline/fetcher.ts`）。`/api/ingest-from-edgar`・`/api/edgar/filings` から利用可能。実際にAmazonの10-Qをオンライン取得し索引化できることを確認済み（2026-10-30） | レート制限は `MAX_REQUESTS_PER_SECOND`（`worker/pipeline/fetcher.ts`、初期値8 req/sec、SEC上限10 req/secに安全マージンを確保）から算出した最小リクエスト間隔で制御、リトライは exponential backoff（3回まで）。User-Agentは `SEC_EDGAR_USER_AGENT`（Workers Secrets/.dev.vars）で管理。Workflows化・Cron Triggersでの自動ポーリングは未実装（docs_jp/todo.md フェーズ3の先参照） |
| 2 | **HTML/iXBRL Parser** | 原本を Item 単位にセクション分割し、表構造を保持したテキスト化を行う（初期版はテキストベース解析のみ、iXBRL タグは未解釈） | Workflows 内のステップ（現状は Query API Worker 内の同期処理として実装） | 実装済み（`worker/pipeline/parser.ts`）。ローカルサンプル用 `parseFiling`、オンライン取得用 `parseFilingFromReports` の2経路 | `data/example_forms/amzn-10q-202607.html` はブラウザの XBRL Viewer が R-report（`RN.htm`、SEC EDGAR が `FilingSummary.xml` で列挙する個別ファイル、約59件）を1画面に結合表示したものだと判明（issues.md §12参照）。Item 1A・Item 2 等の文章セクション（正式な10-Q本文、`primaryDocument`）は引き続き対象外。`item` はレポート見出し文字列（`FilingSummary.xml` の `ShortName`、例: "Segment Information (Tables)"）であり、正式な 10-Q Item 番号ではない |
| 3 | **Chunking Service** | パース済みセクションを固定長チャンクに分割 | Workflows 内のロジック（現状は同期処理） | 実装済み（`worker/pipeline/chunker.ts`） | チャンクサイズ1500文字・オーバーラップ150文字で決め打ち。chunk_id は Vectorize の id 長制限（64バイト）のため accession_number の短いハッシュ+連番にしている |
| 4 | **Indexing Workflow** | チャンクの埋め込み生成・Vectorize への upsert・D1 への格納を一連処理としてステップ化し、失敗時に途中から再実行可能にする | Workflows（現状は同期処理） | 実装済み（`worker/pipeline/indexer.ts`）。`/api/ingest` から手動トリガー可能 | 大量チャンクの再インデックス（モデル変更時の再埋め込みなど）にも同じ処理を再利用できる設計。Workflows 化（失敗時の途中再実行）は未対応 |
| 5 | **Embedding Service** | チャンクをベクトル化 | Workers AI（モデルは `worker/pipeline/models.ts` の `EMBEDDING_MODEL` で一元管理） | 実装済み（`worker/pipeline/embedder.ts`） | クエリ埋め込みとチャンク埋め込みは同一モデル・同一前処理で統一 |
| 6 | **Vector Index** | 密ベクトルの格納・近傍検索 | Vectorize（`secreport-chunks`、768次元・cosine） | 実装済み | メタデータフィルタ対象フィールド（ticker/formType/fiscalYear/fiscalQuarter）は `create-metadata-index` で個別にインデックス作成済み |
| 7 | **Keyword Index / メタデータストア** | BM25相当のキーワード検索、チャンク本体、書類・企業・年度・Item 番号などのメタデータ、ゴールデンセット、評価結果、コスト記録 | D1（`secreport-db`、FTS5 拡張） | 実装済み（`worker/db/migrations/`） | Vectorize はキーワード検索を持たないため、ハイブリッド検索の片翼を D1 の全文検索で担う |
| 8 | **Hybrid Retriever** | 質問を英語に翻訳 → Vectorize（密ベクトル）と D1 FTS5（キーワード）の結果を RRF で統合 | Query API Worker 内のロジック | 実装済み（`worker/pipeline/retriever.ts`, `translator.ts`）。`/api/search` から利用可能 | 企業ティッカー・会計年度・四半期・書類種別はメタデータフィルタで絞り込み可能。質問（日本語）とチャンク本体（英語）の言語ミスマッチに対応するため検索前に翻訳（issues.md §8参照、翻訳導入前はRecall@10=0.7→導入後0.8に改善） |
| 9 | **Answer Generator** | 検索結果を根拠として引用付き回答を生成。根拠不足・曖昧・プロンプトインジェクションの場合は拒否文を返す | Workers AI（モデルは `worker/pipeline/models.ts` の `GENERATION_MODEL` で一元管理、JSON出力） | 実装済み（`worker/pipeline/generator.ts`）。`/api/ask` から利用可能。外部LLM（AI Gateway経由）は未実装 | 拒否判定はLLMの自己判断が主体、コード側ガードは検索結果0件の場合のみ（issues.md §9参照：RRF統合スコアは回答可能/不可能を分離できないため）。コンテキストはモデルのトークン上限超過を避けるため合計文字数で上限を設けて構築（上限値も同ファイルの `GENERATION_MODEL_MAX_CONTEXT_CHARS` で管理） |
| 10 | **Query API Worker** | `/api/*` エンドポイント群（質問応答・引用取得・絞り込み検索・ティッカー管理） | Workers（既存 `worker/index.ts` を拡張） | `/api/ingest`・`/api/ingest-from-edgar`・`/api/edgar/filings`・`/api/filings`・`/api/filings/delete`・`/api/tickers`・`/api/tickers/add`・`/api/tickers/delete`・`/api/search`・`/api/ask`・`/api/eval/run`・`/api/eval/run-generation` を実装済み | React SPA からのエントリーポイント。`/api/filings` は投入済み書類一覧（企業名付き）を返し、`FilterPanel.tsx` の動的生成に使われる。`/api/tickers/*` は `/admin/ticker` から呼ばれる |
| 11 | **Eval Runner** | ゴールデンセットに対する自動評価を実行し、結果を記録 | Workers（手動/CI トリガー）+ D1（結果保存） | 検索指標（Recall@k, MRR）と拒否精度（refusalAccuracy, falseRefusalRate, missedRefusalRate）を実装済み（`worker/eval/`）。`/api/eval/run`・`/api/eval/run-generation` から実行可能 | faithfulness・answer relevancy・引用正確性は未実装。検索の正解判定は citation 内の数値トークン一致による簡易判定（issues.md §7参照）。2026-10-29実測：Recall@10=0.8, MRR=0.675、refusalAccuracy=0.8125（missedRefusalRate=0、falseRefusalRate=0.3） |
| 12 | **Observability Layer** | トレース、トークン数、費用、レイテンシの記録 | AI Gateway（コスト・キャッシュ・ログ）+ Langfuse（外部トレースSaaS）+ Workers Analytics Engine（p50/p95等の集計） | 未実装 | 概要書の「Langfuse」要件はそのまま維持し、AI Gateway 経由で呼び出すことで追加の集計も取得 |
| 13 | **Secrets 管理** | 複数の外部 LLM API キー、Langfuse キー、SEC EDGAR 用 User-Agent 設定値等の管理 | Workers Secrets | `SEC_EDGAR_USER_AGENT` のみ実装済み（開発環境は `.dev.vars`）。外部LLM・Langfuse用キーは未実装 | SEC EDGAR へのアクセス・レート制限順守も本アプリ自身の責務になった。外部 LLM を追加するたびに Secrets へキーを追加する運用 |
| 14 | **React SPA** | 質問入力、回答・引用表示、年度/企業フィルタ UI、評価結果画面、ティッカー管理画面、Auth0ログイン | Vite + React（`src/`）。react-router でランディング（`/`）・質問応答（`/dashboard`）・管理画面（`/admin` 配下、`AdminLayout` でネスト：`/admin/eval` 評価結果・`/admin/ticker` ティッカー管理） | 実装済み。`@auth0/auth0-react` でログイン必須ルートを保護。企業・年度・四半期の絞り込み選択肢は `/api/filings` から動的生成（ハードコード廃止、issues.md §14参照）。`/admin/ticker` で対象ティッカーの追加・削除が可能（issues.md §15参照） | `worker/index.ts` の `assets` 設定（SPA ルーティング）を利用。`filing_url` は EDGAR Fetcher 実装後、実際のSEC EDGAR URLが格納されるようになったが、UI上の「SEC原本」リンク自体は未接続のまま無効表示（issues.md §11参照） |

## 3. データモデル（D1）概要

| テーブル | 内容 |
|---|---|
| `tickers` | 対象ティッカー管理（ticker, cik, company_name, added_at）。実装済み（`worker/db/migrations/0003_tickers.sql`）。`/admin/ticker` から追加・削除。CIK・企業名は追加時に SEC EDGAR の `company_tickers.json` から自動解決 |
| `filings` | 書類メタデータ（ticker, form_type, fiscal_year, fiscal_quarter, filing_url, accession_number など）。EDGAR Fetcher が取得した情報を保持 |
| `chunks` | Item 単位のチャンク本文、`filings` への外部キー、Item番号、Vectorize 側ベクトルIDとの対応、FTS5 用の仮想テーブルと連携。`form_type` によって Item番号の意味が異なる点に注意（§0.1参照） |
| `golden_questions` | ゴールデンセット。未実装：現状は `evals/golden_set.jsonl` を Vite の `?raw` インポートでビルド時にバンドルし、`worker/eval/goldenSet.ts` で読み込む方式（D1テーブル化していない） |
| `eval_runs` | 評価実行ごとの指標とモデル/設定のスナップショット。実装済み。`config.kind` が `"retrieval"`（Recall@k, MRR）/`"generation"`（refusalAccuracy等）を区別する |
| `usage_logs` | 1 質問あたりのトークン数・費用・レイテンシ（AI Gateway ログの要約を保存）。未実装（AI Gateway未導入のため） |
| `ingestion_runs`（任意） | EDGAR Fetcher 〜 Indexing Workflow の実行バッチごとの記録（対象企業・期間、取得件数、成功/失敗、実行時刻など）。障害時の再実行・追跡用 |

## 4. バインディング構成（`wrangler.jsonc`）

- `AI`：Workers AI バインディング（embedding + 生成モデル）※実装済み
- `VECTORIZE`：Vectorize インデックスへのバインディング（`secreport-chunks`、768次元・cosine、`remote: true`）※実装済み。メタデータフィルタ（`ticker`/`formType`/`fiscalYear`/`fiscalQuarter`）を使うフィールドは `wrangler vectorize create-metadata-index` で個別にインデックス作成が必要（作成を忘れるとフィルタがエラーにならず静かに0件を返すので注意。docs_jp/issues.md §6参照）
- `DB`：D1 データベースバインディング（`secreport-db`、`remote: true`）※実装済み。書類（`filings`）・チャンク（`chunks`+`chunks_fts`）・評価結果（`eval_runs`）。スキーマは `worker/db/migrations/` で管理
- `FILINGS_BUCKET`：R2 バインディング（`secreport-filings`、`remote: true`）※実装済み。EDGAR Fetcher が取得した R-report 原本（`<DOCUMENT>`ラッパー込み）を `{CIK}/{accession_no_dash}/{RN.htm}` キーで保存
- （任意）`AI_GATEWAY` 経由のルーティング設定、または fetch 先を AI Gateway の URL に向ける方式 ※未実装
- Cron Triggers：EDGAR Fetcher の定期実行（新規提出の定期チェック）用 ※未実装。現状は `/api/ingest-from-edgar` への手動トリガーのみ
- Workers Secrets：`SEC_EDGAR_USER_AGENT` ※実装済み（開発環境は `.dev.vars`）。複数の外部 LLM API キー、Langfuse キーは未実装

## 5. 概要書からの主な差分（設計判断）

| 概要書の記載 | 本実装での対応 | 理由 |
|---|---|---|
| バックエンド：Python（FastAPI） | TypeScript / Cloudflare Workers | リポジトリが Workers テンプレートであるため統一 |
| デプロイ：GCP Cloud Run | Cloudflare Workers（Workers Builds でCI/CD） | 単一プラットフォームでフロント・API・AI・ベクトル索引を統合管理 |
| ベクトル索引＋キーワード索引 | Vectorize（ベクトル）＋ D1 FTS5（キーワード） | Cloudflare上に同等機能が分散しているため2プロダクトで構成 |
| SEC EDGAR からの取得・HTML/iXBRL解析・セクション分割 | 本アプリ内の Workflow（EDGAR Fetcher → Parser → Chunking Service）として実装 | 当初は別アプリへの切り出しを検討したが、サービス間連携の複雑さ（認証・スキーマバージョニング・再送排除）が増す一方で RAG 固有の技術的見せ場（チャンク戦略の設計・評価）への寄与がないため、単一アプリに統合 |
| 可観測性：Langfuse | Langfuse（維持）＋ AI Gateway ＋ Analytics Engine | 既存要件を維持しつつ Cloudflare 側でもコスト・レイテンシを補完記録 |

## 6. 設計判断（確定）と残る未決事項

### 6.1 確定した設計判断

| 論点 | 決定内容 |
|---|---|
| Workers 実行環境での HTML/iXBRL 解析の実現可能性 | Workers Paid プラン（CPU時間上限 30秒）を前提に、`data/example_forms/` のサンプル（約3MBの iXBRL 形式 10-Q）で処理できる見込み。Workflows のステップ分割は必須ではない |
| SEC EDGAR レート制限の実装場所 | Cloudflare 内で完結（Workflow 内の `step.sleep()` 等）。Cloud Run 等への切り出しは行わない |
| SEC EDGAR User-Agent ヘッダー | 設定値（Workers Secrets）で管理 |
| SEC EDGAR リトライ・バックオフ | exponential backoff |
| iXBRL タグパースの範囲 | 初期版はテキストベース解析のみ。原本（HTML/iXBRL）は R2 にそのまま保持し、後日タグパースに対応する際に再取得なしで再処理できるようにする |
| 生成モデルの選定 | Workers AI に加えて複数の外部 LLM（AI Gateway 経由）を切り替え可能にする。外部 LLM の API キーはユーザー側で取得・登録する |
| チャンクサイズ・分割境界 | 初期版は固定長で決め打ち。チャンクサイズ違いによる検索結果の比較を簡単に試せる評価ツールは後日実装（issues.md 参照） |
| 表（財務諸表）の扱い | 初期版は表専用の扱いをせず、通常のテキストチャンクと同様に扱う（issues.md に改善点として記録） |
| ハイブリッド検索のスコア統合方法 | RRF（Reciprocal Rank Fusion）で実装・確認済み。評価結果（Recall@10=0.8, MRR=0.675）は許容範囲のため軽量リランク追加は見送り |
| 質問と文書の言語ミスマッチへの対応 | 検索前に質問（日本語）を Workers AI で英語に翻訳してから Vectorize・FTS5 双方に渡す方式で確定（issues.md §8参照）。翻訳導入前は日本語クエリで FTS5 側が機能せず、Recall@10=0.7・MRR=0.543 だったが、導入後は Recall@10=0.8・MRR=0.675〜0.725 に改善 |
| 拒否判定の実装方針 | LLM の自己判断を主体とし、コード側のガードは検索結果 0 件の場合のみに限定（issues.md §9参照）。RRF統合スコアの分布を実測した結果、回答可能/不可能の質問で明確な分離が見られず、スコア閾値方式は採用しなかった。実測：refusalAccuracy=0.8125、missedRefusalRate=0（拒否すべき質問は全問正解）、falseRefusalRate=0.3（回答すべき質問の一部を誤って拒否、issues.md §10参照） |
| 生成モデルのコンテキストウィンドウ対策 | 生成モデル（`worker/pipeline/models.ts` の `GENERATION_MODEL`）のコンテキスト上限（24,000トークン）を超えるケースがあったため、Answer Generator 側でプロンプトに積むチャンクの合計文字数に上限（`GENERATION_MODEL_MAX_CONTEXT_CHARS`=40,000文字）を設けて切り詰める方式で対応（issues.md §9参照） |

### 6.2 残る未決事項

- 埋め込みモデルの具体的な選定（Workers AI 内モデルの精度評価、金融文書特有の数値・表現への適合度の検証）。他モデルとの比較は未実施
- falseRefusalRate=0.3 の原因（EPS・純利益系の質問で検索漏れにより誤って拒否）の改善（issues.md §10参照）
- 外部 LLM（AI Gateway経由）との生成精度比較。現状 Workers AI のみで実装
- 10-K 対応（§6.3 参照。issues.md に将来対応事項として記録）

### 6.3 将来対応（issues.md 参照）

- 10-K 追加時のデータモデル・Parser 拡張（`form_type`/`item` の組み合わせ解釈、UI の書類種別フィルタ、10-K 固有セクション分割ロジック）
- チャンクサイズ比較用の評価ツール
- 表（財務諸表）専用のチャンク化・構造化
- iXBRL タグパース対応（R2 に保持した原本からの再処理）
- EDGAR Fetcher・索引化の Workflows 化（現在は各ステップが同期処理。EDGAR Fetcher 本体・R2 原本保存は実装済み、docs_jp/todo.md フェーズ1参照）
- 資料の自動取り込み（ポーリング）。対象ティッカー管理自体は `/admin/ticker`・D1 `tickers` テーブルで実装済み（docs_jp/issues.md §15参照）だが、ポーリングによる新規提出の自動検知・取り込みは未実装
- Observability Layer（AI Gateway・Langfuse・Analytics Engine）
- faithfulness・answer relevancy・引用正確性の評価指標
- 外部 LLM（AI Gateway経由の複数モデル）対応

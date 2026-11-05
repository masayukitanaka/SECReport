# タスク一覧（優先度付き）

`todo.md`（未実装タスク一覧）と`issues.md`（既知の課題・実装ログ）を統合し、優先度を付けて一本化したもの。両ファイルは削除済み。

各タスクには実装時の背景・実測結果・既知の限界を併記している。コード側のコメントで`issues.md §N`のように参照している箇所は、本ファイルの対応する見出しに読み替えること。

---

## 優先度の考え方

- **P0（必須・早急）**：セキュリティ上の既知の欠陥。他人のデータが見える・操作できる等
- **P1（優先度高）**：主要な回答精度・ユーザー体験に直結する未解決の課題
- **P2（優先度中）**：機能拡張・運用自動化。今は困っていないが積み残すと手動運用の負担が増える
- **P3（将来対応・優先度未定）**：着手時期未定。10-K対応、観測性、評価指標の拡充など

---

## P0: セキュリティ

### バックエンドAPIのJWT検証 — 完了 2026-11-02

`/api/ask`・`/api/search`・`/api/eval/*`・`/api/history*`・`/api/tickers*`・`/api/ingest*`・`/api/filings*`・`/api/edgar/*` はいずれも認証なしで直接叩けていた。特に質問履歴機能（`question_history`テーブル）は`userId`（Auth0の`user.sub`）をクライアントが自己申告する設計のため、他人の`userId`を指定すれば他人の質問履歴を閲覧・削除できる状態だった。

**対応**：
- Auth0ダッシュボードでAPI（Resource Server）を作成し、Identifier（audience）を発行（ユーザー側の作業）
- `worker/auth.ts`（新規）：`jose`の`createRemoteJWKSet`/`jwtVerify`でAuth0のJWKS経由RS256署名検証を行う`requireAuth`を実装。issuer（`https://{AUTH0_DOMAIN}/`）・audience（`AUTH0_AUDIENCE`）を検証し、成功時はJWTの`sub`を返す
- `worker/index.ts`：`fetch`ハンドラの先頭で`/api/*`すべてに対し`requireAuth`を通し、失敗時は401を返す共通ガードに変更（個別ハンドラごとにバラバラに保護していたのを一本化）。`PUBLIC_API_PATHS`で認証不要パスを明示的に管理する設計にし、将来の追加エンドポイントが保護漏れしにくいようにした
- `/api/ask`・`/api/history*`：クライアント申告の`userId`/`body.userId`を廃止し、検証済みJWTの`sub`を信頼できるユーザーIDとして使うよう変更（なりすまし・他人の履歴アクセスを防止）
- フロントエンド：`Auth0ProviderWithNavigate.tsx`に`audience`/`scope`を追加。`src/lib/api.ts`に`setTokenGetter`（モジュールレベルのトークン取得関数登録）を実装し、`AuthTokenProvider.tsx`（新規、`App.tsx`のルート直下に配置）が`useAuth0().getAccessTokenSilently`をそこに登録。全APIコール（`postJson`/`getJson`）が`Authorization: Bearer <token>`ヘッダーを自動付与するようにした
- Workers Secrets：`AUTH0_DOMAIN`・`AUTH0_AUDIENCE`を追加（`.dev.vars`/`.dev.vars.example`）。SPA側は`VITE_AUTH0_AUDIENCE`・`VITE_AUTH0_SCOPE`を追加（`.env`/`.env.example`）

**動作確認**：dev環境で、認証なしの`curl`リクエストが保護対象の全エンドポイント（`/api/ask`・`/api/search`・`/api/tickers`・`/api/filings`・`/api/history`・`/api/ingest-from-edgar`・`/api/edgar/filings`・`/api/eval/run`）に対し401を返すことを確認。ログイン済みのブラウザからは`/dashboard`での質問応答、`/admin/ticker`でのティッカー一覧取得が引き続き正常に動作することを確認した。

**ハマった点**：実装中、実際のAuth0テナント（既にSPA用のApplicationは設定済みだった）に対して、まだ存在しないプレースホルダーのaudience（`https://secreport-api`）を一時的に設定したところ、ページが白画面のままReactがマウントされない状態になった（コンソールにエラーは出ない）。原因はAuth0Providerの初期化・サイレントトークン取得が、存在しないaudience指定によって想定外の状態に陥ったためと見られる。ユーザーが実際にAuth0ダッシュボードでAPIを作成し、実在するIdentifierを`.env`/`.dev.vars`に設定したところ解消した。**プレースホルダーのaudience値だけ置いて検証するのは避け、実際にAuth0側でAPIを作成してから動作確認すること。**

関連（引き続き未対応）：
- ~~本番ドメインのCallback/Logout/Web Originsの登録~~ → ✅ 完了（2026-11-03）：本番Secrets設定後、本番URL（`https://secreport.ursytsr.workers.dev`）でログインを試みたところ「Callback URL mismatch」エラーが発生したため、Auth0ダッシュボードのApplication SettingsでAllowed Callback URLs/Logout URLs/Web Originsに本番ドメインを追加してもらった（ユーザー側の作業）。設定後、本番環境でログイン・`/api/ask`（AMZNフィルタ自動適用・正しい根拠付き回答）・左メニューの質問履歴表示がいずれも正常動作することを実機確認した。これで本番環境は認証込みで一通り動作する状態になった
- `/admin`のロールベース制御なし（現状ログインしていれば誰でもアクセス可能。JWT検証は入ったが、管理者とそれ以外を区別する仕組みはまだない）
- トークンキャッシュが`cacheLocation: "memory"`のまま（リロードで消える。UX優先なら`localstorage`へ変更を検討、セキュリティとのトレードオフ）
- ~~本番のWorkers Secrets設定~~ → ✅ 完了（2026-11-03）：P2-A（資料の自動取り込み）を本番デプロイした際に`wrangler secret list`で確認したところ、本番環境にはSecretsが一切設定されていないことが判明した。`SEC_EDGAR_USER_AGENT`・`AUTH0_DOMAIN`・`AUTH0_AUDIENCE`の3つを`.dev.vars`の値から本番に設定した（`wrangler secret put`、値は会話に出さずパイプで設定）。`scheduled`ハンドラ（Cronの自動取得）はfetch経由の認証を通らないため`SEC_EDGAR_USER_AGENT`のみで機能するが、`/api/*`の認証には上記のCallback URL登録が別途必要

---

## P1: 回答精度・検索精度

### 企業混入バグの修正（falseRefusalRateの主因の一つと判明）— 完了 2026-11-02

falseRefusalRateの改善に着手する過程で、より根本的な原因を発見した。**質問フォームの「質問の例」をクリックした際、`ticker`フィルタを指定しないまま送信していたため、AMZN向けの質問にMETA・GOOGLのデータが混入し、別企業のチャンクが誤って根拠として採用される**事故が実機で再現した（配当額$0.22の質問で、AMZNではなくMETAの配当データが「根拠」として提示されていた）。

当初の調査では「GOOGLの研究開発費の質問で正解チャンクが9位に埋もれて拒否される」という記録があったが、企業混入バグ修正後に同じ質問を再検証したところ、**正解チャンク（CONSOLIDATED STATEMENTS OF INCOME）が1位で検索され、正しく回答されるようになった**。つまり過去のfalseRefusalRate=0.3という評価結果・以降の再現事例の相当部分は、企業混入によるノイズ（無関係な他社チャンクがRRFスコア計算に混ざり込み、正解チャンクの相対順位を押し下げていた）が原因だった可能性が高い。

**対応**：
- `worker/pipeline/retriever.ts`：`RetrievedChunk`/`RankedRow`に`ticker`・`fiscalYear`・`fiscalQuarter`を追加し、D1クエリ（`vectorSearch`/`keywordSearch`双方のフォールバック元）で取得するようにした
- `worker/pipeline/generator.ts`：`buildContext`で各チャンクの先頭に`[ticker: ... / fiscalYear: ... / fiscalQuarter: ...]`を明記。`SYSTEM_PROMPT`に、質問の対象企業・期間と一致しないチャンクを根拠に使わず、一致するものが無ければ`refused: true`とするルール（2a）を追加（コード側のフィルタ漏れがあっても、LLM側でも企業不一致を検知できる二重の防御）
- `src/components/AnswerArea.tsx`：「質問の例」3問それぞれに対応する`filter`（`ticker: "AMZN"`, `fiscalYear: "2026"`, `fiscalQuarter: "Q2"`）を紐付け、クリック時に質問文だけでなくフィルタも同時に適用するよう変更（`ExampleFilter`型、`onExampleClick`のシグネチャ変更）
- `src/pages/QaPage.tsx`：`submit`に`overrideFilter`引数を追加し、例クリック時はその場で`filter` stateを更新してから送信する設計にした

**動作確認**：
1. AMZN配当額の質問をフィルタなしで実行 → METAのデータが根拠として混入することを確認（修正前の再現）
2. 修正後、同じ質問例をクリック → 左メニューに`AMZN / FY2026 / Q2`が自動設定され、METAデータは混入しなくなった。AMZN自身のQ2データには配当関連の記載が実際に乏しく（Amazonは伝統的に配当を出していない企業）、`dividend`で検索してもスコア0.014〜0.016程度の低い結果しか出ないため、この質問は正しく拒否されるのが妥当な挙動と判断した（検索漏れではなく、データが実質存在しないケース）
3. GOOGLの研究開発費の質問（過去にfalseRefusalRate問題として記録されていたもの）を`ticker: GOOGL, fiscalQuarter: Q3`で再実行 → 正解チャンクが1位で検索され、`$20,640百万`と正しく回答されることを確認

**ゴールデンセット評価での検証（2026-11-02実施）**：企業混入バグ修正後に`/admin/eval`で生成・拒否評価を再実行した。結果：refusalAccuracy=0.875、falseRefusalRate=0.20、missedRefusalRate=0.00（修正前の最終実測値と完全に同一）。これは、ゴールデンセット評価が`q.source.ticker`等を指定して`hybridSearch`を呼んでいる（`worker/eval/generationEval.ts`参照）ため、企業混入バグの影響を元から受けていなかったことを裏付ける結果である。つまり**企業混入バグはUIの「質問の例」機能（フィルタ未指定時）に限定された問題であり、ゴールデンセット評価のスコア自体はこのバグとは無関係**だった。GOOGLの研究開発費の質問が改善したのは、UI上でticker未指定のまま質問していた際に他社データが紛れ込んでいたためで、フィルタを明示していれば（ゴールデンセット評価がそうしているように）元から問題なく動いていたと考えられる。

### falseRefusalRateの改善（残課題、企業混入バグとは別の検索精度の課題）

2026-10-29の生成評価、および2026-11-02の再評価（企業混入バグ修正後）の両方で、`gs-003`（技術/インフラ費用）・`gs-004`（希薄化後EPS）が本来回答可能なのに拒否された（falseRefusalRate=0.20、変化なし）。企業混入バグとは無関係の、純粋な検索側の課題（正解チャンクが上位10件に入らない、または入っていても埋もれる）である。

複数四半期データを投入した後の再評価ではrefusalAccuracy=0.8125→0.875、falseRefusalRate=0.3→0.2まで改善したが（データ量増加による埋め込み空間の近傍関係の変化が寄与したと見られる）、件数が少なく統計的信頼性は低い。

改善策候補：
- 埋め込みモデルの変更・比較検証（現行は`@cf/baai/bge-base-en-v1.5`のみ、比較検証は未実施）
- チャンクサイズ・分割境界の調整（下記「チャンクサイズ比較ツール」参照）
- 根拠選定（citations）の精度改善：セグメント別売上高で複数指標があるのに引用を1件に集約してしまう事例を確認済み

### 回答生成のJSON出力トークン打ち切り対策（対応済み・継続監視）

`answer`の説明文化＋引用マーカー導入後、LLMの出力が長くなり、Workers AIのデフォルト出力トークン上限で`citations`の`quote`途中でJSON出力が打ち切られる不具合が発生（6回中2回の頻度で再現）。`max_tokens: 1024`明示指定と、`quote`を1行30〜60文字程度に絞る指示をプロンプトに追加して対応済み（10回連続成功を確認、本番デプロイ済み）。出力が再び長文化した場合は同じ問題が再発しうるため、プロンプト変更時は注意する。

---

## P2: 運用自動化・機能拡張

8項目を実装順A〜Hで整理する。並び順の考え方：**運用負担の軽減（手動オペレーションからの脱却）を最優先**とし、その中でも依存関係上先に済ませるべきものを手前に置く。検索精度に関わる改善（表構造化・iXBRL・チャンクサイズ比較）は、P1の残課題と地続きのため次点。独立した小さい改善（翻訳キャッシュ・D1化・Secrets整理）は最後でよい。

### A. 資料の自動取り込み（ポーリング）— 完了 2026-11-03

Cloudflare Cron Triggersでの定期実行を実装した。対象ティッカー（`tickers`テーブル）全件について、SEC EDGAR上の最新10-Qの`accession_number`を確認し、`filings`テーブルに未取得であれば取得・索引化する。

**対応**：
- `wrangler.jsonc`：`triggers.crons`に`["0 3 * * *"]`（UTC 03:00＝JST 12:00、1日1回）を追加。**Cronの設定内容はこのファイルがソース**であり、変更時はここを編集して再デプロイする（ユーザーからの要望：「cron設定をソースコード化したい」に対応）
- `worker/pipeline/polling.ts`（新規）：`pollAllTickersForNewFilings`を実装。各ティッカーについて`listFilings`で最新の`accession_number`を取得し、`filings`テーブルに同じ`accession_number`が既にあればスキップ、同一ティッカーに対して`status='running'`の`ingest_jobs`が既にあればスキップ、どちらでもなければ`ingestFromEdgar`を呼ぶ
- `worker/index.ts`：`scheduled`ハンドラを追加し、Cronから`pollAllTickersForNewFilings`を呼ぶ（`ctx.waitUntil`で実行）。手動トリガー・動作確認用に`POST /api/poll`（認証必須）も追加した

**冪等性の設計**（ユーザーからの要望）：
- D1クエリで「最新の`accession_number`が既に`filings`テーブルに存在するか」を`ingestFromEdgar`を呼ぶ前に必ずチェックする。これにより、同じ書類に対してCronが何度発火しても、SEC EDGARへの再fetch・埋め込み生成・Vectorize再upsertという無駄なコストは発生しない（`indexFiling`側もD1は`ON CONFLICT DO UPDATE`で冪等だが、そもそも無駄な外部呼び出し自体を避ける設計にした）
- 同一ティッカーに対して実行中（`running`）のジョブが既にある場合はスキップする。これはCronの実行間隔より`ingestFromEdgar`の処理時間（GOOGLで85レポート取得・パース・埋め込みに数十秒）が長引いた場合の多重実行を防ぐため

**動作確認**：`/api/poll`を手動で複数回呼び出し、以下の3パターンすべてを実機で確認した。
1. 対象ティッカーに未取得の新しい10-Qがある場合 → `ingested`として取得・索引化される
2. 直前にUI（`/admin/ticker`の「取得実行」ボタン）から手動で取得を開始し、まだ処理中（`running`）のティッカーに対して`/api/poll`を呼ぶ → `skipped_running_job`としてスキップされる
3. 手動取得が完了した後に`/api/poll`を再度呼ぶ → `already_up_to_date`として即座にスキップされる（AMZN・GOOGL・METAの3社すべてで確認、2回連続実行でも結果が変わらないことを確認）

**残課題（遡及取得）→ 完了 2026-11-03**：ティッカー追加時のバックフィル範囲について、`/admin/ticker`にWeb UIを追加した。

**対応**：
- `worker/pipeline/ingestJobs.ts`：`ingest_jobs`テーブルにキュー機能を追加。`enqueueIngestJobs`で複数の`accessionNumber`を`status='queued'`として一括INSERTし、先頭のみ即座に`running`に昇格させる。`runIngestJob`は1件完了後（成功・失敗いずれでも）に同一ティッカーの次の`queued`ジョブを`promoteNextQueuedJob`で見つけて`running`に昇格・再帰的に実行する設計とし、別途Cronやポーリングを追加せずに「順次実行（SEC EDGARへの同時アクセス回避）」を実現した
- `enqueueBackfillJobs(env, ticker, fromYear)`：指定年以降の10-Qを`listFilings`で取得し、`isAccessionNumberIngested`（`polling.ts`と共有）で未取得分のみ抽出してキューに積む。対象が0件の場合は`NoNewFilingsToBackfillError`を投げる
- `worker/index.ts`：`POST /api/ingest-jobs/backfill`（認証必須、body: `{ticker, fromYear}`）を追加。`fromYear`は2001年以降の整数年のみ受け付ける
- `src/pages/TickerAdminPage.tsx`：ティッカー一覧の「取得実行」ボタンの横に「遡及取得」ボタンを追加。クリックするとダイアログが開き、西暦年を入力して「キューに追加」すると`POST /api/ingest-jobs/backfill`を呼ぶ。ジョブ一覧のステータス表示に`queued`（待機中）を追加し、`hasRunningJob`判定も`queued`を含むよう修正（バックフィル中は同一ティッカーの「取得実行」「遡及取得」ボタン両方を無効化）

**設計判断**（ユーザーに確認の上決定）：
- バックフィル範囲の指定方法は「何年度以降」（例：2024年以降の全四半期）を採用。日付や四半期単位での細かい指定はUIを複雑にするため見送った
- 複数ジョブの実行方式は「順次実行（1件ずつ）」を採用。並列実行はSEC EDGARへの同時アクセスが増えることと、実装が複雑になることを踏まえて見送った

**動作確認**：devサーバー上で実機確認済み。METAに対して「2024年以降」を指定したところ、未取得の7件（2024〜2026年の10-Q）が`queued`としてキューに積まれ、先頭1件が`running`に昇格した。この間、METAの「取得実行」「遡及取得」ボタンは無効化され、AMZN・GOOGLの同ボタンは操作可能なままだった。約25秒後に1件目が`成功`に遷移し、2件目が自動的に`running`に昇格することを確認した（順次実行ロジックが正常動作）。

### B. Workflows化 — 完了 2026-11-03

EDGAR Fetcher〜索引化の各ステップ（Parser・Chunker・Indexer）は`waitUntil`ベースの同期直列実行だったため、1件のレポート取得が失敗すると、既に取得済みの他レポート分も含めてジョブ全体が最初からやり直しになっていた（実例：GOOGLの約40件あるレポートのうち1件でSEC EDGAR側の一時的な503が続き、ジョブ全体が失敗。本セッション冒頭で調査）。これをCloudflare Workflowsに移行し、各ステップ単位でリトライ・再開できるようにした。

**対応**：
- `wrangler.jsonc`：`workflows`バインディング（`INGEST_FILING_WORKFLOW`、`class_name: IngestFilingWorkflow`）を追加
- `worker/pipeline/ingestWorkflow.ts`（新規）：`IngestFilingWorkflow extends WorkflowEntrypoint`。`resolve-cik`→`list-filings`→`fetch-filing-summary`→（**レポート1件ごとに個別step**`fetch-report-{i}`）→`save-raw-to-r2`→`parse-and-chunk`→`index`→`mark-success`/`mark-failed`→`promote-next-queued`という構成。レポート個別step化が503対策の肝で、1件が失敗してもそのstepだけリトライされ、既に成功した他レポートはやり直しにならない
- `worker/pipeline/secEdgarFetch.ts`：Workflow内から使う`secEdgarFetchWithRetry`（レート制限なし、429/5xx/403のリトライのみ）を追加。既存の`secEdgarFetch`（モジュール変数でレート制限、Workflow外の単発呼び出し向け）はそのまま残した
- `worker/pipeline/ingestJobs.ts`：`runIngestJob`（`ingestFromEdgar`を直接呼ぶ再帰関数）を廃止。`createIngestJob`・`enqueueIngestJobs`は`INGEST_FILING_WORKFLOW.create()`でWorkflowを起動するだけに変更（instance idはjob_idと同一にし、`ingest_jobs.workflow_instance_id`に記録）
- `worker/pipeline/filingsRepo.ts`（新規）：`isAccessionNumberIngested`を`polling.ts`から切り出し。`polling.ts`が`ingestJobs.ts`の`createIngestJob`を呼ぶようにした際の循環import回避のため
- 遡及取得の順次実行ロジック（1件完了したら次のqueuedジョブを実行）は、`IngestFilingWorkflow`内の`promoteNextQueuedJob`に移植。Workflow自身の最後のstepとして、次のqueuedジョブがあれば新しいWorkflow instanceを起動する「自己連鎖」方式を採用（別途Cron等の仕組みを追加せず「1件完了したら次へ」を実現）
- `worker/pipeline/index.ts`・`worker/index.ts`：`ingestFromEdgar`（同期直列実行版）を削除。`/api/ingest-from-edgar`（開発用）・`/api/ingest-jobs`（本来のUI用）はいずれも`createIngestJob`に統一し、202・jobIdを返すだけの非同期トリガーにした
- `worker/pipeline/polling.ts`：Cronポーリングも`ingestFromEdgar`の直接呼び出しから`createIngestJob`（Workflow起動）に変更。`TickerPollResult`の`outcome`を`"ingested"`→`"ingest_started"`に改名（完了ではなく開始を意味することを明確化）

**ハマった点**：
- Cloudflare WorkflowsはFreeプランだと1stepあたりCPU時間10ms固定（Paidプランはデフォルト30秒・最大55秒まで設定可能）。HTMLパース・embedding処理を含む現在の処理量だとFreeプランでは即座に超過する。本プロジェクトはPaidプラン契約済みのため問題なし
- Workflowのstepは休止・再起動でメモリ内状態を保持しない可能性があるため、従来の`secEdgarFetch`のようなモジュール変数によるレート制限はstepをまたぐと信頼できない。レポート個別fetchは`step.sleep`で明示的にstep間の待機を行う設計に変更した（`MIN_REQUEST_INTERVAL_MS`を`secEdgarFetch.ts`からexport）
- `step.sleep`の第2引数（`WorkflowSleepDuration`）は`` `${number} second|minute|hour|day|week|month|year(s)` ``形式の文字列か、ミリ秒単位の`number`のみ受け付ける。`"milliseconds"`という単位はサポートされておらず型エラーになるため、`number`型（ミリ秒）で渡す
- `polling.ts`（`isAccessionNumberIngested`をexport）と`ingestJobs.ts`（それをimportしつつ`createIngestJob`をexport）の間で循環importが発生。`isAccessionNumberIngested`を独立ファイル（`filingsRepo.ts`）に切り出して解消
- devサーバーも`wrangler.jsonc`のD1/Vectorize/R2が`remote: true`のため本番リソースに接続している。新しいマイグレーション（`workflow_instance_id`列追加）を本番（remote）D1に適用し忘れると、Workflow起動時に`D1_ERROR: table ingest_jobs has no column named workflow_instance_id`で即座に失敗する

**動作確認**：devサーバー（Cloudflare Vite plugin、`/cdn-cgi/local/explorer/api/workflows`でWorkflowインスタンスの実行状況を直接確認できる）で実機確認した。
1. AMZNの「取得実行」→Workflowが起動し、58件のレポートを個別stepとして逐次fetch（`fetch-report-0`〜`fetch-report-57`）→`save-raw-to-r2`→`parse-and-chunk`→`index`の順に完走し、`complete`状態・`{filingsWritten:1, chunksWritten:203, accessionNumber:"0001018724-26-000040", reportsFetched:58}`という従来と同一構造の結果を確認
2. GOOGLに「2025年以降」で遡及取得→5件のジョブがキューに積まれ、1件目のWorkflowが完了すると自動的に2件目のWorkflow instanceが起動する連鎖を確認（`promoteNextQueuedJob`→`INGEST_FILING_WORKFLOW.create`）。5件全てが`complete`・エラー0件で完走し、UI上も「成功」表示・取得済みチャンク数が正しく反映されることを確認

**既知の限界**：レポート個別stepへの分割により、503等で1件が失敗してもそのstepのみリトライされ他は保持される、という本来の目的は達成したが、実際にSEC EDGARの503を意図的に再現しての確認はできていない（本セッション時点では常に200が返る状態だったため）。次に同様の503が発生した際、該当stepだけが再試行され、ジョブ全体のやり直しにならないことを実環境のログで確認するのが望ましい。

**Aの次に置いた理由**（実装前の見積り、実装後も妥当だったと判断）：Aで自動取り込みが定期的に走るようになると、取得失敗時（SEC EDGAR側の403・タイムアウト等）の影響が即座に顕在化する。`waitUntil`ベースの暫定実装は失敗時に最初からやり直すしかなかったため、自動運用が常態化する前にWorkflows化して信頼性を上げる効果があった。

### C. 表（財務諸表）の構造化

現在は表を通常のテキストチャンクと同様に扱っている。将来的には専用のチャンク種別・構造化形式（Markdown table等）で扱い、表が複数チャンクに分断されるケース（ヘッダー行の重複付与等）にも対応する。

**運用自動化の次に置く理由**：P1で残った検索精度の課題（`gs-003`/`gs-004`）に直結する可能性が高い改善。財務諸表は表形式の密度が高く、チャンク分割時に数値と見出しが分離されると検索・引用精度が落ちやすい。D・Eより先に着手する価値が大きい。

### D. iXBRLタグパース対応

原本はR2に保持済みのため再取得なしで対応可能。iXBRLタグ（`us-gaap:Revenues`等）から財務数値・単位・対象期間を構造化データとして抽出し、チャンクのメタデータに付与することで引用の正確性・数値の取り違えリスクを下げる。

**Cの次に置く理由**：Cの表構造化が完了すると、どの数値がどの表のどのセルに属するかが明確になり、iXBRLタグとの対応付け（数値↔タグのマッピング）がしやすくなる。Cを経ずに着手すると、構造化のやり直しが発生しやすい。

### E. チャンクサイズ比較ツール

初期版はチャンクサイズを固定長で決め打ちしている。複数のチャンクサイズ・分割方式で索引を作り分け、同じゴールデンセットで評価を再実行・比較できる仕組みを後日実装する（結果は表・グラフで比較しやすい形式に）。

**C・Dの次に置く理由**：C・Dでチャンクの構造自体が変わるため、比較ツールを先に作ってもすぐに前提が崩れる。構造化が一段落してから、残る「サイズ・境界」のチューニングに使うのが効率的。

### F. 翻訳結果のキャッシュ

質問ごとに毎回Workers AIへ翻訳リクエストを送っており、同一質問の再翻訳を避けるキャッシュが未実装。レイテンシ・コスト削減の余地がある。

**独立した小改善**：検索精度・運用自動化のどちらにも依存しない。着手コストが低く、効果も限定的（レイテンシ・コストの微減）なため、大きめの改善（A〜E）より後でよい。

### G. `golden_questions`のD1テーブル化

現状`evals/golden_set.jsonl`をビルド時にバンドルする方式。D1管理に切り替えるかは要検討。

**独立した整理タスク**：評価の運用性を上げるが、機能・精度には影響しない。優先度は低い。

### H. Secrets管理の整理

外部LLM APIキー、Langfuseキー等、将来導入するサービスのシークレットはWorkers Secretsへの登録が未実施（対応するサービスの導入と合わせて行う）。

**最後でよい理由**：対応するサービス（外部LLM・Langfuse等、いずれもP3）の導入が決まってから着手すればよく、単独で先に進める理由がない。

---

## P3: 将来対応（優先度未定）

### 10-K対応

初期版は10-Qのみを対象とする。10-K追加時に必要な変更：

- チャンクメタデータの`form_type`（`10-Q`/`10-K`）/`item`の組み合わせ解釈ロジック（同じItem番号でも書類種別によって意味が異なる）
- HTML/iXBRL Parserへの10-K固有セクション分割ロジック追加（Item 1 事業概要、Item 1A リスク要因、Item 7 MD&A、Item 8 財務諸表など）
- UIの絞り込み条件に書類種別（10-Q/10-K）フィルタを追加
- ゴールデンセットに10-Q/10-K混在パターンの質問（例：四半期数値とその後の年次確定値の比較）を追加するか検討

### 外部LLM（AI Gateway経由）対応

現状Workers AI（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`、`worker/pipeline/models.ts`で一元管理）のみ。AI Gateway経由で複数モデルを切り替えて比較できるようにする。

### 生成品質の評価指標拡充

Eval Runnerは現状、検索指標（Recall@k, MRR）と拒否精度（refusalAccuracy, falseRefusalRate, missedRefusalRate）のみ実装済み。faithfulness・answer relevancy・引用正確性等、LLM-as-judgeによる生成品質の評価は未実装。

検索の正解判定自体も、citation内の数値トークンの一致数による簡易判定（`worker/eval/retrievalEval.ts`の`findMatchRank`）であり厳密ではない。ゴールデンセットの件数も少なく（現在16問、目安30〜50問に対して少ない）統計的信頼性は低い。

### Observability Layer

AI Gateway（コスト・キャッシュ・ログ）、Langfuse（トレース）、Workers Analytics Engine（p50/p95集計）のいずれも未導入。`usage_logs`テーブル（1質問あたりのトークン数・費用・レイテンシ記録）も未実装。

---

## 完了タスクの記録（実装の経緯・実測結果）

着手済み・完了済みのタスクについて、後から参照する価値のある実装判断・実測結果・既知の限界をまとめる。日付は実装時のもの。

### EDGAR Fetcher本体（オンライン取得の確立）— 完了 2026-10-30

当初の想定（`https://d18rn0p25nwr6d.cloudfront.net/...`形式）は誤りで、実際にはSEC EDGARが各提出書類ごとに`FilingSummary.xml`（レポート一覧）＋`R1.htm`〜`RN.htm`（個別レポート）という形で生ファイルを配布していることが判明した。これまでのサンプルHTML（`data/example_forms/amzn-10q-202607.html`）は、ブラウザのXBRL Viewerがこれらを結合表示したものだった。

**SEC EDGAR側の実際のURL構造**：
- 提出一覧：`https://data.sec.gov/submissions/CIK{10桁ゼロ埋めCIK}.json`（Submissions API）
- レポート索引：`https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_no_dash}/FilingSummary.xml`
- 個別レポート：`https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_no_dash}/{HtmlFileName}`
- 正式なForm 10-Q本文（Item 1〜4の文章構成）は`primaryDocument`という別ファイルで、今回のスコープでは対象外のまま（10-K対応と合わせて将来検討）

個別レポートファイルはSGMLの`<DOCUMENT><TYPE>XML<SEQUENCE>...<TEXT>（実際のHTML）</TEXT></DOCUMENT>`で包まれており、パース前に`<TEXT>`〜`</TEXT>`の中身を取り出す前処理が必要だった（`worker/pipeline/parser.ts`の`extractTextSection`）。`FilingSummary.xml`の`<ShortName>`が、従来サンプルHTMLから抽出していたタイトル文字列と完全一致したため、`item`フィールドはこの`ShortName`をそのまま使う設計にした。

レート制限は`worker/pipeline/fetcher.ts`で最小120ms間隔（約8.3 req/sec、SEC上限10 req/secに安全マージン）、429/5xx発生時は指数バックオフで最大3回リトライ。1件の10-Q取得で約60リクエスト発生するため取得全体で約7秒以上かかる。

実装：`worker/pipeline/fetcher.ts`（EDGAR Fetcher本体）、`FILINGS_BUCKET`（R2、原本保存）、`/api/ingest-from-edgar`・`/api/edgar/filings`・`/api/filings/delete`。

動作確認：Amazon Q2 2026（`accession_number: 0001018724-26-000026`）を実際にオンライン取得し、59レポート→205チャンクという、ローカルサンプルと同一の結果を確認。`filing_url`も実際のSEC EDGAR URLが正しく格納されるようになった（旧`"PLACEHOLDER"`課題を解消）。ローカルサンプル経由の重複データ削除後、検索評価はRecall@10=0.8・MRR=0.8に改善（重複除去前はMRR=0.7）。

### Amazonの他四半期での実行（複数四半期の共存検証）— 完了 2026-10-30

Amazon Q3 2026（`accession_number: 0001018724-26-000040`、58レポート→203チャンク）を追加取得し、Q2と同一のD1/Vectorizeインデックスに共存させて検証した。

- `fiscalQuarter`メタデータフィルタの実地検証：同一の曖昧な質問文（「売上高はいくらですか？」）に対し、`filter.fiscalQuarter`を`"Q2"`/`"Q3"`で切り替えると、それぞれ正しい四半期のチャンクが上位に来て回答も正しく切り替わることを確認
- ゴールデンセット評価（`findMatchRank`の`accession_number`一致チェックにより）Q3データ混入はQ2向け評価に悪影響なし（Recall@10=0.8・MRR=0.8のまま）
- 生成・拒否評価はむしろ改善：refusalAccuracy=0.8125→0.875、falseRefusalRate=0.3→0.2（データ量増加による埋め込み空間の近傍関係の変化が寄与したと見られるが、件数が少なく統計的信頼性は低い）
- フィルタなしで四半期を明示しない質問をした場合、質問文中の期間情報がベクトル検索・翻訳に反映され概ね正しい四半期が選ばれたが、「3ヶ月（単体）」と「累計（9ヶ月）」が両方チャンクに含まれる場合にどちらを選ぶかは質問文の精度に依存する（累計を誤って選んだケースが1件あった）
- ゴールデンセットへのQ3設問追加は、ユーザー判断により見送り

### 他銘柄（GOOGL/Alphabet Inc.）での実行検証 — 完了 2026-10-30

GOOGL（CIK: 0001652044）の2026年Q3 10-Q（`accession_number: 0001652044-26-000084`、85レポート→349チャンク）をオンライン取得し、Parser・Hybrid Retriever・Answer Generatorの汎用性を検証した。

- **Parserの汎用性確認**：GOOGLのレポート見出しはAmazonと命名規則が異なる（全て大文字表記、単独セクション名等）が、`ShortName`をそのまま`item`として使う現行実装はそのまま動作し、企業ごとの改修は不要だった
- `ticker`メタデータフィルタの実地検証：AMZN/GOOGLを切り替えて同じ質問文を投げ、それぞれ正しい企業のデータのみが返ることを確認
- 既知のfalseRefusalRate問題がGOOGLでも再現（研究開発費の質問で正解チャンクが9位に入っていたのに拒否判定、上記P1参照）。GOOGL固有の新しい不具合ではなく、Amazon・GOOGL共通の課題
- `/api/filings`（投入済み書類一覧API）を新規実装し、`FilterPanel.tsx`の企業・年度・四半期の選択肢と「収録データ」表示をハードコードから動的生成に変更。実機でGOOGL選択時に正しくAlphabetのデータ（Q3売上高$127,577）で回答されることを確認

### ティッカー管理機能とルーティング変更（/admin/eval, /admin/ticker）— 完了 2026-10-30

`/admin`を`/admin/eval`（評価結果）・`/admin/ticker`（ティッカー管理）の2ページ構成に変更。

- D1に`tickers`テーブル（`worker/db/migrations/0003_tickers.sql`）を新設。ティッカー追加時はSEC EDGARの`company_tickers.json`（約780KB、10,430社）からCIK・企業名を自動解決
- 新規API：`GET /api/tickers`、`POST /api/tickers/add`（重複は409、未知のティッカーは404）、`POST /api/tickers/delete`
- フロント：`AdminLayout.tsx`（サブナビゲーション）、`TickerAdminPage.tsx`（追加フォーム・一覧テーブル）

動作確認：MSFTの追加（CIK `0000789019`自動解決）、削除、重複追加時のエラー表示を確認。

### company_tickers.json取得の403エラー対応 — 完了 2026-10-30

ティッカー追加時に`company_tickers.json`取得で403エラーが断続的に発生（リトライのみでは解消せず）。原因はCloudflare Workers側IPに対する一時的なボット対策と推定。

最終対応としてR2（`FILINGS_BUCKET`、キー`_cache/company_tickers.json`）に24時間TTLでキャッシュする方式を導入し、SEC EDGARへの再取得自体を減らした。キャッシュ有効期限切れ時に取得が失敗した場合は古いキャッシュにフォールバックする。動作確認：1回目の取得（約1.95秒）でキャッシュ作成、2回目以降（約0.755秒）はキャッシュから高速応答。

### ingest状況の可視化・取得トリガーUI（暫定実装）— 完了 2026-10-30

`/admin/ticker`に「取得済みデータ」セクションを追加し、`/api/filings`をティッカーごとにグルーピングして会計年度・四半期・チャンク数・accession numberを一覧表示。

さらに、各ティッカー行に「取得実行」ボタンを追加（最新の10-Qを取得）。`ingestFromEdgar`はレポート数が多い書類（GOOGLで85件等）だと数十秒かかりタイムアウトの懸念があるため、D1に`ingest_jobs`テーブル（`worker/db/migrations/0004_ingest_jobs.sql`）を新設し、`POST /api/ingest-jobs`が`ctx.waitUntil`でバックグラウンド実行・即202返却、`GET /api/ingest-jobs`でジョブ一覧をポーリングする方式にした。METAで実機確認（85レポート相当、22秒で成功）。

あくまでCron/Workflows等の本格的な非同期基盤を入れるまでの暫定実装で、取得対象は常に最新の10-Qのみ（過去四半期の指定UIはスコープ外、`accessionNumber`指定はAPIレベルでは可能）。

### SEC原本URLリンクの有効化 — 完了 2026-11-01

`worker/pipeline/retriever.ts`の`hybridSearch`（`vectorSearch`/`keywordSearch`両方）で`filings`テーブルをJOINし`filingUrl`を取得、`/api/ask`のレスポンス（`retrieved`）に含めるようにした。`AnswerArea.tsx`の「SEC原本」リンクをグレーアウトの`<span>`から実際の`<a href target="_blank">`に変更し、クリックでSEC EDGAR原本（書類全体、チャンク単位ではない）が新規タブで開くことを確認した。

### 回答生成の「抜粋提示」から「説明文＋クリック可能な引用マーカー」への変更 — 完了 2026-11-01

従来の`generateAnswer`は一文程度の`answer`のみを生成し、根拠（`citations`）は回答文と独立したリストとしてのみ表示していた。ユーザーの要望により「質問への回答＋補足説明＋引用箇所の明示（クリックで参照）」という完全な回答形式に変更した。

- `generator.ts`の`SYSTEM_PROMPT`変更：`answer`は1〜3文の説明文とし、根拠箇所の直後に`[#1][#2]...`形式の引用マーカーを埋め込ませる（`#N`はcitations配列のN番目、1-indexed）
- `AnswerArea.tsx`：`answer`文字列を正規表現`/\[#(\d+)\]/g`でパースし、マーカーを根拠リストの該当項目へスクロールするクリック可能なバッジに変換（`renderAnswerWithCitationMarkers`）

動作確認：単一引用・複数引用（`[#1]`と`[#2]`が異なる文に対応）どちらもクリックで正しい根拠へジャンプすることを確認。既知の限界はP1「falseRefusalRateの改善」の根拠選定精度の項目を参照。

### 過去の質問履歴（左メニュー表示＋専用ページ）— 完了 2026-11-01

D1に`question_history`テーブル（`worker/db/migrations/0005_question_history.sql`）を新設。`/api/ask`に`userId`（Auth0の`user.sub`）を渡すと、`ctx.waitUntil`で質問・フィルタ・回答全体（JSON）を非同期保存する。`GET /api/history`（一覧・`?id=`で単体）・`POST /api/history/delete`を追加。

左メニュー（`QuestionHistoryPanel.tsx`）に直近5件を表示し、「>> すべてを見る」で`/history`専用ページ（`HistoryPage.tsx`、全件・削除可能）に遷移する。履歴項目クリックで`/dashboard?historyId=...`に遷移し、`QaPage`がLLMを再度呼ばずに保存済みの回答をそのまま復元表示する。

セキュリティ上の既知の制約（`userId`自己申告・JWT未検証）はP0参照。

### CSS `-webkit-line-clamp` が `padding` のある要素では機能しないChromeの既知バグ

過去の質問履歴の左メニュー表示で、2行クランプの3行目が中途半端に見切れる不具合が発生。調査の結果、Chromeで**`display: -webkit-box; -webkit-line-clamp: 2`を指定した要素に`padding`も指定すると、クランプの高さ計算が壊れる**（`getComputedStyle().display`が`flow-root`として計算され、クランプの基準点がズレる）という挙動を最小再現コードで特定した。クラス指定かインラインか、CJK文字か英数字かは無関係で、`padding`の有無だけが再現条件だった。

対応：`padding`とline-clampを同じ要素に持たせず2階層に分離（外側の`<Link>`がpadding・ホバー背景、内側の`<span>`がline-clamp）。今後他画面でline-clampを使う場合もこの制約に注意する。

また、ブラウザ標準の`title`属性はホバーから表示までに固定遅延（Chromeで概ね0.5〜1.5秒）がありCSS/JSから調整できないため、React state方式のカスタムツールチップに置き換えた。

---

## 既知の技術的な落とし穴（実装時に踏んだもの、今後も注意）

- **Vectorizeのメタデータフィルタは事前のインデックス作成が必要**：`wrangler vectorize create-metadata-index`を作成していないフィールドをフィルタに使うと、エラーにならず静かに0件を返す。新しいメタデータフィールドをフィルタ条件に追加する際は必ずインデックスも作成すること（作成直後は反映に数十秒かかる）
- **D1 FTS5のMATCHクエリは日本語の分かち書きに非対応**：空白区切りの単純な分割では日本語クエリが1トークン化され常に0件になる。bigram分割は精度が悪化したため、最終的に検索前に質問を英語へ翻訳する方式（`worker/pipeline/translator.ts`）で解決した（Recall@10 0.7→0.8、MRR 0.543→0.675〜0.725に改善）
- **翻訳モデルが質問に「回答」してしまうハルシネーション**：翻訳指示が曖昧だと、モデルが質問への回答だと誤認し架空の数値を含む平叙文を返すことがある。翻訳対象を`<text>`タグで明示し「これは翻訳対象であり回答すべき質問ではない」と繰り返し指示することで解決
- **RRF統合スコアは回答可能/不可能の分離に使えない**：コード側のスコア閾値による拒否判定は採用せず、検索結果0件の場合のみの最小限のガードとし、拒否判定はLLMの自己判断に委ねる設計にした
- **生成モデルのコンテキストウィンドウ超過**：`@cf/meta/llama-3.3-70b-instruct-fp8-fast`のコンテキスト上限24,000トークンに対し、topK=10件をそのまま渡すと超過するケースがある。`GENERATION_MODEL_MAX_CONTEXT_CHARS`（40,000文字）でチャンクの合計文字数に上限を設けて対応
- **Workers AIの`response_format: json_object`のレスポンス形式がモデル・タイミングにより異なる**：`response`フィールドが文字列（要`JSON.parse`）の場合とパース済みオブジェクトの場合の両方があるため、`extractJsonResponse`で両対応する必要がある

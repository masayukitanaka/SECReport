# 既知の課題・将来対応事項

`architect.md` の設計過程で、初期版のスコープ外とした、または簡略化した事項を記録する。優先度は決めていないため、着手時に再評価する。

## 1. 10-K 対応

初期版は 10-Q のみを対象とする。10-K を追加する際に必要な変更：

- チャンクのメタデータにある `form_type`（`10-Q`/`10-K`）/`item` の組み合わせ解釈ロジックの実装（`architect.md` §0.1 参照。同じ Item 番号でも書類種別によって意味が異なる）
- HTML/iXBRL Parser に 10-K 固有のセクション分割ロジックを追加（Item 1 事業概要、Item 1A リスク要因、Item 7 MD&A、Item 8 財務諸表 など）
- UI の絞り込み条件に書類種別（10-Q/10-K）フィルタを追加
- ゴールデンセットに、10-Q と 10-K が混在する質問パターン（例：四半期の数値とその後の年次確定値の比較）を追加するかどうかの検討

## 2. チャンクサイズ比較用の評価ツール

初期版はチャンクサイズを固定長で決め打ちする。チャンクサイズ・分割方式の違いが検索結果（Recall@k, MRR 等）にどう影響するかを、ゴールデンセットに対して簡単に再実行・比較できるツールを後日実装する。

- 複数のチャンクサイズ・分割方式でインデックスを作り分け、同じゴールデンセットで評価を回せる仕組み
- 結果を比較しやすい形式（表・グラフ）で出力

## 3. 表（財務諸表）の構造化

初期版は表（財務諸表等）を通常のテキストチャンクと同様に扱い、専用の構造化は行わない。将来的な改善点：

- 表をテキストチャンクとは別のチャンク種別として扱う
- 表の行・列構造を保持した形式（Markdown table、構造化 JSON 等）での格納
- 表が複数チャンクに分断されるケースの扱い（ヘッダー行の重複付与など）

## 4. iXBRL タグパース対応

初期版は HTML/iXBRL 原本をテキストベースで解析し、iXBRL タグ（`us-gaap:Revenues` 等）は解釈しない。EDGAR Fetcher が取得した原本は R2 にそのまま保持しているため、再取得なしで以下を後日追加できる：

- iXBRL タグから財務数値・単位・コンテキスト（対象期間）を構造化データとして抽出
- チャンクのメタデータに構造化された数値情報を付与し、引用の正確性・数値の取り違えリスクを下げる

## 5. サンプル書類が R-reports ビューア形式であることによる制約

`data/example_forms/amzn-10q-202607.html` は SEC EDGAR の R-reports ビューア出力（XBRL タグに基づく財務諸表・注記のテーブル集合、`id="ReportN"` 単位）であり、Item 1A（リスク要因）・Item 2（MD&A）等の通常の 10-Q 本文（文章セクション）を含まない。初期版の HTML/iXBRL Parser（`worker/pipeline/parser.ts`）はこのビューア形式専用の実装になっている。

- EDGAR Fetcher が正式な Form 10-Q 本文（`https://www.sec.gov/Archives/edgar/data/.../xxx.htm` 形式）を取得するようになった際、Parser はテーブル抽出ロジックに加えて、Item 見出し（`Item 1.`, `Item 1A.` 等）に基づく文章セクション分割ロジックを追加する必要がある
- 現在の `item` フィールドは各レポートの見出し文字列（例: "Segment Information (Tables)"）であり、architect.md で想定していた「Part I Item 2」のような正式な 10-Q Item 番号ではない。正式な本文取得後、両方の `item` 形式が混在する可能性があるため、スキーマまたは別フィールドでの区別を検討する

## 6. Vectorize のメタデータフィルタには事前のインデックス作成が必要

Vectorize の `query()` に `filter`（`ticker`/`formType`/`fiscalYear`/`fiscalQuarter` 等）を渡しても、対象フィールドに対して `wrangler vectorize create-metadata-index` でメタデータインデックスを作成していないと、該当フィルタは静かに 0 件を返す（エラーにならない）。実装時にこれを踏み、Eval Runner の初回実行で原因不明の 0 件ヒットが発生した。

- 新しいメタデータフィールドを Hybrid Retriever のフィルタ条件に追加する際は、必ず対応するメタデータインデックスも作成する運用を徹底する（本番投入の wrangler セットアップ手順に明記する）
- メタデータインデックスの作成はキュー経由で非同期反映されるため、作成直後はフィルタが効かない時間帯がある（実測で数十秒程度）

## 7. ハイブリッド検索の精度に関する既知の限界（ゴールデンセット評価結果より）

チャンク化・索引化・Hybrid Retriever（RRF統合）・Eval Runner の最小構成を実装し、ゴールデンセット（評価対象10問、citation 付き）に対して Recall@10 = 0.7、MRR = 0.543 という結果が出た（2026-10-29 実施、run_id は `eval_runs` テーブル参照）。

- `gs-004`（希薄化後EPS）が上位10件に入らなかった：EPS の数値（例: $5.75）を含むチャンクが、関連語彙（"earnings per share" 等）を含む他のチャンク（加重平均株式数の注記等）より検索スコアが低くなった。チャンクサイズ・分割境界の見直し、またはクエリ側の表記揺れ対応（EPS ⇔ earnings per share の言い換え）で改善する可能性がある
- `gs-010`/`gs-011`（期間をまたぐ比較の質問）が共にヒットしなかった：複数四半期・複数年度の数値を含む質問文に対して、ハイブリッド検索が単純な事実確認の質問より精度が低い傾向が見られた → **§8 の翻訳導入後に解消**（両問とも1位でヒットするようになった）。原因は検索精度ではなく、§8 に記載の日英ミスマッチだった可能性が高い
- 現在の正解判定ロジック（`worker/eval/retrievalEval.ts` の `findMatchRank`）は citation 内の数値トークンの一致数で簡易判定しており、厳密な評価ではない。ゴールデンセットの件数が少ないため統計的な信頼性も低い（README.md の既知の制約を参照）

## 8. 質問（日本語）とチャンク本体（英語）の言語ミスマッチ、および対応時に踏んだ不具合

ゴールデンセットの質問文は日本語だが、チャンク本体は SEC 10-Q の英語原文であるため、Embedding・FTS5 キーワード検索の双方で言語ミスマッチが生じていた。これに対応する過程で2つの不具合を経験した。

**不具合1：D1 FTS5 の MATCH クエリが日本語で機能しない**
`sanitizeFtsQuery`（`worker/pipeline/retriever.ts`）が質問文を空白で単語分割していたが、日本語には分かち書き（単語間の空白）が無いため、CJK文字列全体が1つの巨大なトークンになり、FTS5 の `MATCH` が常に0件を返していた。さらに悪いことに、Vectorize のメタデータフィルタ未設定（§6）と症状が似ており（どちらも「フィルタを付けると0件になる」）、原因の切り分けに時間がかかった。

一時対応として CJK文字列を2文字の重複 bigram に分割する方式を試したが、これは FTS5 の0件エラー自体は解消したものの、意味のない bigram トークンが大量にノイズとして混入し、RRF 統合全体の精度を悪化させた（検索評価の Recall@10 は変わらなかったが、特定の質問で正解チャンクが上位から脱落するようになった）。最終的に §8 の翻訳方式に切り替えて解決。

**不具合2：翻訳モデルが質問に「回答」してしまうハルシネーション**
質問を英語に翻訳する際、システムプロンプトで単に "Translate the user's message to English" と指示したところ、モデルがこれを「ユーザーの質問に答えよ」という指示と誤認し、質問文（例：「Amazonの売上高はいくらですか」）を疑問文としてではなく、架空の回答を含む平叙文（例："Amazon's net sales were 121.23 billion dollars"、実際の値は $200,606M で全く異なる）として出力した。この架空の数値で埋め込み・キーワード検索を行うため、的外れな検索結果になっていた。

対処：翻訳対象のテキストを `<text>` タグで明示的に囲み、システムプロンプトで「これは翻訳対象であり、回答すべき質問ではない」「事実を作り出すな」と繰り返し明示することで解決（`worker/pipeline/translator.ts`）。

**効果**：翻訳導入により Recall@10 = 0.7 → 0.8、MRR = 0.543 → 0.675〜0.725 に改善。日本語クエリを英語文書に投げる構成では、翻訳ステップは精度に対して非常に効果が大きいことが実測で分かった。

- 翻訳は質問ごとに Workers AI を1回追加呼び出しするため、レイテンシ・コストが増える。翻訳結果のキャッシュ（同一質問の再翻訳を避ける）は未実装
- 将来 10-K・10-Q 以外の言語（日本企業の有報等）を扱う場合、チャンク側の言語が変わるため、翻訳方向も再検討が必要

## 9. 拒否判定の設計変更とコンテキストウィンドウ超過への対応

`architect.md` 旧版では「コード側で検索スコアの閾値チェックを行い、LLM任せにしない」という拒否判定方針を想定していたが、実測で RRF 統合スコアが「回答可能」と「回答不能」の質問で明確に分離しないことが分かった（例：回答不能な質問のスコアが、回答可能な質問のスコアより高くなるケースがあった）。これは RRF が「順位に基づいて必ず上位何件かを返す」設計であり、スコア自体に「検索結果がどれも的外れだ」という情報が載らないためである。

この実測に基づき、拒否判定は LLM の自己判断を主体とし、コード側のガードは検索結果が0件の場合のみに縮小した（`worker/pipeline/generator.ts`）。

実装・評価の過程で以下の技術的な問題も発生した：

- **コンテキストウィンドウ超過**：`@cf/meta/llama-3.3-70b-instruct-fp8-fast` のコンテキスト上限は24,000トークンだが、topK=10件のチャンク（R-reportsビューア形式のテーブル羅列で情報密度が高い）をそのまま渡すと、入力+出力の推定トークン数がこれを超えるケースがあった（エラー: `AiError: 5021`）。対処として、Answer Generator 内でプロンプトに積むチャンクの合計文字数に上限（40,000文字）を設け、スコア上位から順に収まるだけのチャンクを採用する方式にした（`buildContext` 関数）。この上限値は経験的な初期値であり、チューニングの余地がある
- **Workers AI の `response_format: json_object` のレスポンス形式がモデル・タイミングにより異なる**：`response` フィールドが文字列（`JSON.parse` が必要）の場合とパース済みオブジェクトの場合の両方があり、最初の実装では文字列のみを想定していたため「生成結果を取得できませんでした」という誤った拒否が発生した。両方のケースに対応する `extractJsonResponse` で解決

最終的な生成評価（2026-10-29実施、翻訳・コンテキスト上限対応後）：refusalAccuracy = 0.8125、missedRefusalRate = 0（拒否すべき質問は全問正解）、falseRefusalRate = 0.3（詳細は §10）。

## 10. 回答すべき質問の一部を誤って拒否する問題（falseRefusalRate = 0.3）

§9 の最終評価で、`gs-002`（純利益）・`gs-003`（技術/インフラ費用）・`gs-004`（希薄化後EPS）の3問が、本来回答可能なはずなのに拒否された。これらはいずれも §7 で記録した「検索精度が相対的に低い」質問と重なっており、根本原因は生成側ではなく検索側（正解チャンクが上位10件に入らない、または入っていても他の無関係なチャンクに埋もれる）にあると見られる。

- 翻訳導入後も完全には解消していないため、埋め込みモデルの変更やチャンク境界の調整（issues.md §2参照）など、検索精度そのものの改善が必要
- 曖昧な質問（`gs-012`, `gs-013`）は、当初（翻訳・コンテキスト対応前の実測）単一の数値を断定的に回答してしまう失敗が見られたが、最終的な評価では正しく拒否できている。プロンプト（`worker/pipeline/generator.ts` の `SYSTEM_PROMPT` ルール5）が有効に機能しているか、今後の継続的な監視が必要（ゴールデンセットの曖昧な質問パターンを増やして再評価する）

## 11. Auth0 認証の未対応範囲

フロントエンド（`src/`）に `@auth0/auth0-react` を導入し、ランディングページ（`/`）・ログイン必須の質問応答画面（`/dashboard`）・評価結果画面（`/admin`）という構成でログインフロー（`loginWithRedirect`/`logout`、`ProtectedRoute`、`onRedirectCallback` によるログイン後の `/dashboard` 遷移）を実装した。以下は未対応：

- **バックエンド（Cloudflare Workers）側のAPI保護**：`/api/ask`・`/api/search`・`/api/eval/*` はJWT検証を行っておらず、フロントの認証状態に関わらず誰でも直接叩ける。ユーザーの判断で今回のスコープ外とした。保護する場合は Auth0 側でAPI（Audience）を作成し、Workers側に `jose` 等でJWT検証ミドルウェアを追加する必要がある
- **実際のAuth0テナント設定値が未入力**：`.env`の`VITE_AUTH0_DOMAIN`/`VITE_AUTH0_CLIENT_ID`はプレースホルダー（`your-tenant.auth0.com`/`your-client-id`）のまま。実際にログインを完了させるには、Auth0ダッシュボードでSPAアプリケーションを作成し、Allowed Callback URLs/Logout URLs/Web Originsに動作環境のURL（本番ドメイン、および開発用の`http://localhost:*`）を登録した上で、`.env`に実際の値を設定する必要がある
- **`/admin`のロールベース制御なし**：現状は「ログインしていれば誰でも`/admin`にアクセス可能」で、管理者ロールによる絞り込みは行っていない。開発者向け機能として運用上の配慮が必要なら、Auth0のロール/パーミッション機能と連携したアクセス制御を追加する
- **トークンキャッシュの保存先**：`Auth0Provider`のデフォルト（`cacheLocation: "memory"`、ページリロードでトークンが消える）のまま。UXを優先する場合は`cacheLocation: "localstorage"`への変更を検討する（セキュリティとのトレードオフ）

## 12. サンプルHTMLの正体（EDGAR Fetcher実装時の発見）とオンライン取得方式

`docs_jp/todo.md` フェーズ1（EDGAR Fetcher実装）に着手する際、`data/example_forms/amzn-10q-202607.html`（これまで索引化のローカルサンプルとして使っていたもの）が、SEC EDGARが実際に配布する生ファイルとは異なることが判明した。

**判明した事実**：SEC EDGARの各提出書類（`accession_number`）には、`FilingSummary.xml`という索引ファイルがあり、そこに財務諸表・注記のテーブルごとに個別の`R1.htm`, `R2.htm`, ... （Amazonの2026年Q2 10-Qでは59件）というファイルが列挙されている。これはブラウザ上のXBRL Viewerが、これら59個の個別ファイルをAjaxで取得して1画面に結合表示する仕組みであり、`amzn-10q-202607.html`はその結合表示をブラウザで保存したもの（`id="Report1"`〜`id="Report59"`のコンテナで各`RN.htm`の中身を包んでいる）だったと分かった。

**SEC EDGAR側の実際のURL構造**：
- 提出一覧：`https://data.sec.gov/submissions/CIK{10桁ゼロ埋めCIK}.json`（Submissions API）
- レポート索引：`https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_no_dash}/FilingSummary.xml`
- 個別レポート：`https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_no_dash}/{HtmlFileName}`（`FilingSummary.xml`内の`<Report>`要素が`<HtmlFileName>`と`<ShortName>`を持つ）
- 正式なForm 10-Q本文（Item 1〜4の文章構成）は`primaryDocument`（例：`amzn-20260630.htm`）という別ファイルで、今回のスコープでは対象外のまま（`todo.md` B参照）

**`RN.htm`のラッパー形式**：個別レポートファイルはSGMLの`<DOCUMENT><TYPE>XML<SEQUENCE>...<TEXT>（実際のHTML）</TEXT></DOCUMENT>`で包まれている。パース前に`<TEXT>`〜`</TEXT>`の中身を取り出す前処理が必要（`worker/pipeline/parser.ts` の `extractTextSection`）。

**`ShortName`と`item`フィールドの対応**：`FilingSummary.xml`の各`<Report>`要素の`<ShortName>`が、これまでサンプルHTMLから`<table class="report">`内の`<th class="tl">`見出しとして抽出していたタイトル文字列（例："Segment Information (Tables)"）と完全に一致する。そのため`parseFilingFromReports`では`<th class="tl">`からのタイトル抽出を行わず、`FilingSummary.xml`由来の`ShortName`をそのまま`item`として使う設計にした（抽出ロジックの二重化を避けるため）。

**レート制限・リトライの実装**：`worker/pipeline/fetcher.ts`で、リクエスト間に最小120ms間隔（約8.3 req/sec、10 req/sec制限より安全側）を設け、429/5xx発生時は指数バックオフで最大3回リトライする方式にした。1件の10-Q取得で約60リクエスト（Submissions API 1回 + FilingSummary.xml 1回 + RN.htm 59回）発生するため、取得全体で約7秒以上かかる。

**動作確認**：2026-10-30、Amazonの2026年Q2 10-Q（`accession_number: 0001018724-26-000026`）を実際にオンライン取得し、59レポート→205チャンクという、ローカルサンプルと全く同じ結果が得られることを確認した。`filing_url`も実際のSEC EDGAR URLが正しく格納され、これまで`"PLACEHOLDER"`だった課題（README §既知の制約参照）が解消された。

**重複データのクリーンアップ**：オンライン取得後、以前`/api/ingest`で手動投入していたローカルサンプル分（`accession_number: "amzn-10q-202607"`、人間が指定した識別子）と、今回のオンライン取得分（`accession_number: "0001018724-26-000026"`、実際のSEC値）が同じ内容のまま2系統重複して索引化されていた。削除用に `deleteFiling`（`worker/pipeline/indexer.ts`）と `/api/filings/delete` を実装し、古い方を削除した。Vectorizeの `deleteByIds` には1リクエストあたり100件の上限があるため、バッチ分割が必要だった（`VECTORIZE_DELETE_BATCH_SIZE`）。削除後、検索評価は Recall@10=0.8・MRR=0.8 に（重複除去前は MRR=0.7）改善した。ゴールデンセット（`evals/golden_set.jsonl`）の `accession_number`/`filing_url` も実際の値に一括更新済み。

## 13. 複数四半期の共存検証（フェーズ2）

docs_jp/todo.md フェーズ2で、Amazon Q2 2026（既存）に加えて Q3 2026（`accession_number: 0001018724-26-000040`、58レポート→203チャンク）をオンライン取得し、同一のD1/Vectorizeインデックスに複数四半期を共存させて検証した。

- **`fiscalQuarter`メタデータフィルタの実地検証**：同一の曖昧な質問文（「売上高はいくらですか？」、対象四半期を明示しない）に対し、`filter.fiscalQuarter`を`"Q2"`/`"Q3"`で切り替えると、それぞれ正しい四半期のチャンクが検索結果の上位に来て、回答も正しく切り替わることを確認した。曖昧な質問文でもフィルタが優先されるため、「年度・企業の絞り込み」機能（概要書 §3）の実装は機能していると言える
- **ゴールデンセット評価への影響なし**：ゴールデンセットは全問Q2対象だが、`findMatchRank`（`worker/eval/retrievalEval.ts`）が `accession_number` の一致チェックを行っているため、Q3データが混入してもQ2向けの評価結果（Recall@10=0.8・MRR=0.8）に悪影響はなかった
- **複数四半期共存でむしろ精度が改善**：生成・拒否評価は refusalAccuracy=0.8125→0.875、falseRefusalRate=0.3→0.2 に改善した。データ量が増えたことで埋め込み空間上の近傍関係が変化し、以前検索漏れしていた設問（純利益・技術インフラ費用等）の一部が拾えるようになったと見られる。ただし件数が少なく（評価対象10〜16問）統計的な信頼性は低いため、確定的な傾向とは言えない
- **フィルタなしで曖昧な四半期質問をした場合の挙動**：四半期を明示しない質問（「Q3の売上高はいくらですか」のように質問文自体には四半期が含まれるがAPIフィルタは指定しない場合）でも、質問文中の期間情報がベクトル検索・翻訳に反映されるため、概ね正しい四半期のチャンクが上位に来た。ただし「3ヶ月（単体）」と「累計（9ヶ月）」の数値が両方チャンクに含まれる場合、生成モデルがどちらを選ぶかは質問文の精度に依存する（今回の検証で、Q3単体ではなく累計の数値を誤って選んだケースが1件あった）

## 14. 他銘柄（GOOGL/Alphabet Inc.）での実行検証（フェーズ3）

docs_jp/todo.md フェーズ3で、Amazon以外の銘柄としてGOOGL（Alphabet Inc.、CIK: 0001652044）の2026年Q3 10-Q（`accession_number: 0001652044-26-000084`、85レポート→349チャンク）をオンライン取得し、Parser・Hybrid Retriever・Answer Generatorの汎用性を検証した。

- **Parserの汎用性確認**：GOOGLのレポート見出し（`FilingSummary.xml`の`ShortName`）は、Amazon（例: "Segment Information (Tables)"、通常の大文字小文字混在）とは命名規則が異なり、"CONSOLIDATED STATEMENTS OF INCOME"（全て大文字）のような表記や、"Revenues"のような単独の単語セクションが存在した。現行の`parseFilingFromReports`（`worker/pipeline/parser.ts`）は`ShortName`をそのまま`item`として使うだけなので、企業ごとの改修なしに正しく動作した
- **`ticker`メタデータフィルタの実地検証**：同一の質問パターンに対し、`filter.ticker`を`"AMZN"`/`"GOOGL"`で切り替えると、正しくそれぞれの企業のデータのみが検索・回答されることを確認。異なる企業のデータが混同されるような誤動作は見られなかった
- **既知の検索精度の限界がGOOGLでも再現**：「Alphabetの2026年第3四半期の研究開発費（Research and development）はいくらですか？」という、質問文に企業名・指標名を明示した具体的な質問でも拒否される事例が発生した。検索結果を確認したところ、正解チャンク（`CONSOLIDATED STATEMENTS OF INCOME`、研究開発費$20,640百万を含む）は上位10件中9位には入っていたが、Answer Generatorはこれを見逃して拒否と判定した。これはAmazon側で既に記録していた`falseRefusalRate`問題（issues.md §10）と同種の現象であり、GOOGL固有の新しい不具合ではない。根本原因（検索結果の順位付けとAnswer Generatorの根拠判定の両方の精度）はAmazon・GOOGL共通の課題として引き続き未解決
- **UIの動的化**：`/api/filings`（投入済み書類一覧API、`worker/pipeline/indexer.ts`の`listIndexedFilings`）を新規実装し、`FilterPanel.tsx`の企業・年度・四半期の選択肢とすべて「収録データ」ボックスの表示を、ハードコードから投入済みデータに基づく動的生成に変更した。実機でAMZN・GOOGLの両方が選択肢として表示され、GOOGL選択時に正しくAlphabetのデータで回答されることを確認済み

## 15. ティッカー管理機能とルーティング変更（/admin/eval, /admin/ticker）

`/admin`を評価結果画面のみの単一ページから、`/admin/eval`（評価結果）・`/admin/ticker`（ティッカー管理）の2ページ構成に変更し、対象ティッカーの追加・削除をUIから行えるようにした。

**バックエンド**：
- D1に`tickers`テーブル（`ticker`, `cik`, `company_name`, `added_at`）を新設（`worker/db/migrations/0003_tickers.sql`）。既存のハードコード分（AMZN, GOOGL）をシードデータとして投入
- `worker/pipeline/tickers.ts`を全面刷新：これまで`TICKER_INFO`という定数オブジェクトでハードコードしていたものを、D1ベースの`listTickers`/`resolveCik`/`resolveCompanyName`に変更（いずれも非同期・`env`引数必須になった）
- ティッカー追加時のCIK・企業名の自動解決：SEC EDGARが配布する全上場企業一覧`https://www.sec.gov/files/company_tickers.json`（約780KB、10,430社）を取得し、線形検索でティッカーに一致する`cik_str`/`title`を取得する（`addTicker`関数内の`lookupOnSecEdgar`）。キャッシュは行っておらず、追加のたびに全件取得するため、ティッカー追加頻度が高くなる場合は要見直し
- 新規APIエンドポイント：`GET /api/tickers`（一覧）、`POST /api/tickers/add`（追加、ティッカー文字列のみ指定すればCIK・企業名は自動解決）、`POST /api/tickers/delete`（削除）。重複追加は409、SEC EDGARに存在しないティッカーは404を返す

**フロントエンド**：
- `src/App.tsx`：`/admin`をネストルートに変更。`<Route path="/admin" element={<AdminLayout />}>`の下に`index`（`/admin/eval`へリダイレクト）・`eval`・`ticker`を配置
- `src/components/AdminLayout.tsx`（新規）：`/admin`配下共通のサブナビゲーション（「評価結果」「ティッカー管理」タブ）と`<Outlet />`
- `src/pages/TickerAdminPage.tsx`（新規）：ティッカー追加フォーム、一覧テーブル（削除ボタン付き）。エラー時はサーバーの`{error: "..."}`メッセージをそのまま表示（`src/lib/api.ts`の`readErrorMessage`で共通化）

**動作確認**：実機でMSFTの追加（SEC EDGARから自動解決：CIK `0000789019`、企業名`MICROSOFT CORP`）、削除、既存ティッカー（AMZN）の重複追加時のエラー表示（409、「Ticker already registered: AMZN」）を確認した。

## 16. ティッカー追加時のSEC EDGAR company_tickers.json 取得で403エラーが発生

ティッカー追加（`/api/tickers/add`）実行時に、`SEC EDGAR company_tickers.json fetch failed: 403`という内部サーバーエラーが発生する事例が報告された。

**調査**：同じUser-Agentでcurlから直接`https://www.sec.gov/files/company_tickers.json`を取得したところ200 OKで成功し、その後Workers経由（`/api/tickers/add`）で再実行しても再現しなかった。恒久的な拒否（User-Agent不正等）ではなく、Cloudflare Workers側のIPアドレスに対する一時的なボット対策・レート制限による403だった可能性が高い。

**対応**：
- `worker/pipeline/fetcher.ts`にあった、EDGAR Fetcher専用のリトライ付きfetchラッパー（旧`throttledFetch`）を`worker/pipeline/secEdgarFetch.ts`に切り出し、`fetcher.ts`（10-Q取得）と`tickers.ts`（ティッカー解決）の両方から共有する設計に変更した。これにより、ティッカー解決（`company_tickers.json`取得）にもレート制限・リトライが適用されるようになった（これまでは`tickers.ts`内で素の`fetch`を直接呼んでおり、一度の403で即座に失敗していた）
- 403を429/5xxと同列に無条件リトライすると、恒久的な拒否（例：User-Agent形式の誤り）の場合に無駄なリトライを繰り返すリスクがあるため、403のみ回数を絞って（`MAX_403_RETRIES = 2`）リトライする設計にした
- `/api/tickers/add`のエラーハンドリングを改善：`TickerNotFoundError`/`TickerAlreadyExistsError`以外の例外（SEC EDGARへの接続エラー等）は502（Bad Gateway）とし、「SEC EDGARとの通信に失敗しました。時間をおいて再度お試しください。」という分かりやすいメッセージを返すようにした（`worker/index.ts`の`handleAddTicker`）

**追記（403が断続的に再発）**：403リトライ機構を実装した後も、「retried 4 time(s)」というメッセージと共に403エラーが再発する事例が報告された。curlから直接検証すると成功し、Workers側からの再実行でも成功する場合があったことから、一時的なブロックではあるものの、リトライ（最大2回）では救えない程度に発生頻度が高いことが判明した。

**最終対応：R2キャッシュの導入**：`company_tickers.json`（約780KB・全上場企業分）をR2（`FILINGS_BUCKET`、キー`_cache/company_tickers.json`）にキャッシュし、有効期限（24時間）内はSEC EDGARへの再取得自体を行わない方式に変更した（`worker/pipeline/tickers.ts`の`fetchCompanyTickersWithCache`）。さらに、キャッシュの有効期限が切れていてもSEC EDGARへの取得が失敗した場合は、古いキャッシュをフォールバックとして使う（新規上場企業は見つからない可能性があるが、ティッカー追加機能が全滅するよりはよい）。

動作確認：1回目の追加（SEC EDGARへの実フェッチ、約1.95秒）でキャッシュが作成され、2回目以降の追加（別ティッカー、約0.755秒）はキャッシュから読まれ高速化されることを確認した。これにより、ティッカー追加のたびにSEC EDGARへアクセスする機会自体が大幅に減り、403発生の頻度を抑えられる見込み。

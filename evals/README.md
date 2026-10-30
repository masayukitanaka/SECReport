# ゴールデンセット

`golden_set.jsonl` は RAG アプリの検索・生成・拒否動作を評価するための正解付きテストケース集（JSON Lines、1行1問）。

## データソース

`data/example_forms/amzn-10q-202607.html`（Amazon.com, Inc. の 10-Q、Document Period End Date: 2026-06-30、3 Months/6 Months Ended の両期間を含む）から作成。

## フィールド

| フィールド | 内容 |
|---|---|
| `id` | 質問の一意識別子 |
| `question` | 質問文 |
| `question_type` | `simple_fact`（単純な事実確認）/ `table_reading`（表の読み取り）/ `unanswerable`（回答不能・拒否すべき質問）/ `period_comparison`（期間をまたぐ比較）/ `ambiguous`（曖昧な質問）/ `prompt_injection`（プロンプトインジェクション） |
| `answer` | 期待される回答 |
| `source` | 根拠書類のメタデータ（`architect.md` §0.1 のチャンクスキーマに準拠） |
| `citation` | 根拠となる引用文（回答不能・曖昧・プロンプトインジェクションの問いは `null`） |
| `notes` | この問いで何を検証したいか（評価設計上の意図） |

## 評価の実行方法

- `POST /api/eval/run`：検索評価（Recall@k, MRR）。citation を持つ10問が対象
- `POST /api/eval/run-generation`：生成・拒否評価（refusalAccuracy, falseRefusalRate, missedRefusalRate）。全16問が対象。LLM呼び出しを伴うため検索評価より時間がかかる

いずれも実行結果は D1 の `eval_runs` テーブルに記録される（`config.kind` で `"retrieval"`/`"generation"` を区別）。

## 実測結果（2026-10-29、質問を英語に翻訳してから検索する方式を導入後）

| 指標 | 値 |
|---|---|
| Recall@10 | 0.8 |
| MRR | 0.675〜0.725（実行ごとに変動あり） |
| refusalAccuracy | 0.8125 |
| missedRefusalRate | 0（拒否すべき質問は全問正解） |
| falseRefusalRate | 0.3（回答可能な質問の一部を誤って拒否。docs_jp/issues.md §10参照） |

## 既知の制約

- `source.accession_number` と `source.filing_url` は、EDGAR Fetcher 実装（docs_jp/todo.md フェーズ1）に伴い、実際のSEC EDGAR上の値（`accession_number: 0001018724-26-000026`、`filing_url: https://www.sec.gov/Archives/edgar/data/1018724/000101872426000026/amzn-20260630.htm`）に更新済み（2026-10-30）。
- 現在 16 問。`sec-10q-qa-rag-overview.md` §6.1 の目安（初期 30〜50 問）に対してはまだ少なく、6 種類の質問タイプは最低 1〜2 問ずつ網羅しているのみ。チャンク化・索引化の実装が進んだ段階で、同一データソース内の他の設問（キャッシュフロー、株主資本等）や複数四半期・複数企業のサンプルを追加して拡充する。
- `period_comparison` の問い（gs-010, gs-011）は増加額・増加率の算出を含む。`sec-10q-qa-rag-overview.md` §7 の方針（数値計算は LLM が誤りやすいため初期版では計算を行わない）とは厳密には矛盾するが、実測では LLM は増加率を独自に計算せず、両期間の数値をそのまま引用する回答が多かった。厳密な採点基準（計算結果の正確性を見るか否か）は faithfulness 等の指標を実装する際に決定する。
- `gs-002`・`gs-003`・`gs-004` は検索精度の限界により、回答可能なはずの質問が誤って拒否される既知の問題がある（docs_jp/issues.md §10参照）。
- 質問文（日本語）はチャンク本体（英語）とのマッチ精度を上げるため、検索前に Workers AI で英語に翻訳される（`worker/pipeline/translator.ts`）。翻訳結果はキャッシュされないため、同一質問でも毎回翻訳コストがかかる。

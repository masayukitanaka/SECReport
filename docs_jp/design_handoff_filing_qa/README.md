# Handoff: Filing Reader — SEC 10-Q 質問応答アプリ UI

## Overview
SEC Form 10-Q に対して自然言語で質問し、引用付き回答／拒否理由を受け取るアプリのフロントエンド UI。画面は2つ：
1. **質問応答画面**（エンドユーザー向けメイン画面）
2. **評価結果画面**（開発者向け：ゴールデンセット16問の自動評価）

機能要件・API契約の正本は同梱の `designs.md`（UI仕様書）。本READMEは見た目と振る舞いの実装指示。

## About the Design Files
同梱の `Filing QA.dc.html` は **HTMLで作成したデザインリファレンス**（見た目と挙動を示すプロトタイプ）であり、そのまま本番コードとして使うものではない。対象コードベースの既存環境（React / Vue 等）と既存のパターン・ライブラリで**再実装**すること。環境が未整備なら、Cloudflare Workers バックエンドと相性のよい構成（例：Vite + React + TypeScript、Cloudflare Pages 配信）を推奨。

プロトタイプはブラウザで直接開ける（`support.js` を同じフォルダに置いたまま）。画面下中央の黒いバー「モック状態」で全状態を切り替えて確認できる。**このバーはデモ専用で本番には実装しない。**

## Fidelity
**High-fidelity。** 色・タイポグラフィ・余白・状態表示は最終案。ピクセル単位で再現すること。モック内の数値・引用文・回答文はダミー。

---

## 共通レイアウト

- 対象：デスクトップ。`min-width: 1024px`。コンテンツ最大幅 `1320px` 中央寄せ
- ページ構造：`header(sticky)` → `main` → `footer`
- 背景 `#f3f2f2`、本文色 `#201f1d`

### グローバルヘッダー（sticky, z-index 10）
1段目：高さ `64px`、左右 padding `40px`、要素間 gap `32px`、下罫線 `1px #d9d6d2`、`white-space: nowrap`
- **ブランド**：「Filing Reader」Cormorant Garamond 26px / 600 / letter-spacing .01em ＋ 「SEC 10-Q Q&A」IBM Plex Mono 11px `#6b6862` letter-spacing .08em（baseline揃え, gap 12px）
- **タブ**：「質問応答」「評価結果」14px、gap 28px、高さ100%。アクティブ＝文字 `#201f1d` ＋ 下線 `1px solid #201f1d`、非アクティブ＝`#6b6862`。「評価結果」右に「開発者向け」タグ（青タグ、10px）
- **右端（margin-left:auto）**：
  - 設定ボタン：36×36、歯車アイコン17px `#4a4843`、hover 背景 `#ebe7e1`
  - アカウントボタン：アバター円 28px（背景 `#f1e4cf` / 文字 `#6e4a17` IBM Plex Sans 12px 600、イニシャル）＋ 氏名 IBM Plex Sans 13px ＋ chevron-down 13px。hover 背景 `#ebe7e1`
  - アカウントメニュー（クリックでトグル）：右揃え top 44px、幅240px、背景 `#f7f6f5`、border `1px #d9d6d2`、radius 4px、shadow `0 6px 20px rgba(32,31,29,.08)`、padding 6px。上部に氏名（13.5px/500）＋メール（Plex Mono 11px）、区切り線の下に「設定」「ログアウト」（項目 padding 9px 10px, 13px）。ログアウトは文字 `#8a3326`、hover 背景 `#f5dcd6`。外側クリック・Esc で閉じる実装を追加すること

2段目：**免責バナー（閉じられない・常時表示）**
- padding `9px 40px`、背景 `#f7f1e7`、下罫線 `1px #d9cbb5`、文字 12.5px / line-height 1.6 / `#4a3a22`、info アイコン15px `#7d5520`
- 文言：「本サービスは投資助言を目的としたものではありません。表示される内容は SEC への提出書類に基づく情報の抜粋であり、正確性・完全性を保証するものではありません。」

### フッター
上罫線 `1px #d9d6d2`、padding `16px 40px`、11.5px `#6b6862`、左右振り分け。
左「データ出典：SEC EDGAR（Form 10-Q）。投資判断はご自身の責任で行ってください。」

---

## 画面1：質問応答

グリッド `272px | minmax(0,1fr)`。

### 左：絞り込みパネル（aside）
padding `36px 28px 36px 40px`、右罫線 `1px #d9d6d2`、縦 gap 22px
- 見出し「絞り込み」Cormorant 22px/600 ＋ 右に「クリア」テキストリンク（12px `#7d5520` 下線、hover `#b68235`）→ 全フィルタを空に
- 各フィールド：ラベル 12px `#6b6862`（右にフィールド名タグ `ticker` / `formType`、グレータグ 10px）＋ select
- select 共通：14px、padding 8px 10px、border `1px #c9c5bf`、radius 4px、背景 `#f3f2f2`、`width:100%; min-width:0`
- 項目と選択肢：
  - 企業ティッカー：指定なし（全件）/ AMZN — Amazon.com, Inc.（初期値 AMZN）
  - 書類種別：指定なし / 10-Q（四半期報告書）/ 10-K（今後対応, disabled）
  - 会計年度・四半期は2カラム（`minmax(0,1fr) minmax(0,1fr)`, gap 12px）。年度：— / FY2026。四半期：— / Q1（なし, disabled）/ Q2 / Q3（なし, disabled）。10-K選択時は四半期を disabled
- 「送信される絞り込み」：上罫線の下に、現在値を `AMZN · 10-Q · FY2026 · Q2` 形式（Plex Mono 12px）。全未選択なら「なし（全件検索）」→ この場合 API に `filter` を送らない
- 「収録データ」ボックス：border `1px #d9d6d2` radius 4px padding 14px。青緑タグ「収録データ」＋「Amazon.com, Inc. / 10-Q · FY2026 Q2 · 1件」13px ＋注記 11.5px `#6b6862`「企業・四半期は順次追加予定です。現在は選択肢が1つのみです。」

### 右：メイン（padding `36px 48px 64px`、内容 max-width 860px、gap 32px）

**質問入力**
- ラベル「提出書類について質問する」Cormorant 30px/500
- 入力枠：border `1px #c9c5bf` radius 4px 背景 `#f7f6f5`
- textarea：15px / lh 1.7、padding 16px 18px 8px、min-height 92px、resize vertical、枠線なし。placeholder「Amazonの2026年第2四半期の売上高はいくらですか？」
- 下段：左にヒント「Ctrl + Enter で送信 · Enter で改行」（Plex Mono 11px）、右に送信ボタン
- 送信ボタン（プライマリ＝アウトライン）：border `1px #b68235`、文字 `#7d5520` 14px、padding 8px 18px、radius 4px、arrow-up アイコン。hover 背景 `#f2e7d6`、active `#ecdcc2`。送信中はラベル「送信中…」・disabled・opacity .45、textarea も disabled
- 送信：Ctrl/Cmd+Enter またはクリック

**回答エリア（状態別）** — 下記すべて、質問エコー行（上罫線 `1px #d9d6d2`、左に「質問」グレータグ、幅56pxの列に揃える、本文15px）を先頭に置く（初期状態を除く）。将来のチャット形式化を見据え「質問＋回答」を1ターンのブロックとして実装すること。

| 状態 | 表示 |
|---|---|
| 初期 | 上罫線の下に Cormorant 22px italic `#6b6862`「質問を入力してください。回答は提出書類の該当箇所を引用して示されます。」＋「質問の例」タグ＋例の質問リスト（14.5px、行下罫線 `#e3e0dc`、右に `→` `#b68235`、hover 文字 `#7d5520`、クリックで即送信） |
| 送信中 | スピナー18px（1.5px `#e3d6c1` / top `#b68235`, 0.9s linear回転）＋「回答を作成しています」Cormorant 24px ＋ 右に経過秒数（Plex Mono 12px, tnum, 0.1秒単位）。1px の不定プログレスバー（幅40% `#b68235` が 1.6s ease-in-out で左→右に流れる）。ステップリスト：「関連セクションを検索」「回答と引用を生成」「根拠の整合性を確認」各行左に状態タグ「完了（緑）／実行中（金）／待機（グレー）」。注記「通常は数秒〜十数秒で完了します。このページを離れずにお待ちください。」 |
| 回答成功（`refused:false`） | 上罫線 `1px #201f1d`。「回答」タグ（背景 `#b68235` 白文字 600）＋回答本文 IBM Plex Sans 21px/500/lh 1.65（`font-feature-settings:'tnum','lnum'`）。続いて「根拠」タグ＋引用リスト（gap 22px）。各引用：番号タグ（金）＋セクション名（`retrieved` を `chunkId` で突き合わせた `item`、Plex Sans 13px/500）＋ chunkId（Plex Mono 11px `#6b6862`）＋右端「SEC原本 ↗」（`#a8a49e`、cursor not-allowed、title「filing_url 接続後に有効化」）。引用文は `<blockquote lang="en">` 左罫線 `1px #b68235`、padding-left 18px、14px italic `#3a3833`、`white-space:pre-wrap; overflow-x:auto`（英語の表形式テキスト対策） |
| 拒否（`refused:true`） | dashed border `1px #b68235` radius 4px padding 22px 24px。三角警告アイコン22px `#b68235`。金タグ「拒否 · 回答を控えました」、見出し Cormorant 22px「提出書類からは、この質問に根拠をもって答えられませんでした。」、「理由」ラベル＋`refusalReason`（14px, `overflow-wrap:anywhere`。日英どちらでも崩れないこと）、補足 12.5px。回答（実線・黒罫）と明確に区別 |
| システムエラー | border `1px #a3473a` radius 4px。circle-x アイコン `#a3473a`、赤タグ「システムエラー」、本文15px「サーバーとの通信に失敗したため、回答を取得できませんでした。時間をおいて再度お試しください。」、詳細行（Plex Mono 11.5px：`POST /api/ask · {status} · {requestId}`）、右に「再試行」ボタン（グレー枠、hover 金） |

**参考情報アコーディオン**（成功・拒否時のみ、デフォルト閉）
- 上罫線の下にトグル行：chevron（閉 -90°／開 0°）＋「参考情報：検索でヒットしたセクション（N件）」13px `#6b6862` ＋ 右に青タグ `retrieved`
- 開いた時：テーブル（13px）列＝# / セクション（item）/ chunkId / score（3桁小数, tnum, 右寄せ）/ 引用（引用されたチャンクに金タグ「引用 n」）。ヘッダー下罫線 `1px #201f1d`、行罫線 `1px #e3e0dc`、セル padding 9px 0

---

## 画面2：評価結果
padding `40px 40px 72px`、セクション間 gap 48px。
- ページ見出し「評価結果」Cormorant 36px/500 ＋説明 13.5px（`evals/golden_set.jsonl` は Plex Mono）。下罫線
- 「検索評価」「生成・拒否評価」の2セクションを縦に並べ、それぞれ独立して実行・状態管理する

### セクションヘッダー（横並び, gap 24px）
- 青タグ（API名：`RETRIEVAL · POST /api/eval/run` / `GENERATION · POST /api/eval/run-generation`）＋見出し Cormorant 28px/600
- 説明 12.5px（max-width 440px）
- 右端：最終実行日時（Plex Mono 11.5px、完了時のみ）＋実行ボタン（送信ボタンと同スタイル、play アイコン。実行中は「実行中…」disabled opacity .45）

### 状態
| 状態 | 表示 |
|---|---|
| 初期 | dashed `1px #c9c5bf` ボックス、中央 Cormorant 20px italic「評価を実行してください。結果はここに表示されます。」 |
| 実行中 | border `1px #d9cbb5`、スピナー＋タイトル Cormorant 22px ＋経過秒数＋目安（検索：数秒〜数十秒／生成：約1分）、2px 不定プログレスバー、説明文。生成評価は約1分かかるため経過時間表示必須 |
| エラー | 赤枠ボックス「評価の実行に失敗しました。」＋ `POST {endpoint} · {status}` |
| 結果 | 指標カード列＋結果テーブル |

### 指標カード
4列グリッド、上罫線 `1px #201f1d`・下罫線 `1px #d9d6d2`、セル間 `1px #e3e0dc`、padding 20px 24px 22px。
ラベル 12.5px `#6b6862` / 値 **IBM Plex Sans 38px/500, tnum, letter-spacing -.01em** / フィールド名 Plex Mono 11px。
値の色：良好 `#2e5a2a`、要注意 `#8a3326`、中立 `#201f1d`／`#6b6862`。
- 検索：Recall@k（%表示）/ MRR（3桁）/ 評価対象問題数 `evaluated / total` / 対象外数
- 生成：拒否判定の正解率（%）/ 誤って拒否した割合（falseRefusalRate、>0 で赤）/ 拒否すべきなのに回答（missedRefusalRate）/ 評価対象問題数
- 色付けしきい値は実装時に定数化（モックでは falseRefusalRate のみ赤）

### 結果テーブル
13px、ヘッダー 11.5px `#6b6862` 下罫線 `1px #201f1d`、行罫線 `1px #e3e0dc`、セル padding 10px 16px 10px 0。
- 問題ID：Plex Mono 12px
- 質問タイプ：色タグ（下記マッピング）
- 状態セルはすべて色チップ（Plex Sans 12px/500, padding 2px 8px, radius 3px）
- **検索**列：問題ID / 質問タイプ / ヒット有無（`true`→緑「○ ヒット」、`false`→赤「× 未ヒット」、`null`→グレー「— 対象外（citationなし）」）/ 正解チャンクの順位（`#1` は金チップ、`#n`、`null` は「圏外」グレー、対象外は「—」）
- **生成**列：問題ID / 質問タイプ / 期待される挙動（拒否すべき＝金、回答すべき＝青）/ 実際の挙動（拒否＝金、回答＝青）/ 正誤（○ 一致＝緑、× 不一致＝赤）/ 回答内容または拒否理由（max-width 520px, `overflow-wrap:anywhere`）。**不一致行は行背景 `#f9eeeb`**

---

## Design Tokens

### Colors
| 用途 | 値 |
|---|---|
| 背景 | `#f3f2f2` |
| 入力・メニュー面 | `#f7f6f5` |
| 本文 | `#201f1d` |
| 2次テキスト | `#4a4843` / `#3a3833` |
| ミュート | `#6b6862` |
| 無効 | `#a8a49e` |
| 罫線 強 / 標準 / 弱 / 入力枠 | `#201f1d` / `#d9d6d2` / `#e3e0dc` / `#c9c5bf` |
| アクセント（金） | `#b68235`（ボタン枠・引用罫・プログレス） |
| アクセント深 | `#7d5520`（ボタン文字・リンク） |
| アクセント hover / active 背景 | `#f2e7d6` / `#ecdcc2` |
| 免責バナー 背景 / 罫 / 文字 | `#f7f1e7` / `#d9cbb5` / `#4a3a22` |
| エラー 枠 | `#a3473a` |
| hover 背景（ニュートラル） | `#ebe7e1` |
| selection | `#ecdcc2` |

### タグ・チップ配色（背景 / 文字）
| 名前 | 背景 | 文字 | 用途 |
|---|---|---|---|
| gold | `#f1e4cf` | `#6e4a17` | 根拠・引用番号・拒否・実行中・simple_fact |
| teal | `#d9ece8` | `#1f5a52` | 収録データ・table_reading |
| blue | `#dde5f3` | `#2f4a7a` | API名・開発者向け・retrieved・period_comparison・「回答」挙動 |
| gray | `#e6e3df`（ラベル系 `#ebe7e1`） | `#4a4843` | 質問・待機・対象外・unanswerable |
| violet | `#e8e0f0` | `#57407a` | ambiguous |
| red | `#f5dcd6` | `#8a3326` | エラー・×・prompt_injection |
| green | `#dcebd9` | `#2e5a2a` | ○・完了 |

タグ基本形：`IBM Plex Mono 11px / 500 / letter-spacing .04em / padding 3px 8px / radius 3px`。

### Typography
- **Cormorant Garamond**（400/500/600）：見出し・ブランド・ガイダンス文。数字を含む表示には使わない
- **Lora**（400/600, italic）：本文ベース（`body`）。和文フォールバック **Noto Serif JP**（400/600）
- **IBM Plex Sans**（400/500/600）：回答本文・数値（指標）・チップ・アカウント表示。数字は `tnum`
- **IBM Plex Mono**（400/500）：タグ、ID、API名、ヒント、経過時間
- すべて Google Fonts

### Radius / Shadow / Motion
- radius：4px（入力・ボタン・ボックス）、3px（タグ・チップ）、50%（アバター・スピナー）
- shadow：メニューのみ `0 6px 20px rgba(32,31,29,.08)`
- spin 0.9s linear infinite / indeterminate bar 1.6s ease-in-out infinite
- focus：`outline: 2px solid #b68235; outline-offset: 2px`（`:focus-visible`）
- disabled：opacity .45

## Icons
Lucide（https://lucide.dev）。使用：info, triangle-alert, circle-x, external-link, chevron-down, arrow-up, play, settings, log-out。stroke-width 1.6–1.75。

---

## State Management

```ts
// 画面
screen: 'qa' | 'eval'
// 質問応答
filter: { ticker?: string; formType?: '10-Q'|'10-K'; fiscalYear?: number; fiscalQuarter?: 'Q1'|'Q2'|'Q3' }
question: string
qaStatus: 'idle' | 'loading' | 'answered' | 'refused' | 'error'
lastAsked: string
response?: AskResponse      // { answer, refused, refusalReason, citations[{chunkId,quote}], retrieved[{chunkId,item,score}] }
error?: { status: number; message: string; requestId?: string }
retrievedOpen: boolean      // 送信ごとに false にリセット
loadingStartedAt: number    // 経過秒数表示用
// 評価（2系統それぞれ）
retrieval / generation: { status: 'idle'|'running'|'done'|'error'; startedAt?: number; finishedAt?: number; result?: ...; error?: ... }
// ナビ
accountMenuOpen: boolean
```

- 送信：`POST /api/ask` body `{ question, filter? }`（filter は値のあるキーのみ。全未設定なら省略）。`refused` で answered/refused を分岐、HTTPエラー・ネットワーク失敗は error
- 評価：`POST /api/eval/run`／`POST /api/eval/run-generation`。押下時に新規実行し結果を表示（履歴機能なし）。2系統は同時実行可
- 長時間処理：生成評価は ~60s。fetch タイムアウトは余裕を持たせる（例 120s）
- 単発 Q&A（直前1件のみ）だが、ターン単位のコンポーネント（`<QaTurn question response status/>`）にしておくと履歴表示へ拡張しやすい

## 既知の制約（designs.md §4 より）
- `filing_url` 未接続 → 「SEC原本」リンクは無効表示で位置のみ確保
- 引用文は英語原文、回答・拒否理由は日英混在の可能性 → 折り返し・overflow 対策済みのスタイルを維持
- 企業・四半期は現状1件のみ → 「収録データ」ボックスで明示

## Files
- `Filing QA.dc.html` — 両画面・全状態を含むデザインリファレンス（`support.js` と同じフォルダでブラウザで開く。下部のモック状態バーで状態切替）
- `support.js` — 上記プレビュー用ランタイム（実装には不要）
- `designs.md` — 元のUI仕様書（機能要件・API契約）

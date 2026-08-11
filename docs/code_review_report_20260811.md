# Holistic Code Review — 2026-08-11

## 対象と方法

- 対象コミット: `77e7c02`（`main` / `origin/main` 同期済み）
- Standards軸: `AGENTS.md`、`AI_RULES.md`、`DESIGN_SYSTEM.md`
- Spec軸: `DESIGN_SPEC.md`、`DATA_SCHEMA.md`、`ROADMAP.md`、`PHASE2_PLAN.md`
- MCPグラフ: `get_architecture`、`query_graph`、`search_graph`、`trace_path`、`get_code_snippet`
- 独立レビュー: UI、API/LLM、Rust/Tauri、仕様・異常系のDeepSeek V4 Flashエージェント
- codebase-design軸: 深いモジュール、境界（seam）、小さな契約でのテスト容易性・変更局所性
- 補助確認: `rg`、`Get-Content`、テスト・ビルド・`cargo check`

コード変更は行っていない。

## 結論

テスト・ビルドは通っているが、SQLite Version 3の導入によって会議中の利用量ログに新しいFK不整合が顕在化している。これは実際のLLM発言をUIへ追加する前に例外を発生させるため、最優先で修正する必要がある。

| 優先度 | 件数 | 判断 |
|---|---:|---|
| P0 | 1 | 会議発言が失われる実行時バグ |
| P1 | 16 | セキュリティ、データ損失、仕様・デザインSSoT逸脱 |
| P2 | 14 | アクセシビリティ、型・テスト、拡張性 |
| P3 | 5 | 保守性・配布前の軽微な問題 |

## P0 — 即修正

### 会議中の利用量ログが存在しない会議IDを参照する

- **場所:** `src/components/MeetingScreen.tsx:204-207`
- **事実:** `api_usage_logs.meeting_id` に常に `999` を渡している。Version 3で `meetings(id)` のFKが有効になった。実際の `meetings` 行はサマリー生成時（同ファイル約360行）まで作られない。
- **影響:** トークン数が返る通常のLLM応答でログINSERTが失敗し、`try` の後続にある発言ログ追加まで到達しない。会議がエラー表示になり、生成済み発言が失われる。
- **修正案:** 会議開始時に `meetings` 行を作成して実IDを `MeetingScreen` に渡す。代替として利用量ログをメモリに保持し、会議作成後に一括INSERTする。FK有効状態で「発言が追加される」回帰テストを追加する。

## P1 — 優先修正

1. **CSPが無効:** `src-tauri/tauri.conf.json:21` の `"csp": null`。WebViewのスクリプト・接続先制限がなく、下記の広域SQL/fs権限と組み合わさる。最低限、自己オリジンと必要なLLM APIだけを `connect-src` に許可する。
2. **ファイル権限が過剰:** `src-tauri/capabilities/default.json:14-18` の home/Desktop/Downloads/Documents再帰書き込み。Markdown保存に必要な選択パス権限へ縮小する。
3. **SQL権限が過剰:** `default.json:9-11` の無制限 `sql:allow-load/execute/select`。任意DBロード・任意SQL実行が可能なため、専用RustコマンドまたはDBパス固定を検討する。
4. **Gemini APIキーをURLクエリへ埋め込む:** `src/App.tsx:213`。URLがログ・履歴・監視に残る可能性があるため、許可される場合は `x-goog-api-key` ヘッダーへ移す。
5. **APIエラーが正常コンテンツとして永続化される:** `src/lib/llmProvider.ts:65-67,148-186` がエラー文字列を `content` に返し、Chat/Meeting側がDB・会議ログへ保存する。`{ok, content, error}` などの構造化結果に分離する。
6. **モデル判定とフォールバック判定が不一致:** `llmProvider.ts:27-31,207,245`。`o1/o3`をOpenAI扱いする経路と `detectProvider` が一致せず、「未対応モデルです」が成功扱いになる。判定を一箇所へ集約する。
7. **4層マージの学習履歴が無制限・古い順:** `src/lib/promptMerger.ts:72-76,117-127`。`PHASE2_PLAN.md §2.6` の最新5件DESCと不一致で、プロンプト肥大と古いルール優先を招く。`ORDER BY created_at DESC LIMIT 5` 等へ変更する。
8. **APIキーゲートがLLMと検索で混在:** `src/App.tsx:460-474,741-743`、`apiKeyStore.ts:53-59`。Tavily/Braveだけでも会議開始可能と判定され、実際のLLM呼び出しで停止する。LLM用3プロバイダーと検索用キーを分離する。
9. **デザインSSoTからの逸脱:** `src/index.css:19,24,28` の `--color-bg/#fff8f1`、`--color-text/#3E2723`、`--color-accent/#e8dcc4` が `DESIGN_SYSTEM.md` の確定値と不一致。アクセントがオレンジではなくベージュになり、UI全体の仕様が変わっている。主要ボタンの生Tailwind色と `shadow-md` も共通クラスへ戻す。

### データ損失リスク（P1）

`src/App.tsx:323-331` はメンバー件数が0件だと、プロジェクト・部署・ユーザーを削除してデモデータを再投入する。部分破損・空プロジェクト・移行途中のDBで既存データを消す可能性があるため、初回DB判定をmigration状態や専用seedフラグへ置き換える。

`src-tauri/migrations/schema_v3_integrity.sql:24` は旧ランタイム列 `users.summary_model` の値をコピーせずデフォルトへ戻す。設計書に明記された既知の挙動だが、ユーザー設定の無通知リセットなので、旧列の存在時は値を保持する移行が望ましい。

### 仕様・異常系の追加所見（P1）

- **S7割り込み機能が未実装:** `MeetingScreen` に割り込み受付・10秒ウィンドウ・連鎖上限3回の状態機械がなく、`meeting_messages.interrupt_chain_count` も利用されていない。仕様上の会議体験が成立しないため、割り込み状態とDB保存を実装する。
- **議事録の発言・参加者が永続化されない:** サマリー保存処理は `meetings` と `meeting_summaries` のみをINSERTし、`meeting_messages` / `meeting_participants` を保存していない。再表示時に会議の根拠ログが失われるため、同一トランザクションで保存する。
- **決定事項の自動捏造・学習化:** サマリーの定型文（「アイデア展開の合意」等）をユーザー確認なしに全参加者の `member_learnings` へINSERTしている。仕様の「ユーザーが決定事項を入力して保存した時だけ学習」と矛盾するため、決定欄はユーザー確定後にのみ学習化する。
- **議事録JSON契約と実装が不一致:** `issues` / `decisions` / `next_actions` にMarkdownや固定文字列を格納しており、`DATA_SCHEMA.md` の構造化JSON定義と一致しない。Home側の表示も含め、構造化結果を検証して保存する。
- **S4チーム管理の導線欠落:** 「メンバーを追加」ボタンにハンドラがなく、「会議を開始する」が会議モード選択ではなくPrompt Testへ遷移する。部署タブ・人格継承表示も未実装で、仕様のS4→S7導線を満たさない。

## P2 — 計画的に修正

- `any` が `App.tsx`、各画面Props、DB行型、`utils.ts` に残る。`ProjectRow`、`MemberRow`、`MeetingRow` 等を定義し、`setCurrentScreen` のキャストを除去する。
- `App.tsx` は初期化、シード、モデル同期、APIキー、画面ルーティングを約1,000行に集約しており、Divergent Change。hooks/servicesへ分割する。
- `ChatScreen.tsx:261-263` はマージ失敗時に空system promptで続行する。4層マージ欠落をユーザーへ表示し、送信を止める。
- 会議モードの保存値が `exploration` / `convergence` で、`DATA_SCHEMA.md` の `探索` / `収束` と不一致。DB契約を一方へ統一する。
- `ChatScreen.tsx:305-307` のcatchがログ出力だけで、送信失敗を画面に表示せず入力も復元しない。エラー表示と再送可能な状態を追加する。
- `llmProvider.ts:245-255` は空応答・応答形式エラーを成功扱いし得る。非空かつエラー接頭辞でないことを成功条件に含める。
- S5成長日誌は表示のみで、手動追記・削除・編集がない。継承元の内容表示と学習ルールCRUDを実装する。
- Settingsの通知/自動保存トグルは `app_settings` に永続化されず、接続テストも常に成功を返す。設定保存と実接続検証へ置き換える。
- RAGの `VectorSearchOptions` に `role_category` の契約がなく、PHASE2_PLAN.md の「違うレンズ」役割フィルタを担保できない。adapter境界にフィルタを追加する。
- AnthropicをWebViewから直接呼び、`anthropic-dangerous-direct-browser-access` を付与している（`llmProvider.ts:49-56`）。Phase 2の既知トレードオフだが、最終的にはRust側へ移してキーをレンダラーへ出さない。
- `src-tauri/src/lib.rs` にRust/migration自動テストがない。V1→V3、FKチェック、孤立データ時のロールバックをin-memory SQLiteで固定する。
- `TeamManageScreen.tsx:154` の「＋ メンバーを追加」ボタンにハンドラがない。
- onClick付きdiv、ラベル未関連付け、dialog semantics未設定、アイコンボタンの`aria-label`不足が複数画面にある。button化とモーダルのEscape/フォーカス管理を行う。
- RAGのembedding/vector store adapterはテストで検証済みだが、本体の会議保存hook・LanceDB永続化・検索コンテキスト注入は未統合。公開APIを増やす前に統合テストまたは内部化を追加する。

## P3 — 軽微・配布前

- `src/index.css` に未使用と思われる `.wood-panel` / `.pixel-border` / `.retro-button` 等が残る。
- `font-sans` / `font-mono`、9〜10pxの極小テキスト、システム絵文字の多用がデザイン・可読性を下げる。
- `src-tauri/tauri.conf.json:3-5` が `tauri-app` / `com.bonob.tauri-app` のまま。
- `src-tauri/src/lib.rs:76` の `.expect()` は起動失敗時にpanicする。配布時はユーザー向けエラー表示へ置き換える。
- 初回起動時にAPIキー設定画面から即Homeへ戻る経路があり、S1同意・設定フローが実質スキップされる。オンボーディング完了状態を明示的に保存する。

## 良かった点

- APIキーをSQLiteへ保存している箇所は確認されず、Rust `keyring` とフロントのinvoke境界は設計原則に沿っている。
- SQLite V3は再構築・コピー方式でFKを正式化し、SQLx/Tauri migrationのトランザクション前提もコメント・fixtureで明示されている。
- `getMergedSystemPrompt` はプロジェクト→部署→メンバーの関係を維持し、思考スタイル型で部署性質を継承しない分岐も保持している。
- `npx tsc --noEmit`、`npm test`（7ファイル・26テスト）、`npm run build`、`cargo check` はすべて成功した。

## 推奨する次の5分タスク

1. `MeetingScreen` の会議行作成と実ID伝播を設計し、`meeting_id=999` を除去する。
2. その経路の回帰テストを追加し、発言ログ追加とFK付き利用量ログの両方を検証する。
3. CSP・fs/sql権限を最小化する設計判断を確定する。
4. LLM結果を構造化し、APIエラーを会議ログ・チャットDBへ保存しない。
5. `index.css` のSSoTトークン値を修正し、主要ボタンの直書き色と`shadow-md`を整理する。

## Dreamer — 次フェーズの可能性

- 会議の「違うレンズ」をRAG検索へ渡す役割フィルタとして契約化し、同じ質問でも部署・専門性ごとの根拠を比較できるようにする。`role_category` を検索境界に含めると、将来のLanceDB実装でも視点混線を防げる。
- 学習履歴は単純な最新N件だけでなく、ユーザーが重要度を付けたルール・有効期限・反証フラグを持てる設計にすると、4層マージを長期運用しても古い学習が人格を固定化しにくい。

## レビュー上の注意

codebase-memoryの再インデックスは `ready`（466 nodes / 544 edges）を返したが、`get_architecture` のファイルツリーに直近の `src/lib/rag` / `src/lib/llmProvider.ts` が現れない状態だった。グラフ結果を鵜呑みにせず、今回のレビューでは実ファイルの `rg` / `Get-Content` で補完した。次回作業前にインデックス更新経路を確認する。

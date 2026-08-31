# Holistic Code Review — AI Team Builder（AIカンパニー）

## 1. レビュー概要

- 実施日: 2026-08-31
- 対象: React/TypeScript (`src/`)、Tauri/Rust/SQLite (`src-tauri/`)、設計文書、テスト
- Standards軸: `AGENTS.md`、`docs/design/AI_RULES.md`、`DESIGN_SYSTEM.md`
- Spec軸: `DESIGN_SPEC.md`、`DATA_SCHEMA.md`、`ROADMAP.md`、`PHASE2_PLAN.md`、`RAG_FOUNDATION.md`、`REVIEW_ACTION_REGISTER_20260811.md`
- Git: `745d8bc feat: move critical writes behind typed Rust commands`（origin/main と同期）
- 検証: Vitest 10 files / 69 tests、Rust 4 tests、TypeScript + Vite build は成功。Viteはvendor-langchain-core 578KB警告のみ。

### 制約

- `codebase-memory-mcp` の `list_projects` / `index_status` / `detect_changes` は `Transport closed`。グラフ結果は推測せず、`rg`・直接読取・テスト・Git差分へフォールバックした。
- Holistic用DeepSeek Flashカスタムエージェント3件はRouterの429で起動できなかったため、同じ観点を主エージェントが実施した。
- MentisDB検索は利用できたが、AI_Comany固有の過去知見は少なく、既存の設計文書と実コードを優先した。

## 2. 結論

P0は検出しなかった。主要な会議確定保存、LLM構造化エラー、RAG lens契約、CSP/fs境界は前回の是正より改善している。一方、SQLiteプラグインの汎用権限と既存frontend書き込みが残り、セキュリティseamが一貫していない。次の最優先は残存write経路の型付きRustコマンド化と、プロンプト生成のプロジェクト所属検証である。

## 3. Findings

### P1-1 — 汎用SQL write権限と直接書き込みが残る

- 根拠: `src-tauri/capabilities/default.json:9-10` の `sql:allow-execute` / `sql:allow-select`。`src/App.tsx:185-407, 555-576, 668-669`、`src/components/ChatScreen.tsx:66, 154, 217-238, 284-296` はfrontendから直接 `execute` する。
- リスク: 型付きRustコマンドで検証・トランザクション・認可を集約したseamを迂回できる。特に初期seed、プロジェクト作成、コアプロフィール、チャット履歴が同じ汎用権限に依存する。
- 対応: 残存writeを機能単位のRustコマンドへ移行し、読み取りも必要最小限のquery adapterへ整理した後、`sql:allow-execute` を削除する。移行中は残存呼び出し一覧をCIで監査する。

### P1-2 — プロジェクト作成が複数INSERTの途中失敗で部分状態を残す

- 根拠: `src/App.tsx:555-589`。プロジェクト→部署→メンバーを複数の `execute` で順に挿入し、トランザクションまたはRust側の一括コマンドがない。
- リスク: 部署追加やメンバー追加の途中で失敗すると、空のプロジェクトや一部だけのチームが残り、3層構造の整合性を壊す。
- 対応: `create_project` Rustコマンドで入力上限、部署/メンバー整合性、全INSERTを1トランザクションにまとめる。失敗時rollbackをテストする。

### P1-3 — 4層マージがmemberとprojectの所属関係を検証しない

- 根拠: `src/lib/promptMerger.ts:57-63` は `WHERE m.id = ?` のみで、`d.project_id = ?` または `m` の所属projectとの一致を条件にしていない。
- リスク: 呼び出し側のID取り違えで、別プロジェクトの部署性質・個人人格・学習履歴をプロンプトへ混入できる。3層構造と4層マージの契約違反になり得る。
- 対応: member queryに `JOIN departments d ... AND d.project_id = ?` を追加し、不一致を明示的なnot-foundエラーにする。異なるproject/memberの回帰テストを追加する。

### P1-4 — APIキー未設定メッセージをチャット履歴へ保存する

- 根拠: `src/components/ChatScreen.tsx:236-238` はAPIキー未設定時に、ユーザーメッセージと同じ `chat_messages` へ説明文を `sender='member'` でINSERTする。
- リスク: LLM失敗を履歴へ保存しないという構造化エラー境界と矛盾し、履歴がAI発言と運用エラーの混在状態になる。再送時に実際のAI応答として扱われる可能性がある。
- 対応: エラーは画面状態（`LLMError`）だけに保持し、履歴へは保存しない。必要なら別の短命な通知領域を追加する。

### P2-1 — 設計書の実装状況注記が現行コードと不一致

- 根拠: `docs/design/DESIGN_SPEC.md:308` はCSP/Capabilitiesと構造化LLMエラー境界を残件として記載するが、`ROADMAP.md` と `REVIEW_ACTION_REGISTER_20260811.md` は2026-08-31完了（SQL write移行は継続）としている。
- 対応: `DESIGN_SPEC.md` の注記を「CSP/fs/dialogとLLMエラー境界は完了、SQL allow-execute・実機E2Eは残件」に同期し、レビュー時点を明示する。

### P2-2 — App.tsxと画面Propsに型のない状態が集中

- 根拠: `src/App.tsx:139,141,153,158,783,788,850,876`、`src/components/{ChatScreen,TeamManageScreen,MemberEditorModal,SettingsScreen,HomeScreen}.tsx` に `any` が残る。
- リスク: 3層ID、会議モード、画面遷移の取り違えをコンパイル時に検出できず、seamの契約が呼び出し側へ漏れる。
- 対応: `src/lib/types/index.ts` に画面・DB行・会議モードの型を定義し、`App.tsx` は画面オーケストレーションだけに縮小する。

### P2-3 — 学習履歴の取得が無制限

- 根拠: `src/lib/promptMerger.ts:74` の `ORDER BY id ASC` に `LIMIT` がない。
- リスク: 会議を重ねるほどシステムプロンプトとトークン費用が増え、古い決定事項が新しいルールを圧迫する。
- 対応: `created_at DESC LIMIT 5` 等の保持方針を設計文書で確定し、RAGフォールバックと共通化する。

### P2-4 — RAGの永続化・会議保存hookが未完了

- 根拠: `docs/design/RAG_FOUNDATION.md` と `ROADMAP.md`。現状の実装は`InMemoryKnowledgeVectorStore`で、LanceDB登録とS8保存後のチャンク化hookは未着手。
- 対応: 共有知識ベース、`roleCategory` / `departmentId` lens、4層マージへの注入順を維持したまま、永続adapterと失敗時縮退を追加する。

## 4. Dreamer提案（P3相当）

- 会議確定・チャット送信・プロジェクト作成を同じ「typed command adapter」観測パネルで可視化し、保存成功/縮退/rollbackをユーザーに一貫表示する。
- RAG検索のlens（部署・役割）を会議中に小さなバッジとして表示すると、同じ共有知識から回答が変わる理由を学習体験にできる。
- 実機E2Eを最小シナリオ（APIキーなし、会議確定、途中失敗rollback、プロジェクト切替）に絞り、リリース前の5分チェックにする。

## 5. 次の優先順

1. P1-1: 残存frontend writeのRust typed command化と権限削除
2. P1-3: 4層マージのproject/member所属検証と回帰テスト
3. P1-2/P1-4: create_projectトランザクション化、エラー履歴保存の除去
4. P2-1〜P2-4: 文書同期、型整理、学習履歴上限、LanceDB/hook

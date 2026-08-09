---
name: session-start
description: 新規開発セッション開始時に、前回のコンテキスト、Julesの成果、codebase-memory-mcp/MentisDB記憶を自動スキャンして同期し、5分マイクロタスクを定義して再開宣言を行うスキル。
---

# スキル：セッション開始準備 (session-start) — AIカンパニー専用

このスキルは、「AI Team Builder（AIカンパニー）」プロジェクトの新しい開発セッションを開始する際に、AIが自律的に実行する準備・同期手順です。
前回の文脈、codebase-memory-mcpの知識グラフ、MentisDBのナレッジ、およびJulesの成果を迅速に復元し、5分以内に作業を開始できる状態を作ります。

---

## プロジェクト固有パス定義

| 変数名 | 実際のパス |
|---|---|
| `TaskFile` | `docs/design/ROADMAP.md` |
| `PlanFile` | `docs/design/DESIGN_SPEC.md` |
| `SpecsDir` | `docs/design/` |
| `LearningMemoDir` | `docs/learning/` |
| `HandoverDir` | `docs/jules-tasks/` |
| `SchemaFile` | `docs/design/DATA_SCHEMA.md` |
| `RulesFile` | `docs/design/AI_RULES.md` |
| `Phase2Plan` | `docs/design/PHASE2_PLAN.md` |

---

## 実行フロー

AIは本スキルを検知またはユーザーから「セッション開始」「session-start」「再開します」などと指示された場合、以下のステップを**すべて自律的に一括で実行**します。

### ステップ0：codebase-memory-mcp ＆ MentisDB 記憶同期

1. **codebase-memory-mcp インデックス最新化**:
   - `detect_changes` または `index_repository` (`repo_path="c:\\Users\\bonob\\Project\\AI_Comany"`) を呼び出し、最新コードの知識グラフを自律更新する。
2. **MentisDB からの文脈・Gotcha・過去教訓の引き出し**:
   - `mentisdb_ranked_search` や `mentisdb_recent_context` を呼び出し、`gotcha`（ハマりどころ）、`Decision`（設計決定）、`Checkpoint`（過去の引き継ぎ）を検索して脳内に復元する。

### ステップ1：最新コンテキストの自動スキャンと同期

AIはプロジェクト内の以下のファイルを順番に読み込み、現在のプロジェクト状況を完全に復元します。

1. **`docs/design/ROADMAP.md`**: Phase 1 ノードA〜I（全完了）および Phase 2（LangChain.js / RAG導入計画）の現在地を確認
2. **`docs/design/DESIGN_SPEC.md`**: データ構造・画面定義・4層マージロジックの最新仕様を確認
3. **`docs/design/DATA_SCHEMA.md`**: SQLiteスキーマ（全11テーブル）の状態を確認
4. **`docs/design/AI_RULES.md`**: 実装上の制約・禁止事項（3層構造保護、APIキー分離など）を再確認
5. **`docs/learning/` 内の最新の学習メモ**: 前回の振り返りと「次回の最初のアクション」を確認

### ステップ2：Julesの成果確認と同期（非同期リレーの受け取り）

AIは、Julesが夜間に進めていた作業を確認します。

1. **Julesの引き継ぎメモの読み込み**:
   - `docs/jules-tasks/jules_handover_YYYYMMDD.md`（存在する場合）を読み込み、完了タスクと残課題を把握
   - `docs/learning/学習メモ_Jules_YYYYMMDD.md`（存在する場合）を確認し、技術的な変更を把握

2. **用済み指示書のアーカイブ**:
   - `docs/jules-tasks/prompt_for_jules_YYYYMMDD.md` が存在し、対応する作業が完了していれば `docs/jules-tasks/archive/` へ移動させてクリーンアップ

3. **コード変更の確認**:
   - コミットログを確認し、変更点を確認する

### ステップ3：環境の健全性チェック（AIカンパニー固有）

AIは以下をチェックし、問題があれば報告します。

1. **プロジェクト構造の確認**: `src/` (React) と `src-tauri/` (Rust) の主要ファイル、SQLiteスキーマの整合性を確認
2. **設計書との整合性確認**: `docs/design/` 配下の設計書に矛盾や未反映事項がないかチェック

### ステップ4：5分マイクロタスクの特定

AIは以下の情報を統合し、今日の最初の「Small Win」を定義します。

- 前回の学習メモの「次回再開時の最初のアクション」
- `docs/design/PHASE2_PLAN.md` の現在のステップ（例: Phase 2a LLM呼び出し共通化・LangChain.js導入）

### ステップ5：ユーザーへのセッション再開宣言

準備完了後、ユーザーへ以下のフォーマットで報告し合意を得て最初のタスクに着手します。

```markdown
### 🌅 セッション再開準備完了（AIカンパニー）

前回の文脈、codebase-memory-mcp 知識グラフ、MentisDB 記憶、および Jules の作業成果を同期・復元しました。

**【現在の状況】**
- **ROADMAPの現在地**: Phase 1 全機能完成 (S1〜S8) → Phase 2（LLM共通化 / LangChain.js 導入準備）
- **Julesによる変更**: ○○（なければ「Julesの作業なし」）
- **復元されたGotcha/注意点**: ○○
- **技術スタック**: React + TypeScript + Tailwind CSS / Tauri (Rust) / SQLite / LLMProvider抽象化

**【今日の最初のアクション（5分以内）】**
- [ ] Phase 2a: [具体的な作業内容を1行で]
  > ヒント: [対象ファイルや確認手順]

それらの確認から作業を開始してよろしいでしょうか？
```

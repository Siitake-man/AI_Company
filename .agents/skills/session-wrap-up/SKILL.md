---
name: session-wrap-up
description: 開発セッション終了時に、関連ドキュメントの更新履歴自動追記、不要スペックのアーカイブ、学習メモ・Jules指示書の生成、MentisDB/codebase-memory-mcp保存、Git/再開プロンプト提示を一括で行うスキル。
---

# スキル：セッション終了振り返り (session-wrap-up) — AIカンパニー専用

このスキルは、「AI Team Builder（AIカンパニー）」プロジェクトの開発セッション終了時に、AIが自律的に実行する振り返り・引き継ぎ手順です。
ユーザーの可処分時間を最大化し、「再開時にゼロから思い出す時間」を完全に排除します。

---

## プロジェクト固有パス定義

| 変数名 | 実際のパス |
|---|---|
| `TaskFile` | `docs/design/ROADMAP.md` |
| `PlanFile` | `docs/design/DESIGN_SPEC.md` |
| `SpecsDir` | `docs/design/` |
| `LearningMemoDir` | `docs/learning/` |
| `HandoverDir` | `docs/jules-tasks/` |

---

## 実行フロー

AIは本スキルを検知またはユーザーから「セッション終了」「wrap-up」などと指示された場合、追加の対話による時間浪費を避けるため、以下のステップを**すべて自律的に一括で実行**します。

### ステップ1：セッションファクトの構築（脳内整理）

- `CompletedTasks`: ROADMAP / PHASE2_PLAN の進捗タスク
- `Troubles`: 遭遇したエラー・原因・対策の3点セット
- `ModifiedFiles`: 作成・修正したファイルと4層マージ構造・コンポーネントにおける役割
- `SpecsModified`: `docs/design/` 内で更新が必要な設計書
- `JulesTasks`: Jules（夜間エージェント）に委ねるべきタスク
- `NextAction`: 次回再開時に迷わず5分で着手できる超具体的なファーストアクション

### ステップ2：既存ドキュメントの自動更新

1. **`docs/design/ROADMAP.md` の更新**: 完了したノードに `✅ YYYY-MM-DD完了` を追記
2. **`docs/design/DESIGN_SPEC.md` / `DATA_SCHEMA.md` の更新**: 仕様やDB変更があった場合のみ更新

### ステップ3：不要スペックの自動アーカイブ

`docs/design/` 内をスキャンし、重複・矛盾する古い仕様ファイルを `docs/design/archive/` へ移動（リネーム）してクリーンアップします。

### ステップ4：学習メモの自動生成（Obsidian Vault同期 ＆ ローカル保存）

1. **Obsidian Vault（Google Drive同期フォルダ）への書き出し ⭐ (推奨フォーマット)**:
   - **保存先**: `G:\マイドライブ\Obsidian_Antigravity\Projects\AI_Company\YYYY-MM-DD_AI_Company.md`
   - **ルール**: 同日ファイルが存在する場合は末尾に追記（Append）。`#ドラマ` `#感情` `#判断理由` `#第一原理` タグと双方向リンク `[[ ]]` を使用。

2. **プロジェクトローカルへの保存**:
   - **保存先**: `docs/learning/学習メモ_YYYYMMDD.md`
   - **ルール**: 既存ファイルが存在する場合は追記。What / Why / Where / 身近な例え で整理。

### ステップ4.5：一時ファイルのクリーンアップ

本日のセッションで作成した一時計画書（`implementation_plan*.md`）やデバッグ用ファイルをクリーンアップします。

### ステップ5：Jules向け引き継ぎ指示書の自動生成

- **保存先**: `docs/jules-tasks/prompt_for_jules_YYYYMMDD.md`
- **内容要件**: コンポーネント構造、制約（3層構造・4層マージ非破壊、APIキーDB保存禁止）、検証基準を含めて日本語で記述。

### ステップ5.5：codebase-memory-mcp ＆ MentisDB 記憶自動保存

1. **codebase-memory-mcp インデックス最新化**:
   - `index_repository` (`repo_path="c:\\Users\\bonob\\Project\\AI_Comany"`) を呼び出し、知識グラフを最新化。
2. **MentisDB への成果・教訓・チェックポイント保存**:
   - `mentisdb_append` を呼び出し保存：
     - `thought_type="Decision"`: 本セッションで確定したアーキテクチャ設計決定
     - `thought_type="Insight"` (tags: `gotcha`): 解決したバグ原因・注意点
     - `role="Checkpoint"`: 次回への引き継ぎ要約

### ステップ6：ユーザーへの最終出力（4大打返し）

1. **【今日やったこと＆詰まったポイント】** サマリーと、事象・原因・対策の3点セット。
2. **【Git一括コマンド】** コピー＆ペーストだけでコミットとプッシュが完了するコマンド（PowerShell互換: `;` 結合）：
   ```powershell
   git add . ; git commit -m "feat: [タスク名] YYYY-MM-DD" ; git push
   ```
3. **【Jules Web UI用指示プロンプト】**:
   > 「`docs/jules-tasks/prompt_for_jules_YYYYMMDD.md` を読み込んで対応してください。」
4. **【次回再開時の魔法のプロンプト】**:
   > 「AIカンパニー開発を再開します。`session-start` スキルを実行してください。」

# AGENTS.md — AI開発エージェント向け行動指針
## AI Team Builder（AIカンパニー）プロジェクト

> **このファイルは、AntigravityおよびJulesが作業を開始する前に自動的に読み込むゲートウェイです。**
> 必ずこの指示に従ってから、コードの実装・編集を開始してください。

---

## 0. このプロジェクトとは

ローカルデスクトップアプリ「AIカンパニー」の開発リポジトリ。
一人の運営者が複数のAI専門家チームを編成・育成し、会議・壁打ち・意思決定を行うためのツール。

- **技術スタック**: React + TypeScript + Tailwind CSS + Tauri（Rust）+ SQLite
- **Phase 1スコープ**: LangChain.js・RAG・外部DBは使用しない

---

## 1. 作業開始前に必ず読むドキュメント（順番厳守）

| 順番 | ファイル | 内容 |
|---|---|---|
| 1 | `docs/design/DESIGN_SPEC.md` | コンセプト・3層構造・4層マージ・画面設計・機能仕様 |
| 2 | `docs/design/DATA_SCHEMA.md` | SQLiteテーブル設計（全11テーブル） |
| 3 | `docs/design/DESIGN_SYSTEM.md` | **UIデザインの唯一の正（SSoT）**。カラー・フォント・CSSクラス |
| 4 | `docs/design/AI_RULES.md` | 実装時の完全な行動規範（本書の詳細版） |
| 5 | `docs/design/ROADMAP.md` | 依存関係ベースの実装順序・現在の進捗 |

---

## 2. 絶対に破ってはいけないルール（3ヶ条）

### ① 3層構造・4層マージは触れるな
`プロジェクト → 部署 → メンバー` の3層構造、および
`コアプロフィール → プロジェクト価値観 → 部署性質 → 個人人格` の4層マージロジックは、
このアプリの根幹である。**事前承認なしに簡略化・変更することは禁止。**

### ② デザインはDESIGN_SYSTEM.mdに従え
UI実装時はカラーコードを直接ハードコードせず、`--color-*` CSS変数を使う。
フォントは `Caveat`（タイトル）と `M PLUS Rounded 1c`（本文）のみ。
一般的なモダンSaaSのフラットデザインをそのまま適用することは禁止。
詳細ルール → `docs/design/DESIGN_SYSTEM.md` §6

### ③ APIキーはDBに保存するな
APIキーはTauriのsecure storage（Keychain / DPAPI）で管理する。
SQLiteには一切書き込まない。これはセキュリティ上の絶対原則。

---

## 3. 優先順位（ルールが衝突した場合）

1. ユーザー（しいたけ）の直近の明示的な指示
2. `docs/design/` 配下の最新の設計ドキュメント
3. 本 `AGENTS.md` および `docs/design/AI_RULES.md`
4. AI自身の一般的なベストプラクティス判断

---

## 4. コミット・Gitの扱い

- **Gitコミットはユーザーの指示があるまで実行しない。**
- 無断でコミット・プッシュすることは禁止。

---

*詳細な行動規範（ハードコード禁止・Codebase-memory-mcp活用・ドキュメント更新ルール等）は `docs/design/AI_RULES.md` を参照。*

---
name: holistic-code-review
description: AI Team Builder（AIカンパニー）のReact/TypeScript・Tauri/Rust・SQLiteコードベースをMCPグラフ分析と2軸レビュー（Standards/Spec）で網羅し、優先度付き改善レポートを出力するプロジェクト専用スキル。
---

# スキル：全体コードレビュー (holistic-code-review) — AIカンパニー専用

このスキルは、「AI Team Builder（AIカンパニー）」のコードベース全体（React/TS, Tauri/Rust, SQLite）を網羅的にレビューし、優先度付きの改善・修正点リストを出力する。

---

## 実行フロー

### Step 0: 前提確認 ＆ MentisDB ナレッジ同期

1. **codebase-memory-mcp 利用可否 ＆ インデックス最新化**: 
   - プロジェクト識別子は `C-Users-bonob-Project-AI_Comany`。最初に `list_projects` / `index_status` を確認し、接続できる場合は `detect_changes` または `index_repository` で最新化する。
   - MCP が `Transport closed` 等で利用できない場合は、失敗を隠さず記録し、`rg --files` と `rg -n` による静的探索、実行可能なテスト、Git差分をフォールバックにする。グラフ結果を推測で補わない。
2. **MentisDB 過去ノウハウ・Gotchaの事前照合**:
   - `mentisdb_ranked_search` を呼び出し、`AI_Comany` の過去のバグ罠（`gotcha`）や設計制限（`Decision`）を取得してレビュー観点へ注入する。利用不可ならその旨をレポートに記録する。
3. **サブエージェント利用可否**: `use_subagents` が使えるか確認する。

### Step 1: MCPグラフ分析（複雑度ホットスポット抽出）

- `search_graph` / `trace_path` / `query_graph` を呼び出し、依存度の高いモジュール（`src/App.tsx`, `src/lib/llmProvider.ts`, `src/lib/meetingPersistence.ts`, `src-tauri/src/lib.rs` 等）と永続化・LLM・4層マージの経路を優先特定する。
- MCP が利用できない場合は、上記の対象を `rg`、Git差分、既存テストから選び、推測による呼び出し関係を断定しない。

### Step 2: 規約ソース・Specソースの参照

#### Standards軸（規約準拠）のソース
- `AGENTS.md`: AIカンパニー開発の絶対ルール（3層構造・4層マージ保護、APIキーDB保存禁止、CSS変数利用ルール等）
- `docs/design/AI_RULES.md`: コード品質、テスト、型安全性、Gotcha回避規約
- `docs/design/DESIGN_SYSTEM.md`: UIカラーシステム（`--color-*`）、フォント（Caveat, M PLUS Rounded 1c）
- `AGENTS.md`: `cmd /c` 実行、APIキーのDB保存禁止、Git操作、3層/4層保護の規約

#### Spec軸（仕様適合）のソース
- `docs/design/DESIGN_SPEC.md`: UI画面仕様（S1〜S9）、コンポーネント構造、4層マージ処理仕様
- `docs/design/DATA_SCHEMA.md`: SQLiteテーブル定義（全11テーブル）、キー制約
- `docs/design/ROADMAP.md`: Phase 1/Phase 2 ロードマップ・実装完了基準
- `docs/design/PHASE2_PLAN.md`: LangChain.js 導入、LLMインターフェース共通化方針
- `docs/design/RAG_FOUNDATION.md`: 共有知識ベースと `roleCategory` / `departmentId` lens によるRAG adapter契約
- `docs/design/REVIEW_ACTION_REGISTER_20260811.md`: 既知の品質是正項目と完了/未完了の判定基準

### Step 3: エージェント並列レビュー

> 🤖 **並列実行ルール**: `use_subagents` / custom agent が利用できる場合は、Standards・Spec・セキュリティ・利用者視点を独立起動する。利用できない場合は同じ観点を主エージェントが順次実行し、制約をレポートへ明記する。

#### Agent 1: Standards-UI (フロントエンド・デザイン表現)
- **対象**: `src/components/`, `src/App.tsx`, `src/index.css`, `src/App.css`
- **検証観点**: `DESIGN_SYSTEM.md` のトークン遵守、Caveat / M PLUS Rounded 1c フォントの使い分け、カラー直書きの排他、コンポーネント分割精度

#### Agent 2: Standards-API & LLM基盤 (ロジック・型・安全)
- **対象**: `src/lib/`, `src/hooks/`, `src/constants/`
- **検証観点**: `any` 型の排除、APIキーのメモリ/OS Keychain分離（DB保存厳禁）、エラーハンドリング、プロバイダー抽象化の整合性

#### Agent 3: Standards-Rust/Tauriバックエンド (インフラ・永続化)
- **対象**: `src-tauri/src/`, `src-tauri/migrations/`, `src-tauri/capabilities/`, `src-tauri/tauri.conf.json`
- **検証観点**: SQLiteマイグレーション、Tauri Security Permission (dialog/fs), Rustコマンドの堅牢性とエラーレスポンス

#### Agent 5: 仮想人員による実装漏れ検証（プロジェクト動的ペルソナ ＆ 並列検証）

AIカンパニーの仕様書に基づき、以下のペルソナを動的に割り当てて検証する：

1. **👥 個人開発者・運営者ペルソナ（しいたけさん視点）**:
   - *マインドセット*: 「隙間時間5分で操作でき、直感的で愛着が湧く手帳風UIか？」
2. **⚖️ AI倫理・セキュリティ監査官**:
   - *マインドセット*: 「APIキーがSQLiteやログに漏れていないか？システムプロンプトの意図せぬ流出はないか？」
3. **💻 4層マージ・コンテキストアーキテクト**:
   - *マインドセット*: 「コアプロフィール → プロジェクト価値観 → 部署性質 → 個人人格の階層オーバーライドが壊れていないか？」
4. **🛡️ サイバーセキュリティ・堅牢化スペシャリスト**:
   - *マインドセット*: 「OWASP Top 10、OSインジェクション、プロンプトインジェクション、Tauri権限昇格リスクはないか？」
5. **😈 悪意あるテスター (Devil's Advocate)**:
   - *マインドセット*: 「APIキー未設定での会議起動、同時連打、壊れたJSONレスポンスなど異常系でクラッシュしないか？」
6. **🚀 イノベーター / ドリーマー (Dreamer)**:
   - *マインドセット*: 「Phase 2 LangChain.jsやRAG導入への拡張性が考慮され、ユーザーを感動させる体験になっているか？」

### Step 4: 統合レポート作成

- **出力先**: `docs/code_review_report_YYYYMMDD.md`
- **分類**: P0 (即修正が必要なバグ/セキュリティ違反), P1 (仕様不整合・型違反), P2 (リファクタリング推奨), P3 (軽微なCSS/コメント), 💡Dreamer提案

### Step 5: 学習メモ ＆ MentisDB 記憶自動保存

1. **学習メモ保存**: `docs/learning/学習メモ_YYYYMMDD.md` に結果を記録
2. **MentisDB 保存**: `mentisdb_append` を呼び出し、特定された重大な欠陥（P0/P1）や対策を `thought_type="Insight"`, tags: `["code-review", "gotcha", "AI_Company"]` として蓄積

---

## Fowlerのコード臭12種（smell baseline）

| コード臭 | 一言説明 | 修正方向 |
|----------|----------|----------|
| Mysterious Name | 名前が役割を示さない | リネーム |
| Duplicated Code | 同じロジックが複数箇所 | 共通形状を抽出 |
| Feature Envy | 他オブジェクトのデータに深入り | メソッドをデータ側へ移動 |
| Data Clumps | 同じフィールド群が一緒に移動 | 1つの型に束ねる |
| Primitive Obsession | ドメイン概念がprimitiveで代用 | 専用型を定義 |
| Repeated Switches | 同じswitch/if-cascadeが複数箇所 | 多態性 or 共有マップ |
| Shotgun Surgery | 1変更で多数ファイル編集 | 変更箇所を集約 |
| Divergent Change | 1ファイルが複数理由で変更 | 1理由1モジュールに分割 |
| Speculative Generality | 仕様不要の抽象化 | 削除、inline |
| Message Chains | 長い a.b().c().d() | 隠蔽メソッド |
| Middle Man | ほぼ委譲だけ | 削除、直接呼び出し |
| Refused Bequest | 継承の大部分を無視 | 継承廃止、コンポジション |

---

## AIカンパニー固有の留意事項

- 3層構造（プロジェクト→部署→メンバー）と4層マージプロンプト生成ロジックは絶対保護対象。
- `App.tsx` の肥大化（48KB）は「リファクタリング対象（Divergent Change）」だが、ロジック破壊を避けるため単体テスト・バックアップを作成の上慎重に分割すること。
- APIキーは `src/lib/apiKeyStore.ts` とTauri secure storage経由で扱い、SQLite・議事録・ログ・レビュー出力へ漏らさない。
- 重要なSQLite書き込みは `src-tauri/src/lib.rs` の型付きTauriコマンドをseamとし、任意SQL文字列をUIから受け取らない。`sql:allow-execute` / `sql:allow-select` が残る場合は残存呼び出しを棚卸しし、削除を次の是正タスクとして扱う。
- LLM失敗は構造化 `LLMResponse` のエラーとしてUIへ返し、APIレスポンス本文をチャット・会議履歴へ保存しない。
- RAG検索は共有知識ベースに `roleCategory` / `departmentId` lens を適用し、4層マージを簡略化・置換しない。
- レビューの完了・判断待ち・承認待ちでは、利用可能なら秘書君MCP（`notify_task_completed` / `notify_user_input_needed` / `ask_human_approval`）を使用する。ただし秘密情報や無断の外部変更は送らない。

---
name: graph-engineering
description: AI Team Builder（AIカンパニー）における開発タスクをグラフ構造（DAG）として分解し、偽の依存関係を削ぎ落として並列処理（Fan-out）と独立検証者（Verifier）による多角レビュー・成果統合（Fan-in）を実行するスキル。
---

# スキル：グラフエンジニアリング実行器 (graph-engineering) — AIカンパニー専用

このスキルは、「AI Team Builder（AIカンパニー）」における複雑な機能拡張（Phase 2 LangChain.js / RAG 導入等）やリファクタリングタスクを「グラフ構造（DAG）」に分解し、独立コンテキストでの並列処理、厳格な独立検証（Verifier）、および成果の統合（Synthesize）を実行する。

---

## 実行フェーズ

### Step 0: コンテキスト同期 ＆ 前提条件の自動確認

1. **セーブポイント作成**: 破壊的変更を伴う作業の前に、リポジトリのセーブポイント（バックアップ/ブランチ）を確認する。
2. **`codebase-memory-mcp` インデックス同期**:
   - `C-Users-bonob-Project-AI_Comany` に対して `detect_changes` または `index_repository` を呼び出し知識グラフを最新化する。
3. **MentisDB 過去知見の抽出**:
   - `mentisdb_search` / `mentisdb_ranked_search` で過去のGotcha、設計決定（Decision）、チェックポイント（Checkpoint）を取得して脳内に復元する。

---

### Phase 1: 依存関係グラフ（DAG）の構築と「偽のエッジ」排除

直列での試行錯誤を禁止し、タスク冒頭で以下の「ノード」と「エッジ」を定義する。

1. **入出力契約（Contract）の明示**: 各ノードの入力データ、前提条件、期待される成果物フォーマットを定義する。
2. **偽のエッジ（Fake Edges）の削除**: 互いに独立したタスク（例: UIデザイン調整 と Rust/Tauriバックエンドコマンド追加）は並列（Fan-out）ノードとして分離する。
3. **DAG構造の宣言**: 実行前に必ず以下のフォーマットで冒頭に `📊 [Graph Engineering & MCP Memory Active]` と構造図を掲示する：

```
📊 [Graph Engineering & MCP Memory Active]
[Task Input]
    ├── 🔵 Node A: React / LLMProvider リファクタリング (Contract: src/lib/llmProvider.ts インターフェース定義)
    ├── 🔵 Node B: SQLite スキーマ拡張 (Contract: src-tauri/migrations/ 対応)
    └── 🔵 Node C: PromptTemplate 分離 (Contract: src/lib/langchain/prompts.ts 作成)
[Verification Tier]
    ├── 🛡️ Verifier 1 (Contract & Spec Audit): 3層構造・4層マージ非破壊検証 (AGENTS.md 遵守)
    ├── 🛡️ Verifier 2 (Build & Test Execution): 機械的検証 (npx tsc --noEmit ; npm run build)
    └── 🛡️ Verifier 3 (Side-effect & Security Audit): APIキー分離・OS Keychain保存の検証
[Synthesize Tier]
    └── 🟣 Node Reduce: 成果物の競合解消・統合・全体動作確認
```

---

### Phase 2: 並列ノード（Fan-out）の実行

> 🤖 **並列実行ルール**: `use_subagents` を使用し、各ノードを独立サブエージェントとして起動して並列実行する。

- 各並列ノードは「隙間時間の5分でコミット・確認可能なサイズ」にマイクロタスク化して実行する。
- コード検索には `codebase-memory-mcp` (`search_graph`, `trace_path`, `get_code_snippet`) を優先使用する。

---

### Phase 3: 独立検証者（Verifier Nodes）による多角検証

> ⚠️ **自己チェック禁止原則**: 実装を担当したノード自身による単独チェックは禁止する。独立したコンテキストを持つ Verifier ノードで検証する。

1. **Verifier 1 (仕様適合・契約検証)**: 成果物が `docs/design/DESIGN_SPEC.md` および `AGENTS.md` の3層構造・4層マージ保護原則を満たしているか監査する。
2. **Verifier 2 (ビルド・型チェック実行)**: 以下を一括実行しパスを確認する。
   - コマンド: `npx tsc --noEmit ; npm run build`
3. **Verifier 3 (副作用・Gotchaスキャン)**: MentisDB の知見を参照し、APIキーの誤DB書き込みや状態管理不整合がないか横断チェックする。

*※いずれかの Verifier が失敗した場合、該当ノードのみに明確なエラー指示を与えて再実行（ノードローカルなリトライ）を行う。*

---

### Phase 4: 成果物統合（Synthesize / Reduce）

全 Verifier のパスを確認後、成果物をメインコードに統合する。

1. 最終確認ビルドの実行: `npx tsc --noEmit ; npm run build`
2. MentisDB への知見・検証成果の保存: `mentisdb_append` (thought_type="Insight", tags: `["graph-engineering", "verified-pattern", "AI_Company"]`)
3. ユーザーへ「日本語結論ファースト」で成果報告と学習資産を出力する。

---

## 留意事項

- **PowerShell互換**: コマンド連結時は必ずセミコロン `;` を使用すること（`&&` は古いPowerShellでエラーとなる）。
- **5分粒度ルール**: 巨大なタスクはグラフトップで細分化し、達成感を感じられるサイズに保つ。
- **手抜き表現禁止**: `// TODO` や `// ...` を一切排除し、完全なプロダクション品質コードを出力すること。

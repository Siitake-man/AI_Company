# Jules向け指示書 — 2026-07-20（AIカンパニー Phase 2a完了 ＆ 夜間機能拡張）

## 対象ブランチ・コミット
- ブランチ: `main`
- 直前のコミット: Phase 2a（LangChain.js導入 ＆ 生fetch完全撤廃 ＆ レビュー修正完了時点）

## 今回の作業サマリー

### Antigravity側で完了したこと（前提条件）
1. **LLM呼び出しの共通化（100%完了）**: `src/lib/llmProvider.ts` にて OpenAI/Gemini を LangChain.js 化、Anthropic を自前 fetch 化するハイブリッド構成を完了。
2. **全画面の生 fetch 撤廃**: `ChatScreen.tsx` と `MeetingScreen.tsx`（サマリー自動生成 `handleGenerateSummary()` を含む）のすべての直書き `fetch` を `callLLMWithHistory` / `callLLMWithPrompt` / `callLLMWithFallback` に置換完了。
3. **ドキュメント・型・レビュー完了**: レビュー報告書 (`review_results_phase2a.md`) および学習メモ (`学習メモ_20260720.md`) 作成済み。

---

## 依頼するタスク（夜間バッチ開発：4大タスク）

Julesは以下の4タスクを順番に実施し、各ステップごとにビルド（`npm run build`）が通ることを確認してください。

### タスク 1: Vite のバンドル分割設定（`vite.config.ts` の最適化）
- **背景**: LangChain.js 導入に伴い、単一 js ファイルのサイズが増大しています。
- **作業内容**:
  `vite.config.ts` の `build.rollupOptions.output.manualChunks` を設定し、LangChain 関連パッケージ（`@langchain/core`, `@langchain/openai`, `@langchain/google-genai`）を `vendor-langchain` チャンクとして分離してください。
- **対象ファイル**: `vite.config.ts`

### タスク 2: コンポーネント Props の `any[]` 型を厳格型へリファクタリング
- **背景**: 各コンポーネント（`ChatScreen.tsx`, `MeetingScreen.tsx`, `HomeScreen.tsx`, `TeamManageScreen.tsx` 等）で `projects: any[]` や `projectMembers: any[]` などの `any` が残存しています。
- **作業内容**:
  `src/lib/types/index.ts`（または適切な型定義ファイル）の型（例: `Project`, `ProjectMember` 等）をインポートし、Props の型定義を厳格に指定してください。
- **対象ファイル**:
  - `src/components/ChatScreen.tsx`
  - `src/components/MeetingScreen.tsx`
  - `src/components/HomeScreen.tsx`
  - `src/components/TeamManageScreen.tsx`

### タスク 3: Phase 2b（RAG / PromptTemplate）向け型定義とスタブファイルの作成
- **背景**: 次回の Phase 2b（LanceDB 導入および PromptTemplate 標準化）にスムーズに着手するための準備が必要です。
- **作業内容**:
  以下の2ファイルを新規作成し、必要な型インターフェースとエクスポート関数の雛形（スタブ）を定義してください。
  1. `src/lib/rag/types.ts`:
     - LanceDB に保存する `KnowledgeDocument` インターフェース（`id`, `project_id`, `source_type`, `content`, `metadata`, `vector` 等）を定義。
  2. `src/lib/langchain/prompts.ts`:
     - `@langchain/core/prompts` の `PromptTemplate` を使用し、会議発言用のユーザープロンプトテンプレート（`speakerPromptTemplate`）の基本定義を記述。
- **対象ファイル**:
  - `src/lib/rag/types.ts`（新規）
  - `src/lib/langchain/prompts.ts`（新規）

### タスク 4: UI 装飾・ホバーアニメーションのポリッシュ
- **背景**: レトロ・ピクセル＆ウッド調の質感（`DESIGN_SYSTEM.md`）に合わせた微妙な視覚的フィードバックを強化します。
- **作業内容**:
  `src/index.css` に以下のCSSクラスユーティリティを追加・調整してください。
  - `.btn-primary` や `.btn-secondary` に押下時のアニメーション `active:scale-95` または `transition-transform` を適用。
  - サイドバー領域（`.sidebar-wood`）のスクロールバーを木目調にマッチする細身のカスタムスクロールバー（`::-webkit-scrollbar`）に調整。
- **対象ファイル**: `src/index.css`

---

## 作業上の制約（必ず守ること）

- **3層構造（プロジェクト→部署→メンバー）および4層マージロジックは絶対に変更しない**
- `src-tauri/` 配下の Rust コードは一切変更しない（フロントエンド領域のみ）
- カラーコードを直接ハードコードせず、`index.css` の `--color-*` 変数を使用すること
- `@langchain/anthropic` パッケージは再インストール・使用しない（Tauri非互換のため）
- 各タスク完了ごとに `npm run build` を実行し、型エラーやビルドエラーがゼロであることを確認する

## 設計資料の参照先

- DESIGN_SYSTEM.md: `docs/design/DESIGN_SYSTEM.md`
- PHASE2_PLAN.md: `docs/design/PHASE2_PLAN.md`
- ROADMAP.md: `docs/design/ROADMAP.md`
- レビュー報告書: `docs/guides/review_results_phase2a.md`

## 完了条件と確認方法

- `npm run build` がエラーなく一発で通過すること
- `ChatScreen.tsx`, `MeetingScreen.tsx` 等で `any[]` の警告・定義が解消されていること
- `src/lib/rag/types.ts` および `src/lib/langchain/prompts.ts` が正常にエクスポートされていること
- 完了後、作業内容をまとめた引き継ぎメモ（`docs/jules-tasks/jules_handover_20260720.md`）を作成すること
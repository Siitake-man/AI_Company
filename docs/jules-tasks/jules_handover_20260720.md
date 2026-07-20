# 引き継ぎメモ (2026-07-20)

以下の4つのタスクを完了しました。

1. **Vite バンドル分割設定**: `vite.config.ts` にて `@langchain` パッケージ群を `vendor-langchain` として分割設定しました。
2. **Props 型の厳格化**: `src/lib/types/index.ts` を作成し、`ChatScreen.tsx`, `MeetingScreen.tsx`, `HomeScreen.tsx`, `TeamManageScreen.tsx` の `any[]` を `Project[]` または `ProjectMember[]` に置換しました。
3. **Phase 2b 用スタブ作成**: `src/lib/rag/types.ts` に `KnowledgeDocument` インターフェースを定義し、`src/lib/langchain/prompts.ts` に `speakerPromptTemplate` の雛形を作成しました。
4. **UI のポリッシュ**: `src/index.css` を編集し、`.btn-primary` と `.btn-secondary` に押下時アニメーション（`scale-95`）を追加、`.sidebar-wood` のスクロールバーを木目調に合わせて細く調整しました。

すべての変更後に `npm run build` が正常に通ることを確認しています。

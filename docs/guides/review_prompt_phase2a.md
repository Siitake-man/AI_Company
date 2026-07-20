# Antigravity（Gemini 3.5 Flash）へのレビュー依頼プロンプト — Phase 2a

以下のプロンプトをコピーして、Antigravity（Gemini 3.5 Flash）に貼り付けてください。

---

```
# レビュー依頼：AIカンパニー Phase 2a（LangChain.js導入）

## 依頼者
Antigravity（Cline）

## 作業概要
Phase 1 完了後の整理（9タスク）に続き、Phase 2a として LLM呼び出しの共通インターフェース（llmProvider.ts）の内部実装を LangChain.js に置き換えた。

## 変更ファイル一覧

### 新規作成
- `docs/guides/review_prompt_phase2a.md` — 本プロンプト

### 編集
- `src/lib/llmProvider.ts` — **内部実装をLangChain.jsに置き換え**（自前fetch → ChatOpenAI / ChatGoogleGenerativeAI）
- `src/components/ChatScreen.tsx` — LLM呼び出しを `callLLMWithHistory` に置き換え
- `src/components/MeetingScreen.tsx` — LLM呼び出しを `callLLMWithPrompt` に置き換え（APIキー解決も `resolveApiKey` に統一）
- `docs/design/PHASE2_PLAN.md` — v0.2 に更新（注釈追加）
- `docs/design/ROADMAP.md` — Phase 2 セクション追記

### 削除
- `src/lib/promptMerger_recovered.ts`
- `src/lib/langchain/dummy.md`, `src/lib/rag/dummy.md`
- `fix_comments.py`, `fix_comments_2.py`

### 移動
- 古いJules引き継ぎファイル6点を `docs/jules-tasks/archive/` へ

### パッケージ追加
```
@langchain/core@1.2.3
@langchain/openai@1.5.5
@langchain/google-genai@2.2.0
```
※ `@langchain/anthropic` は `node:fs/crypto` 依存のためTauriバンドルと非互換で断念。Anthropicは自前fetch維持。

## レビュー観点

### 1. アーキテクチャ
- `llmProvider.ts` の「OpenAI/GeminiはLangChain、Anthropicは自前fetch」というハイブリッド構成は妥当か？
- `callLLMWithPrompt` → `callLLMWithHistory` への委譲設計は適切か？
- 外部インターフェースを変えずに内部実装だけ差し替えるStrangler Figパターンが正しく機能しているか？

### 2. コード品質
- `llmProvider.ts` の型定義（`LLMResponse`, `ChatMessage`, `extractTokens`）は適切か？
- `toLangChainMessages` のメッセージ変換ロジックに漏れはないか？
- `callAnthropicWithFetch` のエラーハンドリングは十分か？
- `ChatScreen.tsx` と `MeetingScreen.tsx` の呼び出し置き換えに漏れはないか？（特に `handleGenerateSummary` 内のサマリーAPI呼び出しはまだ自前fetchのまま）

### 3. パフォーマンス
- バンドルサイズが 319KB → 1.2MB（gzip後 94KB → 319KB）に増加。これは許容範囲か？
- コード分割（`manualChunks`）の導入が必要か？
- LangChain.jsの初期化コスト（`new ChatOpenAI()` 等）が会議の応答速度に影響しないか？

### 4. セキュリティ
- APIキーをLangChainのコンストラクタに直接渡す方式で問題ないか？
- エラーメッセージにAPIキーが漏洩する可能性はないか？

### 5. ドキュメント
- `PHASE2_PLAN.md` v0.2 の内容は実際の実装と整合しているか？
- `ROADMAP.md` の更新は十分か？

## 特に気になっている点
1. **バンドルサイズ増加**: 1.2MBはTauriアプリとして重い。`manualChunks` でLangChain関連を分割すべきか？
2. **Anthropicの自前fetch残留**: ハイブリッド構成は避けられなかったが、メンテナンスコストが増える。将来的に `@langchain/anthropic` がTauri互換になる可能性はあるか？
3. **サマリー生成API**: `handleGenerateSummary()` 内のサマリー呼び出しはまだ自前fetchのまま。これも `llmProvider.ts` に統合すべきか？
4. **`any` 型の残存**: `extractTokens(response as any)` の `as any` は許容できるか？
```

---

## 補足
- レビュー結果を `docs/guides/review_results_phase2a.md` に保存してください。
- Leo（1.5 Pro）ではなく **Gemini 3.5 Flash** を選択してください。
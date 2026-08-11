# RAG基盤（最小実装）設計

## 今回の決定

- RAGデータの最小単位は、会議サマリー・メンバー学習・ユーザーノートのテキストチャンクとする。
- チャンク分割は外部サービスに依存しない決定的な文字数方式にする。
- 初期値は最大1,200文字、オーバーラップ200文字とする。後から埋め込みモデルに合わせて変更できる。
- `KnowledgeDocument` はベクトルを任意フィールドにし、チャンク生成と埋め込み・保存を分離する。
- ドキュメントIDは `source_type:source_id:chunk_index` で安定化し、再取り込み時に同一ソースを置き換えやすくする。

## 実装済みの境界

`src/lib/rag/chunker.ts` と `src/lib/rag/sqliteSources.ts` が以下を担当する。

1. 空白だけの入力を除外
2. テキストを決定的にチャンク化
3. プロジェクト・ソース種別・ソースID・メンバー/部署・ロールをメタデータへ引き継ぐ
4. SQLiteの `meeting_summaries` / `member_learnings` からプロジェクト単位でソースを取得する
5. ベクトルストアadapterが扱える `KnowledgeDocument[]` を返す

埋め込み生成とベクトル検索は、チャンク生成から独立したadapter境界として追加した。これにより、埋め込みモデルや保存先の選択がチャンク分割や既存4層マージを壊さない。

## 埋め込み・検索adapter（2026-08-11）

`src/lib/rag/embeddings.ts` は、実行時に渡されたAPIキーだけでOpenAI Embeddings APIを呼び出し、応答の入力順・ベクトル数・値を検証する。APIキーは `KnowledgeDocument` やDBへ保存しない。

`src/lib/rag/vectorStore.ts` は `KnowledgeVectorStore` 契約と、テスト・オフライン開発用の `InMemoryKnowledgeVectorStore` を提供する。検索は必ず `project_id` で絞り込み、コサイン類似度と `topK` / `minScore` を適用する。LanceDBは同じ契約を実装する次の永続化adapterとして追加する。

## 次の実装単位

1. LanceDB adapter（`KnowledgeVectorStore` の永続実装）
2. 会議保存後の取り込みhook
3. `getMergedSystemPrompt` への検索コンテキスト注入

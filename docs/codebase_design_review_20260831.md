# Codebase Design Review — Deep Modules

## 対象と語彙

`codebase-design` の語彙（Module / Interface / Implementation / Depth / Seam / Adapter / Leverage / Locality）で、AI Team Builderの主要なモジュールをレビューした。MCPグラフは`Transport closed`のため、実コード・テスト・設計文書から確認した。

## 評価

### 深いModuleとして機能している箇所

1. **`finalize_meeting` Rust command (`src-tauri/src/lib.rs`)**
   - Interfaceは`FinalizeMeetingRequest`一つ。Implementationは入力検証、meeting/member所属検証、重複防止、参加者・発言・summary・learningの一括transaction、commit/rollbackを隠蔽している。
   - 小さなInterfaceに大きな挙動があり、LeverageとLocalityが高い。4件のRustテストもこのInterfaceを直接検証している。
2. **`llmProvider` (`src/lib/llmProvider.ts`)**
   - OpenAI/GeminiのLangChain AdapterとAnthropic fetch Implementationを`callLLMWithHistory`へ集約し、UIはprovider差分を意識しない。
   - `LLMResponse`はエラー境界として有効。ただし`ok: boolean`は判別可能なliteral unionではなく、型の深さをさらに高められる。
3. **`InMemoryKnowledgeVectorStore` (`src/lib/rag/vectorStore.ts`)**
   - `KnowledgeVectorStore` Interfaceにupsert/delete/searchを閉じ込め、将来のLanceDB Adapterを差し替え可能にしている。role/department lensも同じseamで検証できる。

### 浅さ・seamの問題

1. **`meetingPersistence.ts` の二重Implementation**
   - `*ViaRust` Adapterと、任意SQLを受ける旧`createMeeting`/`closeMeeting`/`finalizeMeeting`が同居する。呼び出し側は二つのInterfaceを学ぶ必要があり、Shotgun Surgeryと契約ドリフトを招く。
   - 対応: Rust Adapterを唯一の外部Interfaceにし、旧Implementationはテスト専用の明示的fixture層へ隔離して削除する。
2. **`App.tsx` のオーケストレーション過多**
   - 初期seed、モデル同期、プロジェクト作成、プロフィール保存、画面ルーティング、各画面への巨大Propsを一つのModuleが担う。変更理由が多く、Localityが低い。
   - 対応: `ProjectCommandAdapter`、`ProfileCommandAdapter`、`AppBootstrap`、`ScreenRouter` の4つのseamへ分割し、Appは接続だけにする。Adapterは一つずつテスト可能にする。
3. **`promptMerger.ts` のSQLとドメイン規則の混在**
   - Interfaceは小さいが、5回のselect、所属関係、思考スタイル例外、学習履歴の保持方針を一つのImplementationが抱える。project/member所属検証がInterfaceの不変条件として明文化されていない。
   - 対応: `PromptContextReader` Adapter（読み取り）と`PromptComposer` Module（4層順序・例外・上限）を分離する。外部Interfaceは`buildPrompt(context)`に寄せ、DBを直接知らないテストを追加する。
4. **ChatScreen / TeamManageScreen の直接DB操作**
   - UIがSQL文字列、DBエラー、履歴整形を同時に扱い、Interfaceが実装詳細に近い。SQL権限削除の変更が複数画面へ波及する。
   - 対応: `ChatSessionAdapter` と `LearningHistoryReader` を作り、UIはユースケース結果だけ受け取る。

## 判定可能なInterfaceの提案

```text
UI
  └─ use-case Interface (createProject / sendChat / finalizeMeeting)
       ├─ typed Tauri command Adapter      ← 本番
       └─ in-memory/fake Adapter            ← テスト
              └─ SQLite Implementation（Rust内に限定）
```

このseamなら、SQLite schema・権限・トランザクションの変更はAdapterの内側に局所化され、UI側のLeverageと保守のLocalityが上がる。

## 優先アクション

1. `create_project`、chat session/message、core profileのtyped Tauri command Adapterを追加し、`sql:allow-execute`を削除できる状態にする。
2. `PromptContextReader` / `PromptComposer`を分け、project/member所属と学習履歴上限をInterfaceの不変条件にする。
3. `LLMResponse`を`{ ok: true; content: ... } | { ok: false; error: ... }`へ変更し、呼び出し側の判別をコンパイルで強制する。
4. `App.tsx`を削除テスト（何が消えるか）で評価し、初期化・コマンド・ルーティングの深いModuleへ段階分割する。

## 良好な点

- `finalize_meeting`は「削除したら複雑さが呼び出し側へ戻る」深いModuleになっている。
- `KnowledgeVectorStore`は一つの実装に閉じた仮想seamではなく、LanceDBという二つ目のAdapterを見越した明確な契約になっている。
- 型付きRust commandのエラーは秘密情報や生SQLを返さず、セキュリティ上のLocalityが保たれている。

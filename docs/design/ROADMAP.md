# ROADMAP.md
## AI Team Builder（AIカンパニー）Phase1 実装ロードマップ
Version 1.0 / 依存関係ベース（時間ベースではない）

---

## 0. 設計方針

- 本ロードマップは**時間見積もりではなく、依存関係（前工程が終わらないと次に進めない）で構成する**。
- 各ノードの完了自体が一つのチェックポイントであり、曜日・時間で区切らない。
- Phase 1は機能実装済みだが、2026-08-11のholistic reviewでS7割り込み・会議ログ永続化・S8学習確認などの仕様差分が判明し、品質是正タスクを追加した。Phase 2はPhase 2a（LangChain.js導入）・Phase 2b（PromptTemplate標準化）・SQLite Version 3整合化が完了。RAG基盤（SQLiteソースadapter・チャンク契約・埋め込み/検索adapter境界）は完了し、LanceDB統合は未着手。

レビュー所見のタスク一覧と依存関係は [REVIEW_ACTION_REGISTER_20260811.md](./REVIEW_ACTION_REGISTER_20260811.md) を正本とする。

---

## 1. 全体フロー（Mermaid）

```mermaid
flowchart TD
    A[DBスキーマ実装<br/>SQLiteテーブル作成] --> B[4層マージ<br/>システムプロンプト組み立てロジック]
    B --> C1[S1: 初回起動・APIキー設定]
    C1 --> C9[S9: 設定画面]
    B --> D2[S2: プロジェクト一覧]
    D2 --> D3[S3: プロジェクト作成]
    D3 --> D4[S4: チーム管理]
    D4 --> E5[S5: メンバーエディタ]
    D4 --> E6[S6: 1on1チャット]
    E5 --> F7A[会議モード選択]
    E5 --> F7[S7: 会議モード]
    F7 --> G8[S8: 議事録・サマリー]
    G8 --> H[Markdownエクスポート]
    C9 -.-> D2
    H --> I[Phase 1完了・社内発表]
    I -.-> J[Phase 2検討開始]
    style A fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style B fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style C1 fill:#86efac,stroke:#c8a96e  %% 完了カラー（セージグリーン）に変更
    style C9 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style D2 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style D3 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style D4 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style E5 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style E6 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style F7A fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style F7 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style G8 fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style H fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style I fill:#86efac,stroke:#c8a96e  %% 完了カラー
    style J fill:#fdf6e3,stroke:#c8a96e
    style D4 fill:#fef3c7,stroke:#c8a96e  %% review follow-up
    style E5 fill:#fef3c7,stroke:#c8a96e  %% review follow-up
    style G8 fill:#fef3c7,stroke:#c8a96e  %% review follow-up
    style I fill:#fef3c7,stroke:#c8a96e  %% review follow-up
```

---

## 2. ノードの意味と完了条件

| ノード | 内容 | 完了条件 |
|---|---|---|
| A | DBスキーマ実装 | ✅ 2026-07-13完了（全11テーブル自動生成確認済） |
| B | 4層マージロジック | ✅ 2026-07-13完了（テスト画面にて論理マージの正常動作実証済） |
| C1 | S1 初回起動・APIキー設定 | ✅ 2026-07-13完了（OSセキュアストレージによるキー保存とUI確認済） |
| C9 | S9 設定画面 | ✅ 2026-07-13完了（APIキー管理＋コアプロフィール編集機能の実装完了） |
| D2 | S2 プロジェクト一覧 | ✅ 2026-07-15完了（複数プロジェクトの作成・一覧表示実装済） |
| D3 | S3 プロジェクト作成 | ✅ 2026-07-15完了（目的・価値観の登録、コンテキスト編集機能の実装済） |
| D4 | S4 チーム管理 | ⚠️ メンバー一覧は表示可能。ただしメンバー追加ハンドラ、部署タブ、会議モード選択への導線が未完了 |
| E5 | S5 メンバーエディタ | ⚠️ 継承元表示は実装済み。成長日誌の手動追記・編集・削除は未完了 |
| E6 | S6 1on1チャット | ✅ 2026-07-16完了（Jules導入のセッション化に伴うDBマイグレーション漏れ修正と開通確認完了） |
| F7A | 会議モード選択 | ✅ 2026-07-16完了（HomeScreenからの起動、探索/収束選択とMeetingScreenへの遷移確認済） |
| F7 | S7 会議モード | ✅ 2026-08-31完了（ラウンドロビン、10秒強調後も有効な割り込み、pause/resume凍結、同一対象3回上限、割り込みログ確定保存を実装。Tauri実機GUI E2Eは残件） |
| G8 | S8 議事録・サマリー | ✅ 2026-08-16完了（構造化JSON契約、実会議IDのログ/参加者保存、ユーザー確定決定事項の学習経路、単一トランザクションのrollbackを実装。Tauri実機E2Eは残件） |
| H | Markdownエクスポート | ✅ 2026-07-16完了（tauri-plugin-fs / dialogを利用して実装済） |
| I | Phase 1完了・社内発表 | ⚠️ 機能実装済み。ただしholistic reviewでP0/P1の品質・仕様差分を検出。是正完了後に正式完了とする |
| J | Phase 2検討開始 | ✅ 2026-07-20完了（PHASE2_PLAN.md作成、Phase 2a着手） |

---

## 3. 実装時の注意（AI_RULES.mdとの連携）

- 各ノードの実装が完了するごとに、`/docs/design`配下の関連ドキュメント（DESIGN_SPEC.md / DATA_SCHEMA.md）と実装内容に差分がないか確認する。
- ノードBは特に重要。ここで4層マージのロジックが崩れると、D以降の全画面に影響するため、UIより先に単体で動作確認すること。
- 依存関係の矢印（→）は「前工程が完了しないと着手できない」ことを意味する。点線（-.->）は緩やかな前提関係であり、厳密なブロッキングではない。

---

## 4. 更新履歴

| 日付 | 変更者 | 内容 |
|---|---|---|
| 2026-07-13 | Antigravity | ノードA（DBスキーマ実装）の完了に伴いステータスを更新。 |
| 2026-07-13 | Antigravity | ノードB（4層マージロジック）の完了に伴いステータスを更新。 |
| 2026-07-13 | Antigravity | ノードC1（S1: 初回起動・APIキー設定）の完了に伴いステータスを更新。 |
| 2026-07-13 | Antigravity | ノードC9（S9: 設定画面）の完了に伴いステータスを更新。 |
| 2026-07-15 | Antigravity | ノードD2, D3, D4 の実装完了。検索API(Tavily/Brave)フォールバック設計の追加を各設計書へ反映。 |
| 2026-07-15 | Antigravity | ノードE5（S5: メンバーエディタ）の実装完了。継承元（プロジェクト/部署）表示と、成長日誌（自動学習履歴）機能を追加。 |
| 2026-07-16 | Antigravity | 1on1チャット(E6)のDBセッションスキーマ不整合を修正し、会議モード選択モーダル(F7A)を実装完了。消失した4画面をコンポーネント分割で復元。 |
| 2026-07-16 | Jules | S1〜S8の全画面UIを「かわいい手帳風」にリデザイン。S8（議事録・サマリー）画面を新規作成し、Markdownエクスポート機能を実装。会議モードのAPIキーガード強化。Phase 1完了。 |
| 2026-07-18 | Antigravity | 設定画面(S9)の2ペイン化およびタブ統合。Tauri v2の厳格なパーミッション（dialog/fs）不足によるAPIキーテスト・サマリー保存機能の不具合を解消。グローバルSKILL（コンテキスト自動生成）を作成。 |
| 2026-07-20 | Antigravity | Phase 2 設計書（PHASE2_PLAN.md）作成。LLM呼び出しを `src/lib/llmProvider.ts` に共通化。古いJules引き継ぎファイルをarchive化。 |
| 2026-08-11 | Codex | Phase 2a・Phase 2b（PromptTemplate）完了、RAG未着手の実装状況を同期。 |
| 2026-08-11 | Codex | SQLite Version 3整合化マイグレーションを実装。起動時DDLを削除し、データコピー・ロールバックfixtureで検証。 |
| 2026-08-11 | Codex | RAGの埋め込みプロバイダー契約・OpenAI adapter・プロジェクト単位のベクトル検索契約（インメモリ実装付き）を追加。 |
| 2026-08-11 | Codex | Holistic reviewを反映。会議ID/FK不整合をP0として修正し、S7割り込み、会議ログ永続化、ユーザー確認付き学習、CSP/権限、LLMエラー処理、UI SSoT逸脱を是正タスクへ登録。 |
| 2026-08-11 | Codex | セッション終了時点の引き継ぎを確定。P0修正・設計同期・検証成功を記録し、次回はS8確定事項入力/会議ログ永続化から再開する。 |
| 2026-08-16 | Codex | 会議終了時のparticipants/messages/structured summary/confirmed decisionsを単一トランザクションで保存し、失敗時rollback・二重保存防止・実会議ID・UI/DBモード正規化を確認。LLMの構造化JSONからdecisionsを分離し、UIはAI提言とユーザー決定事項を分離した。 |
| 2026-08-16 | Codex | DESIGN_SYSTEM準拠のCSS変数、800×600折りたたみ/1100px以上3ペイン、focus/status/reduced-motion、ローカルnoise SVGを同期。Tauri実機GUIでのDB保存前後E2Eは未実施。 |


## Phase 2（来月以降・優先順位順）

1. **品質是正 P0: 会議ID/FK経路**: ✅ 2026-08-11完了。会議開始時に親行を作成し、実ID確定後に発言を開始する。DB実機回帰テストは追加タスク
2. **品質是正 P1: 会議ログ・S7・S8学習・構造化議事録**: S8構造化JSON、会議ログ/参加者永続化、ユーザー確認済み学習は ✅ 2026-08-16。S7割り込み状態機械は ✅ 2026-08-31。詳細は `REVIEW_ACTION_REGISTER_20260811.md`
3. **品質是正 P1: CSP/Capabilities・LLMエラー構造化・UI SSoT**: UI SSoTは ✅ 2026-08-16。CSP/CapabilitiesのCSP・fs/dialog境界とLLMエラー構造化は ✅ 2026-08-31。会議作成・利用量ログ・終了・S8 `finalize_meeting`・プロジェクト設定更新・モデル設定更新・メンバー更新/統計リセットは固定SQL・型付きRustコマンドへ移行済みで、残りのfrontend `execute` と `sql:allow-execute` の撤去を継続する
4. **LangChain.js 導入（Phase 2a）: 完了**。`@langchain/core` + `@langchain/openai` + `@langchain/google-genai` を導入し、`src/lib/llmProvider.ts` に統一。Anthropicは自前fetchを維持
5. **PromptTemplate 標準化（Phase 2b）: 完了**。`src/lib/langchain/prompts.ts` のテンプレートを会議発言生成へ統合し、回帰テストを追加
6. **SQLite Version 3整合化: 完了（2026-08-11）**。`users.summary_model` をマイグレーションへ移し、運用テーブルを再構築して外部キーを保証
7. **RAG基盤（SQLiteソースadapter・チャンク・埋め込み/検索adapter契約）: 完了（2026-08-11）**。LanceDBは未導入
8. **LanceDB adapter + 会議保存時 自動チャンク化パイプライン**: 議事録保存 → チャンク分割 → 埋め込み → LanceDB登録。S8契約の次段階として未着手
9. **検索→コンテキスト注入の統合**: 4層マージの第2層（プロジェクト価値観）の後にRAG結果を動的に注入
10. **コアプロフィールの本格作り込み**: 他AIからの情報抽出プロンプト付きUI
11. **ワークフロー型会議（Phase 2c）**: `RunnableSequence` による発言生成チェーン
12. **以降**: 会議モードの途中切り替え / 非同期会議 / ローカルLLM / MCPサーバー化

詳細は `docs/design/PHASE2_PLAN.md` を参照。

## 次のDAG

品質是正の次の依存順は、**CSP/CapabilitiesのSQL境界 → LanceDB** とする。CSP文字列とfs/dialog境界、構造化LLMエラー境界、S7割り込み状態機械は ✅ 2026-08-31完了。

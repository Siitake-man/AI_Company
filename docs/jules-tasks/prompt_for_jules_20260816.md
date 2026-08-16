# Jules引き継ぎ指示書 — 2026-08-16

## 目的

次回は、会議の割り込み制御とセキュリティ境界を、既存のS8会議終了・議事録・ユーザー確定decision契約を壊さずに実装する。作業開始前に `AGENTS.md` と `docs/design/` の正本（DESIGN_SPEC、DATA_SCHEMA、DESIGN_SYSTEM、AI_RULES、ROADMAP）を読むこと。

## 次のDAGと所有範囲

### 1. S7割り込み状態機械

- 対象候補: `src/components/MeetingScreen.tsx`、会議状態/生成ロジックの既存ファイル、必要なテスト。
- 割り込みの受付、強調表示10秒、連鎖上限3、一時停止・再開を明示的な状態遷移として定義する。
- 会議ログの実meeting ID、実member ID、round、message type、interrupt count、ISO時刻を維持する。
- `finalizeMeeting` の保存順序、二重保存防止、ROLLBACK、空decision=learning 0件を変更しない。

### 2. CSP / Capabilities

- 対象候補: `src-tauri/tauri.conf.json`、`src-tauri/capabilities/`、関連Rustコマンドとテスト。
- APIキーはSQLiteへ保存せず、OS secure storageのみを使用する。
- 既存のTauri権限を最小権限で見直し、許可範囲と拒否時のUIエラーを確認する。

### 3. 構造化LLMエラー境界

- 対象候補: `src/lib/llmProvider.ts`、`src/lib/meetingSummary.ts`、関連テスト。
- LLM出力はJSON契約を通過したデータだけを保存可能にする。不正JSON、Markdown全文、必須型不一致、未知の`decisions`生成はエラーとして扱う。
- 既存のAI提言とユーザーdecisionの分離を維持し、AI提言から自動的にlearningを作らない。

### 4. LanceDB

- S8保存後のチャンク化・埋め込み・検索adapter境界を設計してから実装する。
- まずSQLiteソースadapter、チャンク契約、埋め込み/検索契約を再利用し、4層マージの意味を変更しない。

## 絶対制約

1. `プロジェクト → 部署 → メンバー` の3層構造を変更・簡略化しない。
2. `コアプロフィール → プロジェクト価値観 → 部署性質 → 個人人格` の4層マージを変更・短絡しない。
3. APIキーをSQLite、ログ、議事録、MentisDBへ保存しない。既存のsecure storage契約を使う。
4. `MeetingScreen` はドラフト生成、`SummaryScreen` はAI提言とユーザーdecision編集、`finalizeMeeting` は明示確定保存という責務分離を維持する。
5. 既存のユーザー変更を巻き戻さない。コミット・push・リリースは依頼者の明示承認なしに行わない。

## Acceptance tests

- 割り込み状態遷移（受付、10秒強調、連鎖上限3、停止/再開）を単体テストで確認する。
- 既存の会議保存テストを含む全テストが通る。保存成功、空decision、複数decision、二重保存、各保存段階の失敗時ROLLBACKを含む。
- 一時SQLiteで `PRAGMA foreign_key_check` が空であることを確認する。
- `cmd /c npm test`、`cmd /c npm run build`、`cmd /c cargo check`（`src-tauri`）、`cmd /c git diff --check` を実行する。
- CSP/Capabilities拒否時に秘密情報が表示されず、APIキーがDBに存在しないことを確認する。
- 構造化LLMの不正JSON、Markdown、未知フィールド、`decisions`混入を拒否する。
- 800×600と1280×800で横スクロールなし、キーボード操作、可視フォーカス、reduced-motion、保存前後の実DB状態一致を確認する。

## Rollback

- 実装前に対象DBをコピーし、スキーマ/データのbefore hashを記録する。
- DB変更は既存migrationパターンに従い、途中失敗時はトランザクションROLLBACKする。`CREATE TABLE IF NOT EXISTS`だけで既存スキーマを更新しない。
- UI変更で契約テストが壊れた場合は、原因ノードの所有範囲だけを戻し、他ノードの変更を巻き戻さない。
- 検証失敗時は修正を原因ノードへ差し戻し、再検証する。コミット・pushは承認を得るまで保留する。

## Report形式

日本語で次を報告する。

1. 変更ファイルと各ファイルの責務。
2. 3層/4層マージ、APIキー保護、会議ID/FK、AI提言とdecision分離への影響。
3. 実行したコマンドと結果（PASS/FAIL、件数、失敗原因）。
4. DBコピー、before/after hash、foreign_key_check、ROLLBACK検証結果。
5. UI検証サイズ、キーボード経路、focus/status/reduced-motion結果。
6. 未解決事項、リスク、推奨する次のDAG。

# Jules引き継ぎ指示 — 2026-08-11

## 目的

Holistic reviewで発見したPhase 1の永続化・状態機械・セキュリティ境界の未完了部分を、設計書と矛盾しない形で是正する。今回の作業ツリーにはCodexの未コミット変更があるため、既存差分を確認し、他の変更を巻き戻さないこと。

## 現在の実装状態

- SQLite Version 3マイグレーションは実装済み。`users.summary_model` の正式化と、`member_learnings` / `api_usage_logs` のFK付き再構築を行っている。
- `src/components/MeetingScreen.tsx` は会議開始時に `meetings` 親行を作り、実IDを利用量ログへ渡す。`meeting_id=999` の仮IDは使用しない。
- `src/lib/meetingPersistence.ts` と契約テストが追加済み。AI生成の決定事項をユーザー確認前に `member_learnings` へ自動登録する経路は停止済み。
- RAGのSQLiteソース、チャンク、埋め込み・検索adapter契約は実装済み。LanceDB、会議保存hook、検索コンテキスト注入は未着手。

## 優先タスク

1. **会議ログ・参加者の永続化（P1）**
   - 通常発言、ユーザー割り込み、AI発言を `meeting_messages` へ保存する。
   - 会議開始時の参加者を `meeting_participants` へ保存する。
   - 親行作成 → 実ID確定 → 子行保存の順序を守り、サマリー保存と整合する契約テストを追加する。
2. **S8のユーザー確認済み決定事項（P1）**
   - AIの提言とユーザーの最終判断をUI上で分離する。
   - `meeting_summaries.decisions` は構造化JSONで保存し、空欄は空配列で保持する。
   - ユーザーが確認して保存した決定事項だけを `member_learnings` へ登録する。
3. **S7割り込み状態機械（P1）**
   - 発言中／割り込み受付中／一時停止中の状態を明示する。
   - 10秒強調ウィンドウと連鎖上限3を実装し、`interrupt_chain_count` を保存・検証する。
4. **Tauriセキュリティ境界（P1）**
   - `csp: null` を廃止し、実際に使用する接続先だけを許可する。
   - `capabilities/default.json` のSQL/fs権限を最小化し、再帰的なホーム領域書込みや無制限SQLを許可しない。
5. **LLM結果境界（P1）**
   - 成功値と失敗値を構造化Result型で分離する。
   - APIエラー文字列を会議ログ・学習データの本文として保存しない。

## 絶対制約

- プロジェクト → 部署 → メンバーの3層構造と、コアプロフィール → プロジェクト価値観 → 部署性質 → 個人人格の4層マージを変更・簡略化しない。
- APIキーはSQLiteへ保存しない。Tauri secure storageの境界を維持する。
- UIの色・フォント・共通ボタンは `docs/design/DESIGN_SYSTEM.md` をSSoTとして扱い、カラーコードを新規ハードコードしない。
- SQLiteのFKを無効化する、仮IDを復活させる、エラー文字列を成功コンテンツとして扱う実装は禁止。

## 検証基準

```powershell
npm test
npm run build
cargo check
```

加えて、会議親行と子行の保存順、`foreign_key_check`、ユーザー未確認の決定事項が `member_learnings` に入らないことを自動テストで確認する。完了時は `docs/design/REVIEW_ACTION_REGISTER_20260811.md`、`ROADMAP.md`、学習メモの更新履歴を同期する。

## 5分で始める手順

1. `docs/design/DESIGN_SPEC.md` §6.3 と `docs/design/DATA_SCHEMA.md` §2〜3を読む。
2. `MeetingScreen.tsx` の発言・割り込み・サマリー保存箇所を確認する。
3. `meetingPersistence` の契約テストを拡張し、`meeting_messages` / `meeting_participants` の実DBfixtureを1本追加する。

参照: `docs/code_review_report_20260811.md`、`docs/design/REVIEW_ACTION_REGISTER_20260811.md`

# SQLite Version 3 マイグレーション設計

## 目的

Version 2で作成された運用テーブルは、既存DBに同名テーブルがある場合に
`CREATE TABLE IF NOT EXISTS` が何も変更しないため、外部キー定義が欠落する
可能性がある。また `users.summary_model` はアプリ起動時の一時的な
`ALTER TABLE` に依存していた。Version 3ではDDLをマイグレーションへ集約し、
データを保持したままスキーマを正規化する。

## 対象

| テーブル | 変更 |
|---|---|
| `users` | `summary_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash'` を正式化 |
| `member_learnings` | `members`（CASCADE）と `meetings`（SET NULL）へのFKを保証 |
| `api_usage_logs` | `members`（CASCADE）、`chat_sessions`/`meetings`（SET NULL）へのFKを保証 |

## データコピー手順

1. 対象テーブルごとに `__v3` 一時テーブルを、確定したDDLで作成する。
2. 既存テーブルから主キーを含む全列を `INSERT ... SELECT` でコピーする。
3. コピーに成功した後、旧テーブルを削除し、一時テーブルを元の名前へ変更する。
4. `id` を明示的にコピーするため、既存の参照IDと履歴を維持する。

`users` はVersion 1の4列をコピーし、`summary_model` は既定値を適用する。
これにより、ランタイムDDLが一度も実行されていない旧DBでも同じ手順で移行できる。
移行後は起動時にDDLを実行しない。

## ロールバックと安全性

Tauri SQLプラグインはSQLxのマイグレーション単位をトランザクションで実行する。
SQLファイルに `BEGIN` / `COMMIT` を書かず、コピー・制約検査・リネームのいずれかが
失敗した場合はトランザクション全体を自動ロールバックする。特に、孤立した
`member_id` / `meeting_id` / `session_id` が存在するDBでは、新しいFK付きテーブルへの
コピーが失敗し、Version 2のテーブルとデータがそのまま残る。

本番DBへ適用する前に、アプリのSQLiteファイルをバックアップする。復旧時は
バックアップファイルを元の場所へ戻し、アプリを再起動する。Version 3が失敗した
状態で一時テーブルだけが残ることはない（トランザクションで破棄される）。

## 検証項目

- Version 1→2→3の新規DBで全テーブルが作成される。
- Version 2の既存データが各テーブルで件数・主キーとも一致する。
- `PRAGMA table_info(users)` に `summary_model` が存在する。
- `PRAGMA foreign_key_list(member_learnings)` と `api_usage_logs` が設計どおりである。
- `PRAGMA foreign_key_check` が空結果になる。
- 孤立参照を含むfixtureでは移行が失敗し、旧テーブル・データが保持される。


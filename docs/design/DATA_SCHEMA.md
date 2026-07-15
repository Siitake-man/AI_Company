# DATA_SCHEMA.md
## AI Team Builder（AIカンパニー）データベース設計書
Version 1.0 / SQLite（ローカルDB）

---

## 0. 設計方針

- 本DBは **Phase 1** の範囲のみを対象とする。RAG（ベクトルDB）は完全に別技術であり、Phase 2で別途設計する。ここでは触れない。
- 3層構造（プロジェクト→部署→メンバー）＋4層マージ（コアプロフィール→プロジェクト価値観→部署性質→個人人格）を素直にテーブル化する。
- 割り込み発言は `meeting_messages` に混在させ、`message_type` カラムで区別する（別テーブル分割はしない）。
- APIキーは本DBに保存しない（Tauri secure storageで別管理）。

---

## 1. 基幹4層構造系テーブル

### 1.1 users（ユーザーコアプロフィール）
ローカルツールのため基本1レコードのみ。

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    core_profile TEXT,           -- 「AI社員が知っておくべきこと」自由記述
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### 1.2 projects（プロジェクト）

```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,          -- 例: "NPO-Trust"
    purpose TEXT,                -- プロジェクトの目的
    "values" TEXT,               -- 判断軸・価値観（※SQLite予約語衝突回避のため二重引用符必須）
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### 1.3 departments（部署）

```sql
CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,               -- 例: "法務部"
    department_prompt TEXT,           -- 専門分野ごとの視点・思考の癖（パターンB継承の核）
    display_order INTEGER,
    is_thinking_style BOOLEAN DEFAULT 0,  -- 1なら「思考スタイル」枠（部署性質を継承しない）
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### 1.4 members（AI社員）

```sql
CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL,
    name TEXT NOT NULL,               -- 例: "契約担当"
    role TEXT,                        -- 役割・専門領域
    personality_prompt TEXT,          -- 個人人格（4層マージの最内層）
    avatar_id TEXT,
    ai_model TEXT,                    -- 例: "gpt-4o", "claude-sonnet-5"
    is_thinking_style_member BOOLEAN DEFAULT 0, -- ドリーマー/悪魔の代弁者等
    is_active_in_meeting BOOLEAN DEFAULT 1,     -- 会議ごとのON/OFF切替
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);
```

> **4層マージ＋学習履歴の最終形（コード側で組み立てる論理式）**
> `system_prompt = users.core_profile + projects.values + departments.department_prompt + members.personality_prompt + (member_learnings から取得した決定事項ルール)`

### 1.5 member_learnings（メンバーごとの自動学習・決定事項履歴）

```sql
CREATE TABLE member_learnings (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL,
    meeting_id INTEGER,               -- どの会議で決定されたか（NULL=手動追記・その他）
    content TEXT NOT NULL,            -- 学習した決定事項・ルール
    created_at TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
);
```

---

## 2. 会議・チャット系テーブル

### 2.1 meetings（会議）

```sql
CREATE TABLE meetings (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    mode TEXT NOT NULL,               -- '探索' or '収束'
    status TEXT NOT NULL,             -- '進行中' or '終了'
    started_at TEXT,
    ended_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### 2.2 meeting_participants（会議参加メンバー）

```sql
CREATE TABLE meeting_participants (
    id INTEGER PRIMARY KEY,
    meeting_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (member_id) REFERENCES members(id)
);
```

### 2.3 meeting_messages（会議中の発言ログ／割り込み混在）

```sql
CREATE TABLE meeting_messages (
    id INTEGER PRIMARY KEY,
    meeting_id INTEGER NOT NULL,
    round_number INTEGER,             -- ラウンドロビンの周回数
    member_id INTEGER,                -- NULL = ユーザー割り込み発言
    message_type TEXT NOT NULL,       -- '通常発言' / 'ユーザー割り込み' / '割り込みへの応答'
    content TEXT NOT NULL,
    interrupt_chain_count INTEGER DEFAULT 0,  -- 連続割り込み回数（上限3のカウント用）
    created_at TEXT NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (member_id) REFERENCES members(id)
);
```

### 2.4 chat_sessions（1on1チャットのセッション）

```sql
CREATE TABLE chat_sessions (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id)
);
```

### 2.5 chat_messages（1on1チャットの発言ログ）

```sql
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL,
    sender TEXT NOT NULL,             -- 'user' or 'member'
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
```

---

## 3. 議事録系テーブル

### 3.1 meeting_summaries（議事録・サマリー）

```sql
CREATE TABLE meeting_summaries (
    id INTEGER PRIMARY KEY,
    meeting_id INTEGER NOT NULL,
    mode TEXT NOT NULL,                    -- '探索' or '収束'
    issues TEXT,                           -- JSON配列：論点一覧
    pro_con_table TEXT,                    -- JSON：メンバー別PRO/CON
    facts TEXT,                            -- JSON：事実ベース材料
    open_concerns TEXT,                    -- JSON：残された懸念
    ai_recommendation TEXT,                -- 収束モード限定：AI社員一同の提言
    member_agreement_levels TEXT,          -- JSON：収束モード限定：納得度
    decisions TEXT,                        -- ユーザーが後から埋める（初期は空）
    next_actions TEXT,                     -- JSON配列：担当者・期限
    exported_markdown_path TEXT,           -- エクスポート済みファイルパス
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
);
```

---

## 4. 設定系テーブル

### 4.1 app_settings（アプリ全体設定）

```sql
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY,
    default_ai_model TEXT,                 -- 例: "gpt-4o"
    desktop_notification BOOLEAN DEFAULT 1,
    auto_save_meeting_log BOOLEAN DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

> **APIキーについての注意**
> APIキーはこのテーブルには保存しない。Tauriのsecure storage（macOS: Keychain / Windows: DPAPI / Linux: Secret Service）で別管理する。DB内にプロバイダーの接続状態すら残さない設計とし、平文流出のリスクをゼロに近づける。

---

## 5. テーブル一覧（全11テーブル）

| # | テーブル名 | 役割 |
|---|---|---|
| 1 | users | ユーザーのコアプロフィール |
| 2 | projects | プロジェクトの価値観・目的 |
| 3 | departments | 部署の性質（パターンB継承） |
| 4 | members | AI社員個人の人格・役割 |
| 5 | meetings | 会議のメタ情報（モード・状態） |
| 6 | meeting_participants | 会議参加メンバーの紐付け |
| 7 | meeting_messages | 発言ログ（通常＋割り込み混在） |
| 8 | chat_sessions | 1on1チャットのセッション |
| 9 | chat_messages | 1on1チャットの発言ログ |
| 10 | meeting_summaries | 議事録・サマリー（2モード対応） |
| 11 | app_settings | アプリ全体の初期設定 |

---

## 6. Phase 2への申し送り（今は着手しない）

- RAG用のベクトルDBは本SQLiteとは別技術のため、ここでは設計しない。Phase 2でChroma/LanceDB/Qdrant等を選定し、SQLite側には「どの知識ベースがどのプロジェクトに紐づくか」程度の参照カラムのみ追加する想定。
- 知識ベースはプロジェクト単位で共有し、部署・役割ごとに"同じ倉庫を違うレンズで読む"設計とする（RAG検索クエリに役割コンテキストを含める）。
- 価値観蓄積・学習ログ（ユーザーが決断理由を聞かれて学習する機能）も未設計。マーケティング系（陳腐化しにくい）とセキュリティ系（鮮度重視）でログの持ち方を分ける方針だけメモしておく。

---

## 7. 更新履歴

| 日付 | 変更者 | 内容 |
|---|---|---|
| 2026-07-13 | Antigravity | projectsテーブルの values カラムについて、SQLiteの予約語衝突エラーを回避するため二重引用符（"values"）を使用する旨を追記。 |

-- SQLite Version 3 schema integrity migration.
--
-- This migration is intentionally rebuild-based. SQLite cannot add or alter
-- foreign-key clauses on an existing table, and the Version 2 CREATE TABLE
-- statements may have been skipped when a table had already been created by
-- an older runtime initializer.
--
-- tauri-plugin-sql/sqlx runs each migration in a transaction. Do not add an
-- explicit BEGIN/COMMIT here: any failed copy or constraint check must abort
-- the whole migration and leave the Version 2 schema untouched.

-- users: move the runtime-only summary_model ALTER into the schema source of truth.
-- Copy only Version 1 columns so this works for databases both with and
-- without the old runtime-added summary_model column. Existing values from
-- that runtime-only column are not relied on; the documented default is used.
CREATE TABLE users__v3 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    core_profile TEXT,
    summary_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO users__v3 (id, core_profile, created_at, updated_at)
SELECT id, core_profile, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users__v3 RENAME TO users;

-- member_learnings: recreate the table so the member and meeting foreign keys
-- are enforced even when Version 2 found a legacy table and skipped CREATE.
CREATE TABLE member_learnings__v3 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    meeting_id INTEGER,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
);

INSERT INTO member_learnings__v3 (id, member_id, meeting_id, content, created_at)
SELECT id, member_id, meeting_id, content, created_at
FROM member_learnings;

DROP TABLE member_learnings;
ALTER TABLE member_learnings__v3 RENAME TO member_learnings;

-- api_usage_logs: recreate the table so all telemetry relationships are
-- enforced while preserving nullable session/meeting references.
CREATE TABLE api_usage_logs__v3 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    session_id INTEGER,
    meeting_id INTEGER,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
);

INSERT INTO api_usage_logs__v3 (
    id,
    member_id,
    session_id,
    meeting_id,
    provider,
    model_id,
    prompt_tokens,
    completion_tokens,
    cost_usd,
    created_at
)
SELECT
    id,
    member_id,
    session_id,
    meeting_id,
    provider,
    model_id,
    prompt_tokens,
    completion_tokens,
    cost_usd,
    created_at
FROM api_usage_logs;

DROP TABLE api_usage_logs;
ALTER TABLE api_usage_logs__v3 RENAME TO api_usage_logs;


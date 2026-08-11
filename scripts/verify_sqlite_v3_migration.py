"""Smoke-test the Version 3 SQLite migration without requiring the Tauri runtime."""

from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "src-tauri" / "migrations"


def read_migration(name: str) -> str:
    return (MIGRATIONS / name).read_text(encoding="utf-8")


def apply_transaction(conn: sqlite3.Connection, sql: str) -> None:
    """Mirror SQLx's all-or-nothing migration boundary for this smoke test."""
    try:
        conn.executescript(f"BEGIN;\n{sql}\nCOMMIT;")
    except Exception:
        conn.rollback()
        raise


def create_v2_fixture() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(read_migration("init.sql"))
    conn.executescript(read_migration("phase2_operational.sql"))
    now = "2026-08-11T00:00:00Z"
    conn.execute(
        "INSERT INTO users (id, core_profile, created_at, updated_at) VALUES (1, ?, ?, ?)",
        ("profile", now, now),
    )
    conn.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (1, 'fixture', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO departments (id, project_id, name, created_at, updated_at) VALUES (1, 1, 'dept', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO members (id, department_id, name, created_at, updated_at) VALUES (1, 1, 'member', ?, ?)",
        (now, now),
    )
    conn.execute(
        "INSERT INTO meetings (id, project_id, mode, status) VALUES (1, 1, '探索', '終了')"
    )
    conn.execute(
        "INSERT INTO chat_sessions (id, member_id, started_at) VALUES (1, 1, ?)",
        (now,),
    )
    conn.execute(
        "INSERT INTO member_learnings (id, member_id, meeting_id, content, created_at) VALUES (1, 1, 1, 'rule', ?)",
        (now,),
    )
    conn.execute(
        "INSERT INTO api_usage_logs (id, member_id, session_id, meeting_id, provider, model_id, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES (1, 1, 1, 1, 'Gemini', 'gemini-2.5-flash', 1, 2, 0.01, ?)",
        (now,),
    )
    conn.commit()
    return conn


def assert_successful_migration() -> None:
    conn = create_v2_fixture()
    # Simulate the old runtime ALTER having run before Version 3.
    conn.execute("ALTER TABLE users ADD COLUMN summary_model TEXT DEFAULT 'gemini-2.5-flash'")
    conn.execute("UPDATE users SET summary_model = 'gpt-4o'")
    conn.commit()

    apply_transaction(conn, read_migration("schema_v3_integrity.sql"))

    users = conn.execute(
        "SELECT id, core_profile, summary_model FROM users"
    ).fetchall()
    assert users == [(1, "profile", "gemini-2.5-flash")]
    assert conn.execute("SELECT COUNT(*) FROM member_learnings").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM api_usage_logs").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert len(conn.execute("PRAGMA foreign_key_list(member_learnings)").fetchall()) == 2
    assert len(conn.execute("PRAGMA foreign_key_list(api_usage_logs)").fetchall()) == 3
    conn.close()


def assert_failed_migration_rolls_back() -> None:
    conn = create_v2_fixture()
    # Create an orphan that a legacy table without enforced FKs could contain.
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        "INSERT INTO member_learnings (id, member_id, content, created_at) VALUES (99, 999, 'orphan', 'now')"
    )
    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        apply_transaction(conn, read_migration("schema_v3_integrity.sql"))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("orphan fixture should make Version 3 fail")

    # The transaction must restore the Version 2 schema and rows.
    columns = [row[1] for row in conn.execute("PRAGMA table_info(users)")]
    assert "summary_model" not in columns
    assert conn.execute("SELECT COUNT(*) FROM member_learnings").fetchone()[0] == 2
    assert conn.execute("SELECT name FROM sqlite_master WHERE name = 'member_learnings__v3'").fetchone() is None
    conn.close()


if __name__ == "__main__":
    assert_successful_migration()
    assert_failed_migration_rolls_back()
    print("SQLite Version 3 migration smoke tests passed")


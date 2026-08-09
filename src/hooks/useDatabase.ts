import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";

export interface UseDatabaseReturn {
  dbInstance: Database | null;
  loading: boolean;
  initError: string;
}

export function useDatabase(): UseDatabaseReturn {
  const [dbInstance, setDbInstance] = useState<Database | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [initError, setInitError] = useState<string>("");

  useEffect(() => {
    async function initApp() {
      try {
        setLoading(true);
        // 1. データベースのロード
        const db = await Database.load("sqlite:ai_company.db");
        setDbInstance(db);

        // テーブル初期化（必須テーブル群）
        await db.execute(`
          CREATE TABLE IF NOT EXISTS ai_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            model_id TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);

        await db.execute(`
          CREATE TABLE IF NOT EXISTS member_learnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            meeting_id INTEGER,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);

        await db.execute(`
          CREATE TABLE IF NOT EXISTS api_usage_logs (
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
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);

        await db.execute(`
          CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            started_at TEXT NOT NULL,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);

        setLoading(false);
      } catch (err) {
        console.error("Failed to initialize database:", err);
        setInitError(`DB初期化エラー: ${String(err)}`);
        setLoading(false);
      }
    }

    initApp();
  }, []);

  return { dbInstance, loading, initError };
}

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

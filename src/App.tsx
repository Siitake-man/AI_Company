import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";

function App() {
  const [tables, setTables] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    async function checkDatabase() {
      try {
        // データベースに接続（マイグレーションが自動実行される）
        const db = await Database.load("sqlite:ai_company.db");
        
        // 作成されたテーブル一覧を取得
        const result = await db.select<{ name: string }[]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );
        
        setTables(result.map((row) => row.name));
      } catch (err) {
        console.error(err);
        setErrorMsg(String(err));
      }
    }

    checkDatabase();
  }, []);

  return (
    <main className="p-8 bg-warm-bg min-h-screen text-dark-brown">
      <h1 className="text-2xl font-bold border-b-2 border-wood-border pb-2 mb-4">
        📊 AIカンパニー - データベース構築テスト
      </h1>

      {errorMsg ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">データベース接続エラー:</p>
          <p>{errorMsg}</p>
        </div>
      ) : (
        <div>
          <p className="mb-4 text-green-700 font-semibold">
            ✅ データベース「ai_company.db」に正常に接続しました。
          </p>
          
          <h2 className="text-lg font-bold mb-2">生成されたテーブル一覧（目標11テーブル）:</h2>
          <ul className="bg-panel-bg border border-wood-border rounded p-4 list-disc list-inside space-y-1">
            {tables.map((table) => (
              <li key={table} className="font-mono text-sm font-semibold text-dark-brown">
                {table}
              </li>
            ))}
          </ul>
          
          <p className="mt-4 text-sm text-gray-600">
            ※ DATA_SCHEMA.mdに定義されたテーブルが正しく表示されているか確認してください。
          </p>
        </div>
      )}
    </main>
  );
}

export default App;

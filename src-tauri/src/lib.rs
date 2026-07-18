// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_sql::{Migration, MigrationKind};
use keyring::Entry;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_api_key(provider: String, api_key: String) -> Result<(), String> {
    let entry = Entry::new("ai-company", &provider)
        .map_err(|e| format!("セキュアストレージの初期化失敗: {}", e))?;
    entry.set_password(&api_key)
        .map_err(|e| format!("APIキーの保存失敗: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_api_key(provider: String) -> Result<String, String> {
    let entry = Entry::new("ai-company", &provider)
        .map_err(|e| format!("セキュアストレージの初期化失敗: {}", e))?;
    entry.get_password()
        .map_err(|e| format!("APIキーの取得失敗 (未設定の可能性があります): {}", e))
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = Entry::new("ai-company", &provider)
        .map_err(|e| format!("セキュアストレージの初期化失敗: {}", e))?;
    entry.delete_password()
        .map_err(|e| format!("APIキーの削除失敗: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // データベースマイグレーションの定義
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/init.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ai_company.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            save_api_key,
            get_api_key,
            delete_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


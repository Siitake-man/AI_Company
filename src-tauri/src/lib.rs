// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use tauri::{Manager, State};
use tauri_plugin_sql::{Migration, MigrationKind};

const MAX_PARTICIPANTS: usize = 128;
const MAX_MESSAGES: usize = 2_000;
const MAX_TEXT_LENGTH: usize = 100_000;

/// The application-owned pool is deliberately separate from the guest SQL
/// plugin API. Commands below never accept SQL text from the frontend.
struct AppDatabase {
    pool: SqlitePool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbCommandError {
    code: &'static str,
    message: String,
}

#[derive(Debug, Deserialize, Clone)]
enum MeetingModeInput {
    #[serde(rename = "exploration", alias = "探索")]
    Exploration,
    #[serde(rename = "convergence", alias = "収束")]
    Convergence,
}

impl MeetingModeInput {
    fn as_db_value(&self) -> &'static str {
        match self {
            Self::Exploration => "探索",
            Self::Convergence => "収束",
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MeetingMessageInput {
    round_number: Option<i64>,
    member_id: Option<i64>,
    message_type: String,
    content: String,
    interrupt_chain_count: Option<i64>,
    created_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StructuredMeetingSummaryInput {
    issues: Vec<String>,
    pro_con_table: Vec<serde_json::Value>,
    facts: Vec<String>,
    open_concerns: Vec<String>,
    ai_recommendation: Option<String>,
    member_agreement_levels: Vec<serde_json::Value>,
    decisions: Vec<String>,
    next_actions: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FinalizeMeetingRequest {
    meeting_id: i64,
    mode: MeetingModeInput,
    participant_member_ids: Vec<i64>,
    messages: Vec<MeetingMessageInput>,
    structured_summary: StructuredMeetingSummaryInput,
    generated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FinalizeMeetingResponse {
    summary_id: i64,
    learning_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMeetingRequest {
    project_id: i64,
    mode: MeetingModeInput,
    started_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateMeetingResponse {
    meeting_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseMeetingRequest {
    meeting_id: i64,
    ended_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InsertMeetingUsageLogRequest {
    member_id: i64,
    meeting_id: i64,
    provider: Option<String>,
    model_id: String,
    prompt_tokens: i64,
    completion_tokens: i64,
    cost_usd: f64,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProjectRequest {
    project_id: i64,
    purpose: String,
    values: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSummaryModelRequest {
    model_id: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkUpdateMemberModelsRequest {
    model_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMemberRequest {
    member_id: i64,
    name: String,
    role: String,
    personality_prompt: String,
    ai_model: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetMemberUsageRequest {
    member_id: i64,
}

fn command_error(code: &'static str, message: impl Into<String>) -> DbCommandError {
    DbCommandError {
        code,
        message: message.into(),
    }
}

fn validate_text(
    value: &str,
    field: &'static str,
    allow_empty: bool,
) -> Result<(), DbCommandError> {
    if (!allow_empty && value.trim().is_empty()) || value.len() > MAX_TEXT_LENGTH {
        return Err(command_error(
            "invalid_input",
            format!("{}が不正です", field),
        ));
    }
    Ok(())
}

fn validate_finalize_request(request: &FinalizeMeetingRequest) -> Result<(), DbCommandError> {
    if request.meeting_id <= 0 {
        return Err(command_error("invalid_id", "meeting_idが不正です"));
    }
    validate_text(&request.generated_at, "generatedAt", false)?;
    if request.participant_member_ids.is_empty()
        || request.participant_member_ids.len() > MAX_PARTICIPANTS
    {
        return Err(command_error("invalid_input", "参加メンバー数が不正です"));
    }
    let mut unique_ids =
        std::collections::HashSet::with_capacity(request.participant_member_ids.len());
    for member_id in &request.participant_member_ids {
        if *member_id <= 0 || !unique_ids.insert(*member_id) {
            return Err(command_error("invalid_id", "参加メンバーIDが不正です"));
        }
    }
    if request.messages.len() > MAX_MESSAGES {
        return Err(command_error("invalid_input", "発言数が上限を超えています"));
    }
    for message in &request.messages {
        if let Some(round_number) = message.round_number {
            if round_number < 0 {
                return Err(command_error("invalid_input", "roundNumberが不正です"));
            }
        }
        if let Some(member_id) = message.member_id {
            if member_id <= 0 || !unique_ids.contains(&member_id) {
                return Err(command_error(
                    "invalid_id",
                    "発言者IDが参加者と一致しません",
                ));
            }
        }
        validate_text(&message.message_type, "messageType", false)?;
        validate_text(&message.content, "content", false)?;
        validate_text(&message.created_at, "createdAt", false)?;
        if let Some(chain_count) = message.interrupt_chain_count {
            if !(0..=3).contains(&chain_count) {
                return Err(command_error(
                    "invalid_input",
                    "interruptChainCountが不正です",
                ));
            }
        }
    }
    for decision in &request.structured_summary.decisions {
        validate_text(decision, "decision", true)?;
    }
    if let Some(recommendation) = &request.structured_summary.ai_recommendation {
        validate_text(recommendation, "aiRecommendation", true)?;
    }
    Ok(())
}

fn serialize_json<T: Serialize>(value: &T, field: &'static str) -> Result<String, DbCommandError> {
    serde_json::to_string(value)
        .map_err(|_| command_error("invalid_input", format!("{}をJSON化できません", field)))
}

async fn finalize_meeting_with_pool(
    pool: &SqlitePool,
    request: FinalizeMeetingRequest,
) -> Result<FinalizeMeetingResponse, DbCommandError> {
    validate_finalize_request(&request)?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| command_error("database_error", "データベースを開始できませんでした"))?;

    let result = async {
        let meeting_status: Option<String> = sqlx::query_scalar("SELECT status FROM meetings WHERE id = ?")
            .bind(request.meeting_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|_| command_error("database_error", "会議の存在確認に失敗しました"))?;
        if meeting_status.is_none() {
            return Err(command_error("not_found", "対象の会議が存在しません"));
        }
        if meeting_status.as_deref() != Some("進行中") {
            return Err(command_error("invalid_state", "進行中の会議だけ確定できます"));
        }

        for member_id in &request.participant_member_ids {
            let member_in_project: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM members m JOIN departments d ON d.id = m.department_id JOIN meetings mt ON mt.project_id = d.project_id WHERE mt.id = ? AND m.id = ?",
            )
            .bind(request.meeting_id)
            .bind(member_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| command_error("database_error", "参加メンバーの確認に失敗しました"))?;
            if member_in_project != 1 {
                return Err(command_error("invalid_id", "参加メンバーが会議のプロジェクトと一致しません"));
            }
        }

        let summary_exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM meeting_summaries WHERE meeting_id = ?",
        )
        .bind(request.meeting_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| command_error("database_error", "議事録の重複確認に失敗しました"))?;
        if summary_exists != 0 {
            return Err(command_error("already_finalized", "この会議は既に確定済みです"));
        }

        for member_id in &request.participant_member_ids {
            sqlx::query("INSERT INTO meeting_participants (meeting_id, member_id) VALUES (?, ?)")
                .bind(request.meeting_id)
                .bind(member_id)
                .execute(&mut *transaction)
                .await
                .map_err(|_| command_error("database_error", "会議参加者を保存できませんでした"))?;
        }

        for message in &request.messages {
            sqlx::query(
                "INSERT INTO meeting_messages (meeting_id, round_number, member_id, message_type, content, interrupt_chain_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(request.meeting_id)
            .bind(message.round_number)
            .bind(message.member_id)
            .bind(&message.message_type)
            .bind(&message.content)
            .bind(message.interrupt_chain_count.unwrap_or(0))
            .bind(&message.created_at)
            .execute(&mut *transaction)
            .await
            .map_err(|_| command_error("database_error", "会議発言を保存できませんでした"))?;
        }

        let summary = &request.structured_summary;
        let issues = serialize_json(&summary.issues, "issues")?;
        let pro_con_table = serialize_json(&summary.pro_con_table, "proConTable")?;
        let facts = serialize_json(&summary.facts, "facts")?;
        let open_concerns = serialize_json(&summary.open_concerns, "openConcerns")?;
        let member_agreement_levels = serialize_json(
            &summary.member_agreement_levels,
            "memberAgreementLevels",
        )?;
        let decisions = serialize_json(&summary.decisions, "decisions")?;
        let next_actions = serialize_json(&summary.next_actions, "nextActions")?;

        let summary_result = sqlx::query(
            "INSERT INTO meeting_summaries (meeting_id, mode, issues, pro_con_table, facts, open_concerns, ai_recommendation, member_agreement_levels, decisions, next_actions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(request.meeting_id)
        .bind(summary_mode(&request.mode))
        .bind(issues)
        .bind(pro_con_table)
        .bind(facts)
        .bind(open_concerns)
        .bind(&summary.ai_recommendation)
        .bind(member_agreement_levels)
        .bind(decisions)
        .bind(next_actions)
        .bind(&request.generated_at)
        .bind(&request.generated_at)
        .execute(&mut *transaction)
        .await
        .map_err(|_| command_error("database_error", "議事録を保存できませんでした"))?;
        let summary_id = summary_result.last_insert_rowid();
        if summary_id <= 0 {
            return Err(command_error("database_error", "議事録IDを取得できませんでした"));
        }

        let mut learning_count = 0_u64;
        for decision in summary.decisions.iter().filter(|decision| !decision.trim().is_empty()) {
            for member_id in &request.participant_member_ids {
                sqlx::query(
                    "INSERT INTO member_learnings (member_id, meeting_id, content, created_at) VALUES (?, ?, ?, ?)",
                )
                .bind(member_id)
                .bind(request.meeting_id)
                .bind(decision)
                .bind(&request.generated_at)
                .execute(&mut *transaction)
                .await
                .map_err(|_| command_error("database_error", "学習データを保存できませんでした"))?;
                learning_count += 1;
            }
        }

        let update_result = sqlx::query(
            "UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?",
        )
        .bind("終了")
        .bind(&request.generated_at)
        .bind(request.meeting_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| command_error("database_error", "会議状態を更新できませんでした"))?;
        if update_result.rows_affected() != 1 {
            return Err(command_error("database_error", "会議状態を更新できませんでした"));
        }

        Ok(FinalizeMeetingResponse {
            summary_id,
            learning_count,
        })
    }
    .await;

    match result {
        Ok(response) => {
            transaction.commit().await.map_err(|_| {
                command_error("database_error", "確定処理をコミットできませんでした")
            })?;
            Ok(response)
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

fn summary_mode(mode: &MeetingModeInput) -> &'static str {
    mode.as_db_value()
}

#[tauri::command]
async fn create_meeting(
    request: CreateMeetingRequest,
    database: State<'_, AppDatabase>,
) -> Result<CreateMeetingResponse, DbCommandError> {
    if request.project_id <= 0 {
        return Err(command_error("invalid_id", "project_idが不正です"));
    }
    validate_text(&request.started_at, "startedAt", false)?;
    let result = sqlx::query(
        "INSERT INTO meetings (project_id, mode, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(request.project_id)
    .bind(summary_mode(&request.mode))
    .bind("進行中")
    .bind(request.started_at)
    .bind(Option::<String>::None)
    .execute(&database.pool)
    .await
    .map_err(|_| command_error("database_error", "会議を開始できませんでした"))?;
    let meeting_id = result.last_insert_rowid();
    if meeting_id <= 0 {
        return Err(command_error(
            "database_error",
            "会議IDを取得できませんでした",
        ));
    }
    Ok(CreateMeetingResponse { meeting_id })
}

#[tauri::command]
async fn close_meeting(
    request: CloseMeetingRequest,
    database: State<'_, AppDatabase>,
) -> Result<(), DbCommandError> {
    if request.meeting_id <= 0 {
        return Err(command_error("invalid_id", "meeting_idが不正です"));
    }
    validate_text(&request.ended_at, "endedAt", false)?;
    let result = sqlx::query("UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?")
        .bind("終了")
        .bind(request.ended_at)
        .bind(request.meeting_id)
        .execute(&database.pool)
        .await
        .map_err(|_| command_error("database_error", "会議終了状態を保存できませんでした"))?;
    if result.rows_affected() != 1 {
        return Err(command_error("not_found", "対象の会議が存在しません"));
    }
    Ok(())
}

#[tauri::command]
async fn insert_meeting_usage_log(
    request: InsertMeetingUsageLogRequest,
    database: State<'_, AppDatabase>,
) -> Result<(), DbCommandError> {
    if request.member_id <= 0
        || request.meeting_id <= 0
        || request.prompt_tokens < 0
        || request.completion_tokens < 0
        || !request.cost_usd.is_finite()
    {
        return Err(command_error("invalid_input", "利用量ログの値が不正です"));
    }
    validate_text(&request.model_id, "modelId", false)?;
    validate_text(&request.created_at, "createdAt", false)?;
    let result = sqlx::query("INSERT INTO api_usage_logs (member_id, meeting_id, provider, model_id, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(request.member_id)
        .bind(request.meeting_id)
        .bind(request.provider)
        .bind(request.model_id)
        .bind(request.prompt_tokens)
        .bind(request.completion_tokens)
        .bind(request.cost_usd)
        .bind(request.created_at)
        .execute(&database.pool)
        .await
        .map_err(|_| command_error("database_error", "利用量ログを保存できませんでした"))?;
    if result.rows_affected() != 1 {
        return Err(command_error(
            "database_error",
            "利用量ログを保存できませんでした",
        ));
    }
    Ok(())
}

#[tauri::command]
async fn update_project(
    request: UpdateProjectRequest,
    database: State<'_, AppDatabase>,
) -> Result<(), DbCommandError> {
    if request.project_id <= 0 {
        return Err(command_error("invalid_id", "project_idが不正です"));
    }
    validate_text(&request.purpose, "purpose", true)?;
    validate_text(&request.values, "values", true)?;
    validate_text(&request.updated_at, "updatedAt", false)?;
    let result =
        sqlx::query("UPDATE projects SET purpose = ?, \"values\" = ?, updated_at = ? WHERE id = ?")
            .bind(request.purpose)
            .bind(request.values)
            .bind(request.updated_at)
            .bind(request.project_id)
            .execute(&database.pool)
            .await
            .map_err(|_| {
                command_error("database_error", "プロジェクト設定を保存できませんでした")
            })?;
    if result.rows_affected() != 1 {
        return Err(command_error(
            "not_found",
            "対象のプロジェクトが存在しません",
        ));
    }
    Ok(())
}

#[tauri::command]
async fn update_summary_model(
    request: UpdateSummaryModelRequest,
    database: State<'_, AppDatabase>,
) -> Result<(), DbCommandError> {
    validate_text(&request.model_id, "modelId", false)?;
    validate_text(&request.updated_at, "updatedAt", false)?;
    let result = sqlx::query("UPDATE users SET summary_model = ?, updated_at = ? WHERE id = 1")
        .bind(request.model_id)
        .bind(request.updated_at)
        .execute(&database.pool)
        .await
        .map_err(|_| command_error("database_error", "サマリーモデルを保存できませんでした"))?;
    if result.rows_affected() != 1 {
        return Err(command_error(
            "not_found",
            "ユーザープロフィールが存在しません",
        ));
    }
    Ok(())
}

#[tauri::command]
async fn bulk_update_member_models(
    request: BulkUpdateMemberModelsRequest,
    database: State<'_, AppDatabase>,
) -> Result<u64, DbCommandError> {
    validate_text(&request.model_id, "modelId", false)?;
    let result = sqlx::query("UPDATE members SET ai_model = ?")
        .bind(request.model_id)
        .execute(&database.pool)
        .await
        .map_err(|_| command_error("database_error", "AI社員のモデルを更新できませんでした"))?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn update_member(
    request: UpdateMemberRequest,
    database: State<'_, AppDatabase>,
) -> Result<(), DbCommandError> {
    if request.member_id <= 0 {
        return Err(command_error("invalid_id", "member_idが不正です"));
    }
    validate_text(&request.name, "name", false)?;
    validate_text(&request.role, "role", true)?;
    validate_text(&request.personality_prompt, "personalityPrompt", true)?;
    validate_text(&request.ai_model, "aiModel", false)?;
    validate_text(&request.updated_at, "updatedAt", false)?;
    let result = sqlx::query("UPDATE members SET name = ?, role = ?, personality_prompt = ?, ai_model = ?, updated_at = ? WHERE id = ?")
        .bind(request.name)
        .bind(request.role)
        .bind(request.personality_prompt)
        .bind(request.ai_model)
        .bind(request.updated_at)
        .bind(request.member_id)
        .execute(&database.pool)
        .await
        .map_err(|_| command_error("database_error", "メンバー情報を保存できませんでした"))?;
    if result.rows_affected() != 1 {
        return Err(command_error("not_found", "対象のメンバーが存在しません"));
    }
    Ok(())
}

#[tauri::command]
async fn reset_member_usage(
    request: ResetMemberUsageRequest,
    database: State<'_, AppDatabase>,
) -> Result<u64, DbCommandError> {
    if request.member_id <= 0 {
        return Err(command_error("invalid_id", "member_idが不正です"));
    }
    let result = sqlx::query("DELETE FROM api_usage_logs WHERE member_id = ?")
        .bind(request.member_id)
        .execute(&database.pool)
        .await
        .map_err(|_| command_error("database_error", "利用統計をリセットできませんでした"))?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn finalize_meeting(
    request: FinalizeMeetingRequest,
    database: State<'_, AppDatabase>,
) -> Result<FinalizeMeetingResponse, DbCommandError> {
    finalize_meeting_with_pool(&database.pool, request).await
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_api_key(provider: String, api_key: String) -> Result<(), String> {
    let entry = Entry::new("ai-company", &provider)
        .map_err(|e| format!("セキュアストレージの初期化失敗: {}", e))?;
    entry
        .set_password(&api_key)
        .map_err(|e| format!("APIキーの保存失敗: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_api_key(provider: String) -> Result<String, String> {
    let entry = Entry::new("ai-company", &provider)
        .map_err(|e| format!("セキュアストレージの初期化失敗: {}", e))?;
    entry
        .get_password()
        .map_err(|e| format!("APIキーの取得失敗 (未設定の可能性があります): {}", e))
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = Entry::new("ai-company", &provider)
        .map_err(|e| format!("セキュアストレージの初期化失敗: {}", e))?;
    entry
        .delete_password()
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
        },
        Migration {
            version: 2,
            description: "create Phase 2 operational tables",
            sql: include_str!("../migrations/phase2_operational.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "normalize schema integrity and summary model",
            sql: include_str!("../migrations/schema_v3_integrity.sql"),
            kind: MigrationKind::Up,
        },
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
        .setup(|app| {
            // Keep the application command pool on the same file used by the
            // SQL plugin. The plugin's Database.load still owns migrations in
            // this transition; the frontend loads it before invoking commands.
            let app_config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("アプリ設定フォルダを取得できませんでした: {e}"))?;
            std::fs::create_dir_all(&app_config_dir)
                .map_err(|e| format!("アプリ設定フォルダを作成できませんでした: {e}"))?;
            let db_path = app_config_dir.join("ai_company.db");
            let connect_options = SqliteConnectOptions::new()
                .filename(db_path)
                .create_if_missing(true)
                .foreign_keys(true);
            let pool = tauri::async_runtime::block_on(
                SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect_with(connect_options),
            )
            .map_err(|e| format!("アプリDBへ接続できませんでした: {e}"))?;
            app.manage(AppDatabase { pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            save_api_key,
            get_api_key,
            delete_api_key,
            finalize_meeting,
            create_meeting,
            close_meeting,
            insert_meeting_usage_log,
            update_project,
            update_summary_model,
            bulk_update_member_models,
            update_member,
            reset_member_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> FinalizeMeetingRequest {
        FinalizeMeetingRequest {
            meeting_id: 1,
            mode: MeetingModeInput::Exploration,
            participant_member_ids: vec![10, 20],
            messages: vec![MeetingMessageInput {
                round_number: Some(1),
                member_id: Some(10),
                message_type: "通常発言".to_string(),
                content: "検討内容".to_string(),
                interrupt_chain_count: Some(0),
                created_at: "2026-08-31T00:00:00Z".to_string(),
            }],
            structured_summary: StructuredMeetingSummaryInput {
                issues: vec!["論点".to_string()],
                pro_con_table: vec![],
                facts: vec![],
                open_concerns: vec![],
                ai_recommendation: None,
                member_agreement_levels: vec![],
                decisions: vec!["決定事項".to_string()],
                next_actions: vec![],
            },
            generated_at: "2026-08-31T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn rejects_duplicate_participants() {
        let mut request = valid_request();
        request.participant_member_ids = vec![10, 10];
        let error =
            validate_finalize_request(&request).expect_err("duplicate IDs must be rejected");
        assert_eq!(error.code, "invalid_id");
    }

    #[test]
    fn rejects_message_member_outside_participants() {
        let mut request = valid_request();
        request.messages[0].member_id = Some(999);
        let error =
            validate_finalize_request(&request).expect_err("foreign member must be rejected");
        assert_eq!(error.code, "invalid_id");
    }

    #[test]
    fn allows_empty_decisions_without_creating_learning_input() {
        let mut request = valid_request();
        request.structured_summary.decisions = vec!["".to_string(), "  ".to_string()];
        validate_finalize_request(&request).expect("empty decisions are valid user input");
        assert!(request
            .structured_summary
            .decisions
            .iter()
            .all(|decision| decision.trim().is_empty()));
    }

    #[test]
    fn finalization_commits_all_rows_and_rejects_duplicate_confirmation() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("in-memory database");
            for schema in [
                "CREATE TABLE projects (id INTEGER PRIMARY KEY)",
                "CREATE TABLE departments (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL)",
                "CREATE TABLE members (id INTEGER PRIMARY KEY, department_id INTEGER NOT NULL)",
                "CREATE TABLE meetings (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, ended_at TEXT)",
                "CREATE TABLE meeting_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL, member_id INTEGER NOT NULL)",
                "CREATE TABLE meeting_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL, round_number INTEGER, member_id INTEGER, message_type TEXT NOT NULL, content TEXT NOT NULL, interrupt_chain_count INTEGER, created_at TEXT NOT NULL)",
                "CREATE TABLE meeting_summaries (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL, mode TEXT NOT NULL, issues TEXT, pro_con_table TEXT, facts TEXT, open_concerns TEXT, ai_recommendation TEXT, member_agreement_levels TEXT, decisions TEXT, next_actions TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
                "CREATE TABLE member_learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, meeting_id INTEGER, content TEXT NOT NULL, created_at TEXT NOT NULL)",
            ] {
                sqlx::query(schema).execute(&pool).await.expect("schema");
            }
            sqlx::query("INSERT INTO projects (id) VALUES (1)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO departments (id, project_id) VALUES (1, 1)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO members (id, department_id) VALUES (10, 1)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO meetings (id, project_id, mode, status) VALUES (1, 1, '探索', '進行中')").execute(&pool).await.unwrap();

            let mut request = valid_request();
            request.participant_member_ids = vec![10];
            request.messages[0].member_id = Some(10);
            let response = finalize_meeting_with_pool(&pool, request.clone())
                .await
                .expect("first confirmation");
            assert_eq!(response.learning_count, 1);
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM meeting_messages")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM member_learnings")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                1
            );

            let duplicate = finalize_meeting_with_pool(&pool, request)
                .await
                .expect_err("duplicate confirmation");
            assert_eq!(duplicate.code, "invalid_state");
        });
    }
}

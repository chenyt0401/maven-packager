use crate::error::AppResult;
use crate::models::history::BuildHistoryRecord;
use crate::repositories::history_repo;
use crate::services::app_logger;
use tauri::AppHandle;

#[tauri::command]
pub fn list_build_history(app: AppHandle) -> AppResult<Vec<BuildHistoryRecord>> {
    let result = history_repo::list(&app);
    match &result {
        Ok(records) => app_logger::log_info(
            &app,
            "history.list.success",
            format!("count={}", records.len()),
        ),
        Err(error) => {
            app_logger::log_error(&app, "history.list.failed", format!("error={}", error));
        }
    }
    result
}

#[tauri::command]
pub fn save_build_history(app: AppHandle, record: BuildHistoryRecord) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "history.save.start",
        format!(
            "id={}, project_root={}, module_path={}, status={}, duration_ms={}",
            record.id, record.project_root, record.module_path, record.status, record.duration_ms
        ),
    );
    let result = history_repo::save(&app, record);
    if let Err(error) = &result {
        app_logger::log_error(&app, "history.save.failed", format!("error={}", error));
    }
    result
}

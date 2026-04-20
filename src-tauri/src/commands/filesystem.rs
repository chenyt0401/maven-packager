use crate::error::{to_user_error, AppResult};
use crate::services::app_logger;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn open_path_in_explorer(app: AppHandle, path: String) -> AppResult<()> {
    app_logger::log_info(&app, "filesystem.open.start", format!("path={}", path));
    let target = PathBuf::from(&path);
    if !target.exists() {
        app_logger::log_error(
            &app,
            "filesystem.open.failed",
            format!("path={}, error=路径不存在", path),
        );
        return Err(to_user_error(format!("路径不存在：{}", path)));
    }

    let result = Command::new("explorer")
        .arg(target)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| to_user_error(format!("无法打开资源管理器：{}", error)));

    match &result {
        Ok(_) => app_logger::log_info(&app, "filesystem.open.success", format!("path={}", path)),
        Err(error) => app_logger::log_error(
            &app,
            "filesystem.open.failed",
            format!("path={}, error={}", path, error),
        ),
    }
    result?;

    Ok(())
}

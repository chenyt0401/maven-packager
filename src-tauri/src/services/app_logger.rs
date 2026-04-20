use crate::error::{to_user_error, AppResult};
use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn log_info(app: &AppHandle, action: &str, message: impl AsRef<str>) {
    append_app_line(app, "INFO", action, message.as_ref());
}

pub fn log_warn(app: &AppHandle, action: &str, message: impl AsRef<str>) {
    append_app_line(app, "WARN", action, message.as_ref());
}

pub fn log_error(app: &AppHandle, action: &str, message: impl AsRef<str>) {
    append_app_line(app, "ERROR", action, message.as_ref());
}

pub fn logs_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| to_user_error(format!("无法获取应用数据目录：{}", error)))?
        .join("logs");
    fs::create_dir_all(&dir).map_err(|error| to_user_error(format!("无法创建日志目录：{}", error)))?;
    Ok(dir)
}

pub fn build_log_path(app: &AppHandle, build_id: &str) -> AppResult<PathBuf> {
    let timestamp = Local::now().format("%Y%m%d-%H%M%S");
    Ok(logs_dir(app)?.join(format!("build-{}-{}.log", timestamp, build_id)))
}

pub fn append_build_line(path: &Path, stream: &str, line: impl AsRef<str>) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let message = format!("[{}] [{}] {}\n", timestamp, stream, line.as_ref());
    let _ = append_line(path, &message);
}

fn append_app_line(app: &AppHandle, level: &str, action: &str, message: &str) {
    let Ok(dir) = logs_dir(app) else {
        return;
    };
    let date = Local::now().format("%Y-%m-%d");
    let path = dir.join(format!("app-{}.log", date));
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] [{}] [{}] {}\n", timestamp, level, action, message);
    let _ = append_line(&path, &line);
}

fn append_line(path: &Path, line: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| to_user_error(format!("无法创建日志目录：{}", error)))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| to_user_error(format!("无法打开日志文件：{}", error)))?;
    file.write_all(line.as_bytes())
        .map_err(|error| to_user_error(format!("无法写入日志文件：{}", error)))
}

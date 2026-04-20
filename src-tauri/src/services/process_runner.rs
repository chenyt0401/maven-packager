use crate::error::{to_user_error, AppResult};
use crate::models::build::{BuildFinishedEvent, BuildLogEvent, StartBuildPayload};
use crate::services::app_logger;
use encoding_rs::GBK;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use tauri::{Emitter, Manager, Window};
use uuid::Uuid;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct BuildProcessState {
    processes: Arc<Mutex<HashMap<String, u32>>>,
    log_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
}

pub fn start_build(
    window: Window,
    state: tauri::State<'_, BuildProcessState>,
    payload: StartBuildPayload,
) -> AppResult<String> {
    if payload.command.trim().is_empty() {
        return Err(to_user_error("构建命令不能为空。"));
    }

    let app = window.app_handle().clone();
    let build_id = Uuid::new_v4().to_string();
    let build_log_path = app_logger::build_log_path(&app, &build_id)?;
    app_logger::log_info(
        &app,
        "build.start",
        format!(
            "build_id={}, project_root={}, module_path={}, module_artifact_id={}, java_home={}, maven_home={}, use_maven_wrapper={}, command={}, build_log={}",
            build_id,
            payload.project_root,
            if payload.module_path.is_empty() {
                "<all>"
            } else {
                payload.module_path.as_str()
            },
            payload.module_artifact_id.as_deref().unwrap_or("<empty>"),
            payload.java_home.as_deref().unwrap_or("<empty>"),
            payload.maven_home.as_deref().unwrap_or("<empty>"),
            payload.use_maven_wrapper,
            payload.command,
            build_log_path.to_string_lossy()
        ),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("build_id={}", build_id),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("project_root={}", payload.project_root),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("module_path={}", payload.module_path),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("java_home={}", payload.java_home.as_deref().unwrap_or("<empty>")),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("maven_home={}", payload.maven_home.as_deref().unwrap_or("<empty>")),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("command={}", payload.command),
    );

    let mut command = Command::new("cmd");
    command
        .args(["/C", payload.command.as_str()])
        .current_dir(&payload.project_root)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(java_home) = payload.java_home.as_deref() {
        command.env("JAVA_HOME", java_home);
    }

    let mut child = command
        .spawn()
        .map_err(|error| {
            app_logger::log_error(
                &app,
                "build.spawn.failed",
                format!("build_id={}, error={}", build_id, error),
            );
            app_logger::append_build_line(
                &build_log_path,
                "system",
                format!("无法启动构建进程：{}", error),
            );
            to_user_error(format!("无法启动构建进程：{}", error))
        })?;
    let pid = child.id();
    app_logger::log_info(
        &app,
        "build.spawn.success",
        format!("build_id={}, pid={}", build_id, pid),
    );
    app_logger::append_build_line(&build_log_path, "system", format!("pid={}", pid));

    state
        .processes
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .insert(build_id.clone(), pid);
    state
        .log_paths
        .lock()
        .map_err(|_| to_user_error("构建日志状态被占用，请稍后重试。"))?
        .insert(build_id.clone(), build_log_path.clone());

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let window_for_stdout = window.clone();
    let stdout_build_id = build_id.clone();
    let stdout_log_path = build_log_path.clone();
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            emit_reader(
                window_for_stdout,
                stdout_build_id,
                "stdout",
                stdout,
                stdout_log_path,
            )
        });
    }

    let window_for_stderr = window.clone();
    let stderr_build_id = build_id.clone();
    let stderr_log_path = build_log_path.clone();
    if let Some(stderr) = stderr {
        thread::spawn(move || {
            emit_reader(
                window_for_stderr,
                stderr_build_id,
                "stderr",
                stderr,
                stderr_log_path,
            )
        });
    }

    let window_for_wait = window.clone();
    let wait_build_id = build_id.clone();
    let wait_app = app.clone();
    let wait_log_path = build_log_path.clone();
    let wait_processes = state.processes.clone();
    let wait_log_paths = state.log_paths.clone();
    let started_at = Instant::now();
    thread::spawn(move || {
        let status = match child.wait() {
            Ok(exit_status) if exit_status.success() => "SUCCESS",
            Ok(exit_status) => {
                app_logger::append_build_line(
                    &wait_log_path,
                    "system",
                    format!("进程退出码：{}", exit_status),
                );
                "FAILED"
            }
            Err(error) => {
                app_logger::append_build_line(
                    &wait_log_path,
                    "system",
                    format!("等待构建进程失败：{}", error),
                );
                "FAILED"
            }
        };
        let duration_ms = started_at.elapsed().as_millis();
        app_logger::append_build_line(
            &wait_log_path,
            "system",
            format!("构建结束：status={}, duration_ms={}", status, duration_ms),
        );
        app_logger::log_info(
            &wait_app,
            "build.finished",
            format!(
                "build_id={}, status={}, duration_ms={}, build_log={}",
                wait_build_id,
                status,
                duration_ms,
                wait_log_path.to_string_lossy()
            ),
        );
        if let Ok(mut processes) = wait_processes.lock() {
            processes.remove(&wait_build_id);
        }
        if let Ok(mut log_paths) = wait_log_paths.lock() {
            log_paths.remove(&wait_build_id);
        }
        let _ = window_for_wait.emit(
            "build-finished",
            BuildFinishedEvent {
                build_id: wait_build_id,
                status: status.to_string(),
                duration_ms,
            },
        );
    });

    let _ = window.emit(
        "build-log",
        BuildLogEvent {
            build_id: build_id.clone(),
            stream: "system".to_string(),
            line: format!(
                "启动构建：{}（日志文件：{}）",
                payload.command,
                build_log_path.to_string_lossy()
            ),
        },
    );

    Ok(build_id)
}

pub fn cancel_build(
    window: Window,
    state: tauri::State<'_, BuildProcessState>,
    build_id: &str,
) -> AppResult<()> {
    let app = window.app_handle().clone();
    app_logger::log_info(&app, "build.cancel.start", format!("build_id={}", build_id));
    let pid = state
        .processes
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .remove(build_id);
    let log_path = state
        .log_paths
        .lock()
        .map_err(|_| to_user_error("构建日志状态被占用，请稍后重试。"))?
        .remove(build_id);

    if let Some(pid) = pid {
        if let Some(log_path) = log_path.as_deref() {
            app_logger::append_build_line(log_path, "system", "用户取消构建");
        }
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        app_logger::log_warn(
            &app,
            "build.cancelled",
            format!("build_id={}, pid={}", build_id, pid),
        );
        let _ = window.emit(
            "build-finished",
            BuildFinishedEvent {
                build_id: build_id.to_string(),
                status: "CANCELLED".to_string(),
                duration_ms: 0,
            },
        );
    } else {
        app_logger::log_warn(
            &app,
            "build.cancel.not_found",
            format!("build_id={}", build_id),
        );
    }

    Ok(())
}

fn emit_reader<R: std::io::Read + Send + 'static>(
    window: Window,
    build_id: String,
    stream: &str,
    reader: R,
    log_path: PathBuf,
) {
    let stream = stream.to_string();
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();

    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer) {
            Ok(0) => break,
            Ok(_) => {
                let line = decode_log_line(&buffer);
                app_logger::append_build_line(&log_path, &stream, &line);
                let _ = window.emit(
                    "build-log",
                    BuildLogEvent {
                        build_id: build_id.clone(),
                        stream: stream.clone(),
                        line,
                    },
                );
            }
            Err(error) => {
                app_logger::append_build_line(
                    &log_path,
                    "system",
                    format!("读取日志失败：{}", error),
                );
                let _ = window.emit(
                    "build-log",
                    BuildLogEvent {
                        build_id: build_id.clone(),
                        stream: "system".to_string(),
                        line: format!("读取日志失败：{}", error),
                    },
                );
                break;
            }
        }
    }
}

fn decode_log_line(bytes: &[u8]) -> String {
    let mut line = bytes;
    while line.last().is_some_and(|byte| *byte == b'\n' || *byte == b'\r') {
        line = &line[..line.len() - 1];
    }

    match String::from_utf8(line.to_vec()) {
        Ok(value) => value,
        Err(_) => {
            let (decoded, _, _) = GBK.decode(line);
            decoded.into_owned()
        }
    }
}

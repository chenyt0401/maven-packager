use crate::error::AppResult;
use crate::models::environment::{BuildEnvironment, EnvironmentSettings};
use crate::repositories::settings_repo;
use crate::services::app_logger;
use crate::services::env_detector;
use tauri::AppHandle;

#[tauri::command]
pub fn detect_environment(app: AppHandle, root_path: String) -> AppResult<BuildEnvironment> {
    let settings = settings_repo::load(&app)?;
    app_logger::log_info(
        &app,
        "environment.detect.start",
        format!(
            "root_path={}, saved_java_home={}, saved_maven_home={}, use_maven_wrapper={}",
            root_path,
            settings.java_home.as_deref().unwrap_or("<empty>"),
            settings.maven_home.as_deref().unwrap_or("<empty>"),
            settings.use_maven_wrapper
        ),
    );
    let environment = env_detector::detect_environment(&root_path, settings);
    app_logger::log_info(
        &app,
        "environment.detect.result",
        format!(
            "java_home={}, java_path={}, java_version={}, maven_home={}, maven_path={}, maven_version={}, settings_xml={}, has_maven_wrapper={}, use_maven_wrapper={}, errors={}",
            environment.java_home.as_deref().unwrap_or("<empty>"),
            environment.java_path.as_deref().unwrap_or("<empty>"),
            environment.java_version.as_deref().unwrap_or("<empty>"),
            environment.maven_home.as_deref().unwrap_or("<empty>"),
            environment.maven_path.as_deref().unwrap_or("<empty>"),
            environment.maven_version.as_deref().unwrap_or("<empty>"),
            environment.settings_xml_path.as_deref().unwrap_or("<empty>"),
            environment.has_maven_wrapper,
            environment.use_maven_wrapper,
            if environment.errors.is_empty() {
                "<none>".to_string()
            } else {
                environment.errors.join(" | ")
            }
        ),
    );
    Ok(environment)
}

#[tauri::command]
pub fn load_environment_settings(app: AppHandle) -> AppResult<EnvironmentSettings> {
    let settings = settings_repo::load(&app);
    match &settings {
        Ok(settings) => app_logger::log_info(
            &app,
            "settings.load.success",
            format!(
                "java_home={}, maven_home={}, use_maven_wrapper={}, last_project_path={}",
                settings.java_home.as_deref().unwrap_or("<empty>"),
                settings.maven_home.as_deref().unwrap_or("<empty>"),
                settings.use_maven_wrapper,
                settings.last_project_path.as_deref().unwrap_or("<empty>")
            ),
        ),
        Err(error) => {
            app_logger::log_error(&app, "settings.load.failed", format!("error={}", error));
        }
    }
    settings
}

#[tauri::command]
pub fn save_environment_settings(
    app: AppHandle,
    settings: EnvironmentSettings,
) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "settings.save.start",
        format!(
            "java_home={}, maven_home={}, use_maven_wrapper={}, last_project_path={}",
            settings.java_home.as_deref().unwrap_or("<empty>"),
            settings.maven_home.as_deref().unwrap_or("<empty>"),
            settings.use_maven_wrapper,
            settings.last_project_path.as_deref().unwrap_or("<empty>")
        ),
    );
    let mut current = settings_repo::load(&app).unwrap_or_default();
    current.java_home = settings.java_home;
    current.maven_home = settings.maven_home;
    current.use_maven_wrapper = settings.use_maven_wrapper;
    if settings.last_project_path.is_some() {
        current.last_project_path = settings.last_project_path;
    }
    let result = settings_repo::save(&app, current);
    if let Err(error) = &result {
        app_logger::log_error(&app, "settings.save.failed", format!("error={}", error));
    } else {
        app_logger::log_info(&app, "settings.save.success", "保存环境设置成功");
    }
    result
}

#[tauri::command]
pub fn save_last_project_path(app: AppHandle, root_path: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "settings.last_project.save.start",
        format!("root_path={}", root_path),
    );
    let mut current = settings_repo::load(&app).unwrap_or_default();
    current.last_project_path = Some(root_path);
    let result = settings_repo::save(&app, current);
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "settings.last_project.save.failed",
            format!("error={}", error),
        );
    }
    result
}

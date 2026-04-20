use crate::error::AppResult;
use crate::models::module::MavenModule;
use crate::models::project::MavenProject;
use crate::services::app_logger;
use crate::services::pom_parser;
use tauri::AppHandle;

#[tauri::command]
pub fn parse_maven_project(app: AppHandle, root_path: String) -> AppResult<MavenProject> {
    app_logger::log_info(&app, "project.parse.start", format!("root_path={}", root_path));
    match pom_parser::parse_maven_project(&root_path) {
        Ok(project) => {
            app_logger::log_info(
                &app,
                "project.parse.success",
                format!(
                    "root_path={}, artifact_id={}, module_count={}",
                    project.root_path,
                    project.artifact_id,
                    count_modules(&project.modules)
                ),
            );
            Ok(project)
        }
        Err(error) => {
            app_logger::log_error(
                &app,
                "project.parse.failed",
                format!("root_path={}, error={}", root_path, error),
            );
            Err(error)
        }
    }
}

fn count_modules(modules: &[MavenModule]) -> usize {
    modules
        .iter()
        .map(|module_item| 1 + count_modules(&module_item.children))
        .sum()
}

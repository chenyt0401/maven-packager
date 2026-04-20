use crate::error::AppResult;
use crate::models::template::BuildTemplate;
use crate::repositories::template_repo;
use crate::services::app_logger;
use tauri::AppHandle;

#[tauri::command]
pub fn list_templates(app: AppHandle) -> AppResult<Vec<BuildTemplate>> {
    let result = template_repo::list(&app);
    match &result {
        Ok(templates) => app_logger::log_info(
            &app,
            "template.list.success",
            format!("count={}", templates.len()),
        ),
        Err(error) => {
            app_logger::log_error(&app, "template.list.failed", format!("error={}", error));
        }
    }
    result
}

#[tauri::command]
pub fn save_template(app: AppHandle, template: BuildTemplate) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "template.save.start",
        format!(
            "id={}, name={}, project_root={}, module_path={}",
            template.id, template.name, template.project_root, template.module_path
        ),
    );
    let result = template_repo::save(&app, template);
    if let Err(error) = &result {
        app_logger::log_error(&app, "template.save.failed", format!("error={}", error));
    }
    result
}

#[tauri::command]
pub fn delete_template(app: AppHandle, template_id: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "template.delete.start",
        format!("id={}", template_id),
    );
    let result = template_repo::delete(&app, &template_id);
    if let Err(error) = &result {
        app_logger::log_error(&app, "template.delete.failed", format!("error={}", error));
    }
    result
}

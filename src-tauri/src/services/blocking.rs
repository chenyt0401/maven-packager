use crate::error::{to_user_error, AppResult};

pub async fn run<T, F>(task: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| to_user_error(format!("后台任务执行失败：{}", error)))?
}

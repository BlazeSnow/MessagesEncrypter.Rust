//! 应用设置与元信息命令。

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::keystore;
use crate::state::AppState;

use super::{join_blocking, resign, spawn_blocking};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsDto {
    pub export_folder: Option<String>,
    pub display_language: String,
    pub selected_recipient_fingerprint: Option<String>,
    pub selected_private_fingerprint: Option<String>,
}

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> AppResult<AppSettingsDto> {
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let get = |key: &str| keystore::get_setting(&db_path, key).unwrap_or(None);
        Ok(AppSettingsDto {
            export_folder: get(keystore::SETTING_EXPORT_FOLDER_PATH),
            display_language: get(keystore::SETTING_DISPLAY_LANGUAGE)
                .unwrap_or_else(|| "auto".to_string()),
            selected_recipient_fingerprint: get(keystore::SETTING_SELECTED_RECIPIENT),
            selected_private_fingerprint: get(keystore::SETTING_SELECTED_PRIVATE),
        })
    }))
    .await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        keystore::set_setting(&db_path, &key, &value)?;
        resign(&db_path)
    }))
    .await
}

/// 启动时读取语言偏好；不受密钥库完整性状态限制（语言初始化必须先于 UI）。
#[tauri::command]
pub async fn get_language_preference(state: State<'_, AppState>) -> AppResult<String> {
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        Ok(
            keystore::get_setting(&db_path, keystore::SETTING_DISPLAY_LANGUAGE)
                .unwrap_or(None)
                .unwrap_or_else(|| "auto".to_string()),
        )
    }))
    .await
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.display().to_string()
}

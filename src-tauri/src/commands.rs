//! Tauri IPC 命令层：参数校验 + 错误码转换，不写业务逻辑。
//! 重活全部 `spawn_blocking`，避免冻结界面。

use serde::Serialize;
use tauri::AppHandle;
use tauri::State;

use crate::credman;
use crate::error::{internal_error, AppError, AppResult};
use crate::integrity::IntegrityState;
use crate::keys;
use crate::keystore::{self, KeyRecord};
use crate::protocol_v1;
use crate::state::AppState;

pub const CATEGORY_RECIPIENT: &str = keystore::CATEGORY_RECIPIENT;
pub const CATEGORY_PRIVATE: &str = keystore::CATEGORY_PRIVATE;

/// 应用自身改库后必须重签。
fn resign(db_path: &std::path::Path) -> AppResult<()> {
    crate::integrity::sign_file(db_path, credman::INTEGRITY_KEY_TARGET_NAME, false)
}

fn spawn_blocking<F, T>(task: F) -> tauri::async_runtime::JoinHandle<AppResult<T>>
where
    F: FnOnce() -> AppResult<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
}

async fn join_blocking<T>(handle: tauri::async_runtime::JoinHandle<AppResult<T>>) -> AppResult<T> {
    handle.await.map_err(|_| internal_error())?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeyEntryDto {
    pub category: String,
    pub alias: String,
    pub fingerprint: String,
    pub public_key_pem: Option<String>,
    pub encrypted_private_key_pem: Option<String>,
    pub key_type: String,
}

fn key_type_of(record: &KeyRecord) -> String {
    match record.category.as_str() {
        CATEGORY_PRIVATE => {
            // 列表展示不触发密码派生：按加密数据长度估算位数。
            record
                .encrypted_private_key_pem
                .as_deref()
                .and_then(keys::estimate_private_key_bits)
                .map(|bits| format!("RSA{bits}"))
                .unwrap_or_default()
        }
        _ => record
            .public_key_pem
            .as_deref()
            .and_then(keys::public_key_bits)
            .map(|bits| format!("RSA{bits}"))
            .unwrap_or_default(),
    }
}

fn dto_of(record: KeyRecord) -> KeyEntryDto {
    KeyEntryDto {
        key_type: key_type_of(&record),
        category: record.category,
        alias: record.alias,
        fingerprint: record.fingerprint,
        public_key_pem: record.public_key_pem,
        encrypted_private_key_pem: record.encrypted_private_key_pem,
    }
}

fn clean_alias(alias: &str) -> AppResult<String> {
    let trimmed = alias.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("ErrorKeyAliasRequired"));
    }
    Ok(trimmed.to_string())
}

fn validate_category(category: &str) -> AppResult<()> {
    match category {
        CATEGORY_RECIPIENT | CATEGORY_PRIVATE => Ok(()),
        _ => Err(internal_error()),
    }
}

#[tauri::command]
pub async fn get_key_store_state(state: State<'_, AppState>) -> AppResult<String> {
    let current = *state.integrity.lock().unwrap();
    Ok(match current {
        IntegrityState::Ok => "ok".to_string(),
        IntegrityState::SignatureMissing => "signatureMissing".to_string(),
        IntegrityState::Invalid => "invalid".to_string(),
    })
}

/// 「忽略并重新签名」：信任当前密钥库。
#[tauri::command]
pub async fn trust_key_store(state: State<'_, AppState>) -> AppResult<()> {
    let db_path = state.db_path();
    let integrity = state.integrity.clone();
    join_blocking(spawn_blocking(move || {
        crate::integrity::trust_current_store(&db_path, credman::INTEGRITY_KEY_TARGET_NAME)?;
        *integrity.lock().unwrap() = IntegrityState::Ok;
        Ok(())
    }))
    .await
}

#[tauri::command]
pub async fn list_keys(
    state: State<'_, AppState>,
    category: String,
) -> AppResult<Vec<KeyEntryDto>> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let records = keystore::list_keys(&db_path, &category)?;
        Ok(records.into_iter().map(dto_of).collect())
    }))
    .await
}

#[tauri::command]
pub async fn generate_key_pair(
    state: State<'_, AppState>,
    alias: String,
    key_size_bits: usize,
    password: String,
    remember_password: bool,
) -> AppResult<KeyEntryDto> {
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let material = keys::generate_key_pair(&password, key_size_bits)?;
        let sort_order = keystore::list_keys(&db_path, CATEGORY_PRIVATE)?.len();
        let record = KeyRecord {
            category: CATEGORY_PRIVATE.to_string(),
            alias,
            fingerprint: material.fingerprint.clone(),
            public_key_pem: Some(material.public_key_pem),
            encrypted_private_key_pem: Some(material.encrypted_private_key_pem),
        };
        if !keystore::insert_key(&db_path, &record, sort_order)? {
            return Err(AppError::new("ErrorDuplicateKey"));
        }
        resign(&db_path)?;
        if remember_password {
            let _ = crate::credman::write_private_key_password(&material.fingerprint, &password);
        }
        Ok(dto_of(record))
    }))
    .await
}

#[tauri::command]
pub async fn import_public_key(
    state: State<'_, AppState>,
    alias: String,
    public_key_pem: String,
) -> AppResult<KeyEntryDto> {
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let (normalized, fingerprint, _bits) = keys::import_public_key(&public_key_pem)?;
        let sort_order = keystore::list_keys(&db_path, CATEGORY_RECIPIENT)?.len();
        let record = KeyRecord {
            category: CATEGORY_RECIPIENT.to_string(),
            alias,
            fingerprint,
            public_key_pem: Some(normalized),
            encrypted_private_key_pem: None,
        };
        if !keystore::insert_key(&db_path, &record, sort_order)? {
            return Err(AppError::new("ErrorDuplicateKey"));
        }
        resign(&db_path)?;
        Ok(dto_of(record))
    }))
    .await
}

#[tauri::command]
pub async fn import_private_key(
    state: State<'_, AppState>,
    alias: String,
    private_key_pem: String,
    password: String,
    remember_password: bool,
) -> AppResult<KeyEntryDto> {
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let material = keys::import_key_pair(&private_key_pem, &password)?;
        let sort_order = keystore::list_keys(&db_path, CATEGORY_PRIVATE)?.len();
        let record = KeyRecord {
            category: CATEGORY_PRIVATE.to_string(),
            alias,
            fingerprint: material.fingerprint.clone(),
            public_key_pem: Some(material.public_key_pem),
            encrypted_private_key_pem: Some(material.encrypted_private_key_pem),
        };
        if !keystore::insert_key(&db_path, &record, sort_order)? {
            return Err(AppError::new("ErrorDuplicateKey"));
        }
        resign(&db_path)?;
        if remember_password {
            let _ = crate::credman::write_private_key_password(&material.fingerprint, &password);
        }
        Ok(dto_of(record))
    }))
    .await
}

#[tauri::command]
pub async fn rename_key(
    state: State<'_, AppState>,
    category: String,
    fingerprint: String,
    alias: String,
) -> AppResult<()> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        if !keystore::update_alias(&db_path, &category, &fingerprint, &alias)? {
            return Err(internal_error());
        }
        resign(&db_path)
    }))
    .await
}

#[tauri::command]
pub async fn delete_key(
    state: State<'_, AppState>,
    category: String,
    fingerprint: String,
) -> AppResult<()> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        keystore::delete_key(&db_path, &category, &fingerprint)?;
        resign(&db_path)?;
        if category == CATEGORY_PRIVATE {
            // 库保存成功后才删除记住的密码（与原版一致）。
            let _ = crate::credman::delete_private_key_password(&fingerprint);
        }
        Ok(())
    }))
    .await
}

#[tauri::command]
pub async fn change_private_key_password(
    state: State<'_, AppState>,
    fingerprint: String,
    old_password: String,
    new_password: String,
    remember_password: bool,
) -> AppResult<()> {
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let record = keystore::get_key(&db_path, CATEGORY_PRIVATE, &fingerprint)?
            .ok_or_else(internal_error)?;
        let pem = record
            .encrypted_private_key_pem
            .ok_or_else(internal_error)?;
        let new_pem = keys::change_private_key_password(&pem, &old_password, &new_password)?;
        keystore::update_encrypted_private_key(&db_path, CATEGORY_PRIVATE, &fingerprint, &new_pem)?;
        resign(&db_path)?;
        if remember_password {
            let _ = crate::credman::write_private_key_password(&fingerprint, &new_password);
        } else {
            let _ = crate::credman::delete_private_key_password(&fingerprint);
        }
        Ok(())
    }))
    .await
}

#[tauri::command]
pub async fn encrypt_message(
    state: State<'_, AppState>,
    recipient_fingerprint: String,
    plain_text: String,
) -> AppResult<String> {
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let record = keystore::get_key(&db_path, CATEGORY_RECIPIENT, &recipient_fingerprint)?
            .ok_or_else(internal_error)?;
        let pem = record
            .public_key_pem
            .ok_or_else(|| AppError::new(protocol_v1::ERROR_PUBLIC_KEY_REQUIRED))?;
        protocol_v1::encrypt_to_base64_json(&pem, &plain_text).map_err(|e| AppError::new(e.code))
    }))
    .await
}

#[tauri::command]
pub async fn decrypt_message(
    state: State<'_, AppState>,
    private_fingerprint: String,
    package: String,
    use_saved_password: bool,
    password: Option<String>,
    remember_password: bool,
) -> AppResult<String> {
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let record = keystore::get_key(&db_path, CATEGORY_PRIVATE, &private_fingerprint)?
            .ok_or_else(internal_error)?;
        let pem = record
            .encrypted_private_key_pem
            .ok_or_else(|| AppError::new(protocol_v1::ERROR_PRIVATE_KEY_REQUIRED))?;

        let resolved: Option<String> = if use_saved_password {
            crate::credman::read_private_key_password(&private_fingerprint)
                .map_err(|_| internal_error())?
        } else {
            password.filter(|p| !p.is_empty())
        };
        let Some(password) = resolved else {
            return Err(AppError::new(protocol_v1::ERROR_PASSWORD_REQUIRED));
        };

        let plain = protocol_v1::decrypt_from_base64_json(&pem, &password, &package)
            .map_err(|e| AppError::new(e.code))?;
        if remember_password {
            let _ = crate::credman::write_private_key_password(&private_fingerprint, &password);
        }
        Ok(plain)
    }))
    .await
}

#[tauri::command]
pub async fn has_saved_password(
    state: State<'_, AppState>,
    private_fingerprint: String,
) -> AppResult<bool> {
    state.require_healthy_store()?;
    join_blocking(spawn_blocking(move || {
        let has = crate::credman::read_private_key_password(&private_fingerprint)
            .map_err(|_| internal_error())?
            .is_some();
        Ok(has)
    }))
    .await
}

/// 导出密钥到导出目录（默认下载目录），并在资源管理器中定位文件。
#[tauri::command]
pub async fn export_key(
    state: State<'_, AppState>,
    category: String,
    fingerprint: String,
) -> AppResult<String> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let record =
            keystore::get_key(&db_path, &category, &fingerprint)?.ok_or_else(internal_error)?;
        let (extension, content) = match category.as_str() {
            CATEGORY_RECIPIENT => (
                "pub",
                record
                    .public_key_pem
                    .ok_or_else(|| AppError::new("ErrorPublicKeyRequired"))?,
            ),
            _ => (
                "pem",
                record
                    .encrypted_private_key_pem
                    .ok_or_else(|| AppError::new("ErrorPrivateKeyRequired"))?,
            ),
        };

        let folder = keystore::get_setting(&db_path, keystore::SETTING_EXPORT_FOLDER_PATH)?
            .filter(|p| !p.trim().is_empty())
            .unwrap_or_else(default_downloads_dir);
        std::fs::create_dir_all(&folder).map_err(|_| AppError::new("ErrorExportFailed"))?;

        let file_name = format!("{}.{}", sanitize_file_name(&record.alias), extension);
        let path = std::path::Path::new(&folder).join(file_name);
        std::fs::write(&path, content).map_err(|_| AppError::new("ErrorExportFailed"))?;

        // 在资源管理器中定位（失败不影响导出结果）。
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn();
        Ok(path.display().to_string())
    }))
    .await
}

fn default_downloads_dir() -> String {
    std::env::var_os("USERPROFILE")
        .map(std::path::PathBuf::from)
        .map(|p| p.join("Downloads").display().to_string())
        .unwrap_or_else(|| ".".to_string())
}

fn sanitize_file_name(alias: &str) -> String {
    let name: String = alias
        .trim()
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 32
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    if name.trim().is_empty() {
        "key".to_string()
    } else {
        name
    }
}

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

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.display().to_string()
}

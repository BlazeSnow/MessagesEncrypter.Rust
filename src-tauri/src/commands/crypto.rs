//! 加解密命令。

use tauri::State;

use crate::credman;
use crate::error::{internal_error, AppError, AppResult};
use crate::keystore;
use crate::protocol_v1;
use crate::state::AppState;

use super::{join_blocking, spawn_blocking, CATEGORY_PRIVATE, CATEGORY_RECIPIENT};

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
            credman::read_private_key_password(&private_fingerprint).map_err(|_| internal_error())?
        } else {
            password.filter(|p| !p.is_empty())
        };
        let Some(password) = resolved else {
            return Err(AppError::new(protocol_v1::ERROR_PASSWORD_REQUIRED));
        };

        let plain = protocol_v1::decrypt_from_base64_json(&pem, &password, &package)
            .map_err(|e| AppError::new(e.code))?;
        if remember_password {
            let _ = credman::write_private_key_password(&private_fingerprint, &password);
        }
        Ok(plain)
    }))
    .await
}

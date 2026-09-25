//! 密钥库状态与完整性命令。

use tauri::State;

use crate::credman;
use crate::error::AppResult;
use crate::integrity::IntegrityState;
use crate::state::AppState;

use super::{join_blocking, spawn_blocking};

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

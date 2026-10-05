//! 全局应用状态。

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;

use crate::integrity::IntegrityState;

pub struct AppState {
    pub data_dir: PathBuf,
    pub integrity: Arc<Mutex<IntegrityState>>,
}

impl AppState {
    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("keys.db")
    }

    /// 除完整性处理命令外的所有密钥操作都要求密钥库可用。
    pub fn require_healthy_store(&self) -> Result<(), crate::error::AppError> {
        let state = *self.integrity.lock().unwrap();
        match state.error_code() {
            Some(code) => Err(crate::error::AppError::new(code)),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_with(integrity: IntegrityState) -> AppState {
        AppState {
            data_dir: std::path::PathBuf::from("app-data"),
            integrity: Arc::new(Mutex::new(integrity)),
        }
    }

    #[test]
    fn db_path_is_keys_db_under_data_dir() {
        assert_eq!(
            state_with(IntegrityState::Ok).db_path(),
            std::path::PathBuf::from("app-data").join("keys.db")
        );
    }

    #[test]
    fn healthy_store_allows_ok_and_maps_integrity_error_codes() {
        state_with(IntegrityState::Ok)
            .require_healthy_store()
            .unwrap();
        assert_eq!(
            state_with(IntegrityState::SignatureMissing)
                .require_healthy_store()
                .unwrap_err()
                .code,
            "ErrorKeyStoreIntegrityMissing"
        );
        assert_eq!(
            state_with(IntegrityState::Invalid)
                .require_healthy_store()
                .unwrap_err()
                .code,
            "ErrorKeyStoreIntegrityInvalid"
        );
    }
}

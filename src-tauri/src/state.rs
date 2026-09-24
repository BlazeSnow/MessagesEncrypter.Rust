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

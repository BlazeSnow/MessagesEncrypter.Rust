//! Tauri IPC 命令层：参数校验 + 错误码转换，不写业务逻辑。
//! 重活全部 `spawn_blocking`，避免冻结界面。
//!
//! 按域拆分：`integrity`（密钥库状态）、`keys`（密钥管理）、`crypto`（加解密）、
//! `store`（设置与元信息）；本文件只放共享工具与 DTO。

pub mod crypto;
pub mod integrity;
pub mod keys;
pub mod store;

use serde::Serialize;

use crate::credman;
use crate::error::{internal_error, AppError, AppResult};
use crate::keys as key_mgmt;
use crate::keystore::{self, KeyRecord};

pub const CATEGORY_RECIPIENT: &str = keystore::CATEGORY_RECIPIENT;
pub const CATEGORY_PRIVATE: &str = keystore::CATEGORY_PRIVATE;

/// 应用自身改库后必须重签。
pub(super) fn resign(db_path: &std::path::Path) -> AppResult<()> {
    crate::integrity::sign_file(db_path, credman::INTEGRITY_KEY_TARGET_NAME, false)
}

pub(super) fn spawn_blocking<F, T>(task: F) -> tauri::async_runtime::JoinHandle<AppResult<T>>
where
    F: FnOnce() -> AppResult<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
}

pub(super) async fn join_blocking<T>(
    handle: tauri::async_runtime::JoinHandle<AppResult<T>>,
) -> AppResult<T> {
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

pub(super) fn key_type_of(record: &KeyRecord) -> String {
    match record.category.as_str() {
        CATEGORY_PRIVATE => {
            // 列表展示不触发密码派生：按加密数据长度估算位数。
            record
                .encrypted_private_key_pem
                .as_deref()
                .and_then(key_mgmt::estimate_private_key_bits)
                .map(|bits| format!("RSA{bits}"))
                .unwrap_or_default()
        }
        _ => record
            .public_key_pem
            .as_deref()
            .and_then(key_mgmt::public_key_bits)
            .map(|bits| format!("RSA{bits}"))
            .unwrap_or_default(),
    }
}

pub(super) fn dto_of(record: KeyRecord) -> KeyEntryDto {
    KeyEntryDto {
        key_type: key_type_of(&record),
        category: record.category,
        alias: record.alias,
        fingerprint: record.fingerprint,
        public_key_pem: record.public_key_pem,
        encrypted_private_key_pem: record.encrypted_private_key_pem,
    }
}

pub(super) fn clean_alias(alias: &str) -> AppResult<String> {
    let trimmed = alias.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("ErrorKeyAliasRequired"));
    }
    Ok(trimmed.to_string())
}

pub(super) fn validate_category(category: &str) -> AppResult<()> {
    match category {
        CATEGORY_RECIPIENT | CATEGORY_PRIVATE => Ok(()),
        _ => Err(internal_error()),
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dto_serializes_camel_case_for_frontend() {
        // 前端 KeyEntry 接口按 camelCase 读取，字段名是对外契约。
        let record = KeyRecord {
            category: CATEGORY_PRIVATE.to_string(),
            alias: "别名".to_string(),
            fingerprint: "FP1".to_string(),
            public_key_pem: Some("PUB".to_string()),
            encrypted_private_key_pem: Some("ENC".to_string()),
        };
        let json = serde_json::to_value(dto_of(record)).unwrap();
        for key in [
            "category",
            "alias",
            "fingerprint",
            "publicKeyPem",
            "encryptedPrivateKeyPem",
            "keyType",
        ] {
            assert!(json.get(key).is_some(), "缺少字段 {key}");
        }
        assert_eq!(json["publicKeyPem"], "PUB");
        assert_eq!(json["encryptedPrivateKeyPem"], "ENC");
        assert_eq!(json["category"], CATEGORY_PRIVATE);
    }

    #[test]
    fn key_type_empty_without_pem() {
        let record = KeyRecord {
            category: CATEGORY_RECIPIENT.to_string(),
            alias: "a".to_string(),
            fingerprint: "FP1".to_string(),
            public_key_pem: None,
            encrypted_private_key_pem: None,
        };
        assert_eq!(key_type_of(&record), "");
    }

    #[test]
    fn key_type_reports_generated_rsa_bits() {
        // 私钥按加密 PEM 估算位数，公钥按公钥 PEM 解析位数。
        let material = key_mgmt::generate_key_pair("test-password", 2048).unwrap();
        let private_record = KeyRecord {
            category: CATEGORY_PRIVATE.to_string(),
            alias: "a".to_string(),
            fingerprint: material.fingerprint.clone(),
            public_key_pem: None,
            encrypted_private_key_pem: Some(material.encrypted_private_key_pem.clone()),
        };
        let recipient_record = KeyRecord {
            category: CATEGORY_RECIPIENT.to_string(),
            alias: "a".to_string(),
            fingerprint: material.fingerprint.clone(),
            public_key_pem: Some(material.public_key_pem.clone()),
            encrypted_private_key_pem: None,
        };
        assert_eq!(key_type_of(&private_record), "RSA2048");
        assert_eq!(key_type_of(&recipient_record), "RSA2048");
    }
}

//! 密钥库完整性签名：HMAC-SHA256(keys.db) → keys.db.sig（见 references/storage.md §4）。
//!
//! 签名密钥存于 Windows 凭据管理器；`key_target` 可注入（测试用独立目标名）。

use std::path::Path;

use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

use crate::credman;
use crate::error::{internal_error, AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntegrityState {
    Ok,
    SignatureMissing,
    Invalid,
}

impl IntegrityState {
    pub fn error_code(self) -> Option<&'static str> {
        match self {
            IntegrityState::Ok => None,
            IntegrityState::SignatureMissing => Some("ErrorKeyStoreIntegrityMissing"),
            IntegrityState::Invalid => Some("ErrorKeyStoreIntegrityInvalid"),
        }
    }
}

pub fn signature_path(db_path: &Path) -> std::path::PathBuf {
    let mut name = db_path.file_name().unwrap_or_default().to_os_string();
    name.push(".sig");
    db_path.with_file_name(name)
}

/// 常数时间比较（长度相同的前提下）。
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// 读取已存在的完整性签名密钥；不存在返回 Ok(None)。
fn read_existing_integrity_key(key_target: &str) -> AppResult<Option<[u8; 32]>> {
    credman::read_integrity_key(key_target).map_err(|_| internal_error())
}

/// 载入签名密钥（仅签名路径使用；密钥不存在时创建）。
/// 写入后立即回读确认，防止凭据存储瞬时失败导致密钥被静默轮换、毁掉签名链。
/// reset 为 true 时先删除旧密钥。
fn load_or_create_integrity_key(key_target: &str, reset: bool) -> AppResult<[u8; 32]> {
    if reset {
        let _ = credman::delete_integrity_key(key_target);
    }
    if let Some(key) = read_existing_integrity_key(key_target)? {
        return Ok(key);
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    for _ in 0..3 {
        credman::write_integrity_key(key_target, &key).map_err(|_| internal_error())?;
        if read_existing_integrity_key(key_target)? == Some(key) {
            return Ok(key);
        }
    }
    Err(internal_error())
}

/// 读取签名密钥（仅校验路径使用）。密钥不存在时不创建——
/// 用新密钥校验旧签名必然失败，返回 Invalid 让用户走「重新签名」流程。
fn load_integrity_key_for_verify(key_target: &str) -> AppResult<AppResult<[u8; 32]>> {
    Ok(read_existing_integrity_key(key_target)?.ok_or(internal_error()))
}

fn compute_signature(key: &[u8; 32], data: &[u8]) -> AppResult<Vec<u8>> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|_| internal_error())?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

/// 生成签名并写入 `keys.db.sig`（Base64 单行 UTF-8）。
pub fn sign_file(db_path: &Path, key_target: &str, reset_integrity_key: bool) -> AppResult<()> {
    let key = load_or_create_integrity_key(key_target, reset_integrity_key)?;
    let data = std::fs::read(db_path).map_err(|_| internal_error())?;
    let signature = compute_signature(&key, &data)?;
    let text = crate::keys::base64_encode(&signature);
    std::fs::write(signature_path(db_path), text).map_err(|_| internal_error())?;
    Ok(())
}

/// 校验签名。库文件不存在视为通过（首次启动）。
pub fn verify_file(db_path: &Path, key_target: &str) -> AppResult<IntegrityState> {
    if !db_path.exists() {
        return Ok(IntegrityState::Ok);
    }
    let sig_path = signature_path(db_path);
    if !sig_path.exists() {
        return Ok(IntegrityState::SignatureMissing);
    }
    let text = match std::fs::read_to_string(&sig_path) {
        Ok(t) => t,
        Err(_) => return Ok(IntegrityState::Invalid),
    };
    let stored = match crate::keys::base64_decode(text.trim()) {
        Some(s) => s,
        None => return Ok(IntegrityState::Invalid),
    };
    let key = match load_integrity_key_for_verify(key_target)? {
        Ok(k) => k,
        Err(_) => return Ok(IntegrityState::Invalid),
    };
    let data = std::fs::read(db_path).map_err(|_| internal_error())?;
    let computed = compute_signature(&key, &data)?;
    if !constant_time_eq(&stored, &computed) {
        return Ok(IntegrityState::Invalid);
    }
    Ok(IntegrityState::Ok)
}

/// 信任当前库：用现有签名密钥重签；若签名密钥本身失效则重置后重签。
pub fn trust_current_store(db_path: &Path, key_target: &str) -> AppResult<()> {
    sign_file(db_path, key_target, false)?;
    if verify_file(db_path, key_target)? != IntegrityState::Ok {
        sign_file(db_path, key_target, true)?;
        if verify_file(db_path, key_target)? != IntegrityState::Ok {
            return Err(AppError::new("ErrorKeyStoreIntegrityInvalid"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_target(tag: &str) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("MessagesEncrypter.UnitTests.Integrity.{tag}.{nanos}")
    }

    fn temp_db(tag: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "me-integrity-{}-{tag}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("keys.db");
        std::fs::write(&db, b"fake-db-bytes").unwrap();
        (dir, db)
    }

    fn cleanup(dir: &std::path::Path, target: &str) {
        let _ = credman::delete_integrity_key(target);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn sign_then_verify_roundtrip() {
        let (dir, db) = temp_db("roundtrip");
        let target = unique_target("roundtrip");
        sign_file(&db, &target, false).unwrap();
        assert_eq!(verify_file(&db, &target).unwrap(), IntegrityState::Ok);
        cleanup(&dir, &target);
    }

    #[test]
    fn missing_db_and_missing_signature() {
        let (dir, db) = temp_db("missing");
        let target = unique_target("missing");
        // 库不存在 → 首次启动，视为通过。
        assert_eq!(
            verify_file(&dir.join("none.db"), &target).unwrap(),
            IntegrityState::Ok
        );
        // 有库无签名 → SignatureMissing。
        assert_eq!(
            verify_file(&db, &target).unwrap(),
            IntegrityState::SignatureMissing
        );
        cleanup(&dir, &target);
    }

    #[test]
    fn tamper_and_invalid_signature_detected() {
        let (dir, db) = temp_db("tamper");
        let target = unique_target("tamper");
        sign_file(&db, &target, false).unwrap();
        std::fs::write(&db, b"tampered-db-bytes").unwrap();
        assert_eq!(verify_file(&db, &target).unwrap(), IntegrityState::Invalid);

        // 签名不是 Base64。
        std::fs::write(signature_path(&db), "not base64 !!!").unwrap();
        assert_eq!(verify_file(&db, &target).unwrap(), IntegrityState::Invalid);

        // 改库后重签恢复。
        trust_current_store(&db, &target).unwrap();
        assert_eq!(verify_file(&db, &target).unwrap(), IntegrityState::Ok);
        cleanup(&dir, &target);
    }

    #[test]
    fn reset_integrity_key_rotates_key() {
        let (dir, db) = temp_db("reset");
        let target = unique_target("reset");
        sign_file(&db, &target, false).unwrap();
        let key_a = load_or_create_integrity_key(&target, false).unwrap();
        // 旋转密钥后旧签名失效，但重签（reset）后恢复。
        let key_b = load_or_create_integrity_key(&target, true).unwrap();
        assert_ne!(key_a, key_b);
        assert_eq!(verify_file(&db, &target).unwrap(), IntegrityState::Invalid);
        trust_current_store(&db, &target).unwrap();
        assert_eq!(verify_file(&db, &target).unwrap(), IntegrityState::Ok);
        cleanup(&dir, &target);
    }
}

//! Windows 凭据管理器访问（与原版 TargetName 约定兼容，见 references/storage.md §5）。
//!
//! - 完整性签名密钥：`MessagesEncrypter.KeyStoreIntegrityKey`
//!   Blob = 密钥 Base64 文本的 UTF-16LE 字节。
//! - 私钥密码：`MessagesEncrypter.PrivateKeyPassword.<指纹>`
//!   Blob = 密码字符串的 UTF-16LE 字节。
//!
//! 读取容错沿用原版：仅 ERROR_NOT_FOUND(1168) 视为不存在，其余错误重试 3 次（间隔 50ms）。

use std::ptr::null_mut;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::thread::sleep;
use std::time::Duration;

use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Foundation::ERROR_NOT_FOUND;
use windows_sys::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

pub const INTEGRITY_KEY_TARGET_NAME: &str = "MessagesEncrypter.KeyStoreIntegrityKey";
const PRIVATE_KEY_PASSWORD_TARGET_PREFIX: &str = "MessagesEncrypter.PrivateKeyPassword.";
const RETRY_ATTEMPTS: u32 = 3;
const RETRY_DELAY: Duration = Duration::from_millis(50);

/// Windows 凭据管理器在高并发（测试并行/多线程）下会出现瞬时失败，
/// 全部 Cred* 操作经此锁串行化。
fn cred_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn wide_bytes(s: &str) -> Vec<u8> {
    s.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()
}

fn decode_wide_lossy(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let end = units.iter().position(|&u| u == 0).unwrap_or(units.len());
    String::from_utf16_lossy(&units[..end])
}

fn current_user_name() -> String {
    std::env::var("USERNAME").unwrap_or_default()
}

/// 读取凭据 Blob；不存在返回 `Ok(None)`，其余 Win32 错误重试后返回 `Err(code)`。
fn read_credential(target: &str) -> Result<Option<Vec<u8>>, u32> {
    let _guard = cred_lock().lock().unwrap();
    let target_wide = wide(target);
    for attempt in 0..RETRY_ATTEMPTS {
        let mut credential: *mut CREDENTIALW = null_mut();
        let ok = unsafe { CredReadW(target_wide.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
        if ok != 0 {
            let blob = unsafe {
                std::slice::from_raw_parts(
                    (*credential).CredentialBlob as *const u8,
                    (*credential).CredentialBlobSize as usize,
                )
                .to_vec()
            };
            unsafe { CredFree(credential.cast()) };
            return Ok(Some(blob));
        }
        let err = unsafe { GetLastError() };
        if err == ERROR_NOT_FOUND {
            return Ok(None);
        }
        if attempt + 1 == RETRY_ATTEMPTS {
            return Err(err);
        }
        sleep(RETRY_DELAY);
    }
    Err(0)
}

fn write_credential(target: &str, blob: &[u8]) -> Result<(), u32> {
    let _guard = cred_lock().lock().unwrap();
    let target_wide = wide(target);
    let user_wide = wide(&current_user_name());
    let credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target_wide.as_ptr() as _,
        Comment: null_mut(),
        LastWritten: unsafe { std::mem::zeroed() },
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: null_mut(),
        TargetAlias: null_mut(),
        UserName: user_wide.as_ptr() as _,
    };
    let ok = unsafe { CredWriteW(&credential, 0) };
    if ok == 0 {
        return Err(unsafe { GetLastError() });
    }
    Ok(())
}

/// 删除凭据；不存在（1168）视为成功。
fn delete_credential(target: &str) -> Result<(), u32> {
    let _guard = cred_lock().lock().unwrap();
    let target_wide = wide(target);
    let ok = unsafe { CredDeleteW(target_wide.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok == 0 {
        let err = unsafe { GetLastError() };
        if err == ERROR_NOT_FOUND {
            return Ok(());
        }
        return Err(err);
    }
    Ok(())
}

fn private_key_password_target(fingerprint: &str) -> String {
    format!("{PRIVATE_KEY_PASSWORD_TARGET_PREFIX}{fingerprint}")
}

/// 读取完整性签名密钥（32 字节）。`target` 供测试注入独立目标名。
pub fn read_integrity_key(target: &str) -> Result<Option<[u8; 32]>, u32> {
    let Some(blob) = read_credential(target)? else {
        return Ok(None);
    };
    let text = decode_wide_lossy(&blob);
    let key = crate::keys::base64_decode(text.trim());
    Ok(key.and_then(|k| <[u8; 32]>::try_from(k).ok()))
}

pub fn write_integrity_key(target: &str, key: &[u8; 32]) -> Result<(), u32> {
    let text = crate::keys::base64_encode(key);
    write_credential(target, &wide_bytes(&text))
}

pub fn delete_integrity_key(target: &str) -> Result<(), u32> {
    delete_credential(target)
}

/// 读取记住的私钥密码。
pub fn read_private_key_password(fingerprint: &str) -> Result<Option<String>, u32> {
    let Some(blob) = read_credential(&private_key_password_target(fingerprint))? else {
        return Ok(None);
    };
    Ok(Some(decode_wide_lossy(&blob)))
}

pub fn write_private_key_password(fingerprint: &str, password: &str) -> Result<(), u32> {
    write_credential(
        &private_key_password_target(fingerprint),
        &wide_bytes(password),
    )
}

pub fn delete_private_key_password(fingerprint: &str) -> Result<(), u32> {
    delete_credential(&private_key_password_target(fingerprint))
}

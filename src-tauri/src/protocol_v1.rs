//! 密文包格式 v1（与原版逐字节兼容，见 references/protocol-v1.md）。
//!
//! 铁律：本模块不得依赖 Tauri、SQLite、窗口系统等宿主设施。

use std::fmt;

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use pkcs8::DecodePrivateKey as _;
use pkcs8::DecodePublicKey as _;
use pkcs8::SecretDocument;
use rand::rngs::OsRng;
use rand::RngCore;
use rsa::sha2::Sha256;
use rsa::traits::PublicKeyParts;
use rsa::{Oaep, RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub const MESSAGE_VERSION: i64 = 1;
pub const AES_KEY_SIZE_BYTES: usize = 32;
pub const AES_GCM_NONCE_SIZE_BYTES: usize = 12;
pub const AES_GCM_TAG_SIZE_BYTES: usize = 16;
pub const MINIMUM_RSA_KEY_SIZE_BITS: usize = 2048;

pub const ERROR_PLAIN_TEXT_REQUIRED: &str = "ErrorPlainTextRequired";
pub const ERROR_CIPHER_TEXT_REQUIRED: &str = "ErrorCipherTextRequired";
pub const ERROR_DECRYPT_FAILED: &str = "ErrorDecryptFailed";
pub const ERROR_UNSUPPORTED_MESSAGE_FORMAT: &str = "ErrorUnsupportedMessageFormat";
pub const ERROR_PRIVATE_KEY_REQUIRED: &str = "ErrorPrivateKeyRequired";
pub const ERROR_PASSWORD_REQUIRED: &str = "ErrorPasswordRequired";
pub const ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG: &str =
    "ErrorPrivateKeyInvalidOrPasswordWrong";
pub const ERROR_PRIVATE_KEY_TOO_SMALL: &str = "ErrorPrivateKeyTooSmall";
pub const ERROR_PUBLIC_KEY_REQUIRED: &str = "ErrorPublicKeyRequired";
pub const ERROR_PUBLIC_KEY_INVALID: &str = "ErrorPublicKeyInvalid";
pub const ERROR_PUBLIC_KEY_TOO_SMALL: &str = "ErrorPublicKeyTooSmall";

/// 协议层错误：只携带稳定错误码。
#[derive(Debug, Clone)]
pub struct ProtocolError {
    pub code: &'static str,
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)
    }
}

impl std::error::Error for ProtocolError {}

fn err(code: &'static str) -> ProtocolError {
    ProtocolError { code }
}

/// 线格式：未知字段忽略（serde 默认行为），可选字段缺失/为 null 均为 None。
#[derive(Deserialize)]
struct EncryptedMessagePackage {
    #[serde(default)]
    ver: i64,
    ek: Option<String>,
    nonce: Option<String>,
    tag: Option<String>,
    ct: Option<String>,
}

/// 输出恰好 5 个字段，字段名全小写。
#[derive(Serialize)]
struct PackageOut {
    ver: i64,
    ek: String,
    nonce: String,
    tag: String,
    ct: String,
}

fn parse_public_key(pem: &str) -> Result<RsaPublicKey, ProtocolError> {
    let pem = pem.trim();
    if pem.is_empty() {
        return Err(err(ERROR_PUBLIC_KEY_REQUIRED));
    }
    let key = RsaPublicKey::from_public_key_pem(pem).map_err(|_| err(ERROR_PUBLIC_KEY_INVALID))?;
    if key.n().bits() < MINIMUM_RSA_KEY_SIZE_BITS {
        return Err(err(ERROR_PUBLIC_KEY_TOO_SMALL));
    }
    Ok(key)
}

fn load_private_key(private_key_pem: &str, password: &str) -> Result<RsaPrivateKey, ProtocolError> {
    if private_key_pem.trim().is_empty() {
        return Err(err(ERROR_PRIVATE_KEY_REQUIRED));
    }
    if password.is_empty() {
        return Err(err(ERROR_PASSWORD_REQUIRED));
    }
    let (_, doc) = SecretDocument::from_pem(private_key_pem.trim())
        .map_err(|_| err(ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG))?;
    let epki = pkcs8::EncryptedPrivateKeyInfo::try_from(doc.as_bytes())
        .map_err(|_| err(ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG))?;
    let der = epki
        .decrypt(password)
        .map_err(|_| err(ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG))?;
    let key = RsaPrivateKey::from_pkcs8_der(der.as_bytes())
        .map_err(|_| err(ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG))?;
    if key.n().bits() < MINIMUM_RSA_KEY_SIZE_BITS {
        return Err(err(ERROR_PRIVATE_KEY_TOO_SMALL));
    }
    Ok(key)
}

/// 加密：RSA-OAEP-SHA256 封装随机会话密钥 + AES-256-GCM 加密 UTF-8 明文，
/// 输出 `Base64(UTF-8 JSON)`。每次调用生成新会话密钥与新 nonce。
pub fn encrypt_to_base64_json(
    public_key_pem: &str,
    plain_text: &str,
) -> Result<String, ProtocolError> {
    if plain_text.trim().is_empty() {
        return Err(err(ERROR_PLAIN_TEXT_REQUIRED));
    }
    let public_key = parse_public_key(public_key_pem)?;

    let mut session_key = [0u8; AES_KEY_SIZE_BYTES];
    let mut nonce_bytes = [0u8; AES_GCM_NONCE_SIZE_BYTES];
    OsRng.fill_bytes(&mut session_key);
    OsRng.fill_bytes(&mut nonce_bytes);

    let encrypted_key = public_key
        .encrypt(&mut OsRng, Oaep::new::<Sha256>(), &session_key)
        .map_err(|_| err(ERROR_PUBLIC_KEY_INVALID))?;

    let cipher = Aes256Gcm::new_from_slice(&session_key)
        .map_err(|_| err(ERROR_UNSUPPORTED_MESSAGE_FORMAT))?;
    let ct_with_tag = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plain_text.as_bytes())
        .map_err(|_| err(ERROR_UNSUPPORTED_MESSAGE_FORMAT))?;
    let (ct, tag) = ct_with_tag.split_at(ct_with_tag.len() - AES_GCM_TAG_SIZE_BYTES);

    let package = PackageOut {
        ver: MESSAGE_VERSION,
        ek: BASE64.encode(&encrypted_key),
        nonce: BASE64.encode(nonce_bytes),
        tag: BASE64.encode(tag),
        ct: BASE64.encode(ct),
    };
    let json = serde_json::to_vec(&package).map_err(|_| err(ERROR_UNSUPPORTED_MESSAGE_FORMAT))?;
    let result = BASE64.encode(&json);

    session_key.zeroize();
    Ok(result)
}

/// 解密：校验顺序与错误码与原版一致（见 references/protocol-v1.md §5）。
pub fn decrypt_from_base64_json(
    private_key_pem: &str,
    password: &str,
    input: &str,
) -> Result<String, ProtocolError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(err(ERROR_CIPHER_TEXT_REQUIRED));
    }

    let json_bytes = BASE64
        .decode(trimmed.as_bytes())
        .map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    let package: EncryptedMessagePackage =
        serde_json::from_slice(&json_bytes).map_err(|_| err(ERROR_DECRYPT_FAILED))?;

    if package.ver != MESSAGE_VERSION {
        return Err(err(ERROR_UNSUPPORTED_MESSAGE_FORMAT));
    }
    let (Some(ek), Some(nonce), Some(tag), Some(ct)) = (
        package.ek.as_deref(),
        package.nonce.as_deref(),
        package.tag.as_deref(),
        package.ct.as_deref(),
    ) else {
        return Err(err(ERROR_UNSUPPORTED_MESSAGE_FORMAT));
    };
    if ek.trim().is_empty()
        || nonce.trim().is_empty()
        || tag.trim().is_empty()
        || ct.trim().is_empty()
    {
        return Err(err(ERROR_UNSUPPORTED_MESSAGE_FORMAT));
    }

    let ek_bytes = BASE64.decode(ek).map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    let nonce_bytes = BASE64
        .decode(nonce)
        .map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    let tag_bytes = BASE64.decode(tag).map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    let ct_bytes = BASE64.decode(ct).map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    if nonce_bytes.len() != AES_GCM_NONCE_SIZE_BYTES || tag_bytes.len() != AES_GCM_TAG_SIZE_BYTES {
        return Err(err(ERROR_UNSUPPORTED_MESSAGE_FORMAT));
    }

    let private_key = load_private_key(private_key_pem, password)?;

    let session_key = private_key
        .decrypt(Oaep::new::<Sha256>(), &ek_bytes)
        .map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    if session_key.len() != AES_KEY_SIZE_BYTES {
        return Err(err(ERROR_UNSUPPORTED_MESSAGE_FORMAT));
    }

    let mut ct_with_tag = ct_bytes.clone();
    ct_with_tag.extend_from_slice(&tag_bytes);
    let cipher = Aes256Gcm::new_from_slice(&session_key)
        .map_err(|_| err(ERROR_UNSUPPORTED_MESSAGE_FORMAT))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ct_with_tag.as_ref())
        .map_err(|_| err(ERROR_DECRYPT_FAILED))?;
    String::from_utf8(plaintext).map_err(|_| err(ERROR_DECRYPT_FAILED))
}

#[cfg(test)]
mod tests;

//! 密钥生成、导入、指纹与密码保护（与原版兼容，见 references/key-management.md）。
//!
//! 私钥存储格式与原版一致：加密 PKCS#8 PEM，
//! PBES2 = PBKDF2-HMAC-SHA256 ×600000 + AES-256-CBC。

use pkcs8::der::Decode as _;
use pkcs8::DecodePrivateKey;
use pkcs8::DecodePublicKey;
use pkcs8::EncodePrivateKey;
use pkcs8::EncodePublicKey;
use pkcs8::LineEnding;
use pkcs8::PrivateKeyInfo;
use pkcs8::SecretDocument;
use rand::rngs::OsRng;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::sha2::{Digest, Sha256};
use rsa::traits::PublicKeyParts;
use rsa::RsaPrivateKey;
use rsa::RsaPublicKey;

use crate::error::{internal_error, AppError, AppResult};

#[cfg(test)]
#[path = "keys_tests.rs"]
mod tests;

pub const MIN_RSA_KEY_SIZE_BITS: usize = 2048;
/// UI 默认值（前端写死 4096，此常量作为文档与后端兜底）。
#[allow(dead_code)]
pub const DEFAULT_RSA_KEY_SIZE_BITS: usize = 4096;
pub const SUPPORTED_RSA_KEY_SIZES_BITS: [usize; 4] = [2048, 3072, 4096, 8192];
pub const PRIVATE_KEY_PBKDF2_ITERATIONS: u32 = 600_000;
pub const FINGERPRINT_BYTES: usize = 16;

pub const ERROR_PASSWORD_REQUIRED: &str = "ErrorPasswordRequired";
pub const ERROR_UNSUPPORTED_RSA_KEY_SIZE: &str = "ErrorUnsupportedRsaKeySize";
pub const ERROR_PRIVATE_KEY_REQUIRED: &str = "ErrorPrivateKeyRequired";
pub const ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG: &str =
    "ErrorPrivateKeyInvalidOrPasswordWrong";
pub const ERROR_PRIVATE_KEY_TOO_SMALL: &str = "ErrorPrivateKeyTooSmall";
pub const ERROR_PUBLIC_KEY_REQUIRED: &str = "ErrorPublicKeyRequired";
pub const ERROR_PUBLIC_KEY_INVALID: &str = "ErrorPublicKeyInvalid";
pub const ERROR_PUBLIC_KEY_TOO_SMALL: &str = "ErrorPublicKeyTooSmall";

/// 一组完整的密钥材料（公钥 PEM、加密私钥 PEM、指纹、位数）。
#[derive(Debug, Clone)]
pub struct KeyPairMaterial {
    pub public_key_pem: String,
    pub encrypted_private_key_pem: String,
    pub fingerprint: String,
    /// 生成时写入；导入路径由 PEM/密钥位长另行推断，故允许未读。
    #[allow(dead_code)]
    pub key_size_bits: usize,
}

fn error(code: &str) -> AppError {
    AppError::new(code)
}

/// 指纹 = SHA256(公钥 SPKI DER) 前 16 字节、32 位大写十六进制（不可变更）。
pub fn fingerprint_from_spki_der(spki_der: &[u8]) -> String {
    let digest = Sha256::digest(spki_der);
    digest[..FINGERPRINT_BYTES]
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect()
}

pub fn fingerprint_from_public_key(key: &RsaPublicKey) -> AppResult<String> {
    let der = key.to_public_key_der().map_err(|_| internal_error())?;
    Ok(fingerprint_from_spki_der(der.as_bytes()))
}

/// 加密私钥 PEM（存储格式）。
pub fn encrypt_private_key_pem(key: &RsaPrivateKey, password: &str) -> AppResult<String> {
    let doc = key.to_pkcs8_der().map_err(|_| internal_error())?;
    let mut salt = [0u8; 16];
    let mut iv = [0u8; 16];
    use rand::RngCore;
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut iv);
    let params = pkcs8::pkcs5::pbes2::Parameters::pbkdf2_sha256_aes256cbc(
        PRIVATE_KEY_PBKDF2_ITERATIONS,
        &salt,
        &iv,
    )
    .map_err(|_| internal_error())?;
    let info = PrivateKeyInfo::from_der(doc.as_bytes()).map_err(|_| internal_error())?;
    let encrypted = info
        .encrypt_with_params(params, password)
        .map_err(|_| internal_error())?;
    encrypted
        .to_pem("ENCRYPTED PRIVATE KEY", LineEnding::LF)
        .map(|pem| pem.to_string())
        .map_err(|_| internal_error())
}

/// 解密私钥 PEM；格式错误或密码错误统一返回 `ErrorPrivateKeyInvalidOrPasswordWrong`。
pub fn decrypt_private_key_pem(enc_pem: &str, password: &str) -> AppResult<RsaPrivateKey> {
    let invalid = || error(ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG);
    let trimmed = enc_pem.trim();
    if trimmed.is_empty() {
        return Err(error(ERROR_PRIVATE_KEY_REQUIRED));
    }
    let (_, doc) = SecretDocument::from_pem(trimmed).map_err(|_| invalid())?;
    let epki = pkcs8::EncryptedPrivateKeyInfo::try_from(doc.as_bytes()).map_err(|_| invalid())?;
    let der = epki.decrypt(password).map_err(|_| invalid())?;
    RsaPrivateKey::from_pkcs8_der(der.as_bytes()).map_err(|_| invalid())
}

/// 生成 RSA 私钥：Windows 优先 CNG（与旧版 .NET 同源，8192 位秒级），
/// 失败回退纯 Rust 实现（8192 位可能耗时数分钟）。
fn generate_private_key(key_size_bits: usize) -> AppResult<RsaPrivateKey> {
    #[cfg(windows)]
    if let Ok(key) = crate::cng::generate_components(key_size_bits) {
        return Ok(key);
    }
    RsaPrivateKey::new(&mut OsRng, key_size_bits).map_err(|_| internal_error())
}

/// 生成密钥对。
pub fn generate_key_pair(password: &str, key_size_bits: usize) -> AppResult<KeyPairMaterial> {
    if password.trim().is_empty() {
        return Err(error(ERROR_PASSWORD_REQUIRED));
    }
    if !SUPPORTED_RSA_KEY_SIZES_BITS.contains(&key_size_bits) {
        return Err(error(ERROR_UNSUPPORTED_RSA_KEY_SIZE));
    }
    let private_key = generate_private_key(key_size_bits)?;
    let public_key = private_key.to_public_key();
    let public_key_pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|_| internal_error())?;
    let encrypted_private_key_pem = encrypt_private_key_pem(&private_key, password)?;
    let fingerprint = fingerprint_from_public_key(&public_key)?;
    Ok(KeyPairMaterial {
        public_key_pem,
        encrypted_private_key_pem,
        fingerprint,
        key_size_bits,
    })
}

/// 导入私钥：先按加密 PEM 解析（原样保留）；失败则按明文 PEM（PKCS#8/PKCS#1）
/// 解析并按存储参数重新加密。公钥由私钥确定性派生。
pub fn import_key_pair(private_key_pem: &str, password: &str) -> AppResult<KeyPairMaterial> {
    if password.trim().is_empty() {
        return Err(error(ERROR_PASSWORD_REQUIRED));
    }
    let trimmed = private_key_pem.trim();
    if trimmed.is_empty() {
        return Err(error(ERROR_PRIVATE_KEY_REQUIRED));
    }

    // 先按加密 PEM 尝试。
    let private_key = match decrypt_private_key_pem(trimmed, password) {
        Ok(key) => key,
        Err(first) => {
            // 再按明文 PEM 尝试（PKCS#8 → PKCS#1）。
            let parsed = RsaPrivateKey::from_pkcs8_pem(trimmed)
                .or_else(|_| RsaPrivateKey::from_pkcs1_pem(trimmed))
                .map_err(|_| first)?;
            if parsed.n().bits() < MIN_RSA_KEY_SIZE_BITS {
                return Err(error(ERROR_PRIVATE_KEY_TOO_SMALL));
            }
            parsed
        }
    };

    if private_key.n().bits() < MIN_RSA_KEY_SIZE_BITS {
        return Err(error(ERROR_PRIVATE_KEY_TOO_SMALL));
    }

    // 已是合法加密 PEM 则原样保留；否则按存储参数重新加密。
    let encrypted = if private_key_matches_encrypted_pem(trimmed, &private_key, password) {
        trimmed.to_string()
    } else {
        encrypt_private_key_pem(&private_key, password)?
    };

    let public_key = private_key.to_public_key();
    let public_key_pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|_| internal_error())?;
    let fingerprint = fingerprint_from_public_key(&public_key)?;
    Ok(KeyPairMaterial {
        public_key_pem,
        encrypted_private_key_pem: encrypted,
        fingerprint,
        key_size_bits: private_key.n().bits(),
    })
}

fn private_key_matches_encrypted_pem(pem: &str, key: &RsaPrivateKey, password: &str) -> bool {
    match decrypt_private_key_pem(pem, password) {
        Ok(parsed) => match (
            fingerprint_from_public_key(&parsed.to_public_key()),
            fingerprint_from_public_key(&key.to_public_key()),
        ) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        },
        Err(_) => false,
    }
}

/// 导入公钥：返回（规范化 SPKI PEM、指纹、位数）。拒绝含私钥材料的 PEM
/// （SPKI 解析本身即拒绝私钥格式）。
pub fn import_public_key(public_key_pem: &str) -> AppResult<(String, String, usize)> {
    let trimmed = public_key_pem.trim();
    if trimmed.is_empty() {
        return Err(error(ERROR_PUBLIC_KEY_REQUIRED));
    }
    let key =
        RsaPublicKey::from_public_key_pem(trimmed).map_err(|_| error(ERROR_PUBLIC_KEY_INVALID))?;
    if key.n().bits() < MIN_RSA_KEY_SIZE_BITS {
        return Err(error(ERROR_PUBLIC_KEY_TOO_SMALL));
    }
    let normalized = key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|_| internal_error())?;
    let fingerprint = fingerprint_from_public_key(&key)?;
    Ok((normalized, fingerprint, key.n().bits()))
}

/// 修改私钥密码：旧密码解密 → 新密码按相同 PBE 参数重加密；指纹不变。
pub fn change_private_key_password(
    encrypted_pem: &str,
    old_password: &str,
    new_password: &str,
) -> AppResult<String> {
    if old_password.trim().is_empty() || new_password.trim().is_empty() {
        return Err(error(ERROR_PASSWORD_REQUIRED));
    }
    let key = decrypt_private_key_pem(encrypted_pem, old_password)?;
    encrypt_private_key_pem(&key, new_password)
}

/// 从加密私钥 PEM 估算密钥位数（用于列表展示，不触发密码派生）：
/// 加密数据长度 ≈ PKCS#8 DER 长度 AES-CBC 填充后的结果，区间互不重叠。
pub fn estimate_private_key_bits(encrypted_pem: &str) -> Option<usize> {
    let (_, doc) = SecretDocument::from_pem(encrypted_pem.trim()).ok()?;
    let epki = pkcs8::EncryptedPrivateKeyInfo::try_from(doc.as_bytes()).ok()?;
    let len = epki.encrypted_data.len();
    Some(if len < 1500 {
        2048
    } else if len < 2_100 {
        3072
    } else if len < 3_200 {
        4096
    } else {
        8192
    })
}

pub fn public_key_bits(public_key_pem: &str) -> Option<usize> {
    RsaPublicKey::from_public_key_pem(public_key_pem.trim())
        .ok()
        .map(|k| k.n().bits())
}

/// Base64 编码（标准字母表，含 padding，与原版一致）。
pub fn base64_encode(data: &[u8]) -> String {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine as _;
    STANDARD.encode(data)
}

pub fn base64_decode(data: &str) -> Option<Vec<u8>> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine as _;
    STANDARD.decode(data).ok()
}

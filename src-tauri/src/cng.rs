//! Windows CNG（BCrypt）RSA 密钥生成：与旧版 .NET 同源，8192 位秒级完成。
//!
//! 导出 BCRYPT_RSAFULLPRIVATE_BLOB 并重建 RsaPrivateKey，存储与互操作层完全不变。
//! 纯 Rust（rsa crate）的 8192 位生成耗时数分钟，故 Windows 上优先走 CNG。

use rand::rngs::OsRng;
use rsa::sha2::Sha256;
use rsa::traits::PublicKeyParts as _;
use rsa::BigUint;
use rsa::RsaPrivateKey;

use crate::error::{internal_error, AppResult};

fn nt_ok(status: i32) -> AppResult<()> {
    if status >= 0 {
        Ok(())
    } else {
        Err(internal_error())
    }
}

/// 生成并导出 CNG RSA 密钥，重建为 RsaPrivateKey（含 validate 与加解密自检）。
pub fn generate_components(bits: usize) -> AppResult<RsaPrivateKey> {
    use windows_sys::Win32::Security::Cryptography::{
        BCryptCloseAlgorithmProvider, BCryptDestroyKey, BCryptExportKey, BCryptFinalizeKeyPair,
        BCryptGenerateKeyPair, BCryptOpenAlgorithmProvider, BCRYPT_ALG_HANDLE,
        BCRYPT_KEY_HANDLE, BCRYPT_RSAFULLPRIVATE_BLOB, BCRYPT_RSA_ALGORITHM,
    };

    unsafe {
        let mut alg: BCRYPT_ALG_HANDLE = std::ptr::null_mut();
        nt_ok(BCryptOpenAlgorithmProvider(
            &mut alg,
            BCRYPT_RSA_ALGORITHM,
            std::ptr::null(),
            0,
        ))?;
        let mut key: BCRYPT_KEY_HANDLE = std::ptr::null_mut();
        let result = (|| {
            nt_ok(BCryptGenerateKeyPair(alg, &mut key, bits as u32, 0))?;
            nt_ok(BCryptFinalizeKeyPair(key, 0))?;

            let mut size: u32 = 0;
            nt_ok(BCryptExportKey(
                key,
                std::ptr::null_mut(),
                BCRYPT_RSAFULLPRIVATE_BLOB,
                std::ptr::null_mut(),
                0,
                &mut size,
                0,
            ))?;
            let mut blob = vec![0u8; size as usize];
            nt_ok(BCryptExportKey(
                key,
                std::ptr::null_mut(),
                BCRYPT_RSAFULLPRIVATE_BLOB,
                blob.as_mut_ptr(),
                size,
                &mut size,
                0,
            ))?;
            blob.truncate(size as usize);
            parse_full_private_blob(&blob, bits)
        })();
        BCryptDestroyKey(key);
        BCryptCloseAlgorithmProvider(alg, 0);
        result
    }
}

/// 解析 BCRYPT_RSAFULLPRIVATE_BLOB：
/// 头（magic, BitLength, cbPublicExp, cbModulus, cbPrime1, cbPrime2，均 u32LE）
/// + e, n, p, q, dp, dq, qinv, d（各块大端字节序）。
fn parse_full_private_blob(blob: &[u8], bits: usize) -> AppResult<RsaPrivateKey> {
    if blob.len() < 24 {
        return Err(internal_error());
    }
    let u32le = |off: usize| u32::from_le_bytes(blob[off..off + 4].try_into().expect("header"));
    let cb_e = u32le(8) as usize;
    let cb_n = u32le(12) as usize;
    let cb_p = u32le(16) as usize;
    let cb_q = u32le(20) as usize;
    let data = &blob[24..];
    let total = cb_e + cb_n + cb_p + cb_q * 4 + cb_n;
    if data.len() < total {
        return Err(internal_error());
    }
    let e = BigUint::from_bytes_be(&data[0..cb_e]);
    let n = BigUint::from_bytes_be(&data[cb_e..cb_e + cb_n]);
    let p = BigUint::from_bytes_be(&data[cb_e + cb_n..cb_e + cb_n + cb_p]);
    let q = BigUint::from_bytes_be(&data[cb_e + cb_n + cb_p..cb_e + cb_n + cb_p + cb_q]);
    let d_off = cb_e + cb_n + cb_p + cb_q * 3;
    let d = BigUint::from_bytes_be(&data[d_off..d_off + cb_n]);

    let key = RsaPrivateKey::from_components(n, e, d, vec![p, q])
        .map_err(|_| internal_error())?;
    key.validate().map_err(|_| internal_error())?;
    if key.n().bits() != bits {
        return Err(internal_error());
    }

    // 自检：OAEP 加解密回环，确保 CNG 导出的组件完整可用。
    use rsa::Oaep;
    let mut msg = [0u8; 16];
    use rand::RngCore;
    OsRng.fill_bytes(&mut msg);
    let public = key.to_public_key();
    let ct = public
        .encrypt(&mut OsRng, Oaep::new::<Sha256>(), &msg)
        .map_err(|_| internal_error())?;
    let pt = key
        .decrypt(Oaep::new::<Sha256>(), &ct)
        .map_err(|_| internal_error())?;
    if pt != msg {
        return Err(internal_error());
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 直接覆盖 CNG 路径（generate_key_pair 的回退可能掩盖 CNG 故障）。
    #[cfg(windows)]
    #[test]
    fn generate_components_2048_validates_and_roundtrips() {
        let key = generate_components(2048).expect("cng keygen");
        assert_eq!(key.n().bits(), 2048);
    }
}

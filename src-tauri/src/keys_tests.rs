//! keys 模块的单元测试与基准（内容较大，独立文件存放）。

use super::*;
use rsa::pkcs1::EncodeRsaPrivateKey as _;
#[cfg(test)]
mod tests {
    use super::*;
    
    const PASSWORD: &str = "unit-密码-PW";

    #[test]
    fn generate_rejects_empty_password_and_bad_size() {
        let err = generate_key_pair("", 2048).unwrap_err();
        assert_eq!(err.code, ERROR_PASSWORD_REQUIRED);
        let err = generate_key_pair(PASSWORD, 1024).unwrap_err();
        assert_eq!(err.code, ERROR_UNSUPPORTED_RSA_KEY_SIZE);
        let err = generate_key_pair(PASSWORD, 3000).unwrap_err();
        assert_eq!(err.code, ERROR_UNSUPPORTED_RSA_KEY_SIZE);
    }

    #[test]
    fn generate_produces_valid_material() {
        for bits in [2048, 3072] {
            let material = generate_key_pair(PASSWORD, bits).unwrap();
            assert!(material.public_key_pem.contains("BEGIN PUBLIC KEY"));
            assert!(material
                .encrypted_private_key_pem
                .contains("BEGIN ENCRYPTED PRIVATE KEY"));
            assert_eq!(material.key_size_bits, bits);

            // 指纹：32 位大写十六进制，可由公钥复算。
            let fingerprint = fingerprint_from_public_key(
                &RsaPublicKey::from_public_key_pem(material.public_key_pem.trim()).unwrap(),
            )
            .unwrap();
            assert_eq!(fingerprint, material.fingerprint);
            assert_eq!(fingerprint.len(), 32);
            assert!(fingerprint
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase()));

            // 可用密码解密。
            let key =
                decrypt_private_key_pem(&material.encrypted_private_key_pem, PASSWORD).unwrap();
            assert_eq!(key.n().bits(), bits);
        }
    }

    #[test]
    fn fingerprints_are_stable_and_distinct() {
        let first = generate_key_pair(PASSWORD, 2048).unwrap();
        let second = generate_key_pair(PASSWORD, 2048).unwrap();
        assert_ne!(first.fingerprint, second.fingerprint);
        // 指纹仅由公钥决定：重新导入同一公钥指纹不变。
        let (normalized, fingerprint, _) = import_public_key(&first.public_key_pem).unwrap();
        assert_eq!(fingerprint, first.fingerprint);
        assert_eq!(normalized, first.public_key_pem);
    }

    #[test]
    fn import_public_key_validates() {
        let material = generate_key_pair(PASSWORD, 2048).unwrap();
        let (normalized, fingerprint, bits) = import_public_key(&material.public_key_pem).unwrap();
        assert_eq!(bits, 2048);
        assert_eq!(fingerprint, material.fingerprint);
        assert_eq!(normalized.trim(), material.public_key_pem.trim());

        let err = import_public_key("").unwrap_err();
        assert_eq!(err.code, ERROR_PUBLIC_KEY_REQUIRED);
        let err = import_public_key("garbage").unwrap_err();
        assert_eq!(err.code, ERROR_PUBLIC_KEY_INVALID);

        // 私钥 PEM 不能作为公钥导入。
        let err = import_public_key(&material.encrypted_private_key_pem).unwrap_err();
        assert_eq!(err.code, ERROR_PUBLIC_KEY_INVALID);

        let small = RsaPrivateKey::new(&mut OsRng, 1024).unwrap();
        let small_pem = small
            .to_public_key()
            .to_public_key_pem(pkcs8::LineEnding::LF)
            .unwrap();
        let err = import_public_key(&small_pem).unwrap_err();
        assert_eq!(err.code, ERROR_PUBLIC_KEY_TOO_SMALL);
    }

    #[test]
    fn import_plaintext_private_key_reencrypts_and_derives_public() {
        let original = generate_key_pair(PASSWORD, 2048).unwrap();
        let key = decrypt_private_key_pem(&original.encrypted_private_key_pem, PASSWORD).unwrap();
        // 明文 PKCS#8。
        let plaintext_pem = key
            .to_pkcs8_der()
            .unwrap()
            .to_pem("PRIVATE KEY", pkcs8::LineEnding::LF)
            .unwrap();
        let material = import_key_pair(&plaintext_pem, "new-密码").unwrap();
        assert!(material
            .encrypted_private_key_pem
            .contains("BEGIN ENCRYPTED PRIVATE KEY"));
        assert_eq!(material.fingerprint, original.fingerprint);
        decrypt_private_key_pem(&material.encrypted_private_key_pem, "new-密码").unwrap();

        // 明文 PKCS#1。
        let pkcs1_pem = key.to_pkcs1_pem(pkcs8::LineEnding::LF).unwrap();
        let material = import_key_pair(&pkcs1_pem, PASSWORD).unwrap();
        assert_eq!(material.fingerprint, original.fingerprint);
    }

    #[test]
    fn import_encrypted_private_key_keeps_pem_and_validates_password() {
        let original = generate_key_pair(PASSWORD, 2048).unwrap();
        let material = import_key_pair(&original.encrypted_private_key_pem, PASSWORD).unwrap();
        // 原样保留（仅允许行尾换行差异）。
        assert_eq!(
            material.encrypted_private_key_pem.trim(),
            original.encrypted_private_key_pem.trim()
        );
        assert_eq!(material.fingerprint, original.fingerprint);

        let err = import_key_pair(&original.encrypted_private_key_pem, "wrong").unwrap_err();
        assert_eq!(err.code, ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG);
        let err = import_key_pair("garbage", PASSWORD).unwrap_err();
        assert_eq!(err.code, ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG);
        let err = import_key_pair("", PASSWORD).unwrap_err();
        assert_eq!(err.code, ERROR_PRIVATE_KEY_REQUIRED);
    }

    #[test]
    fn change_private_key_password_roundtrip() {
        let original = generate_key_pair(PASSWORD, 2048).unwrap();
        let new_pem =
            change_private_key_password(&original.encrypted_private_key_pem, PASSWORD, "brand-new")
                .unwrap();
        decrypt_private_key_pem(&new_pem, "brand-new").unwrap();
        let err = decrypt_private_key_pem(&new_pem, PASSWORD).unwrap_err();
        assert_eq!(err.code, ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG);

        // 指纹不变。
        let key = decrypt_private_key_pem(&new_pem, "brand-new").unwrap();
        assert_eq!(
            fingerprint_from_public_key(&key.to_public_key()).unwrap(),
            original.fingerprint
        );

        let err = change_private_key_password(&new_pem, "bad-old", "x").unwrap_err();
        assert_eq!(err.code, ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG);
        let err = change_private_key_password(&new_pem, "brand-new", "").unwrap_err();
        assert_eq!(err.code, ERROR_PASSWORD_REQUIRED);
    }

    #[test]
    fn estimate_private_key_bits_matches_generated() {
        let material = generate_key_pair(PASSWORD, 2048).unwrap();
        assert_eq!(
            estimate_private_key_bits(&material.encrypted_private_key_pem),
            Some(2048)
        );
    }
}

#[cfg(test)]
mod bench {
    use super::*;
    use std::time::Instant;

    /// 8192 位生成计时（release 下手动运行：cargo test bench_8192 -- --ignored --nocapture）。
    #[test]
    #[ignore = "manual benchmark"]
    fn bench_8192_keygen() {
        for i in 0..3 {
            let t = Instant::now();
            let k = RsaPrivateKey::new(&mut OsRng, 8192).expect("keygen");
            let secs = t.elapsed().as_secs_f32();
            println!("8192 keygen #{}: {:.2}s (bits={})", i + 1, secs, k.n().bits());
        }
    }

    #[test]
    #[ignore = "manual benchmark"]
    fn bench_4096_keygen() {
        for i in 0..3 {
            let t = Instant::now();
            RsaPrivateKey::new(&mut OsRng, 4096).expect("keygen");
            println!("4096 keygen #{}: {:.2}s", i + 1, t.elapsed().as_secs_f32());
        }
    }
}

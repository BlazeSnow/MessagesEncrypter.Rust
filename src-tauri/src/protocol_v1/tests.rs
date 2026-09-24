//! 协议 v1 测试：覆盖原版测试面（往返、线格式、错误码、篡改、前向兼容、随机性）。

use super::*;
use pkcs8::EncodePublicKey as _;

const PASSWORD: &str = "test-password-密码🔑";

fn generate_key(bits: usize) -> (RsaPrivateKey, RsaPublicKey) {
    let private_key = RsaPrivateKey::new(&mut OsRng, bits).expect("keygen");
    let public_key = private_key.to_public_key();
    (private_key, public_key)
}

/// 测试用快速参数（1000 次迭代）的加密私钥 PEM。
fn encrypted_pem(key: &RsaPrivateKey) -> String {
    use pkcs8::der::Decode as _;
    use pkcs8::EncodePrivateKey as _;
    use pkcs8::PrivateKeyInfo;
    let doc = key.to_pkcs8_der().expect("pkcs8");
    let mut salt = [0u8; 16];
    let mut iv = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut iv);
    let params =
        pkcs8::pkcs5::pbes2::Parameters::pbkdf2_sha256_aes256cbc(1000, &salt, &iv).expect("params");
    let encrypted = PrivateKeyInfo::from_der(doc.as_bytes())
        .expect("pkcs8 info")
        .encrypt_with_params(params, PASSWORD)
        .expect("encrypt");
    encrypted
        .to_pem("ENCRYPTED PRIVATE KEY", pkcs8::LineEnding::LF)
        .map(|pem| pem.to_string())
        .expect("pem")
}

fn encrypt_with(public_pem: &str, plain: &str) -> String {
    encrypt_to_base64_json(public_pem, plain).expect("encrypt")
}

fn decrypt_with(private_pem: &str, package: &str) -> Result<String, ProtocolError> {
    decrypt_from_base64_json(private_pem, PASSWORD, package)
}

fn expect_code(err: ProtocolError, code: &str) {
    assert_eq!(err.code, code, "unexpected error code");
}

#[test]
fn roundtrip_short_text() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let package = encrypt_with(&public_pem, "hello");
    assert_eq!(decrypt_with(&enc_pem, &package).unwrap(), "hello");
}

#[test]
fn roundtrip_long_text() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let long = "A".repeat(100_000);
    let package = encrypt_with(&public_pem, &long);
    assert_eq!(decrypt_with(&enc_pem, &package).unwrap(), long);
}

#[test]
fn roundtrip_complex_unicode() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let text = "中文\n\t😄🚀🔑 日本語 한국어 العربية ¥8,888.88 © ™ ✓ → ←";
    let package = encrypt_with(&public_pem, text);
    assert_eq!(decrypt_with(&enc_pem, &package).unwrap(), text);
}

#[test]
fn encrypt_rejects_blank_plaintext() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    expect_code(
        encrypt_to_base64_json(&public_pem, "").unwrap_err(),
        ERROR_PLAIN_TEXT_REQUIRED,
    );
    expect_code(
        encrypt_to_base64_json(&public_pem, "   \n\t").unwrap_err(),
        ERROR_PLAIN_TEXT_REQUIRED,
    );
}

#[test]
fn encrypt_rejects_bad_public_keys() {
    expect_code(
        encrypt_to_base64_json("", "x").unwrap_err(),
        ERROR_PUBLIC_KEY_REQUIRED,
    );
    expect_code(
        encrypt_to_base64_json("not a pem", "x").unwrap_err(),
        ERROR_PUBLIC_KEY_INVALID,
    );
    let small = generate_key(1024);
    let small_pem = small.1.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    expect_code(
        encrypt_to_base64_json(&small_pem, "x").unwrap_err(),
        ERROR_PUBLIC_KEY_TOO_SMALL,
    );
}

#[test]
fn wire_format_has_exactly_five_fields() {
    let (priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let package = encrypt_with(&public_pem, "wire");

    let json_bytes = BASE64.decode(package.trim()).unwrap();
    let value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
    let map = value.as_object().unwrap();
    assert_eq!(map.len(), 5, "wire package must have exactly 5 fields");
    assert_eq!(map["ver"], 1);
    assert_eq!(
        BASE64.decode(map["nonce"].as_str().unwrap()).unwrap().len(),
        AES_GCM_NONCE_SIZE_BYTES
    );
    assert_eq!(
        BASE64.decode(map["tag"].as_str().unwrap()).unwrap().len(),
        AES_GCM_TAG_SIZE_BYTES
    );

    // ek 可用正确私钥解出 32 字节会话密钥。
    let ek = BASE64.decode(map["ek"].as_str().unwrap()).unwrap();
    let session_key = priv_key.decrypt(Oaep::new::<Sha256>(), &ek).unwrap();
    assert_eq!(session_key.len(), AES_KEY_SIZE_BYTES);
}

#[test]
fn decrypt_rejects_unsupported_versions() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let package = encrypt_with(&public_pem, "v");

    for ver in [0i64, 2, -1] {
        let json_bytes = BASE64.decode(package.trim()).unwrap();
        let mut value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
        value["ver"] = serde_json::Value::from(ver);
        let mutated = BASE64.encode(serde_json::to_vec(&value).unwrap());
        expect_code(
            decrypt_with(&enc_pem, &mutated).unwrap_err(),
            ERROR_UNSUPPORTED_MESSAGE_FORMAT,
        );
    }

    // 缺少 ver → 视为 0 → 拒绝。
    let json_bytes = BASE64.decode(package.trim()).unwrap();
    let mut value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
    value.as_object_mut().unwrap().remove("ver");
    let mutated = BASE64.encode(serde_json::to_vec(&value).unwrap());
    expect_code(
        decrypt_with(&enc_pem, &mutated).unwrap_err(),
        ERROR_UNSUPPORTED_MESSAGE_FORMAT,
    );
}

#[test]
fn decrypt_rejects_missing_or_null_fields() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let json_bytes = BASE64
        .decode(encrypt_with(&public_pem, "f").trim())
        .unwrap();

    for field in ["ek", "nonce", "tag", "ct"] {
        for mutate_null in [true, false] {
            let mut value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
            if mutate_null {
                value[field] = serde_json::Value::Null;
            } else {
                value.as_object_mut().unwrap().remove(field);
            }
            let mutated = BASE64.encode(serde_json::to_vec(&value).unwrap());
            expect_code(
                decrypt_with(&enc_pem, &mutated).unwrap_err(),
                ERROR_UNSUPPORTED_MESSAGE_FORMAT,
            );
        }
    }
}

#[test]
fn decrypt_rejects_invalid_base64_and_non_json() {
    let (_priv_key, pub_key) = generate_key(2048);
    let enc_pem = encrypted_pem(&_priv_key);
    expect_code(
        decrypt_with(&enc_pem, "!!!!not-base64!!!!").unwrap_err(),
        ERROR_DECRYPT_FAILED,
    );
    expect_code(
        decrypt_with(&enc_pem, &BASE64.encode(b"plain text json?")).unwrap_err(),
        ERROR_DECRYPT_FAILED,
    );
}

#[test]
fn decrypt_rejects_wrong_nonce_and_tag_sizes() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let json_bytes = BASE64
        .decode(encrypt_with(&public_pem, "n").trim())
        .unwrap();

    for (field, sizes) in [("nonce", vec![11usize, 13, 0]), ("tag", vec![15, 0])] {
        for size in sizes {
            let mut value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
            value[field] = serde_json::Value::from(BASE64.encode(vec![0u8; size]));
            let mutated = BASE64.encode(serde_json::to_vec(&value).unwrap());
            expect_code(
                decrypt_with(&enc_pem, &mutated).unwrap_err(),
                ERROR_UNSUPPORTED_MESSAGE_FORMAT,
            );
        }
    }
}

#[test]
fn decrypt_rejects_tampered_fields() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let json_bytes = BASE64
        .decode(encrypt_with(&public_pem, "t").trim())
        .unwrap();

    for field in ["ek", "nonce", "tag", "ct"] {
        let mut value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
        let mut raw = BASE64.decode(value[field].as_str().unwrap()).unwrap();
        raw[0] ^= 0xFF;
        value[field] = serde_json::Value::from(BASE64.encode(&raw));
        let mutated = BASE64.encode(serde_json::to_vec(&value).unwrap());
        // 篡改必须失败，错误码允许是「格式不支持」或「解密失败」。
        let code = decrypt_with(&enc_pem, &mutated).unwrap_err().code;
        assert!(
            code == ERROR_DECRYPT_FAILED || code == ERROR_UNSUPPORTED_MESSAGE_FORMAT,
            "tampered {field} must fail, got {code}"
        );
    }
}

#[test]
fn unknown_fields_are_ignored() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let enc_pem = encrypted_pem(&_priv_key);
    let json_bytes = BASE64
        .decode(encrypt_with(&public_pem, "future").trim())
        .unwrap();
    let mut value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
    let object = value.as_object_mut().unwrap();
    object.insert("alg".to_string(), serde_json::Value::from("rsa"));
    object.insert("future".to_string(), serde_json::Value::from(42));
    let extended = BASE64.encode(serde_json::to_vec(&value).unwrap());
    assert_eq!(decrypt_with(&enc_pem, &extended).unwrap(), "future");
}

#[test]
fn decrypt_rejects_bad_private_key_inputs() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let package = encrypt_with(&public_pem, "k");

    let (wrong_priv, _) = generate_key(2048);
    let wrong_pem = encrypted_pem(&wrong_priv);
    expect_code(
        decrypt_with(&wrong_pem, &package).unwrap_err(),
        ERROR_DECRYPT_FAILED,
    );

    // 密码错误。
    let (priv_key, _) = generate_key(2048);
    let right_pem = encrypted_pem(&priv_key);
    let err = decrypt_from_base64_json(&right_pem, "wrong-password", &package).unwrap_err();
    expect_code(err, ERROR_PRIVATE_KEY_INVALID_OR_PASSWORD_WRONG);

    // 缺私钥 / 缺密码。
    expect_code(
        decrypt_from_base64_json("", PASSWORD, &package).unwrap_err(),
        ERROR_PRIVATE_KEY_REQUIRED,
    );
    expect_code(
        decrypt_from_base64_json(&right_pem, "", &package).unwrap_err(),
        ERROR_PASSWORD_REQUIRED,
    );

    // 小私钥。
    let (small_priv, _) = generate_key(1024);
    let small_pem = encrypted_pem(&small_priv);
    expect_code(
        decrypt_with(&small_pem, &package).unwrap_err(),
        ERROR_PRIVATE_KEY_TOO_SMALL,
    );
}

#[test]
fn decrypt_rejects_empty_and_garbage_packages() {
    let (_priv_key, _) = generate_key(2048);
    let enc_pem = encrypted_pem(&_priv_key);
    expect_code(
        decrypt_with(&enc_pem, "").unwrap_err(),
        ERROR_CIPHER_TEXT_REQUIRED,
    );
    expect_code(
        decrypt_with(&enc_pem, "   \n").unwrap_err(),
        ERROR_CIPHER_TEXT_REQUIRED,
    );
}

#[test]
fn same_plaintext_encrypts_differently() {
    let (_priv_key, pub_key) = generate_key(2048);
    let public_pem = pub_key.to_public_key_pem(pkcs8::LineEnding::LF).unwrap();
    let first = encrypt_with(&public_pem, "same");
    let second = encrypt_with(&public_pem, "same");
    assert_ne!(first, second);

    let nonce_of = |pkg: &str| {
        let json_bytes = BASE64.decode(pkg.trim()).unwrap();
        let value: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
        BASE64.decode(value["nonce"].as_str().unwrap()).unwrap()
    };
    assert_ne!(nonce_of(&first), nonce_of(&second));
}

// ===== 与原版（.NET 实现）的互操作验证 =====
// 用法（配合 .NET 控制台 harness，目录经 INTEROP_DIR 环境变量传入，不落仓库路径）：
//   1. cargo test interop_generate -- --ignored
//   2. dotnet harness phase1（生成 dotnet 密钥、解密 rust_package、加密 dotnet_package）
//   3. cargo test interop_verify -- --ignored（解密 dotnet_package、生成 rust_package_for_dotnet）
//   4. dotnet harness phase2（解密 rust_package_for_dotnet）
const INTEROP_PLAINTEXT: &str = "互操作验证 Interop 🚀 emoji 中文 ¥8,888.88\n第二行\t制表符 ← ✓";
const INTEROP_PASSWORD: &str = "interop-密码-Pass🔑";

fn interop_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("INTEROP_DIR").expect("INTEROP_DIR must be set for interop tests"),
    )
}

fn interop_write(name: &str, content: &str) {
    std::fs::write(interop_dir().join(name), content).expect("write interop artifact");
}

fn interop_read(name: &str) -> String {
    std::fs::read_to_string(interop_dir().join(name)).expect("read interop artifact")
}

#[test]
#[ignore = "interop harness: run with INTEROP_DIR set"]
fn interop_generate_artifacts() {
    let material = crate::keys::generate_key_pair(INTEROP_PASSWORD, 2048).expect("keygen");
    interop_write("rust_pub.pem", &material.public_key_pem);
    interop_write("rust_priv.pem", &material.encrypted_private_key_pem);
    let package =
        encrypt_to_base64_json(&material.public_key_pem, INTEROP_PLAINTEXT).expect("encrypt");
    interop_write("rust_package.txt", &package);
}

#[test]
#[ignore = "interop harness: run with INTEROP_DIR set"]
fn interop_verify_artifacts() {
    // 用 Rust 侧解密 .NET 生成的密文包（含 600k 迭代加密私钥的解析）。
    let dotnet_priv = interop_read("dotnet_priv.pem");
    let dotnet_package = interop_read("dotnet_package.txt");
    let plain =
        decrypt_from_base64_json(&dotnet_priv, INTEROP_PASSWORD, &dotnet_package).expect("decrypt dotnet package");
    assert_eq!(plain, INTEROP_PLAINTEXT);

    // 用 .NET 公钥加密，供 .NET 侧解密。
    let dotnet_pub = interop_read("dotnet_pub.pem");
    let package = encrypt_to_base64_json(&dotnet_pub, INTEROP_PLAINTEXT).expect("encrypt to dotnet");
    interop_write("rust_package_for_dotnet.txt", &package);
}

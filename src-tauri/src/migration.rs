//! 旧版（WinUI 3 打包应用）本地数据迁移。
//!
//! 包家族名（PFN）= `<Name>_<发布者哈希>`；
//! 发布者哈希 = SHA256(UTF-16LE(Publisher)) 前 8 字节、
//! Crockford 小写 Base32（字母表 0-9a-z 去掉 i/l/o/u）取 13 字符。
//! 已用已知发布者（微软）验证：CN=Microsoft Corporation, … → 8wekyb3d8bbwe。
//!
//! 策略：应用数据目录无 keys.db 时，从旧 LocalState 原地复制 keys.db / keys.db.sig /
//! keys.json；记住的密码与签名密钥在凭据管理器中同名通用，无需迁移。

use std::path::PathBuf;

use crate::error::AppResult;

pub const LEGACY_IDENTITY_NAME: &str = "BlazeSnow.MessagesEncrypter";
pub const LEGACY_PUBLISHER: &str = "CN=C171AF55-419C-4E73-B34E-CB98C8F1EB78";

const BASE32_ALPHABET: &[u8] = b"0123456789abcdefghjkmnpqrstvwxyz";

pub fn package_family_suffix(publisher: &str) -> String {
    use sha2::Digest;
    let utf16: Vec<u8> = publisher
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    let digest = sha2::Sha256::digest(&utf16);
    let mut value: u64 = 0;
    for byte in &digest[..8] {
        value = (value << 8) | *byte as u64;
    }
    // 13 字符 × 5 bits = 65 bits；超出 64 位的缺失位补零（与微软实现一致）。
    let mut out = String::with_capacity(13);
    let mut bit_index: u32 = 0;
    for _ in 0..13 {
        let mut index: u8 = 0;
        for _ in 0..5 {
            index <<= 1;
            if bit_index < 64 {
                index |= ((value >> (63 - bit_index)) & 1) as u8;
            }
            bit_index += 1;
        }
        out.push(BASE32_ALPHABET[index as usize] as char);
    }
    out
}

/// 旧版 LocalState 目录（存在才返回 Some）。
pub fn legacy_local_state_dir() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let suffix = package_family_suffix(LEGACY_PUBLISHER);
    let dir = PathBuf::from(local)
        .join("Packages")
        .join(format!("{LEGACY_IDENTITY_NAME}_{suffix}"))
        .join("LocalState");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// 首次运行迁移：目标目录没有 keys.db 时，从旧 LocalState 复制密钥库文件。
pub fn migrate_legacy_store(app_data_dir: &std::path::Path) -> AppResult<()> {
    let old_dir = legacy_local_state_dir();
    migrate_legacy_store_from(app_data_dir, old_dir.as_deref())
}

/// 迁移核心（`legacy_dir` 供测试注入，None = 无旧版数据目录）。
pub fn migrate_legacy_store_from(
    app_data_dir: &std::path::Path,
    legacy_dir: Option<&std::path::Path>,
) -> AppResult<()> {
    let db_path = app_data_dir.join("keys.db");
    if db_path.exists() {
        return Ok(());
    }
    let Some(old_dir) = legacy_dir else {
        return Ok(());
    };
    let _ = std::fs::copy(old_dir.join("keys.db"), &db_path);
    let sig = crate::integrity::signature_path(&db_path);
    if old_dir.join("keys.db.sig").exists() && !sig.exists() {
        let _ = std::fs::copy(old_dir.join("keys.db.sig"), &sig);
    }
    if !db_path.exists() && old_dir.join("keys.json").exists() {
        let _ = std::fs::copy(old_dir.join("keys.json"), app_data_dir.join("keys.json"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "me-migration-{}-{tag}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn migrate_copies_db_and_signature() {
        let legacy = temp_dir("legacy");
        let target = temp_dir("target");
        std::fs::write(legacy.join("keys.db"), b"legacy-db").unwrap();
        std::fs::write(legacy.join("keys.db.sig"), b"legacy-sig").unwrap();

        migrate_legacy_store_from(&target, Some(&legacy)).unwrap();

        assert_eq!(std::fs::read(target.join("keys.db")).unwrap(), b"legacy-db");
        assert_eq!(
            std::fs::read(crate::integrity::signature_path(&target.join("keys.db"))).unwrap(),
            b"legacy-sig"
        );
        assert!(!target.join("keys.json").exists());
        std::fs::remove_dir_all(legacy).unwrap();
        std::fs::remove_dir_all(target).unwrap();
    }

    #[test]
    fn migrate_falls_back_to_keys_json() {
        let legacy = temp_dir("legacy-json");
        let target = temp_dir("target-json");
        std::fs::write(legacy.join("keys.json"), b"{\"recipientKeys\":[],\"privateKeys\":[]}").unwrap();

        migrate_legacy_store_from(&target, Some(&legacy)).unwrap();

        assert!(!target.join("keys.db").exists());
        assert_eq!(
            std::fs::read(target.join("keys.json")).unwrap(),
            b"{\"recipientKeys\":[],\"privateKeys\":[]}"
        );
        std::fs::remove_dir_all(legacy).unwrap();
        std::fs::remove_dir_all(target).unwrap();
    }

    #[test]
    fn migrate_skips_when_db_exists_or_no_legacy() {
        let legacy = temp_dir("legacy-skip");
        let target = temp_dir("target-skip");
        std::fs::write(target.join("keys.db"), b"existing").unwrap();
        std::fs::write(legacy.join("keys.db"), b"legacy").unwrap();

        // 目标已有库：不动。
        migrate_legacy_store_from(&target, Some(&legacy)).unwrap();
        assert_eq!(std::fs::read(target.join("keys.db")).unwrap(), b"existing");

        // 无旧目录：原样。
        let empty_target = temp_dir("target-empty");
        migrate_legacy_store_from(&empty_target, None).unwrap();
        assert!(!empty_target.join("keys.db").exists());

        std::fs::remove_dir_all(legacy).unwrap();
        std::fs::remove_dir_all(target).unwrap();
        std::fs::remove_dir_all(empty_target).unwrap();
    }

    #[test]
    fn package_family_suffix_matches_known_values() {
        // 微软发布者的已知 PFN 后缀（WindowsTerminal 等）。
        assert_eq!(
            package_family_suffix(
                "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"
            ),
            "8wekyb3d8bbwe"
        );
        // 本产品发布者的 PFN 后缀。
        assert_eq!(package_family_suffix(LEGACY_PUBLISHER), "cavwvnm5yrdtm");
    }
}

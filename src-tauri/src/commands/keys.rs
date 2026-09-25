//! 密钥管理命令：生成 / 导入 / 重命名 / 删除 / 改密 / 导出。

use tauri::State;

use crate::credman;
use crate::error::{internal_error, AppError, AppResult};
use crate::keys;
use crate::keystore::{self, KeyRecord};
use crate::state::AppState;

use super::{
    clean_alias, dto_of, join_blocking, spawn_blocking, validate_category, KeyEntryDto,
    CATEGORY_PRIVATE, CATEGORY_RECIPIENT,
};

/// 应用自身改库后必须重签。
fn resign(db_path: &std::path::Path) -> AppResult<()> {
    crate::integrity::sign_file(db_path, credman::INTEGRITY_KEY_TARGET_NAME, false)
}

#[tauri::command]
pub async fn list_keys(state: State<'_, AppState>, category: String) -> AppResult<Vec<KeyEntryDto>> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let records = keystore::list_keys(&db_path, &category)?;
        Ok(records.into_iter().map(dto_of).collect())
    }))
    .await
}

#[tauri::command]
pub async fn generate_key_pair(
    state: State<'_, AppState>,
    alias: String,
    key_size_bits: usize,
    password: String,
    remember_password: bool,
) -> AppResult<KeyEntryDto> {
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let material = keys::generate_key_pair(&password, key_size_bits)?;
        let sort_order = keystore::list_keys(&db_path, CATEGORY_PRIVATE)?.len();
        let record = KeyRecord {
            category: CATEGORY_PRIVATE.to_string(),
            alias,
            fingerprint: material.fingerprint.clone(),
            public_key_pem: Some(material.public_key_pem),
            encrypted_private_key_pem: Some(material.encrypted_private_key_pem),
        };
        if !keystore::insert_key(&db_path, &record, sort_order)? {
            return Err(AppError::new("ErrorDuplicateKey"));
        }
        resign(&db_path)?;
        if remember_password {
            let _ = credman::write_private_key_password(&material.fingerprint, &password);
        }
        Ok(dto_of(record))
    }))
    .await
}

#[tauri::command]
pub async fn import_public_key(
    state: State<'_, AppState>,
    alias: String,
    public_key_pem: String,
) -> AppResult<KeyEntryDto> {
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let (normalized, fingerprint, _bits) = keys::import_public_key(&public_key_pem)?;
        let sort_order = keystore::list_keys(&db_path, CATEGORY_RECIPIENT)?.len();
        let record = KeyRecord {
            category: CATEGORY_RECIPIENT.to_string(),
            alias,
            fingerprint,
            public_key_pem: Some(normalized),
            encrypted_private_key_pem: None,
        };
        if !keystore::insert_key(&db_path, &record, sort_order)? {
            return Err(AppError::new("ErrorDuplicateKey"));
        }
        resign(&db_path)?;
        Ok(dto_of(record))
    }))
    .await
}

#[tauri::command]
pub async fn import_private_key(
    state: State<'_, AppState>,
    alias: String,
    private_key_pem: String,
    password: String,
    remember_password: bool,
) -> AppResult<KeyEntryDto> {
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let material = keys::import_key_pair(&private_key_pem, &password)?;
        let sort_order = keystore::list_keys(&db_path, CATEGORY_PRIVATE)?.len();
        let record = KeyRecord {
            category: CATEGORY_PRIVATE.to_string(),
            alias,
            fingerprint: material.fingerprint.clone(),
            public_key_pem: Some(material.public_key_pem),
            encrypted_private_key_pem: Some(material.encrypted_private_key_pem),
        };
        if !keystore::insert_key(&db_path, &record, sort_order)? {
            return Err(AppError::new("ErrorDuplicateKey"));
        }
        resign(&db_path)?;
        if remember_password {
            let _ = credman::write_private_key_password(&material.fingerprint, &password);
        }
        Ok(dto_of(record))
    }))
    .await
}

#[tauri::command]
pub async fn rename_key(
    state: State<'_, AppState>,
    category: String,
    fingerprint: String,
    alias: String,
) -> AppResult<()> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let alias = clean_alias(&alias)?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        if !keystore::update_alias(&db_path, &category, &fingerprint, &alias)? {
            return Err(internal_error());
        }
        resign(&db_path)
    }))
    .await
}

#[tauri::command]
pub async fn delete_key(
    state: State<'_, AppState>,
    category: String,
    fingerprint: String,
) -> AppResult<()> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        keystore::delete_key(&db_path, &category, &fingerprint)?;
        resign(&db_path)?;
        if category == CATEGORY_PRIVATE {
            // 库保存成功后才删除记住的密码（与原版一致）。
            let _ = credman::delete_private_key_password(&fingerprint);
        }
        Ok(())
    }))
    .await
}

#[tauri::command]
pub async fn change_private_key_password(
    state: State<'_, AppState>,
    fingerprint: String,
    old_password: String,
    new_password: String,
    remember_password: bool,
) -> AppResult<()> {
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let record = keystore::get_key(&db_path, CATEGORY_PRIVATE, &fingerprint)?
            .ok_or_else(internal_error)?;
        let pem = record.encrypted_private_key_pem.ok_or_else(internal_error)?;
        let new_pem = keys::change_private_key_password(&pem, &old_password, &new_password)?;
        keystore::update_encrypted_private_key(&db_path, CATEGORY_PRIVATE, &fingerprint, &new_pem)?;
        resign(&db_path)?;
        if remember_password {
            let _ = credman::write_private_key_password(&fingerprint, &new_password);
        } else {
            let _ = credman::delete_private_key_password(&fingerprint);
        }
        Ok(())
    }))
    .await
}

#[tauri::command]
pub async fn has_saved_password(
    state: State<'_, AppState>,
    private_fingerprint: String,
) -> AppResult<bool> {
    state.require_healthy_store()?;
    join_blocking(spawn_blocking(move || {
        let has = credman::read_private_key_password(&private_fingerprint)
            .map_err(|_| internal_error())?
            .is_some();
        Ok(has)
    }))
    .await
}

/// 导出密钥到导出目录（默认下载目录），并在资源管理器中定位文件。
/// `part = Some("public")`：导出私钥条目对应的公钥（.pub，原版「我的私钥」页同款能力）；
/// 默认导出条目本体（私钥 → 加密 .pem，公钥 → .pub）。
#[tauri::command]
pub async fn export_key(
    state: State<'_, AppState>,
    category: String,
    fingerprint: String,
    part: Option<String>,
) -> AppResult<String> {
    validate_category(&category)?;
    state.require_healthy_store()?;
    let db_path = state.db_path();
    join_blocking(spawn_blocking(move || {
        let record =
            keystore::get_key(&db_path, &category, &fingerprint)?.ok_or_else(internal_error)?;
        let export_public = category == CATEGORY_RECIPIENT || part.as_deref() == Some("public");
        let (extension, content) = if export_public {
            (
                "pub",
                record
                    .public_key_pem
                    .ok_or_else(|| AppError::new("ErrorPublicKeyRequired"))?,
            )
        } else {
            (
                "pem",
                record
                    .encrypted_private_key_pem
                    .ok_or_else(|| AppError::new("ErrorPrivateKeyRequired"))?,
            )
        };

        let folder = keystore::get_setting(&db_path, keystore::SETTING_EXPORT_FOLDER_PATH)?
            .filter(|p| !p.trim().is_empty())
            .unwrap_or_else(default_downloads_dir);
        std::fs::create_dir_all(&folder).map_err(|_| AppError::new("ErrorExportFailed"))?;

        let file_name = format!("{}.{}", sanitize_file_name(&record.alias), extension);
        let path = std::path::Path::new(&folder).join(file_name);
        std::fs::write(&path, content).map_err(|_| AppError::new("ErrorExportFailed"))?;

        // 在资源管理器中定位（失败不影响导出结果）。
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn();
        Ok(path.display().to_string())
    }))
    .await
}

fn default_downloads_dir() -> String {
    std::env::var_os("USERPROFILE")
        .map(std::path::PathBuf::from)
        .map(|p| p.join("Downloads").display().to_string())
        .unwrap_or_else(|| ".".to_string())
}

fn sanitize_file_name(alias: &str) -> String {
    let name: String = alias
        .trim()
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 32
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    if name.trim().is_empty() {
        "key".to_string()
    } else {
        name
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_file_name_replaces_invalid_chars() {
        assert_eq!(sanitize_file_name("normal"), "normal");
        assert_eq!(sanitize_file_name("  spaced  "), "spaced");
        assert_eq!(
            sanitize_file_name(r#"a<b>c:d"e/f\g|h*i?j"#),
            "a_b_c_d_e_f_g_h_i_j"
        );
        assert_eq!(sanitize_file_name("中文别名"), "中文别名");
        // 控制字符
        assert_eq!(sanitize_file_name("a\nb"), "a_b");
        // 全空白回退 key
        assert_eq!(sanitize_file_name("   "), "key");
        assert_eq!(sanitize_file_name(""), "key");
    }

    #[test]
    fn clean_alias_trims_and_rejects_empty() {
        assert_eq!(clean_alias("  别名  ").unwrap(), "别名");
        assert_eq!(clean_alias("").unwrap_err().code, "ErrorKeyAliasRequired");
        assert_eq!(clean_alias("   ").unwrap_err().code, "ErrorKeyAliasRequired");
    }

    #[test]
    fn validate_category_only_accepts_known_values() {
        validate_category(CATEGORY_RECIPIENT).unwrap();
        validate_category(CATEGORY_PRIVATE).unwrap();
        assert!(validate_category("other").is_err());
    }
}

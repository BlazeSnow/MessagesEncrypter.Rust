//! SQLite 密钥库（与原版 keys.db 兼容，见 references/storage.md）。
//!
//! - 表 `keys`：结构与原版完全一致，主键 (category, fingerprint)。
//! - 表 `settings`：本版新增（原版设置存于系统 KV），小设置不引入 settings.json。
//! - 迁移：旧 `id` 列表结构、旧 `keys.json`。
//! - 任何建表/迁移完成后重新签名。

use std::path::Path;

use rusqlite::Connection;

use crate::error::{internal_error, AppError, AppResult};
use crate::integrity;

pub const CATEGORY_RECIPIENT: &str = "recipient";
pub const CATEGORY_PRIVATE: &str = "private";

pub const SETTING_EXPORT_FOLDER_PATH: &str = "ExportFolderPath";
pub const SETTING_SELECTED_RECIPIENT: &str = "SelectedRecipientKeyFingerprint";
pub const SETTING_SELECTED_PRIVATE: &str = "SelectedPrivateKeyFingerprint";
pub const SETTING_DISPLAY_LANGUAGE: &str = "DisplayLanguage";

pub const VALID_SETTING_KEYS: [&str; 4] = [
    SETTING_EXPORT_FOLDER_PATH,
    SETTING_SELECTED_RECIPIENT,
    SETTING_SELECTED_PRIVATE,
    SETTING_DISPLAY_LANGUAGE,
];

/// 密钥记录（数据库行）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyRecord {
    pub category: String,
    pub alias: String,
    pub fingerprint: String,
    pub public_key_pem: Option<String>,
    pub encrypted_private_key_pem: Option<String>,
}

const KEY_COLUMNS: &str =
    "category TEXT NOT NULL, sort_order INTEGER NOT NULL, alias TEXT NOT NULL, \
     fingerprint TEXT NOT NULL, public_key_pem TEXT NULL, encrypted_private_key_pem TEXT NULL, \
     PRIMARY KEY (category, fingerprint)";

/// 旧版 keys.json 条目（camelCase；KeyEntry 序列化字段）。
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyJsonEntry {
    alias: String,
    fingerprint: String,
    #[serde(default)]
    public_key_pem: Option<String>,
    #[serde(default)]
    encrypted_private_key_pem: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyJsonStore {
    #[serde(default)]
    recipient_keys: Vec<LegacyJsonEntry>,
    #[serde(default)]
    private_keys: Vec<LegacyJsonEntry>,
}

fn open_connection(db_path: &Path) -> AppResult<Connection> {
    Connection::open(db_path).map_err(|_| internal_error())
}

fn table_columns(conn: &Connection, table: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare(&format!("SELECT name FROM pragma_table_info('{table}')"))
        .map_err(|_| internal_error())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| internal_error())?;
    let mut columns = Vec::new();
    for row in rows {
        columns.push(row.map_err(|_| internal_error())?);
    }
    Ok(columns)
}

/// 建库/建表 + 迁移；返回是否发生了迁移（含建表）。迁移后用 `key_target` 重签。
pub fn ensure_database(db_path: &Path, key_target: &str) -> AppResult<bool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| internal_error())?;
    }
    let conn = open_connection(db_path)?;
    let mut migrated = false;

    let table_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='keys'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| internal_error())?
        > 0;

    if !table_exists {
        conn.execute(&format!("CREATE TABLE keys ({KEY_COLUMNS})"), [])
            .map_err(|_| internal_error())?;
        migrated = true;
    }

    // 旧表结构：含自增 id 列 → 重建。
    if table_exists && table_columns(&conn, "keys")?.iter().any(|c| c == "id") {
        conn.execute_batch(&format!(
            "BEGIN;
             CREATE TABLE keys_new ({KEY_COLUMNS});
             INSERT OR IGNORE INTO keys_new (category, sort_order, alias, fingerprint, public_key_pem, encrypted_private_key_pem)
                 SELECT category, sort_order, alias, fingerprint, public_key_pem, encrypted_private_key_pem
                 FROM keys ORDER BY category, sort_order;
             DROP TABLE keys;
             ALTER TABLE keys_new RENAME TO keys;
             COMMIT;"
        ))
        .map_err(|_| internal_error())?;
        migrated = true;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )
    .map_err(|_| internal_error())?;

    // 旧版 keys.json 迁移：仅当库中无密钥时执行；完成后改名 `.migrated`。
    let count: i64 = conn
        .query_row("SELECT count(*) FROM keys", [], |row| row.get(0))
        .map_err(|_| internal_error())?;
    if count == 0 {
        let json_path = db_path.with_file_name("keys.json");
        if let Ok(text) = std::fs::read_to_string(&json_path) {
            if let Ok(store) = serde_json::from_str::<LegacyJsonStore>(&text) {
                insert_legacy_entries(&conn, CATEGORY_RECIPIENT, &store.recipient_keys)?;
                insert_legacy_entries(&conn, CATEGORY_PRIVATE, &store.private_keys)?;
                drop(conn);
                let renamed = json_path.with_file_name("keys.json.migrated");
                let _ = std::fs::rename(&json_path, &renamed);
                integrity::sign_file(db_path, key_target, false)?;
                return Ok(true);
            }
        }
    }

    if migrated {
        integrity::sign_file(db_path, key_target, false)?;
    }
    Ok(migrated)
}

fn insert_legacy_entries(
    conn: &Connection,
    category: &str,
    entries: &[LegacyJsonEntry],
) -> AppResult<()> {
    for (sort_order, entry) in entries.iter().enumerate() {
        conn.execute(
            "INSERT OR IGNORE INTO keys (category, sort_order, alias, fingerprint, public_key_pem, encrypted_private_key_pem)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                category,
                sort_order as i64,
                entry.alias,
                entry.fingerprint,
                entry.public_key_pem,
                entry.encrypted_private_key_pem
            ],
        )
        .map_err(|_| internal_error())?;
    }
    Ok(())
}

pub fn list_keys(db_path: &Path, category: &str) -> AppResult<Vec<KeyRecord>> {
    let conn = open_connection(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT category, alias, fingerprint, public_key_pem, encrypted_private_key_pem
             FROM keys WHERE category = ?1
             ORDER BY alias COLLATE NOCASE, fingerprint COLLATE NOCASE",
        )
        .map_err(|_| internal_error())?;
    let rows = stmt
        .query_map([category], |row| {
            Ok(KeyRecord {
                category: row.get(0)?,
                alias: row.get(1)?,
                fingerprint: row.get(2)?,
                public_key_pem: row.get(3)?,
                encrypted_private_key_pem: row.get(4)?,
            })
        })
        .map_err(|_| internal_error())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|_| internal_error())?);
    }
    Ok(records)
}

pub fn get_key(db_path: &Path, category: &str, fingerprint: &str) -> AppResult<Option<KeyRecord>> {
    let conn = open_connection(db_path)?;
    conn.query_row(
        "SELECT category, alias, fingerprint, public_key_pem, encrypted_private_key_pem
         FROM keys WHERE category = ?1 AND fingerprint = ?2",
        [category, fingerprint],
        |row| {
            Ok(KeyRecord {
                category: row.get(0)?,
                alias: row.get(1)?,
                fingerprint: row.get(2)?,
                public_key_pem: row.get(3)?,
                encrypted_private_key_pem: row.get(4)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other),
    })
    .map_err(|_| internal_error())
}

/// 插入密钥；指纹重复时返回 `Ok(false)`（UI 层转为「重复密钥」提示）。
/// 调用方负责在变更成功后重新签名。
pub fn insert_key(db_path: &Path, record: &KeyRecord, sort_order: usize) -> AppResult<bool> {
    let conn = open_connection(db_path)?;
    insert_with(&conn, record, sort_order)
}

/// 连接级插入。
pub fn insert_with(conn: &Connection, record: &KeyRecord, sort_order: usize) -> AppResult<bool> {
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO keys (category, sort_order, alias, fingerprint, public_key_pem, encrypted_private_key_pem)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                record.category,
                sort_order as i64,
                record.alias,
                record.fingerprint,
                record.public_key_pem,
                record.encrypted_private_key_pem
            ],
        )
        .map_err(|_| internal_error())?;
    Ok(inserted > 0)
}

/// 重命名；返回是否存在目标行。调用方负责变更成功后重新签名。
pub fn update_alias(
    db_path: &Path,
    category: &str,
    fingerprint: &str,
    alias: &str,
) -> AppResult<bool> {
    let conn = open_connection(db_path)?;
    let changed = conn
        .execute(
            "UPDATE keys SET alias = ?1 WHERE category = ?2 AND fingerprint = ?3",
            rusqlite::params![alias, category, fingerprint],
        )
        .map_err(|_| internal_error())?
        > 0;
    Ok(changed)
}

/// 更新加密私钥 PEM。调用方负责变更成功后重新签名。
pub fn update_encrypted_private_key(
    db_path: &Path,
    category: &str,
    fingerprint: &str,
    encrypted_pem: &str,
) -> AppResult<()> {
    let conn = open_connection(db_path)?;
    conn.execute(
        "UPDATE keys SET encrypted_private_key_pem = ?1 WHERE category = ?2 AND fingerprint = ?3",
        rusqlite::params![encrypted_pem, category, fingerprint],
    )
    .map_err(|_| internal_error())?;
    Ok(())
}

/// 删除密钥。调用方负责变更成功后重新签名。
pub fn delete_key(db_path: &Path, category: &str, fingerprint: &str) -> AppResult<()> {
    let conn = open_connection(db_path)?;
    conn.execute(
        "DELETE FROM keys WHERE category = ?1 AND fingerprint = ?2",
        [category, fingerprint],
    )
    .map_err(|_| internal_error())?;
    Ok(())
}

pub fn get_setting(db_path: &Path, key: &str) -> AppResult<Option<String>> {
    if !VALID_SETTING_KEYS.contains(&key) {
        return Err(AppError::new("ErrorInternal"));
    }
    let conn = open_connection(db_path)?;
    let value: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .map_err(|_| internal_error())?;
    Ok(value)
}

/// 写入设置。调用方负责变更成功后重新签名。
pub fn set_setting(db_path: &Path, key: &str, value: &str) -> AppResult<()> {
    if !VALID_SETTING_KEYS.contains(&key) {
        return Err(AppError::new("ErrorInternal"));
    }
    let conn = open_connection(db_path)?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )
    .map_err(|_| internal_error())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 独立签名密钥目标名，避免污染真实凭据；测试结束删除。
    fn test_key_target(tag: &str) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("MessagesEncrypter.UnitTests.{tag}.{nanos}")
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "me-unit-{}-{tag}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn record(category: &str, alias: &str, fingerprint: &str) -> KeyRecord {
        KeyRecord {
            category: category.to_string(),
            alias: alias.to_string(),
            fingerprint: fingerprint.to_string(),
            public_key_pem: Some(format!("PUBLIC-KEY-OF-{fingerprint}")),
            encrypted_private_key_pem: if category == CATEGORY_PRIVATE {
                Some(format!("ENCRYPTED-PRIVATE-KEY-OF-{fingerprint}"))
            } else {
                None
            },
        }
    }

    #[test]
    fn fresh_database_creates_tables_and_signature() {
        let dir = temp_dir("fresh");
        let db = dir.join("keys.db");
        let target = test_key_target("fresh");
        ensure_database(&db, &target).unwrap();
        assert!(db.exists());
        assert!(integrity::signature_path(&db).exists());
        assert_eq!(
            integrity::verify_file(&db, &target).unwrap(),
            integrity::IntegrityState::Ok
        );
        crate::credman::delete_integrity_key(&target).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn insert_list_roundtrip_and_duplicate_tolerance() {
        let dir = temp_dir("roundtrip");
        let db = dir.join("keys.db");
        let target = test_key_target("roundtrip");
        ensure_database(&db, &target).unwrap();

        assert!(insert_key(&db, &record(CATEGORY_RECIPIENT, "乙", "FP2"), 0).unwrap());
        assert!(insert_key(&db, &record(CATEGORY_RECIPIENT, "甲", "FP1"), 1).unwrap());
        assert!(!insert_key(&db, &record(CATEGORY_RECIPIENT, "重复", "FP2"), 2).unwrap());
        integrity::sign_file(&db, &target, false).unwrap();

        let keys = list_keys(&db, CATEGORY_RECIPIENT).unwrap();
        assert_eq!(keys.len(), 2);
        // 别名排序（不区分大小写）。
        assert_eq!(keys[0].alias, "乙");
        assert_eq!(keys[1].alias, "甲");

        assert!(get_key(&db, CATEGORY_RECIPIENT, "FP1").unwrap().is_some());
        assert!(get_key(&db, CATEGORY_RECIPIENT, "MISSING")
            .unwrap()
            .is_none());

        // 重命名 + 删除。
        assert!(update_alias(&db, CATEGORY_RECIPIENT, "FP2", "丙").unwrap());
        assert_eq!(list_keys(&db, CATEGORY_RECIPIENT).unwrap()[0].alias, "丙");
        delete_key(&db, CATEGORY_RECIPIENT, "FP2").unwrap();
        assert_eq!(list_keys(&db, CATEGORY_RECIPIENT).unwrap().len(), 1);

        crate::credman::delete_integrity_key(&target).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn settings_roundtrip_and_signature_tracking() {
        let dir = temp_dir("settings");
        let db = dir.join("keys.db");
        let target = test_key_target("settings");
        ensure_database(&db, &target).unwrap();

        set_setting(&db, SETTING_DISPLAY_LANGUAGE, "zh-Hans").unwrap();
        integrity::sign_file(&db, &target, false).unwrap();
        assert_eq!(
            get_setting(&db, SETTING_DISPLAY_LANGUAGE)
                .unwrap()
                .as_deref(),
            Some("zh-Hans")
        );
        assert!(get_setting(&db, "NotAValidKey").is_err());

        crate::credman::delete_integrity_key(&target).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn legacy_id_column_table_migrates_and_dedups() {
        let dir = temp_dir("idcol");
        let db = dir.join("keys.db");
        let target = test_key_target("idcol");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    alias TEXT NOT NULL,
                    fingerprint TEXT NOT NULL,
                    public_key_pem TEXT NULL,
                    encrypted_private_key_pem TEXT NULL
                 );
                 INSERT INTO keys (category, sort_order, alias, fingerprint) VALUES ('recipient', 0, 'A', 'F1');
                 INSERT INTO keys (category, sort_order, alias, fingerprint) VALUES ('recipient', 1, 'B', 'F2');
                 INSERT INTO keys (category, sort_order, alias, fingerprint) VALUES ('recipient', 2, 'C', 'F1');
                 INSERT INTO keys (category, sort_order, alias, fingerprint) VALUES ('private', 0, 'D', 'F3');",
            )
            .unwrap();
        }

        ensure_database(&db, &target).unwrap();
        let columns = table_columns(&Connection::open(&db).unwrap(), "keys").unwrap();
        assert!(!columns.iter().any(|c| c == "id"));
        // 重复指纹被忽略：4 行迁移后剩 3。
        assert_eq!(list_keys(&db, CATEGORY_RECIPIENT).unwrap().len(), 2);
        assert_eq!(list_keys(&db, CATEGORY_PRIVATE).unwrap().len(), 1);
        assert_eq!(
            integrity::verify_file(&db, &target).unwrap(),
            integrity::IntegrityState::Ok
        );

        crate::credman::delete_integrity_key(&target).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn legacy_keys_json_migrates_and_renames() {
        let dir = temp_dir("json");
        let db = dir.join("keys.db");
        let target = test_key_target("json");
        std::fs::write(
            dir.join("keys.json"),
            r#"{
              "recipientKeys": [
                { "alias": "A", "fingerprint": "FA", "publicKeyPem": "PUB-A", "encryptedPrivateKeyPem": null }
              ],
              "privateKeys": [
                { "alias": "B", "fingerprint": "FB", "publicKeyPem": "PUB-B", "encryptedPrivateKeyPem": "ENC-B" }
              ]
            }"#,
        )
        .unwrap();

        ensure_database(&db, &target).unwrap();
        assert!(dir.join("keys.json.migrated").exists());
        assert!(!dir.join("keys.json").exists());
        let recipient = list_keys(&db, CATEGORY_RECIPIENT).unwrap();
        assert_eq!(recipient.len(), 1);
        assert_eq!(recipient[0].alias, "A");
        assert_eq!(recipient[0].public_key_pem.as_deref(), Some("PUB-A"));
        let private = list_keys(&db, CATEGORY_PRIVATE).unwrap();
        assert_eq!(
            private[0].encrypted_private_key_pem.as_deref(),
            Some("ENC-B")
        );

        crate::credman::delete_integrity_key(&target).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
}

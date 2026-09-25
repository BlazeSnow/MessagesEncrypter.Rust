//! 旧形态迁移：旧 `id` 列表结构与旧 `keys.json`（见 references/storage.md §3）。

use std::path::Path;

use rusqlite::Connection;

use crate::error::{internal_error, AppResult};
use crate::keystore::{CATEGORY_PRIVATE, CATEGORY_RECIPIENT, KEY_COLUMNS};

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

/// 旧表结构：含自增 id 列 → 重建（INSERT OR IGNORE 顺带去重）。
pub(super) fn rebuild_without_id_column(conn: &Connection) -> AppResult<()> {
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
    .map_err(|_| internal_error())
}

/// 旧版 keys.json → keys 表（仅插入，不重命名不签名）。库中有数据时不执行，返回 false。
pub(super) fn try_migrate_keys_json(conn: &Connection, db_path: &Path) -> AppResult<bool> {
    let json_path = db_path.with_file_name("keys.json");
    let Ok(text) = std::fs::read_to_string(&json_path) else {
        return Ok(false);
    };
    let Ok(store) = serde_json::from_str::<LegacyJsonStore>(&text) else {
        return Ok(false);
    };
    insert_legacy_entries(conn, CATEGORY_RECIPIENT, &store.recipient_keys)?;
    insert_legacy_entries(conn, CATEGORY_PRIVATE, &store.private_keys)?;
    Ok(true)
}

/// 迁移完成后把 keys.json 改名为 `.migrated`（尽力而为）。
pub(super) fn rename_migrated_json(db_path: &Path) {
    let json_path = db_path.with_file_name("keys.json");
    let renamed = json_path.with_file_name("keys.json.migrated");
    let _ = std::fs::rename(&json_path, &renamed);
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

#[cfg(test)]
mod tests {
    use crate::integrity;
    use crate::keystore::tests::{temp_dir, test_key_target};
    use crate::keystore::{ensure_database, list_keys, table_columns, CATEGORY_PRIVATE, CATEGORY_RECIPIENT};
    use rusqlite::Connection;

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

        ensure_database(&db, &target, true).unwrap();
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

        ensure_database(&db, &target, true).unwrap();
        assert!(dir.join("keys.json.migrated").exists());
        assert!(!dir.join("keys.json").exists());
        let recipient = list_keys(&db, CATEGORY_RECIPIENT).unwrap();
        assert_eq!(recipient.len(), 1);
        assert_eq!(recipient[0].alias, "A");
        assert_eq!(recipient[0].public_key_pem.as_deref(), Some("PUB-A"));
        let private = list_keys(&db, CATEGORY_PRIVATE).unwrap();
        assert_eq!(private[0].encrypted_private_key_pem.as_deref(), Some("ENC-B"));

        crate::credman::delete_integrity_key(&target).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
}

mod commands;
mod credman;
mod error;
mod integrity;
mod keys;
mod keystore;
mod migration;
mod protocol_v1;
mod state;

use std::sync::Arc;
use std::sync::Mutex;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 第二实例：唤醒已有主窗口。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // 首次运行迁移旧版密钥库（含签名文件），随后建库/迁移并校验完整性。
            migration::migrate_legacy_store(&data_dir)?;
            let db_path = data_dir.join("keys.db");
            keystore::ensure_database(&db_path, credman::INTEGRITY_KEY_TARGET_NAME)?;
            let integrity_state =
                integrity::verify_file(&db_path, credman::INTEGRITY_KEY_TARGET_NAME)?;

            app.manage(AppState {
                data_dir,
                integrity: Arc::new(Mutex::new(integrity_state)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_key_store_state,
            commands::trust_key_store,
            commands::list_keys,
            commands::generate_key_pair,
            commands::import_public_key,
            commands::import_private_key,
            commands::rename_key,
            commands::delete_key,
            commands::change_private_key_password,
            commands::encrypt_message,
            commands::decrypt_message,
            commands::has_saved_password,
            commands::export_key,
            commands::get_app_settings,
            commands::set_setting,
            commands::get_app_version,
            commands::get_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

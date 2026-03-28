use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

mod commands;
mod licensing;
mod partitions;
mod policy;

use commands::{InventoryState, ScanCancelState};
use licensing::commands::LicenseState;
use licensing::models::License;
use partitions::commands::PartitionListState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ScanCancelState(Arc::new(Mutex::new(None))))
        .manage(InventoryState(Arc::new(Mutex::new(Vec::new()))))
        .manage(LicenseState(Arc::new(Mutex::new(License::free()))))
        .manage(PartitionListState(Arc::new(Mutex::new(Vec::new()))))
        .invoke_handler(tauri::generate_handler![
            commands::scan_subnet,
            commands::scan_csv,
            commands::cancel_scan,
            commands::load_inventory,
            commands::get_device_detail,
            commands::get_device_health,
            commands::get_fleet_health,
            commands::backup_config,
            commands::list_backups,
            commands::diff_configs,
            commands::rollback_config,
            commands::vault_init,
            commands::vault_unlock,
            commands::vault_list,
            commands::vault_set,
            commands::vault_delete,
            commands::vault_resolve,
            commands::export_ansible_inventory,
            commands::generate_playbook,
            commands::list_playbook_templates,
            // Licensing commands
            licensing::commands::import_license,
            licensing::commands::get_license,
            licensing::commands::validate_license,
            licensing::commands::deactivate_license,
            // Partition commands
            partitions::commands::list_partitions,
            partitions::commands::create_partition,
            partitions::commands::update_partition_state,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("main window should exist");
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

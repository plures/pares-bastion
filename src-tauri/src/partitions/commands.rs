//! Tauri commands for partition management.

use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use super::models::{Partition, PartitionState};
use crate::licensing::commands::LicenseState;

/// Managed state for partitions.
pub struct PartitionListState(pub Arc<Mutex<Vec<Partition>>>);

/// List all partitions.
#[tauri::command]
pub async fn list_partitions(
    state: State<'_, PartitionListState>,
) -> Result<Vec<Partition>, String> {
    let guard = state.0.lock().await;
    Ok(guard.clone())
}

/// Create a new partition (local_only or synced).
#[tauri::command]
pub async fn create_partition(
    partition_state: State<'_, PartitionListState>,
    license_state: State<'_, LicenseState>,
    display_name: String,
    state: String, // "local_only" or "synced"
    tags: Option<Vec<String>>,
) -> Result<Partition, String> {
    let requested_state: PartitionState = serde_json::from_str(&format!("\"{state}\""))
        .map_err(|_| format!("Invalid partition state: {state}"))?;

    // If synced, check license limits
    if requested_state == PartitionState::Synced {
        let license = license_state.0.lock().await;
        let partitions = partition_state.0.lock().await;
        let check = super::service::can_create_synced(&license, &partitions);
        if !check.ok {
            return Err(check.error.unwrap_or_else(|| "Cannot create synced partition".into()));
        }
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let partition = Partition {
        partition_id: uuid::Uuid::new_v4().to_string(),
        org_id: "local".into(),
        display_name: display_name.clone(),
        slug: slugify(&display_name),
        state: requested_state,
        created_at: now_ms,
        updated_at: now_ms,
        created_by: "user".into(),
        tags: tags.unwrap_or_default(),
        classification: None,
    };

    let mut guard = partition_state.0.lock().await;
    guard.push(partition.clone());

    Ok(partition)
}

/// Update a partition's state (archive, suspend, enable/disable sync).
#[tauri::command]
pub async fn update_partition_state(
    partition_state: State<'_, PartitionListState>,
    license_state: State<'_, LicenseState>,
    partition_id: String,
    new_state: String,
) -> Result<Partition, String> {
    let target: PartitionState = serde_json::from_str(&format!("\"{new_state}\""))
        .map_err(|_| format!("Invalid partition state: {new_state}"))?;

    let mut guard = partition_state.0.lock().await;

    // Pre-check: if we need to enable sync, validate license limits first
    // (before taking a mutable borrow on the specific partition).
    let wants_sync = target == PartitionState::Synced;
    if wants_sync {
        let currently_local = guard
            .iter()
            .find(|p| p.partition_id == partition_id)
            .map(|p| p.state == PartitionState::LocalOnly)
            .unwrap_or(false);
        if currently_local {
            let license = license_state.0.lock().await;
            let check = super::service::can_create_synced(&license, &guard);
            if !check.ok {
                return Err(check.error.unwrap_or_else(|| "Cannot enable sync".into()));
            }
        }
    }

    let partition = guard
        .iter_mut()
        .find(|p| p.partition_id == partition_id)
        .ok_or("Partition not found")?;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    partition.state = target;
    partition.updated_at = now_ms;

    Ok(partition.clone())
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

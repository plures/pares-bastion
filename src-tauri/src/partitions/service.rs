//! Partition service — CRUD, state transitions, limit enforcement.

use super::models::{count_synced, Partition, PartitionState};
use crate::licensing::models::License;

/// Result of a partition creation or state change attempt.
#[derive(Debug)]
pub struct PartitionResult {
    pub ok: bool,
    pub partition: Option<Partition>,
    pub error: Option<String>,
    pub warning: Option<String>,
}

/// Check if creating a synced partition is allowed under the current license.
pub fn can_create_synced(license: &License, partitions: &[Partition]) -> PartitionResult {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    if !license.is_sync_capable(now_ms) {
        return PartitionResult {
            ok: false,
            partition: None,
            error: Some("License is not active. Synced partitions require an active license.".into()),
            warning: None,
        };
    }

    let limit = license.max_synced_partitions;
    if limit == 0 {
        return PartitionResult {
            ok: false,
            partition: None,
            error: Some("Free tier does not include synced partitions. Upgrade to Pro or above.".into()),
            warning: None,
        };
    }

    let used = count_synced(partitions) as i32;

    // Unlimited
    if limit == -1 {
        return PartitionResult {
            ok: true,
            partition: None,
            error: None,
            warning: None,
        };
    }

    let remaining = limit - used;
    if remaining <= 0 {
        return PartitionResult {
            ok: false,
            partition: None,
            error: Some(format!(
                "All {limit} synced partition{} are in use. Upgrade or archive existing partitions.",
                if limit == 1 { "" } else { "s" }
            )),
            warning: None,
        };
    }

    // Soft warning: last slot
    let warning = if remaining == 1 && limit > 1 {
        Some(format!(
            "This will use your last available synced partition slot ({}/{})",
            used + 1,
            limit
        ))
    } else {
        None
    };

    PartitionResult {
        ok: true,
        partition: None,
        error: None,
        warning,
    }
}

/// Handle license downgrade: suspend excess synced partitions.
///
/// Does NOT delete data — preserves local access.
/// Returns list of partition IDs that were suspended.
pub fn handle_downgrade(
    license: &License,
    partitions: &mut [Partition],
) -> Vec<String> {
    let limit = license.max_synced_partitions;
    if limit == -1 {
        return vec![]; // unlimited, nothing to do
    }

    let mut synced: Vec<&mut Partition> = partitions
        .iter_mut()
        .filter(|p| p.state == PartitionState::Synced)
        .collect();

    let excess = synced.len() as i32 - limit;
    if excess <= 0 {
        return vec![];
    }

    // Suspend the most recently created synced partitions first (LIFO)
    synced.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let mut suspended = Vec::new();
    for p in synced.iter_mut().take(excess as usize) {
        p.state = PartitionState::Suspended;
        p.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        suspended.push(p.partition_id.clone());
    }

    suspended
}

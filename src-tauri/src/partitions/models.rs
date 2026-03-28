//! Partition domain types.
//!
//! A partition is the billing unit, security boundary, sync group,
//! replication group, and data isolation boundary.
//! Licenses are consumed by partitions, NOT seats.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PartitionState {
    LocalOnly,
    Synced,
    Suspended,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartitionClassification {
    pub business_unit: Option<String>,
    pub department: Option<String>,
    pub environment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Partition {
    pub partition_id: String,
    pub org_id: String,
    pub display_name: String,
    pub slug: String,
    pub state: PartitionState,
    pub created_at: u64,
    pub updated_at: u64,
    pub created_by: String,
    pub tags: Vec<String>,
    pub classification: Option<PartitionClassification>,
}

impl Partition {
    /// Does this partition count toward the synced partition limit?
    ///
    /// Counting policy (see docs/licensing-and-partitions.md):
    /// - `synced` → YES
    /// - `suspended` → YES (prevents abuse)
    /// - `local_only` → NO
    /// - `archived` → NO
    pub fn counts_toward_limit(&self) -> bool {
        matches!(self.state, PartitionState::Synced | PartitionState::Suspended)
    }
}

/// Count partitions that consume the synced partition entitlement.
pub fn count_synced(partitions: &[Partition]) -> usize {
    partitions.iter().filter(|p| p.counts_toward_limit()).count()
}

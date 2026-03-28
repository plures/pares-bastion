//! License domain types (Rust mirror of src/lib/domain/license.ts).
//!
//! Billing unit: partition, NOT seats.
//! See docs/licensing-and-partitions.md.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LicenseTier {
    Free,
    Pro,
    Team,
    Enterprise,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LicenseStatus {
    Active,
    Expired,
    Suspended,
    Revoked,
    Grace,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FeatureFlag {
    Sync,
    AuditLogs,
    AdvancedPolicy,
    OfflineLicenseImport,
    PartitionSnapshots,
    CrossPartitionFederation,
    EnterpriseAdminControls,
    PrioritySync,
    AdvancedConflictResolution,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FeatureLevel {
    Disabled,
    Basic,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureEntitlement {
    pub feature: FeatureFlag,
    pub level: FeatureLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    pub license_id: String,
    pub org_id: String,
    pub tier: LicenseTier,
    pub status: LicenseStatus,
    pub issued_at: u64,
    pub valid_from: u64,
    pub valid_until: Option<u64>,
    pub grace_until: Option<u64>,
    pub max_synced_partitions: i32, // 0=free, 1=pro, 5=team, -1=unlimited
    pub features: Vec<FeatureEntitlement>,
    pub signature: String,
    pub issuer: String,
    pub offline_capable: bool,
    pub metadata: std::collections::HashMap<String, String>,
}

/// License file format: license payload + detached signature.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseFile {
    pub license: LicensePayload,
    pub signature: String,
}

/// License payload (everything except status and signature — those are computed/external).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub license_id: String,
    pub org_id: String,
    pub tier: LicenseTier,
    pub issued_at: u64,
    pub valid_from: u64,
    pub valid_until: Option<u64>,
    pub grace_until: Option<u64>,
    pub max_synced_partitions: i32,
    pub features: Vec<FeatureEntitlement>,
    pub issuer: String,
    pub offline_capable: bool,
    pub metadata: std::collections::HashMap<String, String>,
}

impl License {
    /// Compute effective status based on current time.
    pub fn compute_status(&self, now_ms: u64) -> LicenseStatus {
        if self.status == LicenseStatus::Revoked {
            return LicenseStatus::Revoked;
        }
        if self.status == LicenseStatus::Suspended {
            return LicenseStatus::Suspended;
        }

        if let Some(valid_until) = self.valid_until {
            if now_ms > valid_until {
                if let Some(grace_until) = self.grace_until {
                    if now_ms <= grace_until {
                        return LicenseStatus::Grace;
                    }
                }
                return LicenseStatus::Expired;
            }
        }

        if now_ms < self.valid_from {
            return LicenseStatus::Suspended;
        }

        LicenseStatus::Active
    }

    /// Check if sync operations are allowed right now.
    pub fn is_sync_capable(&self, now_ms: u64) -> bool {
        let status = self.compute_status(now_ms);
        matches!(status, LicenseStatus::Active | LicenseStatus::Grace)
    }

    /// Create a free/default license.
    pub fn free() -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        License {
            license_id: "free".into(),
            org_id: "local".into(),
            tier: LicenseTier::Free,
            status: LicenseStatus::Active,
            issued_at: now,
            valid_from: now,
            valid_until: None,
            grace_until: None,
            max_synced_partitions: 0,
            features: vec![],
            signature: String::new(),
            issuer: "builtin".into(),
            offline_capable: true,
            metadata: std::collections::HashMap::new(),
        }
    }
}

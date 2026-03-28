//! Centralized policy/entitlement enforcement (Rust side).
//!
//! Mirrors src/lib/domain/entitlements.ts for backend enforcement.
//! The frontend entitlements engine is the primary one (drives UI);
//! this module provides backend enforcement for Tauri commands.

use crate::licensing::models::{FeatureFlag, FeatureLevel, License, LicenseTier};
use crate::partitions::models::{count_synced, Partition};

/// Feature matrix — single source of truth for tier→feature mapping.
pub fn tier_feature_level(tier: &LicenseTier, feature: &FeatureFlag) -> FeatureLevel {
    use FeatureFlag::*;
    use FeatureLevel::*;
    use LicenseTier::*;

    match (tier, feature) {
        // Free: everything disabled
        (Free, _) => Disabled,

        // Pro
        (Pro, Sync) => Full,
        (Pro, AuditLogs) => Basic,
        (Pro, OfflineLicenseImport) => Full,
        (Pro, PartitionSnapshots) => Basic,
        (Pro, _) => Disabled,

        // Team
        (Team, Sync) => Full,
        (Team, AuditLogs) => Full,
        (Team, AdvancedPolicy) => Basic,
        (Team, OfflineLicenseImport) => Full,
        (Team, PartitionSnapshots) => Full,
        (Team, AdvancedConflictResolution) => Full,
        (Team, _) => Disabled,

        // Enterprise: everything full
        (Enterprise, _) => Full,
    }
}

/// Check if a feature is enabled for the given license tier.
pub fn is_feature_enabled(tier: &LicenseTier, feature: &FeatureFlag) -> bool {
    !matches!(tier_feature_level(tier, feature), FeatureLevel::Disabled)
}

/// Check if creating a synced partition is allowed.
pub fn can_create_synced_partition(license: &License, partitions: &[Partition]) -> bool {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    if !license.is_sync_capable(now_ms) {
        return false;
    }

    let limit = license.max_synced_partitions;
    if limit == 0 {
        return false;
    }
    if limit == -1 {
        return true; // unlimited
    }

    let used = count_synced(partitions) as i32;
    used < limit
}

// ─── Feature Matrix ─────────────────────────────────────────────────────────
// Data-driven tier→feature mapping. Single source of truth.
// NO scattered conditionals — all entitlement checks go through computeEntitlements().

import type { LicenseTier, FeatureFlag, FeatureLevel } from './license.js';

export interface TierDefinition {
	tier: LicenseTier;
	maxLocalPartitions: number; // -1 = unlimited
	maxSyncedPartitions: number; // 0, 1, 5, or -1 (unlimited)
	features: Record<FeatureFlag, FeatureLevel>;
}

/**
 * Canonical feature matrix. Add new tiers or features here — nowhere else.
 */
export const TIER_MATRIX: Record<LicenseTier, TierDefinition> = {
	free: {
		tier: 'free',
		maxLocalPartitions: 1,
		maxSyncedPartitions: 0,
		features: {
			sync: 'disabled',
			audit_logs: 'disabled',
			advanced_policy: 'disabled',
			offline_license_import: 'disabled',
			partition_snapshots: 'disabled',
			cross_partition_federation: 'disabled',
			enterprise_admin_controls: 'disabled',
			priority_sync: 'disabled',
			advanced_conflict_resolution: 'disabled',
		},
	},
	pro: {
		tier: 'pro',
		maxLocalPartitions: -1,
		maxSyncedPartitions: 1,
		features: {
			sync: 'full',
			audit_logs: 'basic',
			advanced_policy: 'disabled',
			offline_license_import: 'full',
			partition_snapshots: 'basic',
			cross_partition_federation: 'disabled',
			enterprise_admin_controls: 'disabled',
			priority_sync: 'disabled',
			advanced_conflict_resolution: 'disabled',
		},
	},
	team: {
		tier: 'team',
		maxLocalPartitions: -1,
		maxSyncedPartitions: 5,
		features: {
			sync: 'full',
			audit_logs: 'full',
			advanced_policy: 'basic',
			offline_license_import: 'full',
			partition_snapshots: 'full',
			cross_partition_federation: 'disabled',
			enterprise_admin_controls: 'disabled',
			priority_sync: 'disabled',
			advanced_conflict_resolution: 'full',
		},
	},
	enterprise: {
		tier: 'enterprise',
		maxLocalPartitions: -1,
		maxSyncedPartitions: -1, // configured per license
		features: {
			sync: 'full',
			audit_logs: 'full',
			advanced_policy: 'full',
			offline_license_import: 'full',
			partition_snapshots: 'full',
			cross_partition_federation: 'full',
			enterprise_admin_controls: 'full',
			priority_sync: 'full',
			advanced_conflict_resolution: 'full',
		},
	},
};

/**
 * Get the feature level for a given tier and feature.
 * License-level feature overrides are applied in computeEntitlements(),
 * not here — this is the baseline matrix.
 */
export function getTierFeatureLevel(tier: LicenseTier, feature: FeatureFlag): FeatureLevel {
	return TIER_MATRIX[tier].features[feature];
}

/** All feature flags, for iteration. */
export const ALL_FEATURES: FeatureFlag[] = [
	'sync',
	'audit_logs',
	'advanced_policy',
	'offline_license_import',
	'partition_snapshots',
	'cross_partition_federation',
	'enterprise_admin_controls',
	'priority_sync',
	'advanced_conflict_resolution',
];

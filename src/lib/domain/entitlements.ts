// ─── Entitlements Engine ────────────────────────────────────────────────────
// Centralized policy layer. ALL entitlement checks go through here.
// No ad hoc conditionals in components or services.

import type { License, FeatureFlag, FeatureLevel } from './license.js';
import type { Partition } from './partition.js';
import { computeLicenseStatus } from './license.js';
import { countSyncedPartitions } from './partition.js';
import { TIER_MATRIX, ALL_FEATURES } from './feature-matrix.js';

// ─── Entitlements Result ────────────────────────────────────────────────────

export interface Entitlements {
	// Partition capabilities
	canCreateLocalPartition: boolean;
	canCreateSyncedPartition: boolean;
	canSyncPartition: boolean;
	canArchivePartition: boolean;

	// Feature capabilities
	canUseAuditLogs: boolean;
	canUseAdvancedPolicy: boolean;
	canUseCrossPartitionFederation: boolean;
	canUseEnterpriseAdminControls: boolean;
	canUseOfflineLicenseImport: boolean;
	canUsePartitionSnapshots: boolean;
	canUsePrioritySync: boolean;
	canUseAdvancedConflictResolution: boolean;

	// Partition limits
	syncedPartitionLimit: number;
	syncedPartitionsUsed: number;
	syncedPartitionsRemaining: number;
	localPartitionLimit: number;

	// License state
	licenseActive: boolean;
	inGracePeriod: boolean;
	tier: License['tier'];

	// Per-feature level for UI display
	featureLevels: Record<FeatureFlag, FeatureLevel>;
}

// ─── Computation ────────────────────────────────────────────────────────────

/**
 * Compute current entitlements from a license and partition list.
 * This is the ONLY function that determines what the user can do.
 */
export function computeEntitlements(license: License, partitions: Partition[]): Entitlements {
	const now = Date.now();
	const status = computeLicenseStatus(license, now);
	const licenseActive = status === 'active' || status === 'grace';
	const inGracePeriod = status === 'grace';

	const tierDef = TIER_MATRIX[license.tier];

	// Partition counts
	const syncedUsed = countSyncedPartitions(partitions);
	const localCount = partitions.filter((p) => p.state === 'local_only').length;

	// Synced partition limit — enterprise uses license.maxSyncedPartitions (configurable)
	const syncedLimit =
		license.tier === 'enterprise' && license.maxSyncedPartitions !== -1
			? license.maxSyncedPartitions
			: tierDef.maxSyncedPartitions;

	const syncedRemaining = syncedLimit === -1 ? Infinity : Math.max(0, syncedLimit - syncedUsed);

	// Build feature levels — start from tier matrix, apply license-specific overrides
	const featureLevels = {} as Record<FeatureFlag, FeatureLevel>;
	for (const f of ALL_FEATURES) {
		// Start with tier baseline
		let level = tierDef.features[f];
		// Apply license-specific overrides (higher level wins)
		const override = license.features.find((e) => e.feature === f);
		if (override && featureLevelRank(override.level) > featureLevelRank(level)) {
			level = override.level;
		}
		// If license is not active, disable sync-dependent features
		if (!licenseActive && SYNC_DEPENDENT_FEATURES.has(f)) {
			level = 'disabled';
		}
		featureLevels[f] = level;
	}

	const can = (f: FeatureFlag): boolean => featureLevels[f] !== 'disabled';

	return {
		canCreateLocalPartition:
			tierDef.maxLocalPartitions === -1 || localCount < tierDef.maxLocalPartitions,
		canCreateSyncedPartition: licenseActive && syncedRemaining > 0,
		canSyncPartition: licenseActive && can('sync'),
		canArchivePartition: true, // always allowed — archival is a safety operation

		canUseAuditLogs: can('audit_logs'),
		canUseAdvancedPolicy: can('advanced_policy'),
		canUseCrossPartitionFederation: can('cross_partition_federation'),
		canUseEnterpriseAdminControls: can('enterprise_admin_controls'),
		canUseOfflineLicenseImport: can('offline_license_import'),
		canUsePartitionSnapshots: can('partition_snapshots'),
		canUsePrioritySync: can('priority_sync'),
		canUseAdvancedConflictResolution: can('advanced_conflict_resolution'),

		syncedPartitionLimit: syncedLimit,
		syncedPartitionsUsed: syncedUsed,
		syncedPartitionsRemaining: syncedRemaining === Infinity ? -1 : syncedRemaining,
		localPartitionLimit: tierDef.maxLocalPartitions,

		licenseActive,
		inGracePeriod,
		tier: license.tier,
		featureLevels,
	};
}

// ─── Limit Enforcement ──────────────────────────────────────────────────────

export interface LimitCheck {
	allowed: boolean;
	reason?: string;
	isWarning?: boolean; // true = soft limit (warning), false = hard limit (blocked)
}

/** Check if creating a new synced partition is allowed. */
export function checkCreateSyncedPartition(entitlements: Entitlements): LimitCheck {
	if (!entitlements.licenseActive) {
		return {
			allowed: false,
			reason: 'License is not active. Synced partitions require an active license.',
		};
	}

	if (entitlements.syncedPartitionLimit === 0) {
		return {
			allowed: false,
			reason: 'Free tier does not include synced partitions. Upgrade to Pro or above.',
		};
	}

	if (entitlements.syncedPartitionsRemaining === 0) {
		const limit = entitlements.syncedPartitionLimit;
		return {
			allowed: false,
			reason: `All ${limit} synced partition${limit === 1 ? '' : 's'} are in use. Upgrade or archive existing partitions.`,
		};
	}

	// Soft warning when nearing limit (1 remaining)
	if (
		entitlements.syncedPartitionsRemaining === 1 &&
		entitlements.syncedPartitionLimit > 1
	) {
		return {
			allowed: true,
			isWarning: true,
			reason: `This will use your last available synced partition slot (${entitlements.syncedPartitionsUsed + 1}/${entitlements.syncedPartitionLimit}).`,
		};
	}

	return { allowed: true };
}

/** Check if enabling sync on a local_only partition is allowed. */
export function checkEnableSync(entitlements: Entitlements): LimitCheck {
	if (!entitlements.canSyncPartition) {
		return {
			allowed: false,
			reason: entitlements.inGracePeriod
				? 'License is in grace period. Sync is temporarily available but new sync enablement is restricted.'
				: 'Sync requires an active license with sync capability.',
		};
	}

	return checkCreateSyncedPartition(entitlements);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

const SYNC_DEPENDENT_FEATURES: ReadonlySet<FeatureFlag> = new Set([
	'sync',
	'priority_sync',
	'cross_partition_federation',
	'advanced_conflict_resolution',
]);

function featureLevelRank(level: FeatureLevel): number {
	switch (level) {
		case 'disabled':
			return 0;
		case 'basic':
			return 1;
		case 'full':
			return 2;
	}
}

// ─── Display Helpers ────────────────────────────────────────────────────────

/** Human-readable partition limit description. */
export function formatPartitionLimit(entitlements: Entitlements): string {
	const { syncedPartitionLimit, syncedPartitionsUsed } = entitlements;
	if (syncedPartitionLimit === -1) {
		return `${syncedPartitionsUsed} synced partition${syncedPartitionsUsed === 1 ? '' : 's'} (unlimited)`;
	}
	if (syncedPartitionLimit === 0) {
		return 'Local only — no synced partitions';
	}
	return `${syncedPartitionsUsed} of ${syncedPartitionLimit} synced partition${syncedPartitionLimit === 1 ? '' : 's'} in use`;
}

/** Label for displaying the unlimited-user rule. */
export const UNLIMITED_USERS_LABEL = 'Unlimited users per partition';

// ─── License Domain Types ───────────────────────────────────────────────────
// Canonical license model. Billing unit: partition, NOT seats.
// See docs/licensing-and-partitions.md for full design.

export type LicenseTier = 'free' | 'pro' | 'team' | 'enterprise';

export type LicenseStatus = 'active' | 'expired' | 'suspended' | 'revoked' | 'grace';

export type FeatureFlag =
	| 'sync'
	| 'audit_logs'
	| 'advanced_policy'
	| 'offline_license_import'
	| 'partition_snapshots'
	| 'cross_partition_federation'
	| 'enterprise_admin_controls'
	| 'priority_sync'
	| 'advanced_conflict_resolution';

export type FeatureLevel = 'disabled' | 'basic' | 'full';

export interface FeatureEntitlement {
	feature: FeatureFlag;
	level: FeatureLevel;
}

export interface License {
	licenseId: string;
	orgId: string;
	tier: LicenseTier;
	status: LicenseStatus;
	issuedAt: number;
	validFrom: number;
	validUntil: number | null;
	graceUntil: number | null;
	maxSyncedPartitions: number; // 0=free, 1=pro, 5=team, -1=unlimited
	features: FeatureEntitlement[];
	signature: string;
	issuer: string;
	offlineCapable: boolean;
	metadata: Record<string, string>;
}

// ─── License File Format ────────────────────────────────────────────────────
// A .netops-license file is JSON with two top-level keys:
//   { "license": License (without signature), "signature": string }

export interface LicenseFile {
	license: Omit<License, 'signature' | 'status'>;
	signature: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function createFreeLicense(): License {
	return {
		licenseId: 'free',
		orgId: 'local',
		tier: 'free',
		status: 'active',
		issuedAt: Date.now(),
		validFrom: Date.now(),
		validUntil: null,
		graceUntil: null,
		maxSyncedPartitions: 0,
		features: [],
		signature: '',
		issuer: 'builtin',
		offlineCapable: true,
		metadata: {},
	};
}

/** Compute effective status based on timestamps. */
export function computeLicenseStatus(license: License, now: number = Date.now()): LicenseStatus {
	if (license.status === 'revoked') return 'revoked';
	if (license.status === 'suspended') return 'suspended';

	if (license.validUntil !== null && now > license.validUntil) {
		if (license.graceUntil !== null && now <= license.graceUntil) {
			return 'grace';
		}
		return 'expired';
	}

	if (now < license.validFrom) return 'suspended'; // not yet valid

	return 'active';
}

/** Check if a license allows sync operations right now. */
export function isSyncCapable(license: License, now: number = Date.now()): boolean {
	const status = computeLicenseStatus(license, now);
	return status === 'active' || status === 'grace';
}

/** Default grace period: 14 days in ms. */
export const DEFAULT_GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

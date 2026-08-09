// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
	createFreeLicense,
	computeLicenseStatus,
	isSyncCapable,
	DEFAULT_GRACE_PERIOD_MS,
} from '../license.js';
import type { License } from '../license.js';
import {
	countsTowardLimit,
	slugify,
	createDefaultPartition,
} from '../partition.js';
import type { Partition } from '../partition.js';
import {
	computeEntitlements,
	checkCreateSyncedPartition,
	checkEnableSync,
	formatPartitionLimit,
} from '../entitlements.js';
import { TIER_MATRIX, getTierFeatureLevel, ALL_FEATURES } from '../feature-matrix.js';
import { validateLicenseFile, exportLicenseInfo } from '../../services/license-service.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLicense(overrides: Partial<License> = {}): License {
	return { ...createFreeLicense(), ...overrides };
}

function makePartition(state: Partition['state'] = 'local_only'): Partition {
	return {
		partitionId: crypto.randomUUID(),
		orgId: 'test',
		displayName: 'Test',
		slug: 'test',
		state,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		createdBy: 'test',
		tags: [],
	};
}

// ─── isSyncCapable ──────────────────────────────────────────────────────────

describe('isSyncCapable', () => {
	it('free active license is sync capable (status-wise)', () => {
		const lic = createFreeLicense();
		expect(isSyncCapable(lic)).toBe(true);
	});

	it('revoked license is not sync capable', () => {
		const lic = makeLicense({ status: 'revoked' });
		expect(isSyncCapable(lic)).toBe(false);
	});

	it('suspended license is not sync capable', () => {
		const lic = makeLicense({ status: 'suspended' });
		expect(isSyncCapable(lic)).toBe(false);
	});

	it('grace period license is sync capable', () => {
		const lic = makeLicense({
			validUntil: Date.now() - 1000,
			graceUntil: Date.now() + 86_400_000,
		});
		expect(isSyncCapable(lic)).toBe(true);
	});

	it('fully expired license is not sync capable', () => {
		const lic = makeLicense({
			validUntil: Date.now() - 200_000,
			graceUntil: Date.now() - 1000,
		});
		expect(isSyncCapable(lic)).toBe(false);
	});
});

// ─── DEFAULT_GRACE_PERIOD_MS ────────────────────────────────────────────────

describe('DEFAULT_GRACE_PERIOD_MS', () => {
	it('is 14 days in milliseconds', () => {
		expect(DEFAULT_GRACE_PERIOD_MS).toBe(14 * 24 * 60 * 60 * 1000);
	});
});

// ─── computeLicenseStatus edge cases ────────────────────────────────────────

describe('computeLicenseStatus edge cases', () => {
	it('exactly at validUntil boundary is active', () => {
		const now = 1_000_000;
		const lic = makeLicense({ validFrom: 0, validUntil: now });
		expect(computeLicenseStatus(lic, now)).toBe('active');
	});

	it('one ms past validUntil without grace is expired', () => {
		const now = 1_000_001;
		const lic = makeLicense({ validFrom: 0, validUntil: 1_000_000 });
		expect(computeLicenseStatus(lic, now)).toBe('expired');
	});

	it('null validUntil with active status stays active', () => {
		const lic = makeLicense({ validUntil: null, validFrom: 0 });
		expect(computeLicenseStatus(lic, Date.now())).toBe('active');
	});

	it('exactly at graceUntil boundary is grace', () => {
		const now = 2_000_000;
		const lic = makeLicense({ validFrom: 0, validUntil: 1_000_000, graceUntil: now });
		expect(computeLicenseStatus(lic, now)).toBe('grace');
	});

	it('one ms past graceUntil is expired', () => {
		const now = 2_000_001;
		const lic = makeLicense({ validFrom: 0, validUntil: 1_000_000, graceUntil: 2_000_000 });
		expect(computeLicenseStatus(lic, now)).toBe('expired');
	});
});

// ─── countsTowardLimit ──────────────────────────────────────────────────────

describe('countsTowardLimit', () => {
	it('synced partition counts', () => {
		expect(countsTowardLimit(makePartition('synced'))).toBe(true);
	});

	it('suspended partition counts', () => {
		expect(countsTowardLimit(makePartition('suspended'))).toBe(true);
	});

	it('local_only partition does not count', () => {
		expect(countsTowardLimit(makePartition('local_only'))).toBe(false);
	});

	it('archived partition does not count', () => {
		expect(countsTowardLimit(makePartition('archived'))).toBe(false);
	});
});

// ─── slugify edge cases ─────────────────────────────────────────────────────

describe('slugify edge cases', () => {
	it('strips leading/trailing hyphens', () => {
		expect(slugify('---hello---')).toBe('hello');
	});

	it('collapses consecutive special chars', () => {
		expect(slugify('a   b///c')).toBe('a-b-c');
	});

	it('truncates to 64 characters', () => {
		const long = 'a'.repeat(100);
		expect(slugify(long).length).toBeLessThanOrEqual(64);
	});

	it('handles numeric-only names', () => {
		expect(slugify('12345')).toBe('12345');
	});

	it('handles unicode by stripping non-ascii', () => {
		// slugify uses [^a-z0-9]+ regex which strips accented chars (no NFD normalization)
		const result = slugify('café résumé');
		expect(result).toMatch(/^caf-r-sum$/);
	});
});

// ─── createDefaultPartition ─────────────────────────────────────────────────

describe('createDefaultPartition fields', () => {
	it('has all required fields', () => {
		const p = createDefaultPartition();
		expect(p.orgId).toBe('local');
		expect(p.slug).toBe('default');
		expect(p.createdBy).toBe('system');
		expect(p.tags).toEqual([]);
		expect(typeof p.createdAt).toBe('number');
		expect(typeof p.updatedAt).toBe('number');
	});
});

// ─── Feature Matrix helpers ─────────────────────────────────────────────────

describe('getTierFeatureLevel', () => {
	it('returns correct level for known tier+feature', () => {
		expect(getTierFeatureLevel('pro', 'sync')).toBe('full');
		expect(getTierFeatureLevel('free', 'sync')).toBe('disabled');
		expect(getTierFeatureLevel('team', 'audit_logs')).toBe('full');
	});

	it('pro tier features match matrix', () => {
		for (const feature of ALL_FEATURES) {
			expect(getTierFeatureLevel('pro', feature)).toBe(TIER_MATRIX.pro.features[feature]);
		}
	});
});

describe('Feature matrix local partition limits', () => {
	it('free tier allows 1 local partition', () => {
		expect(TIER_MATRIX.free.maxLocalPartitions).toBe(1);
	});

	it('pro tier has unlimited local partitions', () => {
		expect(TIER_MATRIX.pro.maxLocalPartitions).toBe(-1);
	});
});

// ─── Entitlement: feature override ──────────────────────────────────────────

describe('Entitlement feature overrides', () => {
	it('license-level override elevates feature level', () => {
		const lic = makeLicense({
			tier: 'pro',
			maxSyncedPartitions: 1,
			features: [{ feature: 'advanced_policy', level: 'full' }],
		});
		const ent = computeEntitlements(lic, []);
		expect(ent.featureLevels.advanced_policy).toBe('full');
	});

	it('override does not downgrade feature level', () => {
		const lic = makeLicense({
			tier: 'enterprise',
			maxSyncedPartitions: -1,
			features: [{ feature: 'sync', level: 'basic' }],
		});
		const ent = computeEntitlements(lic, []);
		// enterprise baseline is 'full', override to 'basic' should not apply
		expect(ent.featureLevels.sync).toBe('full');
	});
});

// ─── Entitlement: grace period nuances ──────────────────────────────────────

describe('Entitlement grace period', () => {
	it('grace period license is active for entitlements', () => {
		const lic = makeLicense({
			tier: 'pro',
			maxSyncedPartitions: 1,
			validUntil: Date.now() - 1000,
			graceUntil: Date.now() + 86_400_000,
		});
		const ent = computeEntitlements(lic, []);
		expect(ent.licenseActive).toBe(true);
		expect(ent.inGracePeriod).toBe(true);
		expect(ent.canCreateSyncedPartition).toBe(true);
	});

	it('expired sync-dependent features are disabled', () => {
		const lic = makeLicense({
			tier: 'pro',
			maxSyncedPartitions: 1,
			validUntil: Date.now() - 1000,
		});
		const ent = computeEntitlements(lic, []);
		expect(ent.featureLevels.sync).toBe('disabled');
		expect(ent.featureLevels.priority_sync).toBe('disabled');
		expect(ent.featureLevels.cross_partition_federation).toBe('disabled');
		expect(ent.featureLevels.advanced_conflict_resolution).toBe('disabled');
	});
});

// ─── Entitlement: local partition limit enforcement ─────────────────────────

describe('Entitlement local partition limits', () => {
	it('free tier blocks second local partition', () => {
		const lic = makeLicense({ tier: 'free' });
		const ent = computeEntitlements(lic, [makePartition('local_only')]);
		expect(ent.canCreateLocalPartition).toBe(false);
	});

	it('free tier allows first local partition', () => {
		const lic = makeLicense({ tier: 'free' });
		const ent = computeEntitlements(lic, []);
		expect(ent.canCreateLocalPartition).toBe(true);
	});

	it('pro tier allows unlimited local partitions', () => {
		const partitions = Array.from({ length: 50 }, () => makePartition('local_only'));
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, partitions);
		expect(ent.canCreateLocalPartition).toBe(true);
	});
});

// ─── checkEnableSync detailed scenarios ─────────────────────────────────────

describe('checkEnableSync', () => {
	it('allowed for pro with capacity', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, []);
		const check = checkEnableSync(ent);
		expect(check.allowed).toBe(true);
	});

	it('blocked for free tier', () => {
		const ent = computeEntitlements(makeLicense({ tier: 'free' }), []);
		const check = checkEnableSync(ent);
		expect(check.allowed).toBe(false);
	});

	it('blocked when at synced partition limit', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, [makePartition('synced')]);
		const check = checkEnableSync(ent);
		expect(check.allowed).toBe(false);
	});

	it('grace period allows sync when canSyncPartition is true', () => {
		const lic = makeLicense({
			tier: 'pro',
			maxSyncedPartitions: 1,
			validUntil: Date.now() - 1000,
			graceUntil: Date.now() + 86_400_000,
		});
		const ent = computeEntitlements(lic, []);
		const check = checkEnableSync(ent);
		// Grace period: license is active, sync feature is enabled, partition available
		expect(check.allowed).toBe(true);
	});
});

// ─── Enterprise configurable limits ─────────────────────────────────────────

describe('Enterprise configurable limits', () => {
	it('enterprise with specific limit respects it', () => {
		const lic = makeLicense({ tier: 'enterprise', maxSyncedPartitions: 10 });
		const ent = computeEntitlements(lic, []);
		expect(ent.syncedPartitionLimit).toBe(10);
		expect(ent.syncedPartitionsRemaining).toBe(10);
	});

	it('enterprise with -1 is unlimited', () => {
		const lic = makeLicense({ tier: 'enterprise', maxSyncedPartitions: -1 });
		const ent = computeEntitlements(lic, [makePartition('synced')]);
		expect(ent.syncedPartitionLimit).toBe(-1);
		expect(ent.syncedPartitionsRemaining).toBe(-1);
	});

	it('enterprise at configurable limit is blocked', () => {
		const lic = makeLicense({ tier: 'enterprise', maxSyncedPartitions: 2 });
		const partitions = [makePartition('synced'), makePartition('synced')];
		const ent = computeEntitlements(lic, partitions);
		expect(ent.canCreateSyncedPartition).toBe(false);
		const check = checkCreateSyncedPartition(ent);
		expect(check.allowed).toBe(false);
	});
});

// ─── validateLicenseFile ────────────────────────────────────────────────────

describe('validateLicenseFile', () => {
	it('rejects missing license payload', async () => {
		const result = await validateLicenseFile({ license: null as never, signature: 'abc1234567' });
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Missing');
	});

	it('rejects missing signature', async () => {
		const result = await validateLicenseFile({
			license: { licenseId: 'x', orgId: 'o', tier: 'pro' } as never,
			signature: '',
		});
		expect(result.valid).toBe(false);
	});

	it('rejects short signature', async () => {
		const result = await validateLicenseFile({
			license: { licenseId: 'x', orgId: 'o', tier: 'pro' } as never,
			signature: 'short',
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain('signature');
	});

	it('rejects missing required fields', async () => {
		const result = await validateLicenseFile({
			license: { licenseId: '', orgId: 'o', tier: 'pro' } as never,
			signature: 'a]valid-signature-string',
		});
		expect(result.valid).toBe(false);
	});

	it('accepts structurally valid license file', async () => {
		const result = await validateLicenseFile({
			license: {
				licenseId: 'lic-1',
				orgId: 'org-1',
				tier: 'pro',
				issuedAt: Date.now(),
				validFrom: Date.now(),
				validUntil: null,
				graceUntil: null,
				maxSyncedPartitions: 1,
				features: [],
				issuer: 'test',
				offlineCapable: true,
				metadata: {},
			},
			signature: 'valid-signature-at-least-10-chars',
		});
		expect(result.valid).toBe(true);
	});
});

// ─── exportLicenseInfo ──────────────────────────────────────────────────────

describe('exportLicenseInfo', () => {
	it('redacts signature', () => {
		const lic = makeLicense({ signature: 'super-secret-key' });
		const exported = exportLicenseInfo(lic);
		expect(exported).not.toContain('super-secret-key');
		expect(exported).toContain('[REDACTED]');
	});

	it('preserves other fields', () => {
		const lic = makeLicense({ tier: 'pro', orgId: 'my-org' });
		const exported = exportLicenseInfo(lic);
		const parsed = JSON.parse(exported);
		expect(parsed.tier).toBe('pro');
		expect(parsed.orgId).toBe('my-org');
	});
});

// ─── formatPartitionLimit additional cases ──────────────────────────────────

describe('formatPartitionLimit edge cases', () => {
	it('team tier with 0 used', () => {
		const lic = makeLicense({ tier: 'team', maxSyncedPartitions: 5 });
		const ent = computeEntitlements(lic, []);
		expect(formatPartitionLimit(ent)).toBe('0 of 5 synced partitions in use');
	});

	it('enterprise with 1 synced uses singular', () => {
		const lic = makeLicense({ tier: 'enterprise', maxSyncedPartitions: -1 });
		const ent = computeEntitlements(lic, [makePartition('synced')]);
		expect(formatPartitionLimit(ent)).toContain('1 synced partition');
		expect(formatPartitionLimit(ent)).not.toContain('partitions');
	});
});

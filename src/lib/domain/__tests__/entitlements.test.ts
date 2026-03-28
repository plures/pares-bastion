import { describe, it, expect } from 'vitest';
import {
	computeEntitlements,
	checkCreateSyncedPartition,
	checkEnableSync,
	formatPartitionLimit,
	UNLIMITED_USERS_LABEL,
} from '../entitlements.js';
import { createFreeLicense, computeLicenseStatus, isSyncCapable } from '../license.js';
import type { License } from '../license.js';
import type { Partition } from '../partition.js';
import { countSyncedPartitions } from '../partition.js';
import { TIER_MATRIX } from '../feature-matrix.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

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

// ─── License Status Tests ───────────────────────────────────────────────────

describe('License Status', () => {
	it('free license is active', () => {
		const lic = createFreeLicense();
		expect(computeLicenseStatus(lic)).toBe('active');
	});

	it('expired without grace', () => {
		const lic = makeLicense({ validUntil: Date.now() - 1000 });
		expect(computeLicenseStatus(lic)).toBe('expired');
		expect(isSyncCapable(lic)).toBe(false);
	});

	it('expired within grace period', () => {
		const lic = makeLicense({
			validUntil: Date.now() - 1000,
			graceUntil: Date.now() + 86_400_000,
		});
		expect(computeLicenseStatus(lic)).toBe('grace');
		expect(isSyncCapable(lic)).toBe(true);
	});

	it('expired past grace period', () => {
		const lic = makeLicense({
			validUntil: Date.now() - 200_000,
			graceUntil: Date.now() - 1000,
		});
		expect(computeLicenseStatus(lic)).toBe('expired');
	});

	it('revoked stays revoked', () => {
		const lic = makeLicense({ status: 'revoked' });
		expect(computeLicenseStatus(lic)).toBe('revoked');
	});

	it('not yet valid', () => {
		const lic = makeLicense({ validFrom: Date.now() + 100_000 });
		expect(computeLicenseStatus(lic)).toBe('suspended');
	});
});

// ─── Partition Counting ─────────────────────────────────────────────────────

describe('Partition Counting', () => {
	it('synced partitions count', () => {
		expect(countSyncedPartitions([makePartition('synced')])).toBe(1);
	});

	it('suspended partitions count (anti-abuse)', () => {
		expect(countSyncedPartitions([makePartition('suspended')])).toBe(1);
	});

	it('local_only partitions do NOT count', () => {
		expect(countSyncedPartitions([makePartition('local_only')])).toBe(0);
	});

	it('archived partitions do NOT count', () => {
		expect(countSyncedPartitions([makePartition('archived')])).toBe(0);
	});

	it('mixed partition types count correctly', () => {
		const partitions = [
			makePartition('synced'),
			makePartition('synced'),
			makePartition('local_only'),
			makePartition('archived'),
			makePartition('suspended'),
		];
		expect(countSyncedPartitions(partitions)).toBe(3); // 2 synced + 1 suspended
	});
});

// ─── Entitlement Computation ────────────────────────────────────────────────

describe('Entitlements', () => {
	it('free tier: no synced partitions', () => {
		const ent = computeEntitlements(makeLicense({ tier: 'free' }), []);
		expect(ent.syncedPartitionLimit).toBe(0);
		expect(ent.canCreateSyncedPartition).toBe(false);
		expect(ent.canSyncPartition).toBe(false);
	});

	it('pro tier: 1 synced partition', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, []);
		expect(ent.syncedPartitionLimit).toBe(1);
		expect(ent.canCreateSyncedPartition).toBe(true);
		expect(ent.syncedPartitionsRemaining).toBe(1);
	});

	it('pro tier: at limit with 1 synced', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, [makePartition('synced')]);
		expect(ent.canCreateSyncedPartition).toBe(false);
		expect(ent.syncedPartitionsRemaining).toBe(0);
	});

	it('team tier: 5 synced partitions', () => {
		const lic = makeLicense({ tier: 'team', maxSyncedPartitions: 5 });
		const ent = computeEntitlements(lic, [makePartition('synced'), makePartition('synced')]);
		expect(ent.syncedPartitionLimit).toBe(5);
		expect(ent.syncedPartitionsUsed).toBe(2);
		expect(ent.syncedPartitionsRemaining).toBe(3);
	});

	it('enterprise tier: unlimited', () => {
		const lic = makeLicense({ tier: 'enterprise', maxSyncedPartitions: -1 });
		const ent = computeEntitlements(lic, []);
		expect(ent.syncedPartitionLimit).toBe(-1);
		expect(ent.syncedPartitionsRemaining).toBe(-1);
		expect(ent.canCreateSyncedPartition).toBe(true);
	});

	it('expired license: no sync capability', () => {
		const lic = makeLicense({
			tier: 'pro',
			maxSyncedPartitions: 1,
			validUntil: Date.now() - 1000,
		});
		const ent = computeEntitlements(lic, []);
		expect(ent.licenseActive).toBe(false);
		expect(ent.canCreateSyncedPartition).toBe(false);
		expect(ent.canSyncPartition).toBe(false);
	});

	it('feature levels match tier matrix', () => {
		const lic = makeLicense({ tier: 'team', maxSyncedPartitions: 5 });
		const ent = computeEntitlements(lic, []);
		expect(ent.featureLevels.audit_logs).toBe('full');
		expect(ent.featureLevels.advanced_policy).toBe('basic');
		expect(ent.featureLevels.enterprise_admin_controls).toBe('disabled');
	});
});

// ─── Limit Checks ───────────────────────────────────────────────────────────

describe('Limit Checks', () => {
	it('free tier: blocked', () => {
		const ent = computeEntitlements(makeLicense({ tier: 'free' }), []);
		const check = checkCreateSyncedPartition(ent);
		expect(check.allowed).toBe(false);
		expect(check.reason).toContain('Free tier');
	});

	it('pro tier: allowed when under limit', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, []);
		const check = checkCreateSyncedPartition(ent);
		expect(check.allowed).toBe(true);
	});

	it('pro tier: blocked when at limit', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, [makePartition('synced')]);
		const check = checkCreateSyncedPartition(ent);
		expect(check.allowed).toBe(false);
		expect(check.reason).toContain('in use');
	});

	it('team tier: warning on last slot', () => {
		const lic = makeLicense({ tier: 'team', maxSyncedPartitions: 5 });
		const partitions = Array.from({ length: 4 }, () => makePartition('synced'));
		const ent = computeEntitlements(lic, partitions);
		const check = checkCreateSyncedPartition(ent);
		expect(check.allowed).toBe(true);
		expect(check.isWarning).toBe(true);
		expect(check.reason).toContain('last available');
	});

	it('enable sync blocked when license inactive', () => {
		const lic = makeLicense({
			tier: 'pro',
			maxSyncedPartitions: 1,
			validUntil: Date.now() - 1000,
		});
		const ent = computeEntitlements(lic, []);
		const check = checkEnableSync(ent);
		expect(check.allowed).toBe(false);
	});
});

// ─── No Seat Enforcement ────────────────────────────────────────────────────

describe('No Seat Enforcement', () => {
	it('UNLIMITED_USERS_LABEL says unlimited', () => {
		expect(UNLIMITED_USERS_LABEL).toContain('Unlimited');
	});

	it('license type has NO seat/user fields', () => {
		const lic = createFreeLicense();
		// Verify these properties do NOT exist
		expect('maxUsers' in lic).toBe(false);
		expect('seats' in lic).toBe(false);
		expect('maxSeats' in lic).toBe(false);
	});

	it('entitlements have NO seat limits', () => {
		const ent = computeEntitlements(createFreeLicense(), []);
		expect('maxUsers' in ent).toBe(false);
		expect('seatLimit' in ent).toBe(false);
	});
});

// ─── Feature Matrix ─────────────────────────────────────────────────────────

describe('Feature Matrix', () => {
	it('all tiers have entries', () => {
		expect(TIER_MATRIX.free).toBeDefined();
		expect(TIER_MATRIX.pro).toBeDefined();
		expect(TIER_MATRIX.team).toBeDefined();
		expect(TIER_MATRIX.enterprise).toBeDefined();
	});

	it('free tier has all features disabled', () => {
		const free = TIER_MATRIX.free;
		for (const [, level] of Object.entries(free.features)) {
			expect(level).toBe('disabled');
		}
	});

	it('enterprise tier has all features full', () => {
		const ent = TIER_MATRIX.enterprise;
		for (const [, level] of Object.entries(ent.features)) {
			expect(level).toBe('full');
		}
	});

	it('tier partition limits escalate', () => {
		expect(TIER_MATRIX.free.maxSyncedPartitions).toBe(0);
		expect(TIER_MATRIX.pro.maxSyncedPartitions).toBe(1);
		expect(TIER_MATRIX.team.maxSyncedPartitions).toBe(5);
		expect(TIER_MATRIX.enterprise.maxSyncedPartitions).toBe(-1);
	});
});

// ─── Display Helpers ────────────────────────────────────────────────────────

describe('Display Helpers', () => {
	it('formats free tier', () => {
		const ent = computeEntitlements(makeLicense({ tier: 'free' }), []);
		expect(formatPartitionLimit(ent)).toContain('Local only');
	});

	it('formats pro tier with usage', () => {
		const lic = makeLicense({ tier: 'pro', maxSyncedPartitions: 1 });
		const ent = computeEntitlements(lic, [makePartition('synced')]);
		expect(formatPartitionLimit(ent)).toBe('1 of 1 synced partition in use');
	});

	it('formats enterprise unlimited', () => {
		const lic = makeLicense({ tier: 'enterprise', maxSyncedPartitions: -1 });
		const ent = computeEntitlements(lic, [makePartition('synced'), makePartition('synced')]);
		expect(formatPartitionLimit(ent)).toContain('unlimited');
	});
});

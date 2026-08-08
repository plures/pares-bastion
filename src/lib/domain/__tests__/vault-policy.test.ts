import { describe, it, expect, beforeEach } from 'vitest';
import {
	validateRotationPolicy,
	isRotationOverdue,
	daysUntilRotation,
	createRotationMeta,
	applyRotation,
	checkVaultAccess,
	checkVaultModify,
	validateAccessScope,
	createAuditEvent,
	auditDetail,
	resetAuditIdCounter,
	DEFAULT_ROTATION_INTERVAL_DAYS,
	MIN_ROTATION_INTERVAL_DAYS,
	MAX_ROTATION_INTERVAL_DAYS,
} from '../vault-policy.js';
import type {
	VaultCredential,
	VaultAccessScope,
} from '$lib/types/vault.types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeCredential(overrides: Partial<VaultCredential> = {}): VaultCredential {
	return {
		id: 'cred-1',
		vaultType: 'personal',
		scope: 'default',
		username: 'admin',
		authMethod: 'password',
		hasEnableSecret: false,
		...overrides,
	};
}

// ─── Rotation Policy Validation ─────────────────────────────────────────────

describe('Rotation Policy Validation', () => {
	it('disabled policy is always valid', () => {
		expect(validateRotationPolicy({ enabled: false, intervalDays: 0 })).toBeNull();
	});

	it('valid enabled policy', () => {
		expect(validateRotationPolicy({ enabled: true, intervalDays: 90 })).toBeNull();
	});

	it('interval below minimum', () => {
		const err = validateRotationPolicy({ enabled: true, intervalDays: 0 });
		expect(err).toContain('between');
	});

	it('interval above maximum', () => {
		const err = validateRotationPolicy({ enabled: true, intervalDays: 999 });
		expect(err).toContain('between');
	});

	it('non-integer interval', () => {
		const err = validateRotationPolicy({ enabled: true, intervalDays: 30.5 });
		expect(err).toContain('integer');
	});

	it('boundary: minimum interval is valid', () => {
		expect(validateRotationPolicy({ enabled: true, intervalDays: MIN_ROTATION_INTERVAL_DAYS })).toBeNull();
	});

	it('boundary: maximum interval is valid', () => {
		expect(validateRotationPolicy({ enabled: true, intervalDays: MAX_ROTATION_INTERVAL_DAYS })).toBeNull();
	});

	it('default rotation interval constant is reasonable', () => {
		expect(DEFAULT_ROTATION_INTERVAL_DAYS).toBe(90);
	});
});

// ─── Rotation Status ────────────────────────────────────────────────────────

describe('Rotation Status', () => {
	const DAY_MS = 24 * 60 * 60 * 1000;

	it('not overdue when no policy', () => {
		const cred = makeCredential();
		expect(isRotationOverdue(cred)).toBe(false);
	});

	it('not overdue when policy disabled', () => {
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: Date.now() - 200 * DAY_MS,
				policy: { enabled: false, intervalDays: 90 },
				rotationCount: 1,
			},
		});
		expect(isRotationOverdue(cred)).toBe(false);
	});

	it('overdue when never rotated', () => {
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: null,
				policy: { enabled: true, intervalDays: 90 },
				rotationCount: 0,
			},
		});
		expect(isRotationOverdue(cred)).toBe(true);
	});

	it('overdue when past interval', () => {
		const now = Date.now();
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: now - 91 * DAY_MS,
				policy: { enabled: true, intervalDays: 90 },
				rotationCount: 1,
			},
		});
		expect(isRotationOverdue(cred, now)).toBe(true);
	});

	it('not overdue when within interval', () => {
		const now = Date.now();
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: now - 30 * DAY_MS,
				policy: { enabled: true, intervalDays: 90 },
				rotationCount: 1,
			},
		});
		expect(isRotationOverdue(cred, now)).toBe(false);
	});
});

// ─── Days Until Rotation ────────────────────────────────────────────────────

describe('Days Until Rotation', () => {
	const DAY_MS = 24 * 60 * 60 * 1000;

	it('null when no policy', () => {
		expect(daysUntilRotation(makeCredential())).toBeNull();
	});

	it('0 when never rotated', () => {
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: null,
				policy: { enabled: true, intervalDays: 90 },
				rotationCount: 0,
			},
		});
		expect(daysUntilRotation(cred)).toBe(0);
	});

	it('positive when not yet due', () => {
		const now = Date.now();
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: now - 10 * DAY_MS,
				policy: { enabled: true, intervalDays: 90 },
				rotationCount: 1,
			},
		});
		expect(daysUntilRotation(cred, now)).toBe(80);
	});

	it('negative when overdue', () => {
		const now = Date.now();
		const cred = makeCredential({
			rotation: {
				lastRotatedAt: now - 100 * DAY_MS,
				policy: { enabled: true, intervalDays: 90 },
				rotationCount: 1,
			},
		});
		const days = daysUntilRotation(cred, now);
		expect(days).not.toBeNull();
		expect(days!).toBeLessThan(0);
	});
});

// ─── Rotation Meta Lifecycle ────────────────────────────────────────────────

describe('Rotation Meta Lifecycle', () => {
	it('createRotationMeta with no policy', () => {
		const meta = createRotationMeta(null);
		expect(meta.lastRotatedAt).toBeNull();
		expect(meta.policy).toBeNull();
		expect(meta.rotationCount).toBe(0);
	});

	it('createRotationMeta with enabled policy sets lastRotatedAt', () => {
		const meta = createRotationMeta({ enabled: true, intervalDays: 30 });
		expect(meta.lastRotatedAt).toBeTypeOf('number');
		expect(meta.policy?.enabled).toBe(true);
		expect(meta.rotationCount).toBe(0);
	});

	it('applyRotation increments count and updates timestamp', () => {
		const initial = createRotationMeta({ enabled: true, intervalDays: 30 });
		const now = Date.now() + 100_000;
		const rotated = applyRotation(initial, now);
		expect(rotated.lastRotatedAt).toBe(now);
		expect(rotated.rotationCount).toBe(1);
	});

	it('multiple rotations accumulate', () => {
		let meta = createRotationMeta({ enabled: true, intervalDays: 30 });
		meta = applyRotation(meta);
		meta = applyRotation(meta);
		meta = applyRotation(meta);
		expect(meta.rotationCount).toBe(3);
	});
});

// ─── Scoped Access ──────────────────────────────────────────────────────────

describe('Scoped Access', () => {
	it('no access scope = unrestricted', () => {
		const cred = makeCredential();
		expect(checkVaultAccess(cred, undefined, 'part-1')).toBeNull();
	});

	it('empty allowedPartitions = unrestricted', () => {
		const scope: VaultAccessScope = { allowedPartitions: [], readOnly: false };
		const cred = makeCredential();
		expect(checkVaultAccess(cred, scope, 'part-1')).toBeNull();
	});

	it('access allowed for matching partition', () => {
		const scope: VaultAccessScope = { allowedPartitions: ['part-1', 'part-2'], readOnly: false };
		const cred = makeCredential();
		expect(checkVaultAccess(cred, scope, 'part-1')).toBeNull();
	});

	it('access denied for non-matching partition', () => {
		const scope: VaultAccessScope = { allowedPartitions: ['part-1'], readOnly: false };
		const cred = makeCredential();
		const err = checkVaultAccess(cred, scope, 'part-99');
		expect(err).toContain('not allowed');
	});

	it('access denied when no partition context', () => {
		const scope: VaultAccessScope = { allowedPartitions: ['part-1'], readOnly: false };
		const cred = makeCredential();
		const err = checkVaultAccess(cred, scope, null);
		expect(err).toContain('requires a partition context');
	});
});

// ─── Modify Checks ──────────────────────────────────────────────────────────

describe('Modify Checks', () => {
	it('no scope = modifiable', () => {
		const cred = makeCredential();
		expect(checkVaultModify(cred, undefined, 'part-1')).toBeNull();
	});

	it('readOnly blocks modification', () => {
		const scope: VaultAccessScope = { allowedPartitions: [], readOnly: true };
		const cred = makeCredential();
		const err = checkVaultModify(cred, scope, 'part-1');
		expect(err).toContain('read-only');
	});

	it('writable scope allows modification', () => {
		const scope: VaultAccessScope = { allowedPartitions: ['part-1'], readOnly: false };
		const cred = makeCredential();
		expect(checkVaultModify(cred, scope, 'part-1')).toBeNull();
	});

	it('access denied takes precedence over readOnly', () => {
		const scope: VaultAccessScope = { allowedPartitions: ['part-1'], readOnly: true };
		const cred = makeCredential();
		const err = checkVaultModify(cred, scope, 'part-99');
		expect(err).toContain('not allowed');
	});
});

// ─── Access Scope Validation ────────────────────────────────────────────────

describe('Access Scope Validation', () => {
	it('valid scope', () => {
		expect(validateAccessScope({ allowedPartitions: ['p1'], readOnly: false })).toBeNull();
	});

	it('empty partitions is valid', () => {
		expect(validateAccessScope({ allowedPartitions: [], readOnly: true })).toBeNull();
	});

	it('empty string partition ID is invalid', () => {
		const err = validateAccessScope({ allowedPartitions: [''], readOnly: false });
		expect(err).toContain('non-empty');
	});

	it('whitespace-only partition ID is invalid', () => {
		const err = validateAccessScope({ allowedPartitions: ['  '], readOnly: false });
		expect(err).toContain('non-empty');
	});
});

// ─── Audit Events ───────────────────────────────────────────────────────────

describe('Audit Events', () => {
	beforeEach(() => {
		resetAuditIdCounter();
	});

	it('creates event with all fields', () => {
		const event = createAuditEvent('credential_created', 'test detail', 'cred-1', 'part-1');
		expect(event.id).toContain('audit-');
		expect(event.timestamp).toBeTruthy();
		expect(event.action).toBe('credential_created');
		expect(event.credentialId).toBe('cred-1');
		expect(event.partitionId).toBe('part-1');
		expect(event.detail).toBe('test detail');
	});

	it('defaults credentialId and partitionId to null', () => {
		const event = createAuditEvent('vault_unlocked', 'unlocked');
		expect(event.credentialId).toBeNull();
		expect(event.partitionId).toBeNull();
	});

	it('generates unique IDs', () => {
		const e1 = createAuditEvent('vault_unlocked', 'a');
		const e2 = createAuditEvent('vault_locked', 'b');
		expect(e1.id).not.toBe(e2.id);
	});

	it('auditDetail generates standard messages', () => {
		expect(auditDetail('credential_rotated')).toBe('Credential password rotated');
		expect(auditDetail('access_denied', 'partition mismatch')).toBe(
			'Access denied: partition mismatch',
		);
	});

	it('covers all audit action types', () => {
		const actions: VaultAuditAction[] = [
			'credential_created',
			'credential_updated',
			'credential_deleted',
			'credential_rotated',
			'credential_accessed',
			'vault_unlocked',
			'vault_locked',
			'access_denied',
		];
		for (const action of actions) {
			const msg = auditDetail(action);
			expect(msg.length).toBeGreaterThan(0);
		}
	});
});

// Need the import for the type used in tests
import type { VaultAuditAction } from '$lib/types/vault.types.js';

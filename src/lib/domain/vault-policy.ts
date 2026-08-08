// ─── Vault Policy ───────────────────────────────────────────────────────────
// Centralized domain logic for credential vault hardening.
// Rotation checks, scoped-access validation, audit event construction.

import type {
	RotationPolicy,
	RotationMeta,
	VaultAccessScope,
	VaultAuditAction,
	VaultAuditEvent,
	VaultCredential,
} from '$lib/types/vault.types.js';

// ─── Rotation ───────────────────────────────────────────────────────────────

/** Default rotation interval in days when a policy is enabled without specifying an interval. */
export const DEFAULT_ROTATION_INTERVAL_DAYS = 90;

/** Minimum allowed rotation interval in days. */
export const MIN_ROTATION_INTERVAL_DAYS = 1;

/** Maximum allowed rotation interval in days. */
export const MAX_ROTATION_INTERVAL_DAYS = 365;

/** Validate a rotation policy. Returns an error message if invalid, null if valid. */
export function validateRotationPolicy(policy: RotationPolicy): string | null {
	if (!policy.enabled) {
		return null; // disabled policies are always valid
	}
	if (
		!Number.isInteger(policy.intervalDays) ||
		policy.intervalDays < MIN_ROTATION_INTERVAL_DAYS ||
		policy.intervalDays > MAX_ROTATION_INTERVAL_DAYS
	) {
		return `Rotation interval must be an integer between ${MIN_ROTATION_INTERVAL_DAYS} and ${MAX_ROTATION_INTERVAL_DAYS} days.`;
	}
	return null;
}

/** Check whether a credential's password is overdue for rotation. */
export function isRotationOverdue(credential: VaultCredential, now: number = Date.now()): boolean {
	const rotation = credential.rotation;
	if (!rotation?.policy?.enabled) return false;
	if (rotation.lastRotatedAt === null) return true; // never rotated

	const intervalMs = rotation.policy.intervalDays * 24 * 60 * 60 * 1000;
	return now - rotation.lastRotatedAt >= intervalMs;
}

/** Calculate the number of days until rotation is due (negative = overdue). */
export function daysUntilRotation(
	credential: VaultCredential,
	now: number = Date.now(),
): number | null {
	const rotation = credential.rotation;
	if (!rotation?.policy?.enabled) return null;
	if (rotation.lastRotatedAt === null) return 0; // due immediately

	const intervalMs = rotation.policy.intervalDays * 24 * 60 * 60 * 1000;
	const dueAt = rotation.lastRotatedAt + intervalMs;
	return Math.ceil((dueAt - now) / (24 * 60 * 60 * 1000));
}

/** Create initial rotation metadata for a new credential. */
export function createRotationMeta(policy: RotationPolicy | null): RotationMeta {
	return {
		lastRotatedAt: null,
		policy: policy ?? null,
		rotationCount: 0,
	};
}

/** Produce updated rotation metadata after a credential rotation. */
export function applyRotation(existing: RotationMeta, now: number = Date.now()): RotationMeta {
	return {
		...existing,
		lastRotatedAt: now,
		rotationCount: existing.rotationCount + 1,
	};
}

// ─── Scoped Access ──────────────────────────────────────────────────────────

/**
 * Check whether a partition ID is allowed to access a credential.
 * Returns an error message if denied, null if access is allowed.
 */
export function checkVaultAccess(
	credential: VaultCredential,
	accessScope: VaultAccessScope | undefined,
	activePartitionId: string | null,
): string | null {
	// Personal vault credentials without an access scope are unrestricted
	if (!accessScope) return null;

	// Empty allowedPartitions = unrestricted
	if (accessScope.allowedPartitions.length === 0) return null;

	if (!activePartitionId) {
		return `Credential "${credential.id}" requires a partition context for scoped access.`;
	}

	if (!accessScope.allowedPartitions.includes(activePartitionId)) {
		return `Partition "${activePartitionId}" is not allowed to access credential "${credential.id}".`;
	}

	return null;
}

/**
 * Check whether a credential can be modified given its access scope.
 * Returns an error message if modification is denied, null if allowed.
 */
export function checkVaultModify(
	credential: VaultCredential,
	accessScope: VaultAccessScope | undefined,
	activePartitionId: string | null,
): string | null {
	const accessError = checkVaultAccess(credential, accessScope, activePartitionId);
	if (accessError) return accessError;

	if (accessScope?.readOnly) {
		return `Credential "${credential.id}" is read-only and cannot be modified.`;
	}

	return null;
}

/** Validate an access scope definition. Returns an error message if invalid, null if valid. */
export function validateAccessScope(scope: VaultAccessScope): string | null {
	if (!Array.isArray(scope.allowedPartitions)) {
		return 'allowedPartitions must be an array.';
	}
	for (const pid of scope.allowedPartitions) {
		if (typeof pid !== 'string' || pid.trim().length === 0) {
			return 'Each partition ID in allowedPartitions must be a non-empty string.';
		}
	}
	return null;
}

// ─── Audit Events ───────────────────────────────────────────────────────────

/** Build a vault audit event. */
export function createAuditEvent(
	action: VaultAuditAction,
	detail: string,
	credentialId: string | null = null,
	partitionId: string | null = null,
): VaultAuditEvent {
	return {
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		action,
		credentialId,
		partitionId,
		detail,
	};
}

/** Standard audit detail messages by action type. */
export function auditDetail(action: VaultAuditAction, extra?: string): string {
	const base: Record<VaultAuditAction, string> = {
		credential_created: 'Credential created',
		credential_updated: 'Credential updated',
		credential_deleted: 'Credential deleted',
		credential_rotated: 'Credential password rotated',
		credential_accessed: 'Credential accessed',
		vault_unlocked: 'Vault unlocked',
		vault_locked: 'Vault locked',
		access_denied: 'Access denied',
	};
	return extra ? `${base[action]}: ${extra}` : base[action];
}

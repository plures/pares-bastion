/** Credential scope: default fallback, group pattern, or device-specific. */
export type CredentialScope = 'default' | 'group' | 'device';

/** Authentication method for a credential entry. */
export type AuthMethod = 'password' | 'key';

/** Vault type: personal (local, single-key) or shared (synced, dual-key). */
export type VaultType = 'personal' | 'shared';

/** Rotation policy for a credential. */
export interface RotationPolicy {
	/** Whether automatic rotation reminders are enabled. */
	enabled: boolean;
	/** Rotation interval in days (e.g. 90). */
	intervalDays: number;
}

/** Metadata about credential rotation history. */
export interface RotationMeta {
	/** Timestamp of the last rotation (epoch ms), null if never rotated. */
	lastRotatedAt: number | null;
	/** Configured rotation policy, if any. */
	policy: RotationPolicy | null;
	/** Number of times this credential has been rotated. */
	rotationCount: number;
}

/** A single credential entry stored in the vault (passwords masked). */
export interface VaultCredential {
	/** Unique identifier for this entry. */
	id: string;
	/** Vault tier: personal (local-only, master password) or shared (synced, dual-key). */
	vaultType: VaultType;
	/** Partition ID this credential belongs to (shared vault only). */
	partitionId?: string;
	/** Credential scope. */
	scope: CredentialScope;
	/**
	 * For scope=group: a hostname/IP pattern (e.g. "10.0.1.*").
	 * For scope=device: the exact hostname or IP.
	 * Omitted for scope=default.
	 */
	target?: string;
	/** Login username. */
	username: string;
	/** Authentication method. */
	authMethod: AuthMethod;
	/** Whether an enable/privilege secret is configured. */
	hasEnableSecret: boolean;
	/** Rotation metadata (present when rotation tracking is active). */
	rotation?: RotationMeta;
}

/** Defines who/what can access a credential. */
export interface VaultAccessScope {
	/** Partition IDs allowed to access this credential. Empty array = unrestricted. */
	allowedPartitions: string[];
	/** Whether this credential is read-only (cannot be modified without elevated access). */
	readOnly: boolean;
}

/** Vault audit event types. */
export type VaultAuditAction =
	| 'credential_created'
	| 'credential_updated'
	| 'credential_deleted'
	| 'credential_rotated'
	| 'credential_accessed'
	| 'vault_unlocked'
	| 'vault_locked'
	| 'access_denied';

/** A single vault audit event. */
export interface VaultAuditEvent {
	/** Unique event identifier. */
	id: string;
	/** ISO 8601 timestamp. */
	timestamp: string;
	/** The action that was performed. */
	action: VaultAuditAction;
	/** Credential ID involved (if applicable). */
	credentialId: string | null;
	/** Partition context when the event occurred. */
	partitionId: string | null;
	/** Human-readable description. */
	detail: string;
}

/** Payload for creating or updating a vault credential. */
export interface VaultSetPayload {
	vaultType: VaultType;
	partitionId?: string;
	scope: CredentialScope;
	target?: string;
	username: string;
	/** Omit (undefined) when editing to keep the existing password. */
	password?: string;
	enableSecret?: string;
	authMethod: AuthMethod;
	/** Optional rotation policy to attach to this credential. */
	rotationPolicy?: RotationPolicy;
	/** Optional access scope restrictions. */
	accessScope?: VaultAccessScope;
}

/** Payload for rotating a credential's password. */
export interface VaultRotatePayload {
	/** Credential ID to rotate. */
	credentialId: string;
	/** New password to set. */
	newPassword: string;
	/** New enable secret (optional). */
	newEnableSecret?: string;
}

/** Result of a credential resolution preview for a given hostname. */
export interface VaultResolveResult {
	hostname: string;
	/** The credential that would be used (masked). */
	resolved: VaultCredential | null;
	/** Human-readable explanation of which rule matched. */
	explanation: string;
}

/** Vault status returned after unlock or init. */
export interface VaultStatus {
	/** Whether the vault is currently unlocked. */
	unlocked: boolean;
	/** Number of personal credentials stored. */
	personalCount: number;
	/** Number of shared credentials accessible (requires license). */
	sharedCount: number;
	/** Whether the shared vault is available (license key present + valid). */
	sharedAvailable: boolean;
}

/** Filter for querying audit log entries. */
export interface VaultAuditFilter {
	/** Filter by action type. */
	action?: VaultAuditAction;
	/** Filter by credential ID. */
	credentialId?: string;
	/** Return events after this ISO 8601 timestamp. */
	since?: string;
	/** Maximum number of events to return. */
	limit?: number;
}

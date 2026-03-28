/** Credential scope: default fallback, group pattern, or device-specific. */
export type CredentialScope = 'default' | 'group' | 'device';

/** Authentication method for a credential entry. */
export type AuthMethod = 'password' | 'key';

/** Vault type: personal (local, single-key) or shared (synced, dual-key). */
export type VaultType = 'personal' | 'shared';

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

/** A stored configuration backup entry. */
export interface ConfigBackup {
	hostname: string;
	version: string;
	timestamp: string;
	size: number;
}

/** Result of a config diff between two versions. */
export interface DiffResult {
	hostname: string;
	versionA: string;
	versionB: string;
	unified: string;
	additions: number;
	deletions: number;
}

/** Result of a rollback operation. */
export interface RollbackResult {
	hostname: string;
	version: string;
	success: boolean;
	message: string;
}

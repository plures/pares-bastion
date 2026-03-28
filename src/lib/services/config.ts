/**
 * Config service — wraps Tauri invoke commands for config backup management.
 *
 * Commands map to `src-tauri/src/commands.rs`:
 *   backup_config  → spawn python3 -m netops.collect.backup
 *   list_backups   → list stored config backups
 *   diff_configs   → spawn python3 -m netops.change.diff
 *   rollback_config → spawn python3 -m netops.change.rollback
 */
import { invoke } from '@tauri-apps/api/core';
import type { ConfigBackup, DiffResult, RollbackResult } from '$lib/types/config.types.js';

/**
 * Trigger a config backup for the specified device.
 * Calls the `backup_config` Tauri command.
 */
export async function backupConfig(hostname: string): Promise<ConfigBackup> {
	return invoke<ConfigBackup>('backup_config', { hostname });
}

/**
 * List stored config backups, optionally filtered by hostname.
 * Calls the `list_backups` Tauri command.
 */
export async function listBackups(hostname?: string): Promise<ConfigBackup[]> {
	return invoke<ConfigBackup[]>('list_backups', { hostname: hostname ?? null });
}

/**
 * Compute a diff between two config versions for a device.
 * Calls the `diff_configs` Tauri command.
 */
export async function diffConfigs(
	hostname: string,
	versionA: string,
	versionB: string
): Promise<DiffResult> {
	return invoke<DiffResult>('diff_configs', {
		hostname,
		versionA,
		versionB
	});
}

/**
 * Rollback a device config to a previous version.
 * Calls the `rollback_config` Tauri command.
 */
export async function rollbackConfig(
	hostname: string,
	version: string
): Promise<RollbackResult> {
	return invoke<RollbackResult>('rollback_config', { hostname, version });
}

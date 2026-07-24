// ─── Partition Service ───────────────────────────────────────────────────────
// Wraps Tauri invoke commands for partition operations.
// Phase 1: local state management. Phase 2+: Rust backend + pluresDB.

import type { Partition, PartitionState } from '$lib/domain/partition.js';

/**
 * List all partitions for the current org.
 * Phase 1: reads from partition store (localStorage).
 * Phase 2+: invoke('list_partitions')
 */
export async function listPartitions(): Promise<Partition[]> {
	// TODO: invoke('list_partitions') when Rust module is ready
	// For now, the partition store manages state directly
	return [];
}

/**
 * Get partition details by ID.
 * Phase 1: reads from partition store.
 * Phase 2+: invoke('get_partition', { partitionId })
 */
export async function getPartition(_partitionId: string): Promise<Partition | null> {
	// TODO: invoke('get_partition', { partitionId })
	return null;
}

/**
 * Create a new partition.
 * Phase 1: handled by partition store.
 * Phase 2+: invoke('create_partition', { name, state, ... })
 */
export async function createPartition(
	_displayName: string,
	_state: PartitionState,
	_options?: { tags?: string[]; classification?: Record<string, string> },
): Promise<Partition | null> {
	// TODO: invoke('create_partition', { displayName, state, ...options })
	return null;
}

/**
 * Update partition state (sync enable/disable, archive, suspend).
 * Phase 1: handled by partition store.
 * Phase 2+: invoke('update_partition_state', { partitionId, state })
 */
export async function updatePartitionState(
	_partitionId: string,
	_state: PartitionState,
): Promise<boolean> {
	// TODO: invoke('update_partition_state', { partitionId, state })
	return false;
}

/**
 * Delete a partition permanently (admin only, requires confirmation).
 * Data is destroyed — this is NOT the same as archive.
 */
export async function deletePartition(_partitionId: string): Promise<boolean> {
	// TODO: invoke('delete_partition', { partitionId })
	return false;
}

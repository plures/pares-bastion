// ─── Partition Guard ────────────────────────────────────────────────────────
// Ensures data access is always scoped to the active partition.
// All data queries should go through these guards.

import { partitionStore } from '$lib/stores/partition-store.svelte.js';

/**
 * Get the current active partition ID.
 * Throws if no partition is active (should never happen — store ensures one exists).
 */
export function requireActivePartition(): string {
	const id = partitionStore.activePartitionId;
	if (!id) {
		throw new Error('No active partition. This should never happen.');
	}
	return id;
}

/**
 * Validate that a data record belongs to the active partition.
 * Use as a runtime guard before displaying or modifying data.
 */
export function assertPartitionScope(recordPartitionId: string): void {
	const activeId = requireActivePartition();
	if (recordPartitionId !== activeId) {
		throw new Error(
			`Cross-partition access denied. Record belongs to partition ${recordPartitionId}, active is ${activeId}.`,
		);
	}
}

/**
 * Filter an array of records to only those belonging to the active partition.
 * Records must have a `partitionId` field.
 */
export function filterByActivePartition<T extends { partitionId: string }>(records: T[]): T[] {
	const activeId = requireActivePartition();
	return records.filter((r) => r.partitionId === activeId);
}

/**
 * Tag a new record with the active partition ID.
 * Use when creating data records.
 */
export function tagWithPartition<T>(record: T): T & { partitionId: string } {
	return { ...record, partitionId: requireActivePartition() };
}

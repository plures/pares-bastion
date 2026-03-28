// ─── Partition Domain Types ──────────────────────────────────────────────────
// A partition is the billing unit, security boundary, sync boundary, and
// data isolation boundary. Licenses are consumed by partitions, NOT seats.

export type PartitionState = 'local_only' | 'synced' | 'suspended' | 'archived';

export interface PartitionClassification {
	businessUnit?: string;
	department?: string;
	environment?: string; // 'production' | 'staging' | 'lab' | etc.
}

export interface Partition {
	partitionId: string;
	orgId: string;
	displayName: string;
	slug: string;
	state: PartitionState;
	createdAt: number;
	updatedAt: number;
	createdBy: string;
	tags: string[];
	classification?: PartitionClassification;
}

// ─── Counting Policy ────────────────────────────────────────────────────────
// Exactly one function determines what counts toward the synced partition limit.
// See docs/licensing-and-partitions.md § Counting Policy.

const COUNTED_STATES: ReadonlySet<PartitionState> = new Set(['synced', 'suspended']);

/** Count partitions that consume the synced partition entitlement. */
export function countSyncedPartitions(partitions: Partition[]): number {
	return partitions.filter((p) => COUNTED_STATES.has(p.state)).length;
}

/** Check if a specific partition counts toward the limit. */
export function countsTowardLimit(partition: Partition): boolean {
	return COUNTED_STATES.has(partition.state);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function createDefaultPartition(): Partition {
	return {
		partitionId: crypto.randomUUID(),
		orgId: 'local',
		displayName: 'Default',
		slug: 'default',
		state: 'local_only',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		createdBy: 'system',
		tags: [],
	};
}

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);
}

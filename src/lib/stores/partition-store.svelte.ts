// ─── Partition Store (Svelte 5 Runes) ────────────────────────────────────────
// Manages partition CRUD, active partition selection, and switching.
// Partitions are the billing unit — licenses are consumed by partitions, NOT users.

import {
	type Partition,
	type PartitionState,
	type PartitionClassification,
	createDefaultPartition,
	countSyncedPartitions,
	slugify,
} from '$lib/domain/partition.js';
import { licenseStore } from './license-store.svelte.js';
import { checkCreateSyncedPartition, checkEnableSync, type LimitCheck } from '$lib/domain/entitlements.js';

const PARTITIONS_STORAGE_KEY = 'netops-partitions-v1';
const ACTIVE_PARTITION_KEY = 'netops-active-partition-v1';

class PartitionStore {
	partitions = $state<Partition[]>([]);
	activePartitionId = $state<string | null>(null);

	constructor() {
		this.load();
		// Sync partition list to license store for entitlement computation
		$effect(() => {
			licenseStore.setPartitions(this.partitions);
		});
	}

	// ── Derived State ────────────────────────────────────────────────────────

	get activePartition(): Partition | null {
		return this.partitions.find((p) => p.partitionId === this.activePartitionId) ?? null;
	}

	get syncedCount(): number {
		return countSyncedPartitions(this.partitions);
	}

	get localCount(): number {
		return this.partitions.filter((p) => p.state === 'local_only').length;
	}

	get archivedCount(): number {
		return this.partitions.filter((p) => p.state === 'archived').length;
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private load(): void {
		if (typeof localStorage === 'undefined') return;

		const raw = localStorage.getItem(PARTITIONS_STORAGE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as Partition[];
				if (Array.isArray(parsed) && parsed.length > 0) {
					this.partitions = parsed;
				}
			} catch {
				// corrupted — will create default below
			}
		}

		// Ensure at least one partition exists
		if (this.partitions.length === 0) {
			const defaultPartition = createDefaultPartition();
			this.partitions = [defaultPartition];
			this.save();
		}

		// Restore active partition
		const activeId = localStorage.getItem(ACTIVE_PARTITION_KEY);
		if (activeId && this.partitions.some((p) => p.partitionId === activeId)) {
			this.activePartitionId = activeId;
		} else {
			this.activePartitionId = this.partitions[0].partitionId;
		}
	}

	private save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(PARTITIONS_STORAGE_KEY, JSON.stringify(this.partitions));
		if (this.activePartitionId) {
			localStorage.setItem(ACTIVE_PARTITION_KEY, this.activePartitionId);
		}
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	/** Switch active partition. */
	switchTo(partitionId: string): boolean {
		const partition = this.partitions.find((p) => p.partitionId === partitionId);
		if (!partition || partition.state === 'archived') return false;
		this.activePartitionId = partitionId;
		this.save();
		return true;
	}

	/** Create a new local partition. */
	createLocal(
		displayName: string,
		options?: { tags?: string[]; classification?: PartitionClassification },
	): { ok: boolean; partition?: Partition; error?: string } {
		const entitlements = licenseStore.entitlements;

		if (!entitlements.canCreateLocalPartition) {
			return {
				ok: false,
				error: `Free tier allows ${entitlements.localPartitionLimit} local partition${entitlements.localPartitionLimit === 1 ? '' : 's'}. Upgrade for more.`,
			};
		}

		const partition: Partition = {
			partitionId: crypto.randomUUID(),
			orgId: licenseStore.license.orgId,
			displayName,
			slug: slugify(displayName),
			state: 'local_only',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			createdBy: 'user',
			tags: options?.tags ?? [],
			classification: options?.classification,
		};

		this.partitions = [...this.partitions, partition];
		this.save();
		return { ok: true, partition };
	}

	/** Create a new synced partition. Enforces license limits. */
	createSynced(
		displayName: string,
		options?: { tags?: string[]; classification?: PartitionClassification },
	): { ok: boolean; partition?: Partition; error?: string; warning?: string } {
		const entitlements = licenseStore.entitlements;
		const check = checkCreateSyncedPartition(entitlements);

		if (!check.allowed) {
			return { ok: false, error: check.reason };
		}

		const partition: Partition = {
			partitionId: crypto.randomUUID(),
			orgId: licenseStore.license.orgId,
			displayName,
			slug: slugify(displayName),
			state: 'synced',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			createdBy: 'user',
			tags: options?.tags ?? [],
			classification: options?.classification,
		};

		this.partitions = [...this.partitions, partition];
		this.save();
		return { ok: true, partition, warning: check.isWarning ? check.reason : undefined };
	}

	/** Enable sync on a local_only partition. */
	enableSync(partitionId: string): LimitCheck {
		const partition = this.partitions.find((p) => p.partitionId === partitionId);
		if (!partition) return { allowed: false, reason: 'Partition not found.' };
		if (partition.state !== 'local_only') {
			return { allowed: false, reason: `Partition is ${partition.state}, not local_only.` };
		}

		const check = checkEnableSync(licenseStore.entitlements);
		if (!check.allowed) return check;

		this.updateState(partitionId, 'synced');
		return { allowed: true };
	}

	/** Disable sync on a synced partition (revert to local_only). */
	disableSync(partitionId: string): boolean {
		const partition = this.partitions.find((p) => p.partitionId === partitionId);
		if (!partition || partition.state !== 'synced') return false;
		this.updateState(partitionId, 'local_only');
		return true;
	}

	/** Archive a partition (stops sync, frees license slot). */
	archive(partitionId: string): boolean {
		const partition = this.partitions.find((p) => p.partitionId === partitionId);
		if (!partition || partition.state === 'archived') return false;
		this.updateState(partitionId, 'archived');

		// If we archived the active partition, switch to another
		if (this.activePartitionId === partitionId) {
			const next = this.partitions.find(
				(p) => p.partitionId !== partitionId && p.state !== 'archived',
			);
			if (next) this.activePartitionId = next.partitionId;
		}
		return true;
	}

	/** Suspend a partition (admin action or license downgrade). */
	suspend(partitionId: string): boolean {
		const partition = this.partitions.find((p) => p.partitionId === partitionId);
		if (!partition || partition.state === 'archived') return false;
		this.updateState(partitionId, 'suspended');
		return true;
	}

	/** Update partition metadata (name, tags, classification). */
	update(
		partitionId: string,
		updates: { displayName?: string; tags?: string[]; classification?: PartitionClassification },
	): boolean {
		const idx = this.partitions.findIndex((p) => p.partitionId === partitionId);
		if (idx === -1) return false;

		const current = this.partitions[idx];
		const updated = {
			...current,
			...updates,
			slug: updates.displayName ? slugify(updates.displayName) : current.slug,
			updatedAt: Date.now(),
		};

		this.partitions = [...this.partitions.slice(0, idx), updated, ...this.partitions.slice(idx + 1)];
		this.save();
		return true;
	}

	// ── Internal ─────────────────────────────────────────────────────────────

	private updateState(partitionId: string, state: PartitionState): void {
		const idx = this.partitions.findIndex((p) => p.partitionId === partitionId);
		if (idx === -1) return;

		const updated = { ...this.partitions[idx], state, updatedAt: Date.now() };
		this.partitions = [...this.partitions.slice(0, idx), updated, ...this.partitions.slice(idx + 1)];
		this.save();
	}
}

export const partitionStore = new PartitionStore();

// Re-exports
export type { Partition, PartitionState };

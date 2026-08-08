// ─── Inventory Domain Logic ──────────────────────────────────────────────────
// Pure functions for inventory operations — no side effects, no storage.

import type { InventoryDevice, ScanRecord, InventoryState } from '$lib/types/inventory.types.js';
import type { Device } from '$lib/types.js';

/**
 * Merge newly scanned devices into an existing inventory.
 * Matching is by IP + partitionId. Existing devices are updated; new ones are added.
 * Returns the merged device list (does not mutate the input).
 */
export function mergeDevices(
	existing: InventoryDevice[],
	scanned: Device[],
	scanId: string,
	partitionId: string,
	now: string,
): InventoryDevice[] {
	const byIp = new Map(
		existing.filter((d) => d.partitionId === partitionId).map((d) => [d.ip, d]),
	);
	const otherPartitions = existing.filter((d) => d.partitionId !== partitionId);

	const merged = new Map(byIp);

	for (const dev of scanned) {
		const prev = merged.get(dev.ip);
		if (prev) {
			// Update existing device
			merged.set(dev.ip, {
				...prev,
				hostname: dev.hostname,
				vendor: dev.vendor,
				version: dev.version,
				model: dev.model ?? prev.model,
				serialNumber: dev.serialNumber ?? prev.serialNumber,
				lastSeen: now,
				lastScanId: scanId,
			});
		} else {
			// New device
			merged.set(dev.ip, {
				id: crypto.randomUUID(),
				hostname: dev.hostname,
				ip: dev.ip,
				vendor: dev.vendor,
				model: dev.model ?? '',
				version: dev.version,
				serialNumber: dev.serialNumber ?? '',
				site: '',
				firstSeen: now,
				lastSeen: now,
				lastScanId: scanId,
				partitionId,
			});
		}
	}

	return [...otherPartitions, ...merged.values()];
}

/**
 * Create a ScanRecord from scan results.
 */
export function createScanRecord(
	opts: {
		hostsScanned: number;
		devicesFound: number;
		durationMs: number;
		target: string;
		partitionId: string;
	},
	now: string,
): ScanRecord {
	return {
		id: crypto.randomUUID(),
		startedAt: new Date(new Date(now).getTime() - opts.durationMs).toISOString(),
		completedAt: now,
		durationMs: opts.durationMs,
		hostsScanned: opts.hostsScanned,
		devicesFound: opts.devicesFound,
		target: opts.target,
		partitionId: opts.partitionId,
	};
}

/**
 * Get devices for a specific partition.
 */
export function devicesForPartition(
	state: InventoryState,
	partitionId: string,
): InventoryDevice[] {
	return state.devices.filter((d) => d.partitionId === partitionId);
}

/**
 * Get scan history for a specific partition, most recent first.
 */
export function scansForPartition(
	state: InventoryState,
	partitionId: string,
): ScanRecord[] {
	return state.scans
		.filter((s) => s.partitionId === partitionId)
		.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

/** Maximum number of scan records to keep per partition. */
export const MAX_SCAN_HISTORY = 50;

/**
 * Trim scan history to the most recent MAX_SCAN_HISTORY per partition.
 */
export function trimScanHistory(scans: ScanRecord[], partitionId: string): ScanRecord[] {
	const forPartition = scans
		.filter((s) => s.partitionId === partitionId)
		.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
		.slice(0, MAX_SCAN_HISTORY);
	const others = scans.filter((s) => s.partitionId !== partitionId);
	return [...others, ...forPartition];
}

/**
 * Create an empty inventory state.
 */
export function createEmptyInventoryState(): InventoryState {
	return { devices: [], scans: [] };
}

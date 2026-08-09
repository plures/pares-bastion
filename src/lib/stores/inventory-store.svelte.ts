// ─── Inventory Store (Svelte 5 Runes) ────────────────────────────────────────
// Durable local storage for inventory devices and scan history.
// Follows the same pattern as partition-store.svelte.ts.

import type { Device } from '$lib/types.js';
import type { InventoryDevice, ScanRecord, InventoryState } from '$lib/types/inventory.types.js';
import {
	mergeDevices,
	createScanRecord,
	devicesForPartition,
	scansForPartition,
	trimScanHistory,
} from '$lib/domain/inventory.js';

const STORAGE_KEY = 'bastion-inventory-v1';

class InventoryStore {
	devices = $state<InventoryDevice[]>([]);
	scans = $state<ScanRecord[]>([]);

	constructor() {
		this.load();
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private load(): void {
		if (typeof localStorage === 'undefined') return;

		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as InventoryState;
				if (parsed && Array.isArray(parsed.devices)) {
					this.devices = parsed.devices;
				}
				if (parsed && Array.isArray(parsed.scans)) {
					this.scans = parsed.scans;
				}
			} catch {
				// corrupted — start fresh
			}
		}
	}

	private save(): void {
		if (typeof localStorage === 'undefined') return;
		const state: InventoryState = { devices: this.devices, scans: this.scans };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}

	// ── Queries ──────────────────────────────────────────────────────────────

	/** Get devices for a specific partition. */
	forPartition(partitionId: string): InventoryDevice[] {
		return devicesForPartition({ devices: this.devices, scans: this.scans }, partitionId);
	}

	/** Get scan history for a specific partition, most recent first. */
	scanHistory(partitionId: string): ScanRecord[] {
		return scansForPartition({ devices: this.devices, scans: this.scans }, partitionId);
	}

	/** Get the most recent scan for a partition, or null. */
	lastScan(partitionId: string): ScanRecord | null {
		const history = this.scanHistory(partitionId);
		return history.length > 0 ? history[0] : null;
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	/**
	 * Ingest scan results: merge discovered devices into the inventory and
	 * record the scan in history.
	 */
	ingestScan(
		scannedDevices: Device[],
		opts: {
			hostsScanned: number;
			durationMs: number;
			target: string;
			partitionId: string;
		},
	): ScanRecord {
		const now = new Date().toISOString();
		const record = createScanRecord(
			{ ...opts, devicesFound: scannedDevices.length },
			now,
		);

		this.devices = mergeDevices(this.devices, scannedDevices, record.id, opts.partitionId, now);
		this.scans = trimScanHistory([...this.scans, record], opts.partitionId);
		this.save();

		return record;
	}

	/** Remove a single device by ID. */
	removeDevice(deviceId: string): boolean {
		const before = this.devices.length;
		this.devices = this.devices.filter((d) => d.id !== deviceId);
		if (this.devices.length !== before) {
			this.save();
			return true;
		}
		return false;
	}

	/** Clear all inventory data (useful for testing / reset). */
	clear(): void {
		this.devices = [];
		this.scans = [];
		this.save();
	}
}

export const inventoryStore = new InventoryStore();

// ─── Inventory Types ─────────────────────────────────────────────────────────
// Unified device representation for durable local storage.
// Merges the scan-time Device with the inventory-view Device.

export interface InventoryDevice {
	id: string;
	hostname: string;
	ip: string;
	vendor: string;
	model: string;
	version: string;
	serialNumber: string;
	site: string;
	/** ISO 8601 timestamp when the device was first discovered. */
	firstSeen: string;
	/** ISO 8601 timestamp of the most recent scan that found this device. */
	lastSeen: string;
	/** ID of the scan that last updated this device. */
	lastScanId: string;
	/** Partition the device belongs to. */
	partitionId: string;
}

export interface ScanRecord {
	id: string;
	/** ISO 8601 timestamp when the scan started. */
	startedAt: string;
	/** ISO 8601 timestamp when the scan finished. */
	completedAt: string;
	/** Duration in milliseconds. */
	durationMs: number;
	/** Number of hosts scanned. */
	hostsScanned: number;
	/** Number of devices discovered. */
	devicesFound: number;
	/** Subnet or CSV path that was scanned. */
	target: string;
	partitionId: string;
}

export interface InventoryState {
	devices: InventoryDevice[];
	scans: ScanRecord[];
}

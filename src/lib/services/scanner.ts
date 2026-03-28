/**
 * Scanner service — wraps Tauri invoke commands for the netops-toolkit backend.
 *
 * Commands map to `src-tauri/src/commands.rs`:
 *   scan_subnet   → spawn python3 -m netops.inventory.scan --subnet …
 *   scan_csv      → spawn python3 -m netops.inventory.scan --csv …
 *   cancel_scan   → signal the running scan to stop
 *   load_inventory → read a JSON inventory file from disk
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
	Device,
	DeviceEvent,
	ProgressEvent,
	CompleteEvent,
	ScanErrorEvent
} from '$lib/types.js';

export interface ScanCallbacks {
	onDevice?: (device: Device) => void;
	onProgress?: (scanned: number, total: number) => void;
	onComplete?: (totalDevices: number, durationMs: number) => void;
	onError?: (message: string, ip?: string) => void;
}

/**
 * Scan a subnet via the Tauri `scan_subnet` command.
 * Returns an unsubscribe function that also cancels the running scan.
 */
export async function scanSubnet(
	subnet: string,
	user: string,
	password: string,
	deep: boolean,
	concurrency: number,
	callbacks: ScanCallbacks
): Promise<() => Promise<void>> {
	const unlisteners = await attachListeners(callbacks);

	await invoke('scan_subnet', { subnet, user, password, deep, concurrency });

	return async () => {
		await cancelScan();
		unlisteners.forEach((fn) => fn());
	};
}

/**
 * Scan from a CSV host list via the Tauri `scan_csv` command.
 * Returns an unsubscribe function that also cancels the running scan.
 */
export async function scanCsv(
	csvPath: string,
	user: string,
	password: string,
	deep: boolean,
	concurrency: number,
	callbacks: ScanCallbacks
): Promise<() => Promise<void>> {
	const unlisteners = await attachListeners(callbacks);

	await invoke('scan_csv', { csvPath, user, password, deep, concurrency });

	return async () => {
		await cancelScan();
		unlisteners.forEach((fn) => fn());
	};
}

/** Send a cancellation signal to the running scan. */
export async function cancelScan(): Promise<void> {
	await invoke('cancel_scan');
}

/**
 * Load an inventory JSON file from disk.
 * Returns the parsed array of devices.
 */
export async function loadInventory(path: string): Promise<Device[]> {
	return invoke<Device[]>('load_inventory', { path });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function attachListeners(callbacks: ScanCallbacks): Promise<UnlistenFn[]> {
	const fns: UnlistenFn[] = [];

	if (callbacks.onDevice) {
		const cb = callbacks.onDevice;
		fns.push(
			await listen<DeviceEvent>('scan:device', ({ payload }) =>
				cb(deviceEventToDevice(payload))
			)
		);
	}

	if (callbacks.onProgress) {
		const cb = callbacks.onProgress;
		fns.push(
			await listen<ProgressEvent>('scan:progress', ({ payload }) =>
				cb(payload.scanned, payload.total)
			)
		);
	}

	if (callbacks.onComplete) {
		const cb = callbacks.onComplete;
		fns.push(
			await listen<CompleteEvent>('scan:complete', ({ payload }) =>
				cb(payload.total_devices, payload.duration_ms)
			)
		);
	}

	if (callbacks.onError) {
		const cb = callbacks.onError;
		fns.push(
			await listen<ScanErrorEvent>('scan:error', ({ payload }) =>
				cb(payload.message, payload.ip)
			)
		);
	}

	return fns;
}

function deviceEventToDevice(e: DeviceEvent): Device {
	return {
		hostname: e.hostname,
		ip: e.ip,
		vendor: e.vendor,
		version: e.version,
		model: e.model,
		serialNumber: e.serial_number
	};
}

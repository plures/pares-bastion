// Data adapter pattern — swap between mock and Tauri backend
import type { Device, ScanConfig, ScanState } from '$lib/types.js';

export interface DataAdapter {
	scan(config: ScanConfig): AsyncGenerator<{ scanned: number; total: number; devices: Device[] }>;
	getHealth(): Promise<import('$lib/types/health.types.js').FleetHealth>;
	// Add more as needed
}

export type AdapterType = 'mock' | 'tauri';

let currentAdapter: AdapterType = 'mock';

export function setAdapter(type: AdapterType): void {
	currentAdapter = type;
}

export function getAdapterType(): AdapterType {
	return currentAdapter;
}

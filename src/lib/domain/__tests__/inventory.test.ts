import { describe, it, expect } from 'vitest';
import {
	mergeDevices,
	createScanRecord,
	devicesForPartition,
	scansForPartition,
	trimScanHistory,
	createEmptyInventoryState,
	MAX_SCAN_HISTORY,
} from '../inventory.js';
import type { InventoryDevice, ScanRecord } from '$lib/types/inventory.types.js';
import type { Device } from '$lib/types.js';

const PARTITION = 'part-1';
const NOW = '2026-08-08T20:00:00.000Z';
const SCAN_ID = 'scan-001';

function makeScanDevice(overrides: Partial<Device> = {}): Device {
	return {
		hostname: 'rtr-01',
		ip: '10.0.0.1',
		vendor: 'cisco',
		version: '16.9',
		...overrides,
	};
}

function makeInventoryDevice(overrides: Partial<InventoryDevice> = {}): InventoryDevice {
	return {
		id: 'dev-1',
		hostname: 'rtr-01',
		ip: '10.0.0.1',
		vendor: 'cisco',
		model: 'ISR4331',
		version: '16.9',
		serialNumber: 'ABC123',
		site: 'NYC-DC1',
		firstSeen: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		lastScanId: 'scan-old',
		partitionId: PARTITION,
		...overrides,
	};
}

function makeScanRecord(overrides: Partial<ScanRecord> = {}): ScanRecord {
	return {
		id: 'scan-r1',
		startedAt: '2026-08-08T19:59:00.000Z',
		completedAt: '2026-08-08T20:00:00.000Z',
		durationMs: 60_000,
		hostsScanned: 254,
		devicesFound: 5,
		target: '10.0.0.0/24',
		partitionId: PARTITION,
		...overrides,
	};
}

describe('inventory domain', () => {
	describe('mergeDevices', () => {
		it('adds new devices not already in inventory', () => {
			const result = mergeDevices([], [makeScanDevice()], SCAN_ID, PARTITION, NOW);
			expect(result).toHaveLength(1);
			expect(result[0].ip).toBe('10.0.0.1');
			expect(result[0].hostname).toBe('rtr-01');
			expect(result[0].partitionId).toBe(PARTITION);
			expect(result[0].firstSeen).toBe(NOW);
			expect(result[0].lastSeen).toBe(NOW);
		});

		it('updates existing device by IP within same partition', () => {
			const existing = [makeInventoryDevice({ version: '15.0' })];
			const scanned = [makeScanDevice({ version: '16.9' })];
			const result = mergeDevices(existing, scanned, SCAN_ID, PARTITION, NOW);

			expect(result).toHaveLength(1);
			expect(result[0].version).toBe('16.9');
			expect(result[0].firstSeen).toBe('2026-01-01T00:00:00.000Z'); // preserved
			expect(result[0].lastSeen).toBe(NOW); // updated
		});

		it('does not affect devices in other partitions', () => {
			const otherDev = makeInventoryDevice({ partitionId: 'part-other', ip: '10.0.0.1' });
			const result = mergeDevices([otherDev], [makeScanDevice()], SCAN_ID, PARTITION, NOW);

			expect(result).toHaveLength(2); // other + new
			expect(result.find((d) => d.partitionId === 'part-other')).toBeTruthy();
		});

		it('handles empty scanned list', () => {
			const existing = [makeInventoryDevice()];
			const result = mergeDevices(existing, [], SCAN_ID, PARTITION, NOW);
			expect(result).toHaveLength(1);
		});
	});

	describe('createScanRecord', () => {
		it('creates a valid scan record', () => {
			const record = createScanRecord(
				{ hostsScanned: 254, devicesFound: 10, durationMs: 5000, target: '10.0.0.0/24', partitionId: PARTITION },
				NOW,
			);
			expect(record.id).toBeTruthy();
			expect(record.completedAt).toBe(NOW);
			expect(record.hostsScanned).toBe(254);
			expect(record.devicesFound).toBe(10);
			expect(record.partitionId).toBe(PARTITION);
		});
	});

	describe('devicesForPartition', () => {
		it('filters by partition ID', () => {
			const state = {
				devices: [
					makeInventoryDevice({ partitionId: 'a' }),
					makeInventoryDevice({ partitionId: 'b', id: 'dev-2', ip: '10.0.0.2' }),
				],
				scans: [],
			};
			expect(devicesForPartition(state, 'a')).toHaveLength(1);
			expect(devicesForPartition(state, 'b')).toHaveLength(1);
			expect(devicesForPartition(state, 'c')).toHaveLength(0);
		});
	});

	describe('scansForPartition', () => {
		it('returns scans sorted most recent first', () => {
			const state = {
				devices: [],
				scans: [
					makeScanRecord({ id: 's1', completedAt: '2026-01-01T00:00:00.000Z' }),
					makeScanRecord({ id: 's2', completedAt: '2026-06-01T00:00:00.000Z' }),
				],
			};
			const result = scansForPartition(state, PARTITION);
			expect(result[0].id).toBe('s2');
			expect(result[1].id).toBe('s1');
		});

		it('filters by partition', () => {
			const state = {
				devices: [],
				scans: [
					makeScanRecord({ partitionId: 'other' }),
					makeScanRecord({ partitionId: PARTITION }),
				],
			};
			expect(scansForPartition(state, PARTITION)).toHaveLength(1);
		});
	});

	describe('trimScanHistory', () => {
		it('keeps at most MAX_SCAN_HISTORY per partition', () => {
			const scans: ScanRecord[] = Array.from({ length: MAX_SCAN_HISTORY + 10 }, (_, i) =>
				makeScanRecord({
					id: `scan-${i}`,
					completedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
				}),
			);
			const result = trimScanHistory(scans, PARTITION);
			const forPartition = result.filter((s) => s.partitionId === PARTITION);
			expect(forPartition).toHaveLength(MAX_SCAN_HISTORY);
		});

		it('preserves scans from other partitions', () => {
			const scans = [
				makeScanRecord({ partitionId: 'other', id: 'keep-me' }),
				...Array.from({ length: MAX_SCAN_HISTORY + 5 }, (_, i) =>
					makeScanRecord({ id: `scan-${i}`, completedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }),
				),
			];
			const result = trimScanHistory(scans, PARTITION);
			expect(result.find((s) => s.id === 'keep-me')).toBeTruthy();
		});
	});

	describe('createEmptyInventoryState', () => {
		it('returns empty state', () => {
			const state = createEmptyInventoryState();
			expect(state.devices).toEqual([]);
			expect(state.scans).toEqual([]);
		});
	});
});

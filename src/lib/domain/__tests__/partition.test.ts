import { describe, it, expect } from 'vitest';
import { createDefaultPartition, countSyncedPartitions, slugify } from '../partition.js';

describe('partition domain', () => {
	describe('slugify', () => {
		it('converts display name to slug', () => {
			expect(slugify('My Cool Partition')).toBe('my-cool-partition');
		});
		it('handles special characters', () => {
			expect(slugify('Test/Partition (1)')).toMatch(/^test-partition-1/);
		});
		it('handles empty string', () => {
			const result = slugify('');
			expect(typeof result).toBe('string');
		});
	});

	describe('createDefaultPartition', () => {
		it('returns a valid partition', () => {
			const p = createDefaultPartition();
			expect(p.partitionId).toBeTruthy();
			expect(p.state).toBe('local_only');
			expect(p.displayName).toBeTruthy();
		});
	});

	describe('countSyncedPartitions', () => {
		it('counts only synced partitions', () => {
			const partitions = [
				{ state: 'synced' },
				{ state: 'local_only' },
				{ state: 'synced' },
				{ state: 'archived' },
			] as any[];
			expect(countSyncedPartitions(partitions)).toBe(2);
		});
		it('returns 0 for empty array', () => {
			expect(countSyncedPartitions([])).toBe(0);
		});
	});
});

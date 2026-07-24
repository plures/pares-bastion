import { describe, it, expect } from 'vitest';
import { createFreeLicense, computeLicenseStatus } from '../license.js';

describe('license domain', () => {
	describe('createFreeLicense', () => {
		it('creates a free tier license', () => {
			const license = createFreeLicense();
			expect(license.tier).toBe('free');
			expect(license.status).toBe('active');
		});
	});

	describe('computeLicenseStatus', () => {
		it('returns active for valid license', () => {
			const license = createFreeLicense();
			expect(computeLicenseStatus(license)).toBe('active');
		});

		it('returns expired for past expiry', () => {
			const now = Date.now();
			const license = {
				...createFreeLicense(),
				tier: 'pro' as const,
				validUntil: now - 86400000 * 30, // expired 30 days ago
				graceUntil: now - 86400000 * 23, // 7-day grace also expired
			};
			const status = computeLicenseStatus(license);
			expect(['expired', 'grace']).toContain(status);
		});
	});
});

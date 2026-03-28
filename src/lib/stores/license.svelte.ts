// ─── Legacy License Store ───────────────────────────────────────────────────
// Device-count gating for features within a partition.
// This is the per-feature soft gate, NOT the partition billing model.
// For partition/tier licensing, see license-store.svelte.ts.
//
// Kept for backward compatibility — components import from here.
// Will be consolidated into license-store once migration is complete.

import {
	type LicenseInfo,
	type LicensedFeature,
	type LicenseTier,
	createFreeLicense,
	createProLicense,
	FREE_TIER_DEVICE_LIMIT,
	GATED_FEATURES,
} from '$lib/types/license.types.js';

const LICENSE_STORAGE_KEY = 'netops-toolkit-license';

// ─── License Store (Svelte 5 runes) ────────────────────────────────────────

class LicenseStore {
	license = $state<LicenseInfo>(createFreeLicense());

	constructor() {
		this.load();
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	load(): void {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw) as LicenseInfo;
			if (parsed && typeof parsed.tier === 'string') {
				// Check expiration
				if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
					// Expired — revert to free
					this.license = createFreeLicense();
					this.save();
					return;
				}
				this.license = parsed;
			}
		} catch {
			// corrupted — reset
			this.license = createFreeLicense();
		}
	}

	save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(this.license));
	}

	// ── Queries ──────────────────────────────────────────────────────────────

	get tier(): LicenseTier {
		return this.license.tier;
	}

	get isFree(): boolean {
		return this.license.tier === 'free';
	}

	get isPro(): boolean {
		return this.license.tier === 'pro' || this.license.tier === 'enterprise';
	}

	/**
	 * Returns the device limit for a gated feature.
	 * -1 means unlimited.
	 */
	getLimit(feature: LicensedFeature): number {
		return this.license.maxDevices[feature] ?? FREE_TIER_DEVICE_LIMIT;
	}

	/**
	 * Check if a specific feature is within its device limit.
	 * @param feature - The gated feature to check
	 * @param currentCount - How many devices are currently using this feature
	 * @returns true if allowed, false if at or over the limit
	 */
	isWithinLimit(feature: LicensedFeature, currentCount: number): boolean {
		const limit = this.getLimit(feature);
		if (limit === -1) return true; // unlimited
		return currentCount < limit;
	}

	/**
	 * Returns a human-readable gate message if the user has hit the limit.
	 * Returns null if they're within limits.
	 */
	gateMessage(feature: LicensedFeature, currentCount: number): string | null {
		if (this.isWithinLimit(feature, currentCount)) return null;
		const limit = this.getLimit(feature);
		return `Free tier allows ${limit} devices for ${feature}. Upgrade to Pro for unlimited access.`;
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	/**
	 * Activate a license key.
	 * In production this would validate a JWT signature.
	 * For now, accepts any non-empty key with a valid-looking email.
	 */
	activate(email: string, key: string): { ok: boolean; error?: string } {
		if (!email || !email.includes('@')) {
			return { ok: false, error: 'Valid email required.' };
		}
		if (!key || key.length < 8) {
			return { ok: false, error: 'Invalid license key.' };
		}

		// TODO: In production, verify JWT signature against public key
		// For now, accept any key that starts with "NETOPS-PRO-"
		if (!key.startsWith('NETOPS-PRO-') && !key.startsWith('NETOPS-ENT-')) {
			return { ok: false, error: 'Unrecognized license key format.' };
		}

		this.license = createProLicense(email, key);
		this.save();
		return { ok: true };
	}

	/**
	 * Deactivate and revert to free tier.
	 */
	deactivate(): void {
		this.license = createFreeLicense();
		this.save();
	}
}

export const licenseStore = new LicenseStore();

// ── Re-exports for convenience ──────────────────────────────────────────────

export { FREE_TIER_DEVICE_LIMIT, GATED_FEATURES };
export type { LicenseInfo, LicensedFeature, LicenseTier };

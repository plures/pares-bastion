// ─── License Store (Svelte 5 Runes) ─────────────────────────────────────────
// Manages license state. Billing unit: partition, NOT seats.
// All entitlement checks delegate to domain/entitlements.ts.

import {
	type License,
	type LicenseStatus,
	type LicenseTier,
	type LicenseFile,
	createFreeLicense,
	computeLicenseStatus,
} from '$lib/domain/license.js';
import type { Partition } from '$lib/domain/partition.js';
import {
	type Entitlements,
	computeEntitlements,
} from '$lib/domain/entitlements.js';

const LICENSE_STORAGE_KEY = 'netops-license-v2';

class LicenseStore {
	license = $state<License>(createFreeLicense());
	private _partitions = $state<Partition[]>([]);

	constructor() {
		this.load();
	}

	// ── Derived State ────────────────────────────────────────────────────────

	get tier(): LicenseTier {
		return this.license.tier;
	}

	get status(): LicenseStatus {
		return computeLicenseStatus(this.license);
	}

	get isActive(): boolean {
		const s = this.status;
		return s === 'active' || s === 'grace';
	}

	get inGracePeriod(): boolean {
		return this.status === 'grace';
	}

	get isFree(): boolean {
		return this.license.tier === 'free';
	}

	/** Compute full entitlements from current license + partitions. */
	get entitlements(): Entitlements {
		return computeEntitlements(this.license, this._partitions);
	}

	// ── Partition Binding ────────────────────────────────────────────────────
	// The partition store calls this to keep entitlements in sync.

	setPartitions(partitions: Partition[]): void {
		this._partitions = partitions;
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private load(): void {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw) as License;
			if (parsed && typeof parsed.tier === 'string' && typeof parsed.licenseId === 'string') {
				this.license = parsed;
			}
		} catch {
			this.license = createFreeLicense();
		}
	}

	private save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(this.license));
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	/**
	 * Import a signed license file.
	 * In production, this calls the Rust backend for Ed25519 verification.
	 * For now, validates structure and accepts.
	 */
	importLicense(file: LicenseFile): { ok: boolean; error?: string } {
		const { license: payload, signature } = file;

		// Structural validation
		if (!payload.licenseId || !payload.orgId || !payload.tier) {
			return { ok: false, error: 'Invalid license file: missing required fields.' };
		}

		const validTiers: LicenseTier[] = ['free', 'pro', 'team', 'enterprise'];
		if (!validTiers.includes(payload.tier)) {
			return { ok: false, error: `Invalid tier: ${payload.tier}` };
		}

		if (!signature || signature.length < 10) {
			return { ok: false, error: 'Invalid or missing signature.' };
		}

		// TODO: Call Rust backend for Ed25519 signature verification
		// For now, accept structurally valid licenses

		const license: License = {
			...payload,
			signature,
			status: 'active',
		};

		// Check if license has expired
		const status = computeLicenseStatus(license);
		if (status === 'expired') {
			return { ok: false, error: 'This license has expired.' };
		}

		this.license = { ...license, status };
		this.save();
		return { ok: true };
	}

	/**
	 * Deactivate license and revert to free tier.
	 * Does NOT delete partitions — admin must handle excess synced partitions.
	 */
	deactivate(): void {
		this.license = createFreeLicense();
		this.save();
	}

	/**
	 * Refresh license status (call periodically or on app focus).
	 * Handles grace period transitions and expiry.
	 */
	refreshStatus(): void {
		const newStatus = computeLicenseStatus(this.license);
		if (newStatus !== this.license.status) {
			this.license = { ...this.license, status: newStatus };
			this.save();
		}
	}
}

export const licenseStore = new LicenseStore();

// Re-exports for convenience
export type { License, LicenseStatus, LicenseTier, LicenseFile, Entitlements };

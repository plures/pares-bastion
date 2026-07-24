// ─── License Service ────────────────────────────────────────────────────────
// Wraps Tauri invoke commands for license operations.
// In the current phase, uses local validation. Future: Rust backend Ed25519 verify.

import type { LicenseFile, License } from '$lib/domain/license.js';

// ─── Tauri Command Wrappers ─────────────────────────────────────────────────
// These will call `invoke()` when the Rust licensing module is implemented.
// For now, they perform validation locally.

/**
 * Validate a license file's signature.
 * Phase 1: structural validation only.
 * Phase 2+: calls Rust backend for Ed25519 verification.
 */
export async function validateLicenseFile(file: LicenseFile): Promise<{ valid: boolean; error?: string }> {
	// TODO: invoke('validate_license', { file }) when Rust module is ready
	const { license, signature } = file;

	if (!license || !signature) {
		return { valid: false, error: 'Missing license payload or signature.' };
	}

	if (!license.licenseId || !license.orgId || !license.tier) {
		return { valid: false, error: 'Missing required license fields.' };
	}

	if (typeof signature !== 'string' || signature.length < 10) {
		return { valid: false, error: 'Invalid signature format.' };
	}

	// Phase 1: accept structurally valid files
	return { valid: true };
}

/**
 * Read a license file from disk.
 * Uses Tauri's file dialog + fs API in production.
 */
export async function readLicenseFile(_path: string): Promise<LicenseFile | null> {
	try {
		// In browser/dev mode, this would use FileReader
		// In Tauri, this calls invoke('read_license_file', { path })
		// TODO: implement Tauri command
		return null;
	} catch {
		return null;
	}
}

/**
 * Export current license info (for support/debugging).
 */
export function exportLicenseInfo(license: License): string {
	const safe = { ...license, signature: '[REDACTED]' };
	return JSON.stringify(safe, null, 2);
}

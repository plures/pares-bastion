// ─── License Types ──────────────────────────────────────────────────────────

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export type LicensedFeature =
	| 'config'
	| 'health'
	| 'vault'
	| 'device-detail'
	| 'tunneling'
	| 'terminal'
	| 'export';

export interface LicenseInfo {
	tier: LicenseTier;
	email: string | null;
	issuedAt: number; // Unix ms
	expiresAt: number | null; // null = perpetual
	maxDevices: Record<LicensedFeature, number>; // -1 = unlimited
	key: string | null; // signed JWT or activation key
}

/** Features that are ALWAYS unlimited regardless of license. */
export const UNLIMITED_FEATURES = new Set<string>(['scan', 'inventory']);

/** The device cap for gated features on the free tier. */
export const FREE_TIER_DEVICE_LIMIT = 10;

/** All features that require a license for unlimited use. */
export const GATED_FEATURES: LicensedFeature[] = [
	'config',
	'health',
	'vault',
	'device-detail',
	'tunneling',
	'terminal',
	'export',
];

// ─── Default Free License ───────────────────────────────────────────────────

export function createFreeLicense(): LicenseInfo {
	const maxDevices: Record<LicensedFeature, number> = {
		config: FREE_TIER_DEVICE_LIMIT,
		health: FREE_TIER_DEVICE_LIMIT,
		vault: FREE_TIER_DEVICE_LIMIT,
		'device-detail': FREE_TIER_DEVICE_LIMIT,
		tunneling: FREE_TIER_DEVICE_LIMIT,
		terminal: FREE_TIER_DEVICE_LIMIT,
		export: FREE_TIER_DEVICE_LIMIT, // rows for export
	};

	return {
		tier: 'free',
		email: null,
		issuedAt: Date.now(),
		expiresAt: null,
		maxDevices,
		key: null,
	};
}

export function createProLicense(email: string, key: string): LicenseInfo {
	const maxDevices = {} as Record<LicensedFeature, number>;
	for (const f of GATED_FEATURES) {
		maxDevices[f] = -1; // unlimited
	}

	return {
		tier: 'pro',
		email,
		issuedAt: Date.now(),
		expiresAt: null, // perpetual
		maxDevices,
		key,
	};
}

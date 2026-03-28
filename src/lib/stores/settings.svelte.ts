import type { Settings } from '$lib/types/settings.types.js';

const SETTINGS_STORAGE_KEY = 'netops-toolkit-settings';

const DEFAULT_SETTINGS: Settings = {
	sshCredentials: {
		username: '',
		passwordOrKeyPath: '',
		defaultTimeout: 30
	},
	scanDefaults: {
		defaultConcurrency: 10,
		deepScan: false,
		outputFormat: 'json'
	},
	appearance: {
		theme: 'dark',
		tuiMode: false
	}
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function parseSettings(raw: string): Settings {
	try {
		const parsedUnknown = JSON.parse(raw) as unknown;

		const settings: Settings = {
			sshCredentials: { ...DEFAULT_SETTINGS.sshCredentials },
			scanDefaults: { ...DEFAULT_SETTINGS.scanDefaults },
			appearance: { ...DEFAULT_SETTINGS.appearance }
		};

		if (!isRecord(parsedUnknown)) {
			return settings;
		}

		const parsed = parsedUnknown as Record<string, unknown>;

		// sshCredentials
		if (isRecord(parsed.sshCredentials)) {
			const ssh = parsed.sshCredentials;

			if (isString(ssh.username)) {
				settings.sshCredentials.username = ssh.username;
			}

			if (isString(ssh.passwordOrKeyPath)) {
				settings.sshCredentials.passwordOrKeyPath = ssh.passwordOrKeyPath;
			}

			if (isNumber(ssh.defaultTimeout)) {
				// Clamp timeout to a reasonable range (seconds)
				settings.sshCredentials.defaultTimeout = clampNumber(ssh.defaultTimeout, 1, 300);
			}
		}

		// scanDefaults
		if (isRecord(parsed.scanDefaults)) {
			const scan = parsed.scanDefaults;

			if (isNumber(scan.defaultConcurrency)) {
				// Clamp concurrency to a reasonable range
				settings.scanDefaults.defaultConcurrency = clampNumber(scan.defaultConcurrency, 1, 1024);
			}

			if (isBoolean(scan.deepScan)) {
				settings.scanDefaults.deepScan = scan.deepScan;
			}

			if (isString(scan.outputFormat)) {
				// Only accept known/allowed output formats
				const allowedOutputFormats = new Set<string>(['json']);
				if (allowedOutputFormats.has(scan.outputFormat)) {
					settings.scanDefaults.outputFormat = scan.outputFormat as import('$lib/types/settings.types.js').OutputFormat;
				}
			}
		}

		// appearance
		if (isRecord(parsed.appearance)) {
			const appearance = parsed.appearance;

			if (isString(appearance.theme)) {
				// Only accept known themes
				const allowedThemes = new Set<string>(['dark', 'light']);
				if (allowedThemes.has(appearance.theme)) {
					settings.appearance.theme = appearance.theme as import('$lib/types/settings.types.js').Theme;
				}
			}

			if (isBoolean(appearance.tuiMode)) {
				settings.appearance.tuiMode = appearance.tuiMode;
			}
		}

		return settings;
	} catch {
		return {
			sshCredentials: { ...DEFAULT_SETTINGS.sshCredentials },
			scanDefaults: { ...DEFAULT_SETTINGS.scanDefaults },
			appearance: { ...DEFAULT_SETTINGS.appearance }
		};
	}
}

class SettingsStore {
	value = $state<Settings>({ ...DEFAULT_SETTINGS });

	load(): void {
		if (typeof localStorage === 'undefined') return;
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (stored) {
			this.value = parseSettings(stored);
		}
	}

	save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.value));
	}

	update(settings: Settings): void {
		this.value = settings;
		this.save();
	}

	reset(): void {
		this.value = { ...DEFAULT_SETTINGS };
		this.save();
	}
}

export const settingsStore = new SettingsStore();

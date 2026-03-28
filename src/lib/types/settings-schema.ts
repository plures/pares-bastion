// ─── VS Code-style Settings Schema ──────────────────────────────────────────
// Each setting has a key path, type, default, description, and category.
// The settings page renders this schema into a searchable, categorized editor.

export type SettingType = 'string' | 'number' | 'boolean' | 'enum' | 'path' | 'password';

export interface SettingDefinition {
	key: string; // dot-separated path, e.g. "ssh.username"
	label: string;
	description: string;
	category: SettingCategory;
	type: SettingType;
	default: unknown;
	options?: string[]; // for enum type
	min?: number; // for number type
	max?: number;
	placeholder?: string;
	secret?: boolean; // mask in UI
}

export type SettingCategory =
	| 'general'
	| 'ssh'
	| 'scanning'
	| 'tunnels'
	| 'terminal'
	| 'appearance'
	| 'licensing'
	| 'export';

export interface CategoryMeta {
	id: SettingCategory;
	label: string;
	icon: string;
	description: string;
}

// ─── Category Definitions ───────────────────────────────────────────────────

export const CATEGORIES: CategoryMeta[] = [
	{ id: 'general', label: 'General', icon: '⚙️', description: 'Application-level settings' },
	{ id: 'ssh', label: 'SSH', icon: '🔑', description: 'SSH connection defaults' },
	{ id: 'scanning', label: 'Scanning', icon: '🔍', description: 'Network discovery settings' },
	{ id: 'tunnels', label: 'Tunnels', icon: '🚇', description: 'SSH tunnel and bastion configuration' },
	{ id: 'terminal', label: 'Terminal', icon: '💻', description: 'Integrated terminal settings' },
	{ id: 'appearance', label: 'Appearance', icon: '🎨', description: 'Theme and display settings' },
	{ id: 'export', label: 'Export', icon: '📊', description: 'Data export preferences' },
	{ id: 'licensing', label: 'Licensing', icon: '🪪', description: 'License activation and limits' },
];

// ─── Setting Definitions ────────────────────────────────────────────────────

export const SETTINGS_SCHEMA: SettingDefinition[] = [
	// General
	{
		key: 'general.dataDir',
		label: 'Data Directory',
		description: 'Directory for storing app data (inventory, configs, logs).',
		category: 'general',
		type: 'path',
		default: '~/.netops-toolkit',
		placeholder: '~/.netops-toolkit',
	},
	{
		key: 'general.autoSave',
		label: 'Auto Save',
		description: 'Automatically save changes to inventory and configurations.',
		category: 'general',
		type: 'boolean',
		default: true,
	},
	{
		key: 'general.logLevel',
		label: 'Log Level',
		description: 'Verbosity of application logs.',
		category: 'general',
		type: 'enum',
		default: 'info',
		options: ['debug', 'info', 'warn', 'error'],
	},

	// SSH
	{
		key: 'ssh.defaultUsername',
		label: 'Default Username',
		description: 'Default SSH username when no vault credential matches.',
		category: 'ssh',
		type: 'string',
		default: '',
		placeholder: 'admin',
	},
	{
		key: 'ssh.defaultTimeout',
		label: 'Connection Timeout (seconds)',
		description: 'SSH connection timeout in seconds.',
		category: 'ssh',
		type: 'number',
		default: 30,
		min: 1,
		max: 300,
	},
	{
		key: 'ssh.strictHostKeyChecking',
		label: 'Strict Host Key Checking',
		description: 'Reject connections to hosts with unknown or changed SSH keys.',
		category: 'ssh',
		type: 'boolean',
		default: false,
	},
	{
		key: 'ssh.keepAliveInterval',
		label: 'Keep Alive Interval (seconds)',
		description: 'Send keepalive packets at this interval to prevent session drops.',
		category: 'ssh',
		type: 'number',
		default: 60,
		min: 0,
		max: 600,
	},
	{
		key: 'ssh.knownHostsPath',
		label: 'Known Hosts File',
		description: 'Path to SSH known_hosts file.',
		category: 'ssh',
		type: 'path',
		default: '~/.ssh/known_hosts',
		placeholder: '~/.ssh/known_hosts',
	},

	// Scanning
	{
		key: 'scanning.defaultConcurrency',
		label: 'Default Concurrency',
		description: 'Number of simultaneous connections during network scans.',
		category: 'scanning',
		type: 'number',
		default: 10,
		min: 1,
		max: 1024,
	},
	{
		key: 'scanning.deepScan',
		label: 'Deep Scan',
		description: 'Collect interface details, BGP peers, and running config during scan.',
		category: 'scanning',
		type: 'boolean',
		default: false,
	},
	{
		key: 'scanning.timeout',
		label: 'Per-Device Timeout (seconds)',
		description: 'Maximum time to wait for each device during a scan.',
		category: 'scanning',
		type: 'number',
		default: 15,
		min: 1,
		max: 120,
	},
	{
		key: 'scanning.retryCount',
		label: 'Retry Count',
		description: 'Number of retries for failed device connections during scan.',
		category: 'scanning',
		type: 'number',
		default: 1,
		min: 0,
		max: 5,
	},
	{
		key: 'scanning.protocols',
		label: 'Discovery Protocols',
		description: 'Protocols to use for device discovery.',
		category: 'scanning',
		type: 'enum',
		default: 'ssh',
		options: ['ssh', 'snmp', 'netconf', 'ssh+snmp'],
	},

	// Tunnels
	{
		key: 'tunnels.defaultBastionHost',
		label: 'Default Bastion Host',
		description: 'Hostname or IP of the default jump box / bastion.',
		category: 'tunnels',
		type: 'string',
		default: '',
		placeholder: 'bastion.corp.example.com',
	},
	{
		key: 'tunnels.defaultBastionPort',
		label: 'Bastion SSH Port',
		description: 'SSH port on the bastion host.',
		category: 'tunnels',
		type: 'number',
		default: 22,
		min: 1,
		max: 65535,
	},
	{
		key: 'tunnels.bastionUsername',
		label: 'Bastion Username',
		description: 'Username for bastion host authentication (uses vault if empty).',
		category: 'tunnels',
		type: 'string',
		default: '',
		placeholder: 'Uses vault credential',
	},
	{
		key: 'tunnels.autoTunnel',
		label: 'Auto-Tunnel',
		description: 'Automatically create tunnels when connecting to devices behind bastion networks.',
		category: 'tunnels',
		type: 'boolean',
		default: false,
	},
	{
		key: 'tunnels.socksProxy',
		label: 'SOCKS Proxy',
		description: 'Enable SOCKS5 proxy mode for routing all device traffic through the bastion.',
		category: 'tunnels',
		type: 'boolean',
		default: false,
	},
	{
		key: 'tunnels.localPortRangeStart',
		label: 'Local Port Range Start',
		description: 'Starting local port for dynamic tunnel allocation.',
		category: 'tunnels',
		type: 'number',
		default: 10000,
		min: 1024,
		max: 60000,
	},
	{
		key: 'tunnels.keepAlive',
		label: 'Tunnel Keep Alive',
		description: 'Send tunnel keepalive packets to prevent idle disconnects.',
		category: 'tunnels',
		type: 'boolean',
		default: true,
	},

	// Terminal
	{
		key: 'terminal.defaultShell',
		label: 'Default Shell',
		description: 'Default shell for local terminal sessions.',
		category: 'terminal',
		type: 'enum',
		default: 'bash',
		options: ['bash', 'zsh', 'fish', 'powershell', 'cmd'],
	},
	{
		key: 'terminal.fontSize',
		label: 'Font Size',
		description: 'Terminal font size in pixels.',
		category: 'terminal',
		type: 'number',
		default: 14,
		min: 8,
		max: 32,
	},
	{
		key: 'terminal.fontFamily',
		label: 'Font Family',
		description: 'Terminal font family.',
		category: 'terminal',
		type: 'string',
		default: 'SF Mono, Cascadia Code, Consolas, monospace',
	},
	{
		key: 'terminal.scrollback',
		label: 'Scrollback Lines',
		description: 'Number of lines to keep in terminal scrollback buffer.',
		category: 'terminal',
		type: 'number',
		default: 5000,
		min: 100,
		max: 100000,
	},
	{
		key: 'terminal.sessionLogging',
		label: 'Session Logging',
		description: 'Automatically log terminal sessions to files.',
		category: 'terminal',
		type: 'boolean',
		default: false,
	},
	{
		key: 'terminal.logDir',
		label: 'Session Log Directory',
		description: 'Directory for terminal session log files.',
		category: 'terminal',
		type: 'path',
		default: '~/.netops-toolkit/logs/sessions',
	},

	// Appearance
	{
		key: 'appearance.theme',
		label: 'Theme',
		description: 'Application color theme.',
		category: 'appearance',
		type: 'enum',
		default: 'dark',
		options: ['dark', 'light', 'auto'],
	},
	{
		key: 'appearance.sidebarCollapsed',
		label: 'Sidebar Collapsed',
		description: 'Start with the sidebar collapsed.',
		category: 'appearance',
		type: 'boolean',
		default: false,
	},
	{
		key: 'appearance.statusBar',
		label: 'Show Status Bar',
		description: 'Display the status bar at the bottom of the window.',
		category: 'appearance',
		type: 'boolean',
		default: true,
	},
	{
		key: 'appearance.compactMode',
		label: 'Compact Mode',
		description: 'Reduce padding and spacing for denser information display.',
		category: 'appearance',
		type: 'boolean',
		default: false,
	},

	// Export
	{
		key: 'export.defaultFormat',
		label: 'Default Export Format',
		description: 'Default file format for data exports.',
		category: 'export',
		type: 'enum',
		default: 'xlsx',
		options: ['xlsx', 'csv', 'json', 'yaml'],
	},
	{
		key: 'export.includeTimestamp',
		label: 'Include Timestamp',
		description: 'Add a timestamp to exported filenames.',
		category: 'export',
		type: 'boolean',
		default: true,
	},
	{
		key: 'export.outputDir',
		label: 'Export Directory',
		description: 'Default directory for exported files.',
		category: 'export',
		type: 'path',
		default: '~/Downloads',
		placeholder: '~/Downloads',
	},
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getSettingsByCategory(category: SettingCategory): SettingDefinition[] {
	return SETTINGS_SCHEMA.filter((s) => s.category === category);
}

export function getSettingByKey(key: string): SettingDefinition | undefined {
	return SETTINGS_SCHEMA.find((s) => s.key === key);
}

export function getDefaultValues(): Record<string, unknown> {
	const defaults: Record<string, unknown> = {};
	for (const s of SETTINGS_SCHEMA) {
		defaults[s.key] = s.default;
	}
	return defaults;
}

/**
 * Convert flat dot-notation settings to nested YAML-friendly object.
 */
export function toNestedObject(flat: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(flat)) {
		const parts = key.split('.');
		let current: Record<string, unknown> = result;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!(parts[i] in current)) {
				current[parts[i]] = {};
			}
			current = current[parts[i]] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
	}
	return result;
}

/**
 * Flatten nested object to dot-notation keys.
 */
export function fromNestedObject(
	nested: Record<string, unknown>,
	prefix = '',
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(nested)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			Object.assign(result, fromNestedObject(value as Record<string, unknown>, fullKey));
		} else {
			result[fullKey] = value;
		}
	}
	return result;
}

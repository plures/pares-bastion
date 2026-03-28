/**
 * Device categories for infrastructure inventory.
 * Covers both network and systems engineering disciplines.
 */

// ── Category Hierarchy ──────────────────────────────────────────────────────

export type DeviceDomain = 'network' | 'systems' | 'cloud' | 'custom';

export interface DeviceCategory {
	id: string;
	domain: DeviceDomain;
	label: string;
	icon: string;
	/** Default health check method for this category. */
	defaultHealthCheck: 'icmp' | 'snmp' | 'ssh' | 'api' | 'none';
	/** Default credential auth method for this category. */
	defaultAuthMethod: 'password' | 'key' | 'token' | 'none';
	/** Whether this category typically has a CLI/console interface. */
	hasConsole: boolean;
	/** Whether config backup is applicable. */
	hasConfig: boolean;
}

// ── Network Categories ──────────────────────────────────────────────────────

export const NETWORK_CATEGORIES: DeviceCategory[] = [
	{ id: 'router', domain: 'network', label: 'Router', icon: '🔀', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'switch', domain: 'network', label: 'Switch', icon: '🔲', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'firewall', domain: 'network', label: 'Firewall', icon: '🛡️', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'access-point', domain: 'network', label: 'Access Point', icon: '📡', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: false, hasConfig: true },
	{ id: 'load-balancer', domain: 'network', label: 'Load Balancer', icon: '⚖️', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'wan-optimizer', domain: 'network', label: 'WAN Optimizer', icon: '🚀', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'wireless-controller', domain: 'network', label: 'Wireless Controller', icon: '📶', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'network-tap', domain: 'network', label: 'Network TAP', icon: '🔌', defaultHealthCheck: 'icmp', defaultAuthMethod: 'none', hasConsole: false, hasConfig: false },
	{ id: 'packet-broker', domain: 'network', label: 'Packet Broker', icon: '📦', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
];

// ── Systems Categories ──────────────────────────────────────────────────────

export const SYSTEMS_CATEGORIES: DeviceCategory[] = [
	{ id: 'server-physical', domain: 'systems', label: 'Server (Physical)', icon: '🖥️', defaultHealthCheck: 'ssh', defaultAuthMethod: 'key', hasConsole: true, hasConfig: true },
	{ id: 'virtual-machine', domain: 'systems', label: 'Virtual Machine', icon: '💻', defaultHealthCheck: 'ssh', defaultAuthMethod: 'key', hasConsole: true, hasConfig: true },
	{ id: 'hypervisor', domain: 'systems', label: 'Hypervisor', icon: '🏗️', defaultHealthCheck: 'ssh', defaultAuthMethod: 'key', hasConsole: true, hasConfig: true },
	{ id: 'container-host', domain: 'systems', label: 'Container Host', icon: '📦', defaultHealthCheck: 'ssh', defaultAuthMethod: 'key', hasConsole: true, hasConfig: true },
	{ id: 'storage-array', domain: 'systems', label: 'Storage Array', icon: '💾', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
	{ id: 'backup-appliance', domain: 'systems', label: 'Backup Appliance', icon: '🔄', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
	{ id: 'ups-pdu', domain: 'systems', label: 'UPS / PDU', icon: '🔋', defaultHealthCheck: 'snmp', defaultAuthMethod: 'password', hasConsole: false, hasConfig: false },
	{ id: 'kvm-console', domain: 'systems', label: 'KVM / Console Server', icon: '🎮', defaultHealthCheck: 'icmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: true },
	{ id: 'bmc-ipmi', domain: 'systems', label: 'BMC / IPMI', icon: '🔧', defaultHealthCheck: 'icmp', defaultAuthMethod: 'password', hasConsole: true, hasConfig: false },
];

// ── Cloud Categories ────────────────────────────────────────────────────────

export const CLOUD_CATEGORIES: DeviceCategory[] = [
	{ id: 'cloud-vpc', domain: 'cloud', label: 'Cloud VPC / VNet', icon: '☁️', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
	{ id: 'cloud-instance', domain: 'cloud', label: 'Cloud Instance', icon: '⚡', defaultHealthCheck: 'api', defaultAuthMethod: 'key', hasConsole: true, hasConfig: true },
	{ id: 'cloud-lb', domain: 'cloud', label: 'Cloud Load Balancer', icon: '⚖️', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
	{ id: 'cloud-gateway', domain: 'cloud', label: 'Cloud Gateway', icon: '🚪', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
	{ id: 'cloud-storage', domain: 'cloud', label: 'Cloud Storage', icon: '🗄️', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
	{ id: 'cloud-database', domain: 'cloud', label: 'Cloud Database', icon: '🗃️', defaultHealthCheck: 'api', defaultAuthMethod: 'token', hasConsole: false, hasConfig: true },
];

// ── Combined ────────────────────────────────────────────────────────────────

export const ALL_CATEGORIES: DeviceCategory[] = [
	...NETWORK_CATEGORIES,
	...SYSTEMS_CATEGORIES,
	...CLOUD_CATEGORIES,
];

export const CATEGORY_MAP = new Map(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryById(id: string): DeviceCategory | undefined {
	return CATEGORY_MAP.get(id);
}

export function getCategoriesByDomain(domain: DeviceDomain): DeviceCategory[] {
	return ALL_CATEGORIES.filter((c) => c.domain === domain);
}

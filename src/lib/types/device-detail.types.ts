/** System information parsed from device CLI output. */
export interface SystemInfo {
	hostname: string;
	ip: string;
	vendor: string;
	model: string;
	version: string;
	serial: string;
	uptime: string;
}

/** Single network interface with status and counters. */
export interface InterfaceEntry {
	name: string;
	status: 'up' | 'down' | 'admin-down';
	speed: string;
	inputErrors: number;
	outputErrors: number;
	utilization: number;
}

/** Device health metrics. */
export interface HealthInfo {
	cpuPercent: number;
	memoryPercent: number;
	temperatureCelsius: number | null;
}

/** BGP peer summary entry. */
export interface BgpPeer {
	neighbor: string;
	remoteAs: number;
	state: string;
	prefixesReceived: number;
}

/** Full device detail payload returned by the Tauri command. */
export interface DeviceDetail {
	systemInfo: SystemInfo;
	interfaces: InterfaceEntry[];
	health: HealthInfo;
	bgpPeers: BgpPeer[];
	configOutput: string;
}

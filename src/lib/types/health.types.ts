/** Per-device health entry returned by the fleet health command. */
export interface DeviceHealthEntry {
	hostname: string;
	ip: string;
	vendor: string;
	status: 'healthy' | 'warning' | 'critical' | 'unreachable';
	cpuPercent: number;
	memoryPercent: number;
	temperatureCelsius: number | null;
	interfaceErrors: InterfaceErrorEntry[];
	logAlerts: LogAlertEntry[];
}

/** Interface error counters for a single interface on a device. */
export interface InterfaceErrorEntry {
	interfaceName: string;
	crcErrors: number;
	inputErrors: number;
	outputErrors: number;
}

/** Parsed syslog alert entry. */
export interface LogAlertEntry {
	timestamp: string;
	severity: 'critical' | 'major' | 'minor' | 'warning' | 'info';
	source: string;
	message: string;
}

/** Per-vendor health summary. */
export interface VendorHealthSummary {
	vendor: string;
	total: number;
	healthy: number;
	warning: number;
	critical: number;
	unreachable: number;
	avgCpu: number;
	avgMemory: number;
}

/** Aggregate fleet health returned by get_fleet_health. */
export interface FleetHealth {
	devices: DeviceHealthEntry[];
	summary: {
		total: number;
		healthy: number;
		warning: number;
		critical: number;
		unreachable: number;
	};
	vendorBreakdown: VendorHealthSummary[];
	lastUpdated: string;
}

import type {
	FleetHealth,
	DeviceHealthEntry,
	VendorHealthSummary
} from '$lib/types/health.types.js';

const devices: DeviceHealthEntry[] = [
	{
		hostname: 'core-rtr-01',
		ip: '10.0.0.1',
		vendor: 'Cisco',
		status: 'healthy',
		cpuPercent: 24,
		memoryPercent: 61,
		temperatureCelsius: 42,
		interfaceErrors: [],
		logAlerts: [
			{
				timestamp: '2026-03-27T06:12:00Z',
				severity: 'info',
				source: 'core-rtr-01',
				message: 'BGP neighbor 10.0.0.2 Up'
			}
		]
	},
	{
		hostname: 'core-rtr-02',
		ip: '10.0.0.2',
		vendor: 'Cisco',
		status: 'warning',
		cpuPercent: 78,
		memoryPercent: 85,
		temperatureCelsius: 55,
		interfaceErrors: [
			{ interfaceName: 'Gi0/0/1', crcErrors: 12, inputErrors: 45, outputErrors: 3 }
		],
		logAlerts: [
			{
				timestamp: '2026-03-27T05:58:00Z',
				severity: 'warning',
				source: 'core-rtr-02',
				message: 'CPU utilization above 75% threshold'
			}
		]
	},
	{
		hostname: 'edge-rtr-01',
		ip: '10.0.1.1',
		vendor: 'Nokia',
		status: 'healthy',
		cpuPercent: 18,
		memoryPercent: 44,
		temperatureCelsius: 38,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'edge-rtr-02',
		ip: '10.0.1.2',
		vendor: 'Nokia',
		status: 'critical',
		cpuPercent: 95,
		memoryPercent: 92,
		temperatureCelsius: 68,
		interfaceErrors: [
			{ interfaceName: 'port-1/1/1', crcErrors: 230, inputErrors: 1540, outputErrors: 87 }
		],
		logAlerts: [
			{
				timestamp: '2026-03-27T06:01:00Z',
				severity: 'critical',
				source: 'edge-rtr-02',
				message: 'Memory utilization critical — 92%'
			},
			{
				timestamp: '2026-03-27T05:55:00Z',
				severity: 'major',
				source: 'edge-rtr-02',
				message: 'Port 1/1/1 CRC errors exceeding threshold'
			}
		]
	},
	{
		hostname: 'spine-sw-01',
		ip: '10.1.0.1',
		vendor: 'Arista',
		status: 'healthy',
		cpuPercent: 12,
		memoryPercent: 38,
		temperatureCelsius: 35,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'spine-sw-02',
		ip: '10.1.0.2',
		vendor: 'Arista',
		status: 'healthy',
		cpuPercent: 15,
		memoryPercent: 41,
		temperatureCelsius: 36,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'leaf-sw-01',
		ip: '10.1.1.1',
		vendor: 'Arista',
		status: 'warning',
		cpuPercent: 72,
		memoryPercent: 80,
		temperatureCelsius: 48,
		interfaceErrors: [
			{ interfaceName: 'Ethernet1/1', crcErrors: 0, inputErrors: 22, outputErrors: 8 }
		],
		logAlerts: [
			{
				timestamp: '2026-03-27T06:05:00Z',
				severity: 'warning',
				source: 'leaf-sw-01',
				message: 'Interface Ethernet1/1 input errors rising'
			}
		]
	},
	{
		hostname: 'leaf-sw-02',
		ip: '10.1.1.2',
		vendor: 'Arista',
		status: 'healthy',
		cpuPercent: 20,
		memoryPercent: 50,
		temperatureCelsius: 39,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'agg-rtr-01',
		ip: '10.0.2.1',
		vendor: 'Cisco',
		status: 'healthy',
		cpuPercent: 30,
		memoryPercent: 55,
		temperatureCelsius: 40,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'agg-rtr-02',
		ip: '10.0.2.2',
		vendor: 'Cisco',
		status: 'unreachable',
		cpuPercent: 0,
		memoryPercent: 0,
		temperatureCelsius: null,
		interfaceErrors: [],
		logAlerts: [
			{
				timestamp: '2026-03-27T05:30:00Z',
				severity: 'critical',
				source: 'agg-rtr-02',
				message: 'Device unreachable — SNMP timeout'
			}
		]
	},
	{
		hostname: 'pe-rtr-01',
		ip: '10.0.3.1',
		vendor: 'Nokia',
		status: 'healthy',
		cpuPercent: 22,
		memoryPercent: 48,
		temperatureCelsius: 37,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'pe-rtr-02',
		ip: '10.0.3.2',
		vendor: 'Nokia',
		status: 'healthy',
		cpuPercent: 19,
		memoryPercent: 45,
		temperatureCelsius: 36,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'border-sw-01',
		ip: '10.1.2.1',
		vendor: 'Arista',
		status: 'warning',
		cpuPercent: 68,
		memoryPercent: 75,
		temperatureCelsius: 46,
		interfaceErrors: [
			{ interfaceName: 'Ethernet49/1', crcErrors: 5, inputErrors: 14, outputErrors: 0 }
		],
		logAlerts: [
			{
				timestamp: '2026-03-27T06:08:00Z',
				severity: 'minor',
				source: 'border-sw-01',
				message: 'Ethernet49/1 CRC errors detected'
			}
		]
	},
	{
		hostname: 'dist-rtr-01',
		ip: '10.0.4.1',
		vendor: 'Cisco',
		status: 'healthy',
		cpuPercent: 35,
		memoryPercent: 58,
		temperatureCelsius: 41,
		interfaceErrors: [],
		logAlerts: []
	},
	{
		hostname: 'wan-rtr-01',
		ip: '10.0.5.1',
		vendor: 'Nokia',
		status: 'healthy',
		cpuPercent: 16,
		memoryPercent: 42,
		temperatureCelsius: 34,
		interfaceErrors: [],
		logAlerts: [
			{
				timestamp: '2026-03-27T06:10:00Z',
				severity: 'info',
				source: 'wan-rtr-01',
				message: 'ISIS adjacency up with pe-rtr-01'
			}
		]
	}
];

function buildVendorBreakdown(entries: DeviceHealthEntry[]): VendorHealthSummary[] {
	const vendorMap = new Map<string, DeviceHealthEntry[]>();
	for (const d of entries) {
		const list = vendorMap.get(d.vendor) ?? [];
		list.push(d);
		vendorMap.set(d.vendor, list);
	}

	const result: VendorHealthSummary[] = [];
	for (const [vendor, list] of vendorMap) {
		const reachable = list.filter((d) => d.status !== 'unreachable');
		result.push({
			vendor,
			total: list.length,
			healthy: list.filter((d) => d.status === 'healthy').length,
			warning: list.filter((d) => d.status === 'warning').length,
			critical: list.filter((d) => d.status === 'critical').length,
			unreachable: list.filter((d) => d.status === 'unreachable').length,
			avgCpu:
				reachable.length > 0
					? Math.round(reachable.reduce((s, d) => s + d.cpuPercent, 0) / reachable.length)
					: 0,
			avgMemory:
				reachable.length > 0
					? Math.round(reachable.reduce((s, d) => s + d.memoryPercent, 0) / reachable.length)
					: 0
		});
	}
	return result;
}

export const mockFleetHealth: FleetHealth = {
	devices,
	summary: {
		total: devices.length,
		healthy: devices.filter((d) => d.status === 'healthy').length,
		warning: devices.filter((d) => d.status === 'warning').length,
		critical: devices.filter((d) => d.status === 'critical').length,
		unreachable: devices.filter((d) => d.status === 'unreachable').length
	},
	vendorBreakdown: buildVendorBreakdown(devices),
	lastUpdated: '2026-03-27T06:15:00Z'
};

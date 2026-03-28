import { invoke } from '@tauri-apps/api/core';
import type { FleetHealth } from '$lib/types/health.types.js';
import type { HealthInfo } from '$lib/types/device-detail.types.js';

/**
 * Fetch aggregate fleet health data across all devices.
 * Calls the `get_fleet_health` Tauri command.
 */
export async function getFleetHealth(): Promise<FleetHealth> {
	return invoke<FleetHealth>('get_fleet_health');
}

/**
 * Fetch live health metrics for a single device.
 * Calls the `get_device_health` Tauri command.
 */
export async function getDeviceHealth(hostname: string): Promise<HealthInfo> {
	return invoke<HealthInfo>('get_device_health', { hostname });
}

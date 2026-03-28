import { invoke } from '@tauri-apps/api/core';
import type { DeviceDetail, HealthInfo } from '$lib/types/device-detail.types.js';

/**
 * Fetch full device detail (system info, interfaces, BGP, config).
 * Calls the `get_device_detail` Tauri command.
 */
export async function getDeviceDetail(hostname: string): Promise<DeviceDetail> {
	return invoke<DeviceDetail>('get_device_detail', { hostname });
}

/**
 * Fetch live health metrics (CPU, memory, temperature) for a device.
 * Calls the `get_device_health` Tauri command.
 */
export async function getDeviceHealth(hostname: string): Promise<HealthInfo> {
	return invoke<HealthInfo>('get_device_health', { hostname });
}

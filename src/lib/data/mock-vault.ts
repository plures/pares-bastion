import type { VaultCredential, VaultResolveResult, VaultStatus } from '$lib/types/vault.types.js';

export const mockVaultStatus: VaultStatus = {
	unlocked: false,
	personalCount: 4,
	sharedCount: 0,
	sharedAvailable: false,
};

export const mockCredentials: VaultCredential[] = [
	{
		id: 'default-1',
		vaultType: 'personal',
		scope: 'default',
		username: 'admin',
		authMethod: 'password',
		hasEnableSecret: true
	},
	{
		id: 'group-1',
		vaultType: 'personal',
		scope: 'group',
		target: '10.0.1.*',
		username: 'netops',
		authMethod: 'password',
		hasEnableSecret: false
	},
	{
		id: 'group-2',
		vaultType: 'personal',
		scope: 'group',
		target: 'core-*',
		username: 'svcacct',
		authMethod: 'key',
		hasEnableSecret: true
	},
	{
		id: 'device-1',
		vaultType: 'personal',
		scope: 'device',
		target: 'core-rtr-01',
		username: 'admin',
		authMethod: 'password',
		hasEnableSecret: true
	}
];

export const mockResolveResult: VaultResolveResult = {
	hostname: 'core-rtr-01',
	resolved: {
		id: 'device-1',
		vaultType: 'personal',
		scope: 'device',
		target: 'core-rtr-01',
		username: 'admin',
		authMethod: 'password',
		hasEnableSecret: true
	},
	explanation: 'Device-specific credential matched for "core-rtr-01".'
};

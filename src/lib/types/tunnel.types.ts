// ─── SSH Tunnel Types ───────────────────────────────────────────────────────

export type TunnelType = 'local-forward' | 'dynamic-socks';
export type TunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface TunnelProfile {
	id: string;
	name: string;
	type: TunnelType;
	/** Bastion/jump host */
	bastionHost: string;
	bastionPort: number;
	/** Credentials — use vault ID if available, otherwise inline */
	vaultCredentialId: string | null;
	bastionUsername: string;
	/** For local-forward: target network CIDR or specific host:port */
	targetNetwork: string | null;
	localPort: number;
	remoteHost: string | null;
	remotePort: number | null;
	/** Auto-connect when app starts */
	autoConnect: boolean;
	/** Keep alive interval in seconds (0 = disabled) */
	keepAliveInterval: number;
	/** Auto-reconnect on disconnect */
	autoReconnect: boolean;
	/** Max reconnect attempts (0 = infinite) */
	maxReconnectAttempts: number;
}

export interface TunnelState {
	profileId: string;
	status: TunnelStatus;
	connectedAt: number | null;
	lastError: string | null;
	latencyMs: number | null;
	bytesTransferred: number;
	reconnectAttempts: number;
}

export interface TunnelEvent {
	type: 'connected' | 'disconnected' | 'error' | 'latency';
	profileId: string;
	timestamp: number;
	message?: string;
	latencyMs?: number;
}

// ─── Default Profile ────────────────────────────────────────────────────────

export function createDefaultProfile(): Omit<TunnelProfile, 'id'> {
	return {
		name: '',
		type: 'local-forward',
		bastionHost: '',
		bastionPort: 22,
		vaultCredentialId: null,
		bastionUsername: '',
		targetNetwork: null,
		localPort: 10022,
		remoteHost: null,
		remotePort: null,
		autoConnect: false,
		keepAliveInterval: 60,
		autoReconnect: true,
		maxReconnectAttempts: 5,
	};
}

import type {
	TunnelProfile,
	TunnelState,
	TunnelEvent,
	TunnelStatus,
} from '$lib/types/tunnel.types.js';
import { createDefaultProfile } from '$lib/types/tunnel.types.js';

const TUNNEL_STORAGE_KEY = 'netops-toolkit-tunnels';

// ─── Mock tunnel states for development ─────────────────────────────────────

const mockProfiles: TunnelProfile[] = [
	{
		id: 'tun-1',
		name: 'NYC-DC1 Bastion',
		type: 'local-forward',
		bastionHost: 'bastion.nyc.corp.example.com',
		bastionPort: 22,
		vaultCredentialId: 'default-1',
		bastionUsername: 'admin',
		targetNetwork: '10.0.0.0/16',
		localPort: 10022,
		remoteHost: null,
		remotePort: null,
		autoConnect: false,
		keepAliveInterval: 60,
		autoReconnect: true,
		maxReconnectAttempts: 5,
	},
	{
		id: 'tun-2',
		name: 'LON-DC2 SOCKS',
		type: 'dynamic-socks',
		bastionHost: 'jump.lon.corp.example.com',
		bastionPort: 2222,
		vaultCredentialId: null,
		bastionUsername: 'netops',
		targetNetwork: null,
		localPort: 1080,
		remoteHost: null,
		remotePort: null,
		autoConnect: false,
		keepAliveInterval: 30,
		autoReconnect: true,
		maxReconnectAttempts: 10,
	},
	{
		id: 'tun-3',
		name: 'SYD-DC3 Direct',
		type: 'local-forward',
		bastionHost: '203.0.113.50',
		bastionPort: 22,
		vaultCredentialId: 'group-1',
		bastionUsername: 'svcacct',
		targetNetwork: '10.0.2.0/24',
		localPort: 10023,
		remoteHost: '10.0.2.1',
		remotePort: 22,
		autoConnect: true,
		keepAliveInterval: 60,
		autoReconnect: true,
		maxReconnectAttempts: 3,
	},
];

// ─── Tunnel Store (Svelte 5 runes) ─────────────────────────────────────────

class TunnelStore {
	profiles = $state<TunnelProfile[]>([]);
	states = $state<Map<string, TunnelState>>(new Map());
	events = $state<TunnelEvent[]>([]);

	constructor() {
		this.load();
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private load(): void {
		if (typeof localStorage === 'undefined') {
			this.profiles = [...mockProfiles];
			this.initStates();
			return;
		}
		const raw = localStorage.getItem(TUNNEL_STORAGE_KEY);
		if (raw) {
			try {
				this.profiles = JSON.parse(raw) as TunnelProfile[];
			} catch {
				this.profiles = [...mockProfiles];
			}
		} else {
			this.profiles = [...mockProfiles];
		}
		this.initStates();
	}

	private save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(TUNNEL_STORAGE_KEY, JSON.stringify(this.profiles));
	}

	private initStates(): void {
		const newStates = new Map<string, TunnelState>();
		for (const profile of this.profiles) {
			newStates.set(profile.id, {
				profileId: profile.id,
				status: 'disconnected',
				connectedAt: null,
				lastError: null,
				latencyMs: null,
				bytesTransferred: 0,
				reconnectAttempts: 0,
			});
		}
		this.states = newStates;
	}

	// ── Queries ──────────────────────────────────────────────────────────────

	getState(profileId: string): TunnelState | undefined {
		return this.states.get(profileId);
	}

	get connectedCount(): number {
		let count = 0;
		for (const state of this.states.values()) {
			if (state.status === 'connected') count++;
		}
		return count;
	}

	get activeProfiles(): TunnelProfile[] {
		return this.profiles.filter((p) => {
			const state = this.states.get(p.id);
			return state?.status === 'connected';
		});
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	addProfile(profile: Omit<TunnelProfile, 'id'>): TunnelProfile {
		const id = `tun-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const newProfile: TunnelProfile = { ...profile, id };
		this.profiles = [...this.profiles, newProfile];
		this.states.set(id, {
			profileId: id,
			status: 'disconnected',
			connectedAt: null,
			lastError: null,
			latencyMs: null,
			bytesTransferred: 0,
			reconnectAttempts: 0,
		});
		this.save();
		return newProfile;
	}

	updateProfile(id: string, updates: Partial<TunnelProfile>): void {
		this.profiles = this.profiles.map((p) =>
			p.id === id ? { ...p, ...updates } : p,
		);
		this.save();
	}

	deleteProfile(id: string): void {
		this.profiles = this.profiles.filter((p) => p.id !== id);
		this.states.delete(id);
		this.save();
	}

	async connect(profileId: string): Promise<void> {
		const state = this.states.get(profileId);
		if (!state) return;

		state.status = 'connecting';
		state.lastError = null;
		this.states = new Map(this.states);

		// TODO: In production, invoke Tauri command to create SSH tunnel
		// For now, simulate connection
		await new Promise((resolve) => setTimeout(resolve, 1500));

		state.status = 'connected';
		state.connectedAt = Date.now();
		state.latencyMs = Math.floor(Math.random() * 50) + 10;
		this.states = new Map(this.states);

		this.events = [
			...this.events,
			{
				type: 'connected',
				profileId,
				timestamp: Date.now(),
				message: `Connected to ${this.profiles.find((p) => p.id === profileId)?.bastionHost}`,
			},
		];
	}

	async disconnect(profileId: string): Promise<void> {
		const state = this.states.get(profileId);
		if (!state) return;

		// TODO: In production, invoke Tauri command to close SSH tunnel
		state.status = 'disconnected';
		state.connectedAt = null;
		state.latencyMs = null;
		state.bytesTransferred = 0;
		state.reconnectAttempts = 0;
		this.states = new Map(this.states);

		this.events = [
			...this.events,
			{
				type: 'disconnected',
				profileId,
				timestamp: Date.now(),
				message: 'Tunnel closed',
			},
		];
	}
}

export const tunnelStore = new TunnelStore();

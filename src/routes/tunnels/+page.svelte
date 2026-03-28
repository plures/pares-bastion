<script lang="ts">
	import { Button, Badge, Table, StatusBar, StatusBarItem, StatusBarSpacer } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import { tunnelStore } from '$lib/stores/tunnels.svelte.js';
	import { createDefaultProfile, type TunnelProfile, type TunnelType } from '$lib/types/tunnel.types.js';
	import LicenseGate from '$lib/components/LicenseGate.svelte';

	const getTui = useTui();
	let tui = $derived(getTui());

	type TunnelView = 'list' | 'form';

	let view = $state<TunnelView>('list');
	let editingId = $state<string | null>(null);

	// Form state
	let formName = $state('');
	let formType = $state<TunnelType>('local-forward');
	let formBastionHost = $state('');
	let formBastionPort = $state(22);
	let formBastionUsername = $state('');
	let formTargetNetwork = $state('');
	let formLocalPort = $state(10022);
	let formRemoteHost = $state('');
	let formRemotePort = $state(22);
	let formAutoConnect = $state(false);
	let formKeepAlive = $state(60);
	let formAutoReconnect = $state(true);
	let errorMsg = $state('');

	// ── Table data ──────────────────────────────────────────────────────────

	const columns = [
		{ key: 'name', label: 'Name', width: 18 },
		{ key: 'type', label: 'Type', width: 14 },
		{ key: 'bastion', label: 'Bastion', width: 28 },
		{ key: 'target', label: 'Target', width: 16 },
		{ key: 'localPort', label: 'Local Port', width: 10 },
		{ key: 'status', label: 'Status', width: 12 },
	];

	let rows = $derived(
		tunnelStore.profiles.map((p) => {
			const state = tunnelStore.getState(p.id);
			return {
				name: p.name,
				type: p.type === 'local-forward' ? 'L-Forward' : 'SOCKS5',
				bastion: `${p.bastionUsername}@${p.bastionHost}:${p.bastionPort}`,
				target: p.targetNetwork ?? '(dynamic)',
				localPort: String(p.localPort),
				status: state?.status ?? 'unknown',
			};
		}),
	);

	let selectedIndex = $state<number | undefined>(undefined);

	// ── Actions ─────────────────────────────────────────────────────────────

	function openAddForm(): void {
		editingId = null;
		const defaults = createDefaultProfile();
		formName = defaults.name;
		formType = defaults.type;
		formBastionHost = defaults.bastionHost;
		formBastionPort = defaults.bastionPort;
		formBastionUsername = defaults.bastionUsername;
		formTargetNetwork = defaults.targetNetwork ?? '';
		formLocalPort = defaults.localPort;
		formRemoteHost = defaults.remoteHost ?? '';
		formRemotePort = defaults.remotePort ?? 22;
		formAutoConnect = defaults.autoConnect;
		formKeepAlive = defaults.keepAliveInterval;
		formAutoReconnect = defaults.autoReconnect;
		errorMsg = '';
		view = 'form';
	}

	function openEditForm(profile: TunnelProfile): void {
		editingId = profile.id;
		formName = profile.name;
		formType = profile.type;
		formBastionHost = profile.bastionHost;
		formBastionPort = profile.bastionPort;
		formBastionUsername = profile.bastionUsername;
		formTargetNetwork = profile.targetNetwork ?? '';
		formLocalPort = profile.localPort;
		formRemoteHost = profile.remoteHost ?? '';
		formRemotePort = profile.remotePort ?? 22;
		formAutoConnect = profile.autoConnect;
		formKeepAlive = profile.keepAliveInterval;
		formAutoReconnect = profile.autoReconnect;
		errorMsg = '';
		view = 'form';
	}

	function handleSave(): void {
		if (!formName.trim()) { errorMsg = 'Name is required.'; return; }
		if (!formBastionHost.trim()) { errorMsg = 'Bastion host is required.'; return; }
		if (!formBastionUsername.trim()) { errorMsg = 'Username is required.'; return; }

		const data = {
			name: formName.trim(),
			type: formType,
			bastionHost: formBastionHost.trim(),
			bastionPort: formBastionPort,
			vaultCredentialId: null,
			bastionUsername: formBastionUsername.trim(),
			targetNetwork: formTargetNetwork.trim() || null,
			localPort: formLocalPort,
			remoteHost: formRemoteHost.trim() || null,
			remotePort: formRemotePort || null,
			autoConnect: formAutoConnect,
			keepAliveInterval: formKeepAlive,
			autoReconnect: formAutoReconnect,
			maxReconnectAttempts: 5,
		};

		if (editingId) {
			tunnelStore.updateProfile(editingId, data);
		} else {
			tunnelStore.addProfile(data);
		}
		view = 'list';
	}

	function handleDelete(id: string): void {
		tunnelStore.deleteProfile(id);
	}

	function handleSelectRow(index: number): void {
		selectedIndex = index;
		const profile = tunnelStore.profiles[index];
		if (profile) openEditForm(profile);
	}

	function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
		switch (status) {
			case 'connected': return 'success';
			case 'connecting':
			case 'reconnecting': return 'warning';
			case 'error': return 'danger';
			default: return 'neutral';
		}
	}
</script>

<LicenseGate feature="tunneling" currentCount={tunnelStore.profiles.length}>

{#if tui}
	<div class="tunnels-page tui">
		{#if view === 'list'}
			<div class="header">
				<span class="title">SSH TUNNELS</span>
				<span class="info">{tunnelStore.connectedCount} connected / {tunnelStore.profiles.length} configured</span>
			</div>
			<Table {columns} {rows} selected={selectedIndex} onselect={handleSelectRow} tui={true} />

			<!-- Tunnel details for each -->
			{#each tunnelStore.profiles as profile}
				{@const state = tunnelStore.getState(profile.id)}
				<div class="tui-tunnel-row">
					<span class="tui-name">{profile.name}</span>
					<span class="tui-status" class:connected={state?.status === 'connected'} class:error={state?.status === 'error'}>
						{state?.status ?? 'unknown'}
					</span>
					{#if state?.latencyMs}
						<span class="tui-latency">{state.latencyMs}ms</span>
					{/if}
					{#if state?.status === 'disconnected'}
						<span role="button" tabindex="0"
							onclick={() => tunnelStore.connect(profile.id)}
							onkeydown={(e) => { if (e.key === 'Enter') tunnelStore.connect(profile.id); }}
						>[C] Connect</span>
					{:else if state?.status === 'connected'}
						<span role="button" tabindex="0"
							onclick={() => tunnelStore.disconnect(profile.id)}
							onkeydown={(e) => { if (e.key === 'Enter') tunnelStore.disconnect(profile.id); }}
						>[D] Disconnect</span>
					{/if}
				</div>
			{/each}

			<div class="tui-actions">
				<span>[A] Add</span>
				<span>[Enter] Edit</span>
				<span>[C] Connect</span>
				<span>[D] Disconnect</span>
				<span>[X] Delete</span>
			</div>

		{:else}
			<div class="header">
				<span class="title">{editingId ? 'EDIT TUNNEL' : 'ADD TUNNEL'}</span>
			</div>
			<div class="tui-form">
				<div class="form-row">
					<label for="t-name">Name: </label>
					<input id="t-name" type="text" bind:value={formName} class="tui-input" aria-label="Tunnel name" />
				</div>
				<div class="form-row">
					<label for="t-type">Type [local-forward/dynamic-socks]: </label>
					<input id="t-type" type="text" bind:value={formType} class="tui-input" aria-label="Tunnel type" />
				</div>
				<div class="form-row">
					<label for="t-bastion">Bastion: </label>
					<input id="t-bastion" type="text" bind:value={formBastionHost} class="tui-input" aria-label="Bastion host" />
				</div>
				<div class="form-row">
					<label for="t-user">Username: </label>
					<input id="t-user" type="text" bind:value={formBastionUsername} class="tui-input" aria-label="Username" />
				</div>
				<div class="form-row">
					<label for="t-target">Target Network: </label>
					<input id="t-target" type="text" bind:value={formTargetNetwork} class="tui-input" placeholder="10.0.0.0/16" aria-label="Target network" />
				</div>
				<div class="form-row">
					<label for="t-local">Local Port: </label>
					<input id="t-local" type="number" bind:value={formLocalPort} class="tui-input short" aria-label="Local port" />
				</div>
				{#if errorMsg}<div class="tui-error">{errorMsg}</div>{/if}
				<div class="tui-actions">
					<span role="button" tabindex="0" onclick={handleSave} onkeydown={(e) => { if (e.key === 'Enter') handleSave(); }}>[Enter] Save</span>
					<span role="button" tabindex="0" onclick={() => { view = 'list'; }} onkeydown={(e) => { if (e.key === 'Enter') view = 'list'; }}>[Esc] Cancel</span>
				</div>
			</div>
		{/if}
	</div>

{:else}
	<div class="tunnels-page gui">
		<div class="toolbar">
			<h2>SSH Tunnels</h2>
			<div class="toolbar-info">
				<Badge variant={tunnelStore.connectedCount > 0 ? 'success' : 'neutral'} size="sm">
					{tunnelStore.connectedCount} connected
				</Badge>
			</div>
			<div class="toolbar-actions">
				<Button variant="solid" onclick={openAddForm}>＋ Add Tunnel</Button>
			</div>
		</div>

		{#if view === 'form'}
			<div class="form-card">
				<h3>{editingId ? 'Edit Tunnel' : 'New Tunnel'}</h3>

				<div class="form-grid">
					<div class="field">
						<label for="gui-t-name">Name</label>
						<input id="gui-t-name" type="text" bind:value={formName} placeholder="NYC-DC1 Bastion" class="text-input" />
					</div>
					<div class="field">
						<label for="gui-t-type">Type</label>
						<select id="gui-t-type" bind:value={formType} class="select-input">
							<option value="local-forward">Local Forward (-L)</option>
							<option value="dynamic-socks">SOCKS Proxy (-D)</option>
						</select>
					</div>
					<div class="field">
						<label for="gui-t-bastion">Bastion Host</label>
						<input id="gui-t-bastion" type="text" bind:value={formBastionHost} placeholder="bastion.corp.example.com" class="text-input" />
					</div>
					<div class="field">
						<label for="gui-t-port">Bastion Port</label>
						<input id="gui-t-port" type="number" bind:value={formBastionPort} class="text-input number" min="1" max="65535" />
					</div>
					<div class="field">
						<label for="gui-t-user">Username</label>
						<input id="gui-t-user" type="text" bind:value={formBastionUsername} placeholder="admin" class="text-input" />
					</div>
					<div class="field">
						<label for="gui-t-local">Local Port</label>
						<input id="gui-t-local" type="number" bind:value={formLocalPort} class="text-input number" min="1024" max="65535" />
					</div>
					{#if formType === 'local-forward'}
						<div class="field span-2">
							<label for="gui-t-target">Target Network / CIDR</label>
							<input id="gui-t-target" type="text" bind:value={formTargetNetwork} placeholder="10.0.0.0/16" class="text-input" />
						</div>
						<div class="field">
							<label for="gui-t-rhost">Remote Host (optional)</label>
							<input id="gui-t-rhost" type="text" bind:value={formRemoteHost} placeholder="10.0.0.1" class="text-input" />
						</div>
						<div class="field">
							<label for="gui-t-rport">Remote Port</label>
							<input id="gui-t-rport" type="number" bind:value={formRemotePort} class="text-input number" min="1" max="65535" />
						</div>
					{/if}
					<div class="field checkbox-field">
						<label>
							<input type="checkbox" bind:checked={formAutoConnect} /> Auto-connect on start
						</label>
					</div>
					<div class="field checkbox-field">
						<label>
							<input type="checkbox" bind:checked={formAutoReconnect} /> Auto-reconnect
						</label>
					</div>
					<div class="field">
						<label for="gui-t-keepalive">Keep Alive (seconds)</label>
						<input id="gui-t-keepalive" type="number" bind:value={formKeepAlive} class="text-input number" min="0" max="600" />
					</div>
				</div>

				{#if errorMsg}<p class="error-msg">{errorMsg}</p>{/if}
				<div class="form-actions">
					<Button variant="solid" onclick={handleSave}>{editingId ? 'Update' : 'Create Tunnel'}</Button>
					<Button variant="outline" onclick={() => { view = 'list'; }}>Cancel</Button>
				</div>
			</div>

		{:else}
			<div class="tunnel-list">
				{#each tunnelStore.profiles as profile}
					{@const state = tunnelStore.getState(profile.id)}
					<div class="tunnel-card">
						<div class="tunnel-header">
							<div class="tunnel-info">
								<h3>{profile.name}</h3>
								<span class="tunnel-type">
									<Badge variant="neutral" size="sm">
										{profile.type === 'local-forward' ? 'Local Forward' : 'SOCKS5 Proxy'}
									</Badge>
								</span>
							</div>
							<Badge variant={statusVariant(state?.status ?? 'disconnected')} size="sm">
								{state?.status ?? 'unknown'}
								{#if state?.latencyMs} ({state.latencyMs}ms){/if}
							</Badge>
						</div>

						<dl class="tunnel-detail">
							<dt>Bastion</dt>
							<dd class="mono">{profile.bastionUsername}@{profile.bastionHost}:{profile.bastionPort}</dd>
							{#if profile.targetNetwork}
								<dt>Target</dt>
								<dd class="mono">{profile.targetNetwork}</dd>
							{/if}
							<dt>Local Port</dt>
							<dd class="mono">localhost:{profile.localPort}</dd>
							{#if profile.remoteHost}
								<dt>Remote</dt>
								<dd class="mono">{profile.remoteHost}:{profile.remotePort}</dd>
							{/if}
						</dl>

						<div class="tunnel-actions">
							{#if state?.status === 'disconnected'}
								<Button variant="solid" onclick={() => tunnelStore.connect(profile.id)}>
									▶ Connect
								</Button>
							{:else if state?.status === 'connected'}
								<Button variant="ghost" onclick={() => tunnelStore.disconnect(profile.id)}>
									⏹ Disconnect
								</Button>
							{:else if state?.status === 'connecting'}
								<Button variant="ghost" disabled={true}>⏳ Connecting…</Button>
							{/if}
							<Button variant="ghost" onclick={() => openEditForm(profile)}>✏️ Edit</Button>
							<Button variant="ghost" onclick={() => handleDelete(profile.id)}>🗑 Delete</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<StatusBar>
			<StatusBarItem label="Tunnels" value={String(tunnelStore.profiles.length)} />
			<StatusBarItem label="Connected" value={String(tunnelStore.connectedCount)} />
			<StatusBarSpacer />
			<StatusBarItem label="View" value="SSH Tunnels" />
		</StatusBar>
	</div>
{/if}

</LicenseGate>

<style>
	.tunnels-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

	/* TUI */
	.tunnels-page.tui { font-family: monospace; color: var(--color-text, #e0e0e0); }
	.tunnels-page.tui .header { display: flex; justify-content: space-between; padding: 0.5ch 0; border-bottom: 1px solid var(--tui-border, #0f3460); margin-bottom: 0.5ch; }
	.tunnels-page.tui .title { color: var(--color-accent, #7fefbd); font-weight: bold; }
	.tunnels-page.tui .info { color: var(--tui-text-dim, #888); }
	.tui-form { padding: 0.5ch 0; display: flex; flex-direction: column; gap: 0.5ch; }
	.form-row { display: flex; align-items: center; gap: 1ch; }
	.tui-input { background: transparent; border: 1px solid var(--tui-border, #444); color: inherit; font-family: monospace; padding: 0.25ch 0.5ch; width: 24ch; }
	.tui-input.short { width: 8ch; }
	.tui-error { color: var(--color-error, #f38ba8); }
	.tui-tunnel-row { display: flex; gap: 2ch; align-items: center; padding: 0.25ch 0; }
	.tui-name { color: var(--color-text, #e0e0e0); min-width: 16ch; }
	.tui-status { color: var(--tui-text-dim, #888); }
	.tui-status.connected { color: var(--color-success, #56d364); }
	.tui-status.error { color: var(--color-error, #f38ba8); }
	.tui-latency { color: var(--color-accent, #79c0ff); font-size: 0.875em; }
	.tui-actions { display: flex; gap: 2ch; padding: 0.5ch 0; border-top: 1px solid var(--tui-border, #0f3460); color: var(--tui-text-dim, #888); font-size: 0.875rem; margin-top: auto; }

	/* GUI */
	.toolbar { display: flex; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border, #333); flex-shrink: 0; gap: 0.75rem; }
	.toolbar h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
	.toolbar-actions { margin-left: auto; }
	.tunnel-list { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.tunnel-card { background: var(--color-bg-card, #24283b); border: 1px solid var(--color-border, #3b4261); border-radius: 8px; padding: 1rem; }
	.tunnel-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
	.tunnel-info { display: flex; align-items: center; gap: 0.75rem; }
	.tunnel-info h3 { margin: 0; font-size: 1rem; color: var(--color-text, #c0caf5); }
	.tunnel-detail { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0 0 0.75rem; font-size: 0.875rem; }
	.tunnel-detail dt { color: var(--color-text-secondary, #565f89); font-weight: 500; }
	.tunnel-detail dd { margin: 0; color: var(--color-text, #c0caf5); }
	.tunnel-detail dd.mono { font-family: 'SF Mono', monospace; font-size: 0.8125rem; }
	.tunnel-actions { display: flex; gap: 0.5rem; }

	/* Form */
	.form-card { padding: 1.5rem; max-width: 680px; overflow-y: auto; flex: 1; }
	.form-card h3 { margin: 0 0 1rem; font-size: 1.1rem; color: var(--color-text, #c0caf5); }
	.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.field { display: flex; flex-direction: column; gap: 0.25rem; }
	.field label { font-size: 0.8125rem; font-weight: 500; color: var(--color-text-secondary, #a9b1d6); }
	.span-2 { grid-column: span 2; }
	.checkbox-field { flex-direction: row; align-items: center; gap: 0.5rem; }
	.checkbox-field label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
	.text-input, .select-input { padding: 0.5rem 0.75rem; border: 1px solid var(--color-border, #3b4261); border-radius: 4px; background: var(--color-bg, #1a1b26); color: var(--color-text, #c0caf5); font-size: 0.875rem; width: 100%; box-sizing: border-box; }
	.text-input.number { max-width: 100px; }
	.text-input:focus, .select-input:focus { outline: 2px solid var(--color-accent, #7aa2f7); outline-offset: 1px; }
	.error-msg { color: var(--color-error, #f85149); font-size: 0.875rem; margin: 0.5rem 0; }
	.form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
</style>

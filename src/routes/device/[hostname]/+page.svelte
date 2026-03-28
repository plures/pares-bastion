<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		SplitPane,
		Pane,
		Table,
		Badge,
		StatusBar,
		StatusBarItem,
		StatusBarSpacer,
		Button,
		useTui
	} from '@plures/design-dojo';
	import { getDeviceDetail, getDeviceHealth } from '$lib/services/device.js';
	import type {
		DeviceDetail,
		HealthInfo,
		InterfaceEntry,
		BgpPeer
	} from '$lib/types/device-detail.types.js';

	interface Props {
		data: { hostname: string };
	}

	let { data }: Props = $props();

	const getTui = useTui();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	type Tab = 'interfaces' | 'health' | 'bgp' | 'config';
	let activeTab = $state<Tab>('interfaces');

	let detail = $state<DeviceDetail | null>(null);
	let health = $state<HealthInfo | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// ---------------------------------------------------------------------------
	// Data loading
	// ---------------------------------------------------------------------------
	$effect(() => {
		loading = true;
		error = null;
		Promise.all([
			getDeviceDetail(data.hostname),
			getDeviceHealth(data.hostname)
		])
			.then(([d, h]) => {
				detail = d;
				health = h;
				loading = false;
			})
			.catch((e: unknown) => {
				error = e instanceof Error ? e.message : String(e);
				loading = false;
			});
	});

	// ---------------------------------------------------------------------------
	// Derived helpers
	// ---------------------------------------------------------------------------
	let isTui = $derived(getTui());

	let filteredConfig = $derived.by(() => {
		if (!detail) return '';
		if (!searchQuery) return detail.configOutput;
		return detail.configOutput
			.split('\n')
			.filter((line) => line.toLowerCase().includes(searchQuery.toLowerCase()))
			.join('\n');
	});

	let ifaceColumns = [
		{ key: 'name', label: 'Interface', width: 24 },
		{ key: 'status', label: 'Status', width: 10 },
		{ key: 'speed', label: 'Speed', width: 8 },
		{ key: 'inputErrors', label: 'In Err', width: 8 },
		{ key: 'outputErrors', label: 'Out Err', width: 8 },
		{ key: 'utilization', label: 'Util %', width: 8 }
	];

	let bgpColumns = [
		{ key: 'neighbor', label: 'Neighbor', width: 18 },
		{ key: 'remoteAs', label: 'Remote AS', width: 12 },
		{ key: 'state', label: 'State', width: 14 },
		{ key: 'prefixesReceived', label: 'Prefixes', width: 10 }
	];

	let ifaceRows = $derived(
		(detail?.interfaces ?? []).map((iface: InterfaceEntry) => ({
			name: iface.name,
			status: iface.status,
			speed: iface.speed,
			inputErrors: String(iface.inputErrors),
			outputErrors: String(iface.outputErrors),
			utilization: `${iface.utilization.toFixed(1)}%`
		}))
	);

	let bgpRows = $derived(
		(detail?.bgpPeers ?? []).map((peer: BgpPeer) => ({
			neighbor: peer.neighbor,
			remoteAs: String(peer.remoteAs),
			state: peer.state,
			prefixesReceived: String(peer.prefixesReceived)
		}))
	);

	const tabs: { id: Tab; label: string; tuiLabel: string }[] = [
		{ id: 'interfaces', label: 'Interfaces', tuiLabel: '[IFaces]' },
		{ id: 'health', label: 'Health', tuiLabel: '[Health]' },
		{ id: 'bgp', label: 'BGP', tuiLabel: '[BGP]' },
		{ id: 'config', label: 'Config', tuiLabel: '[Config]' }
	];

	function bgpStateBadgeVariant(
		state: string
	): 'success' | 'warning' | 'neutral' {
		if (state === 'Established') return 'success';
		if (state === 'Active') return 'warning';
		return 'neutral';
	}

	function gaugeBar(percent: number, width = 20): string {
		const filled = Math.round((percent / 100) * width);
		const empty = width - filled;
		return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
	}
</script>

<div class="device-page" class:tui={isTui}>
	<!-- Back button + hostname heading -->
	<div class="page-header">
		<Button variant="ghost" size="sm" tui={isTui} onclick={() => goto('/inventory')}>
			{isTui ? '< Back' : '← Back'}
		</Button>
		<h1 class="hostname">{data.hostname}</h1>
		{#if detail && !loading}
			<Badge variant="neutral" tui={isTui}>{detail.systemInfo.vendor}</Badge>
		{/if}
	</div>

	{#if loading}
		<p class="loading-msg">{isTui ? '[ loading... ]' : 'Loading device data…'}</p>
	{:else if error}
		<p class="error-msg">{isTui ? `! Error: ${error}` : `Error: ${error}`}</p>
	{:else if detail}
		<SplitPane direction="horizontal" tui={isTui}>
			<!-- System info panel (left) -->
			<Pane tui={isTui} flex={0} title={isTui ? undefined : 'System Info'}>
			{#if isTui}
				<div class="sys-info tui">
					<div class="sys-title">SYSTEM INFO</div>
					<div class="sys-row"><span class="sys-key">Hostname</span><span class="sys-val">{detail.systemInfo.hostname}</span></div>
					<div class="sys-row"><span class="sys-key">IP      </span><span class="sys-val">{detail.systemInfo.ip}</span></div>
					<div class="sys-row"><span class="sys-key">Vendor  </span><span class="sys-val">{detail.systemInfo.vendor}</span></div>
					<div class="sys-row"><span class="sys-key">Model   </span><span class="sys-val">{detail.systemInfo.model}</span></div>
					<div class="sys-row"><span class="sys-key">Version </span><span class="sys-val">{detail.systemInfo.version}</span></div>
					<div class="sys-row"><span class="sys-key">Serial  </span><span class="sys-val">{detail.systemInfo.serial}</span></div>
					<div class="sys-row"><span class="sys-key">Uptime  </span><span class="sys-val">{detail.systemInfo.uptime}</span></div>
				</div>
			{:else}
				<div class="sys-info gui">
					<dl>
						<div class="info-row"><dt>Hostname</dt><dd>{detail.systemInfo.hostname}</dd></div>
						<div class="info-row"><dt>IP</dt><dd>{detail.systemInfo.ip}</dd></div>
						<div class="info-row"><dt>Vendor</dt><dd>{detail.systemInfo.vendor}</dd></div>
						<div class="info-row"><dt>Model</dt><dd>{detail.systemInfo.model}</dd></div>
						<div class="info-row"><dt>Version</dt><dd>{detail.systemInfo.version}</dd></div>
						<div class="info-row"><dt>Serial</dt><dd>{detail.systemInfo.serial}</dd></div>
						<div class="info-row"><dt>Uptime</dt><dd>{detail.systemInfo.uptime}</dd></div>
					</dl>
				</div>
			{/if}
			</Pane>

			<!-- Tab area (right) -->
			<Pane tui={isTui} flex={1} scrollable>
				<!-- Tab bar -->
				<div class="tab-bar" role="tablist" aria-label="Device detail tabs">
					{#each tabs as tab}
						<button
							role="tab"
							class="tab-btn"
							class:active={activeTab === tab.id}
							aria-selected={activeTab === tab.id}
							onclick={() => { activeTab = tab.id; }}
						>
							{isTui ? tab.tuiLabel : tab.label}
						</button>
					{/each}
				</div>

				<!-- Tab panels -->
				<div class="tab-panel" role="tabpanel">
					{#if activeTab === 'interfaces'}
						{#if isTui}
							<div class="tui-table">
								<div class="tui-header">
									<span style="min-width:24ch">Interface</span>
									<span style="min-width:10ch">Status</span>
									<span style="min-width:8ch">Speed</span>
									<span style="min-width:8ch">InErr</span>
									<span style="min-width:8ch">OutErr</span>
									<span style="min-width:8ch">Util%</span>
								</div>
								{#each detail.interfaces as iface}
									<div class="tui-row">
										<span style="min-width:24ch">{iface.name}</span>
										<span style="min-width:10ch" class:up={iface.status==='up'} class:down={iface.status!=='up'}>{iface.status}</span>
										<span style="min-width:8ch">{iface.speed}</span>
										<span style="min-width:8ch">{iface.inputErrors}</span>
										<span style="min-width:8ch">{iface.outputErrors}</span>
										<span style="min-width:8ch">{iface.utilization.toFixed(1)}%</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="iface-table-wrap">
								<Table
									tui={false}
									columns={ifaceColumns}
									rows={ifaceRows}
								/>
							</div>
						{/if}
					{:else if activeTab === 'health'}
						{#if isTui}
							<div class="tui-health">
								<div class="health-metric">
									<span class="metric-label">CPU    </span>
									<span class="metric-bar">{gaugeBar(health?.cpuPercent ?? 0)}</span>
									<span class="metric-value">{(health?.cpuPercent ?? 0).toFixed(1)}%</span>
								</div>
								<div class="health-metric">
									<span class="metric-label">Memory </span>
									<span class="metric-bar">{gaugeBar(health?.memoryPercent ?? 0)}</span>
									<span class="metric-value">{(health?.memoryPercent ?? 0).toFixed(1)}%</span>
								</div>
								{#if health?.temperatureCelsius != null}
									<div class="health-metric">
										<span class="metric-label">Temp   </span>
										<span class="metric-bar">{gaugeBar(Math.min(100, ((health.temperatureCelsius - 20) / 60) * 100))}</span>
										<span class="metric-value">{health.temperatureCelsius.toFixed(0)}°C</span>
									</div>
								{/if}
							</div>
						{:else}
							<div class="health-gauges">
								<div class="gauge-card">
									<div class="gauge-label">CPU</div>
									<div class="gauge-bar-wrap" role="progressbar" aria-valuenow={health?.cpuPercent ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="CPU usage">
										<div class="gauge-fill" style="width:{health?.cpuPercent ?? 0}%;background:var(--color-accent,#89b4fa)"></div>
									</div>
									<div class="gauge-value">{(health?.cpuPercent ?? 0).toFixed(1)}%</div>
								</div>
								<div class="gauge-card">
									<div class="gauge-label">Memory</div>
									<div class="gauge-bar-wrap" role="progressbar" aria-valuenow={health?.memoryPercent ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Memory usage">
										<div class="gauge-fill" style="width:{health?.memoryPercent ?? 0}%;background:var(--color-success,#a6e3a1)"></div>
									</div>
									<div class="gauge-value">{(health?.memoryPercent ?? 0).toFixed(1)}%</div>
								</div>
								{#if health?.temperatureCelsius != null}
									<div class="gauge-card">
										<div class="gauge-label">Temperature</div>
										<div class="gauge-bar-wrap" role="progressbar" aria-valuenow={health.temperatureCelsius} aria-valuemin={0} aria-valuemax={100} aria-label="Temperature">
											<div class="gauge-fill" style="width:{Math.min(100,((health.temperatureCelsius-20)/60)*100)}%;background:var(--color-warning,#f9e2af)"></div>
										</div>
										<div class="gauge-value">{health.temperatureCelsius.toFixed(0)}°C</div>
									</div>
								{/if}
							</div>
						{/if}
					{:else if activeTab === 'bgp'}
						{#if isTui}
							<div class="tui-table">
								<div class="tui-header">
									<span style="min-width:18ch">Neighbor</span>
									<span style="min-width:12ch">Remote AS</span>
									<span style="min-width:14ch">State</span>
									<span style="min-width:10ch">Prefixes</span>
								</div>
								{#each detail.bgpPeers as peer}
									<div class="tui-row">
										<span style="min-width:18ch">{peer.neighbor}</span>
										<span style="min-width:12ch">{peer.remoteAs}</span>
										<span style="min-width:14ch" class:up={peer.state==='Established'} class:warning={peer.state==='Active'} class:down={peer.state!=='Established'&&peer.state!=='Active'}>{peer.state}</span>
										<span style="min-width:10ch">{peer.prefixesReceived}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="bgp-table-wrap">
								<Table
									tui={false}
									columns={bgpColumns}
									rows={bgpRows}
								/>
								<div class="bgp-badges">
									{#each detail.bgpPeers as peer}
										<span class="bgp-badge-wrap">
											<Badge variant={bgpStateBadgeVariant(peer.state)} tui={false}>
												{peer.neighbor} — {peer.state}
											</Badge>
										</span>
									{/each}
								</div>
							</div>
						{/if}
					{:else if activeTab === 'config'}
						<div class="config-panel" class:tui={isTui}>
							<div class="config-search">
								<input
									type="search"
									class="config-search-input"
									placeholder={isTui ? 'filter lines…' : 'Filter config lines…'}
									bind:value={searchQuery}
									aria-label="Filter config output"
								/>
							</div>
							<pre class="config-output" role="region" aria-label="Device configuration output">{filteredConfig}</pre>
						</div>
					{/if}
				</div>
			</Pane>
		</SplitPane>

		<!-- Status bar -->
		<StatusBar tui={isTui} position="bottom">
			<StatusBarItem label="Device" value={data.hostname} />
			<StatusBarItem label="Model" value={detail.systemInfo.model} separator />
			<StatusBarSpacer />
			<StatusBarItem label="Version" value={detail.systemInfo.version} color="accent" />
		</StatusBar>
	{/if}
</div>

<style>
	.device-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: var(--surface-1, #141414);
		color: var(--color-text, #e8e8e8);
	}

	.device-page.tui {
		background: var(--tui-bg, #0d0d0d);
		color: var(--tui-text, #e0e0e0);
		font-family: monospace;
	}

	/* Page header */
	.page-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: var(--surface-2, #1e1e1e);
		border-bottom: 1px solid var(--color-border, #2a2a2a);
		flex-shrink: 0;
	}

	.tui .page-header {
		background: var(--tui-surface, #16213e);
		border-bottom: 1px solid var(--tui-border, #0f3460);
	}

	.hostname {
		font-size: 1.125rem;
		font-weight: 700;
		margin: 0;
		color: var(--color-text, #e8e8e8);
	}

	.tui .hostname {
		font-size: 1rem;
		font-family: monospace;
	}

	.loading-msg,
	.error-msg {
		padding: 32px;
		text-align: center;
		color: var(--color-text-muted, #888);
	}

	.error-msg {
		color: var(--color-error, #f38ba8);
	}

	/* System info panel */
	.sys-info.gui {
		width: 220px;
		min-width: 220px;
		padding: 16px;
		overflow: auto;
	}

	.sys-info.gui dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.info-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.info-row dt {
		font-size: 0.6875rem;
		text-transform: uppercase;
		color: var(--color-text-muted, #888);
		letter-spacing: 0.03em;
	}

	.info-row dd {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text, #e8e8e8);
	}

	/* TUI sys-info */
	.sys-info.tui {
		width: 32ch;
		min-width: 32ch;
		padding: 1ch;
		font-family: monospace;
		font-size: 0.875rem;
		overflow: auto;
	}

	.sys-title {
		font-weight: bold;
		margin-bottom: 1ch;
		color: var(--color-accent, #7fefbd);
	}

	.sys-row {
		display: flex;
		gap: 1ch;
		margin-bottom: 0.25ch;
	}

	.sys-key {
		color: var(--tui-text-dim, #888);
		min-width: 10ch;
	}

	.sys-val {
		color: var(--tui-text, #e0e0e0);
	}

	/* Tab bar */
	.tab-bar {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--color-border, #2a2a2a);
		background: var(--surface-2, #1e1e1e);
		flex-shrink: 0;
	}

	.tui .tab-bar {
		background: var(--tui-surface, #16213e);
		border-bottom: 1px solid var(--tui-border, #0f3460);
	}

	.tab-btn {
		padding: 8px 16px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-muted, #888);
		cursor: pointer;
		font-size: 0.875rem;
		font-family: inherit;
		transition: color 0.15s ease, border-color 0.15s ease;
	}

	.tui .tab-btn {
		font-family: monospace;
		padding: 4px 8px;
	}

	.tab-btn.active {
		color: var(--color-accent, #89b4fa);
		border-bottom-color: var(--color-accent, #89b4fa);
	}

	.tui .tab-btn.active {
		color: var(--color-accent, #7fefbd);
		border-bottom-color: var(--color-accent, #7fefbd);
	}

	.tab-btn:hover:not(.active) {
		color: var(--color-text, #e8e8e8);
	}

	.tab-btn:focus-visible {
		outline: 2px solid var(--color-accent, #89b4fa);
		outline-offset: -2px;
	}

	/* Tab panel */
	.tab-panel {
		flex: 1;
		overflow: auto;
		padding: 8px;
	}

	.tui .tab-panel {
		padding: 1ch;
	}

	/* Interface table */
	.iface-table-wrap,
	.bgp-table-wrap {
		overflow: auto;
	}

	.bgp-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 0;
	}

	/* TUI table */
	.tui-table {
		font-family: monospace;
		font-size: 0.875rem;
	}

	.tui-header {
		display: flex;
		gap: 1ch;
		font-weight: bold;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		padding-bottom: 0.5ch;
		margin-bottom: 0.5ch;
		color: var(--color-accent, #7fefbd);
	}

	.tui-row {
		display: flex;
		gap: 1ch;
		padding: 0.25ch 0;
		border-bottom: 1px solid rgba(15, 52, 96, 0.3);
	}

	.tui-row:hover {
		background: rgba(127, 239, 189, 0.05);
	}

	.tui-row .up {
		color: var(--color-success-tui, #7fefbd);
	}

	.tui-row .down {
		color: var(--color-error-tui, #f38ba8);
	}

	.tui-row .warning {
		color: var(--color-warning-tui, #f9e2af);
	}

	/* Health gauges */
	.health-gauges {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 16px;
		max-width: 480px;
	}

	.gauge-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.gauge-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted, #888);
	}

	.gauge-bar-wrap {
		height: 12px;
		background: var(--surface-3, #2a2a2a);
		border-radius: var(--radius-sm, 4px);
		overflow: hidden;
		border: 1px solid var(--color-border, #333);
	}

	.gauge-fill {
		height: 100%;
		border-radius: var(--radius-sm, 4px);
		transition: width 0.4s ease;
	}

	.gauge-value {
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-text, #e8e8e8);
		text-align: right;
	}

	/* TUI health */
	.tui-health {
		font-family: monospace;
		font-size: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 1ch;
		padding: 1ch;
	}

	.health-metric {
		display: flex;
		gap: 2ch;
		align-items: center;
	}

	.metric-label {
		color: var(--tui-text-dim, #888);
		min-width: 8ch;
	}

	.metric-bar {
		color: var(--color-accent, #7fefbd);
		letter-spacing: -0.05em;
	}

	.metric-value {
		color: var(--tui-text, #e0e0e0);
		min-width: 7ch;
		text-align: right;
	}

	/* Config panel */
	.config-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 8px;
	}

	.config-search {
		flex-shrink: 0;
	}

	.config-search-input {
		background: var(--surface-2, #1e1e1e);
		border: 1px solid var(--color-border, #333);
		border-radius: var(--radius-sm, 4px);
		color: var(--color-text, #e8e8e8);
		font-size: 0.875rem;
		padding: 4px 10px;
		outline: none;
		width: 100%;
		max-width: 320px;
		box-sizing: border-box;
	}

	.tui .config-search-input {
		font-family: monospace;
		color: var(--tui-text, #e0e0e0);
		background: var(--tui-surface, #16213e);
		border-color: var(--tui-border, #0f3460);
	}

	.config-output {
		flex: 1;
		overflow: auto;
		background: var(--surface-1, #0a0a0a);
		border: 1px solid var(--color-border, #2a2a2a);
		border-radius: var(--radius-sm, 4px);
		padding: 12px;
		font-family: monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--color-text, #e8e8e8);
		white-space: pre;
		tab-size: 4;
		margin: 0;
	}

	.tui .config-output {
		background: var(--tui-bg, #0d0d0d);
		border-color: var(--tui-border, #0f3460);
		color: var(--tui-text, #e0e0e0);
	}
</style>

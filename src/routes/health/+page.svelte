<script lang="ts">
	import {
		Table,
		Badge,
		StatusBar,
		StatusBarItem,
		StatusBarSpacer,
		ProgressBar,
		Button,
		useTui
	} from '@plures/design-dojo';
	import { mockFleetHealth } from '$lib/data/mock-health.js';
	import type {
		FleetHealth,
		DeviceHealthEntry,
		LogAlertEntry
	} from '$lib/types/health.types.js';

	const getTui = useTui();

	// --- State ---
	let fleetHealth = $state<FleetHealth>(mockFleetHealth);
	let loading = $state(false);
	let autoRefresh = $state(false);
	let refreshInterval = $state(30);
	let refreshTimer = $state<ReturnType<typeof setInterval> | null>(null);

	// --- Derived ---
	let summary = $derived(fleetHealth.summary);

	let topCpuDevices = $derived(
		[...fleetHealth.devices]
			.filter((d) => d.status !== 'unreachable')
			.sort((a, b) => b.cpuPercent - a.cpuPercent)
			.slice(0, 5)
	);

	let topMemoryDevices = $derived(
		[...fleetHealth.devices]
			.filter((d) => d.status !== 'unreachable')
			.sort((a, b) => b.memoryPercent - a.memoryPercent)
			.slice(0, 5)
	);

	let interfaceErrorRows = $derived.by(() => {
		const rows: Array<{
			hostname: string;
			interfaceName: string;
			crcErrors: string;
			inputErrors: string;
			outputErrors: string;
			totalErrors: string;
		}> = [];
		for (const device of fleetHealth.devices) {
			for (const err of device.interfaceErrors) {
				const total = err.crcErrors + err.inputErrors + err.outputErrors;
				rows.push({
					hostname: device.hostname,
					interfaceName: err.interfaceName,
					crcErrors: String(err.crcErrors),
					inputErrors: String(err.inputErrors),
					outputErrors: String(err.outputErrors),
					totalErrors: String(total)
				});
			}
		}
		return rows.sort((a, b) => Number(b.totalErrors) - Number(a.totalErrors));
	});

	let allLogAlerts = $derived.by(() => {
		const alerts: LogAlertEntry[] = [];
		for (const device of fleetHealth.devices) {
			for (const alert of device.logAlerts) {
				alerts.push(alert);
			}
		}
		return alerts.sort(
			(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);
	});

	let logAlertRows = $derived(
		allLogAlerts.map((a) => ({
			timestamp: new Date(a.timestamp).toLocaleString(),
			severity: a.severity,
			source: a.source,
			message: a.message
		}))
	);

	let vendorRows = $derived(
		fleetHealth.vendorBreakdown.map((v) => ({
			vendor: v.vendor,
			total: String(v.total),
			healthy: String(v.healthy),
			warning: String(v.warning),
			critical: String(v.critical),
			unreachable: String(v.unreachable),
			avgCpu: `${v.avgCpu}%`,
			avgMemory: `${v.avgMemory}%`
		}))
	);

	let lastUpdatedFormatted = $derived(
		new Date(fleetHealth.lastUpdated).toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	);

	// --- Helpers ---
	function statusVariant(
		status: DeviceHealthEntry['status']
	): 'success' | 'warning' | 'danger' | 'neutral' {
		if (status === 'healthy') return 'success';
		if (status === 'warning') return 'warning';
		if (status === 'critical') return 'danger';
		return 'neutral';
	}

	function severityVariant(
		severity: string
	): 'danger' | 'warning' | 'info' | 'neutral' {
		if (severity === 'critical' || severity === 'major') return 'danger';
		if (severity === 'warning' || severity === 'minor') return 'warning';
		if (severity === 'info') return 'info';
		return 'neutral';
	}

	function thresholdClass(pct: number): string {
		if (pct >= 90) return 'threshold-red';
		if (pct >= 70) return 'threshold-yellow';
		return 'threshold-green';
	}

	async function refreshData(): Promise<void> {
		loading = true;
		try {
			const { getFleetHealth } = await import('$lib/services/health.js');
			fleetHealth = await getFleetHealth();
		} catch {
			// keep mock data on failure
		} finally {
			loading = false;
		}
	}

	function toggleAutoRefresh(): void {
		autoRefresh = !autoRefresh;
	}

	$effect(() => {
		// If auto-refresh is disabled, ensure any existing interval is cleared.
		if (!autoRefresh) {
			if (refreshTimer) {
				clearInterval(refreshTimer);
				refreshTimer = null;
			}
			return;
		}

		// Clear any existing interval before creating a new one.
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}

		refreshTimer = setInterval(() => {
			void refreshData();
		}, refreshInterval * 1000);

		// Cleanup when dependencies change or component is destroyed.
		return () => {
			if (refreshTimer) {
				clearInterval(refreshTimer);
				refreshTimer = null;
			}
		};
	});
	// --- Table columns ---
	const errorColumns = [
		{ key: 'hostname', label: 'Device', width: 14 },
		{ key: 'interfaceName', label: 'Interface', width: 14 },
		{ key: 'crcErrors', label: 'CRC', width: 8 },
		{ key: 'inputErrors', label: 'Input Err', width: 10 },
		{ key: 'outputErrors', label: 'Output Err', width: 10 },
		{ key: 'totalErrors', label: 'Total', width: 8 }
	];

	const logColumns = [
		{ key: 'timestamp', label: 'Time', width: 20 },
		{ key: 'severity', label: 'Severity', width: 10 },
		{ key: 'source', label: 'Source', width: 14 },
		{ key: 'message', label: 'Message', width: 40 }
	];

	const vendorColumns = [
		{ key: 'vendor', label: 'Vendor', width: 10 },
		{ key: 'total', label: 'Total', width: 6 },
		{ key: 'healthy', label: 'Healthy', width: 8 },
		{ key: 'warning', label: 'Warning', width: 8 },
		{ key: 'critical', label: 'Critical', width: 8 },
		{ key: 'unreachable', label: 'Unreach.', width: 8 },
		{ key: 'avgCpu', label: 'Avg CPU', width: 8 },
		{ key: 'avgMemory', label: 'Avg Mem', width: 8 }
	];
</script>

<div class="health-page" class:tui={getTui()}>
	<!-- Toolbar -->
	<div class="toolbar" role="toolbar" aria-label="Health dashboard controls">
		<h2 class="page-title">Health Dashboard</h2>
		<div class="toolbar-actions">
			<Button variant="solid" size="sm" tui={getTui()} onclick={refreshData} disabled={loading}>
				{loading ? 'Refreshing…' : '🔄 Refresh'}
			</Button>
			<Button
				variant={autoRefresh ? 'solid' : 'ghost'}
				size="sm"
				tui={getTui()}
				onclick={toggleAutoRefresh}
			>
				{autoRefresh ? `⏸ Auto (${refreshInterval}s)` : `▶ Auto-refresh`}
			</Button>
		</div>
	</div>

	<!-- Overview grid -->
	<section class="overview-grid" aria-label="Fleet health summary">
		<div class="card">
			<span class="card-label">Total</span>
			<span class="card-value">{summary.total}</span>
		</div>
		<div class="card card-healthy">
			<span class="card-label">Healthy</span>
			<span class="card-value">{summary.healthy}</span>
		</div>
		<div class="card card-warning">
			<span class="card-label">Warning</span>
			<span class="card-value">{summary.warning}</span>
		</div>
		<div class="card card-critical">
			<span class="card-label">Critical</span>
			<span class="card-value">{summary.critical}</span>
		</div>
		<div class="card card-unreachable">
			<span class="card-label">Unreachable</span>
			<span class="card-value">{summary.unreachable}</span>
		</div>
	</section>

	<div class="dashboard-body">
		<!-- CPU gauges -->
		<section class="gauge-section" aria-label="Top CPU consumers">
			<h3 class="section-title">Top CPU Consumers</h3>
			<div class="gauge-list">
				{#each topCpuDevices as device}
					<div class="gauge-row">
						<span class="gauge-hostname">{device.hostname}</span>
						<div class="gauge-bar {thresholdClass(device.cpuPercent)}">
							<ProgressBar value={device.cpuPercent} label="{device.hostname} CPU" />
						</div>
						<Badge variant={statusVariant(device.status)} size="sm" tui={getTui()}>
							{device.status}
						</Badge>
					</div>
				{/each}
			</div>
		</section>

		<!-- Memory gauges -->
		<section class="gauge-section" aria-label="Top memory consumers">
			<h3 class="section-title">Top Memory Consumers</h3>
			<div class="gauge-list">
				{#each topMemoryDevices as device}
					<div class="gauge-row">
						<span class="gauge-hostname">{device.hostname}</span>
						<div class="gauge-bar {thresholdClass(device.memoryPercent)}">
							<ProgressBar value={device.memoryPercent} label="{device.hostname} Memory" />
						</div>
						<Badge variant={statusVariant(device.status)} size="sm" tui={getTui()}>
							{device.status}
						</Badge>
					</div>
				{/each}
			</div>
		</section>

		<!-- Interface errors table -->
		<section class="table-section" aria-label="Interface errors">
			<h3 class="section-title">Interface Errors</h3>
			{#if interfaceErrorRows.length > 0}
				<div class="table-wrapper">
					<Table
						tui={getTui()}
						columns={errorColumns}
						rows={interfaceErrorRows}
					/>
				</div>
			{:else}
				<p class="empty-state">No interface errors detected.</p>
			{/if}
		</section>

		<!-- Log alerts -->
		<section class="table-section" aria-label="Log alerts">
			<h3 class="section-title">Log Alerts</h3>
			{#if logAlertRows.length > 0}
				<div class="table-wrapper">
					<Table
						tui={getTui()}
						columns={logColumns}
						rows={logAlertRows}
					/>
				</div>
			{:else}
				<p class="empty-state">No log alerts.</p>
			{/if}
		</section>

		<!-- Vendor breakdown -->
		<section class="table-section" aria-label="Vendor breakdown">
			<h3 class="section-title">Vendor Breakdown</h3>
			<div class="table-wrapper">
				<Table
					tui={getTui()}
					columns={vendorColumns}
					rows={vendorRows}
				/>
			</div>
		</section>
	</div>

	<!-- Status bar -->
	<StatusBar tui={getTui()} position="bottom">
		<StatusBarItem label="Devices" value={String(summary.total)} />
		<StatusBarItem
			label="Healthy"
			value={String(summary.healthy)}
			color="success"
			separator
		/>
		<StatusBarItem
			label="Alerts"
			value={String(allLogAlerts.length)}
			color={allLogAlerts.length > 0 ? 'warning' : 'default'}
			separator
		/>
		<StatusBarSpacer />
		<StatusBarItem label="Updated" value={lastUpdatedFormatted} />
	</StatusBar>
</div>

<style>
	.health-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: var(--surface-1, #141414);
		color: var(--color-text, #e8e8e8);
	}

	.health-page.tui {
		background: var(--tui-bg, #1a1a2e);
		color: var(--tui-text, #e0e0e0);
		font-family: var(--font-mono);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3, 12px);
		padding: var(--space-2, 8px) var(--space-4, 16px);
		background: var(--surface-2, #1e1e1e);
		border-bottom: 1px solid var(--color-border, #2a2a2a);
		flex-shrink: 0;
	}

	.tui .toolbar {
		background: var(--tui-surface, #16213e);
		border-bottom: 1px solid var(--tui-border, #0f3460);
	}

	.page-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2, 8px);
	}

	/* Overview grid */
	.overview-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: var(--space-3, 12px);
		padding: var(--space-3, 12px) var(--space-4, 16px);
		flex-shrink: 0;
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-3, 12px);
		border-radius: var(--radius-md, 6px);
		background: var(--surface-2, #1e1e1e);
		border: 1px solid var(--color-border, #2a2a2a);
	}

	.tui .card {
		background: var(--tui-surface, #16213e);
		border-color: var(--tui-border, #0f3460);
		border-radius: 0;
	}

	.card-label {
		font-size: 0.75rem;
		color: var(--color-text-muted, #888);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.card-value {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.card-healthy .card-value { color: #a6e3a1; }
	.card-warning .card-value { color: #f9e2af; }
	.card-critical .card-value { color: #f38ba8; }
	.card-unreachable .card-value { color: #a6adc8; }

	/* Dashboard body */
	.dashboard-body {
		flex: 1;
		overflow: auto;
		padding: 0 var(--space-4, 16px) var(--space-4, 16px);
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 16px);
	}

	.section-title {
		margin: 0 0 var(--space-2, 8px);
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text-muted, #aaa);
	}

	/* Gauge sections */
	.gauge-section {
		flex-shrink: 0;
	}

	.gauge-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 8px);
	}

	.gauge-row {
		display: grid;
		grid-template-columns: 140px 1fr auto;
		align-items: center;
		gap: var(--space-3, 12px);
	}

	.gauge-hostname {
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.gauge-bar {
		min-width: 0;
	}

	/* Threshold colors override the ProgressBar fill via CSS variables */
	.threshold-green {
		--color-primary: #a6e3a1;
		--color-success: #a6e3a1;
	}
	.threshold-yellow {
		--color-primary: #f9e2af;
		--color-success: #f9e2af;
	}
	.threshold-red {
		--color-primary: #f38ba8;
		--color-success: #f38ba8;
	}

	/* Table sections */
	.table-section {
		flex-shrink: 0;
	}

	.table-wrapper {
		max-height: 300px;
		overflow: auto;
		border: 1px solid var(--color-border, #2a2a2a);
		border-radius: var(--radius-md, 6px);
	}

	.tui .table-wrapper {
		border-color: var(--tui-border, #0f3460);
		border-radius: 0;
	}

	.empty-state {
		text-align: center;
		padding: var(--space-4, 16px);
		color: var(--color-text-muted, #888);
		font-size: 0.875rem;
	}
</style>

<script lang="ts">
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import type { Device, ScanConfig, ScanState } from '$lib/types.js';

	// ---------------------------------------------------------------------------
	// Form state
	// ---------------------------------------------------------------------------
	let config: ScanConfig = $state({
		subnet: '10.0.0.0/24',
		csvPath: '',
		username: 'admin',
		password: '',
		deepScan: false,
		concurrency: 10
	});

	// ---------------------------------------------------------------------------
	// Scan state
	// ---------------------------------------------------------------------------
	let scan: ScanState = $state({
		status: 'idle',
		scanned: 0,
		total: 0,
		devices: [],
		startedAt: null,
		elapsedMs: 0,
		error: null
	});

	/** Regex pattern for CIDR notation — kept as a variable to avoid Svelte template conflicts. */
	const subnetPattern = String.raw`^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$`;

	let elapsedInterval: ReturnType<typeof setInterval> | null = null;
	let scanInterval: ReturnType<typeof setInterval> | null = null;

	// ---------------------------------------------------------------------------
	// Derived values
	// ---------------------------------------------------------------------------
	let progressPct = $derived(scan.total > 0 ? (scan.scanned / scan.total) * 100 : 0);

	let elapsedLabel = $derived(formatElapsed(scan.elapsedMs));

	let vendorSummary = $derived(
		scan.devices.reduce<Record<string, number>>((acc, d) => {
			acc[d.vendor] = (acc[d.vendor] ?? 0) + 1;
			return acc;
		}, {})
	);

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function formatElapsed(ms: number): string {
		const totalSec = Math.floor(ms / 1000);
		const mins = Math.floor(totalSec / 60);
		const secs = totalSec % 60;
		return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
	}

	/** Generate a fake list of devices that would have been discovered. */
	function generateMockDevices(count: number): Device[] {
		const vendors = ['cisco', 'nokia', 'juniper', 'arista', 'huawei'];
		const versions = ['16.9.4', '23.10.R1', '22.3R1', '4.28.0F', 'VRP V800R022C00'];
		const models = ['ISR4331', '7750 SR-7', 'MX204', 'DCS-7050TX', 'NE40E'];
		const [base] = (config.subnet || '10.0.0.0/24').split('/');
		const parts = base.split('.');

		return Array.from({ length: count }, (_, i) => {
			const vi = i % vendors.length;
			return {
				hostname: `${vendors[vi].substring(0, 2)}-${String(i + 1).padStart(3, '0')}`,
				ip: `${parts[0]}.${parts[1]}.${parts[2]}.${i + 1}`,
				vendor: vendors[vi],
				version: versions[vi],
				model: models[vi]
			};
		});
	}

	// ---------------------------------------------------------------------------
	// Scan lifecycle
	// ---------------------------------------------------------------------------
	function startScan() {
		if (scan.status === 'running') return;

		// Derive total host count from subnet (simplified: /24 → 254 hosts etc.)
		const rawPrefix = (config.subnet || '').split('/')[1] ?? '';
		let prefix = Number.parseInt(rawPrefix, 10);

		if (Number.isNaN(prefix)) {
			// Fallback to a sane default if the prefix is malformed
			prefix = 24;
		}

		// Clamp prefix to valid IPv4 CIDR range
		if (prefix < 0) prefix = 0;
		if (prefix > 32) prefix = 32;

		// Handle /31 and /32 explicitly: this mock scanner does not support them
		if (prefix >= 31) {
			scan.status = 'error';
			scan.error = 'Subnets with /31 or /32 prefixes are not supported in this scanner.';
			scan.scanned = 0;
			scan.total = 0;
			scan.devices = [];
			scan.startedAt = null;
			scan.elapsedMs = 0;
			return;
		}

		const totalHosts = Math.pow(2, 32 - prefix) - 2;
		const total = Math.min(totalHosts, 254);
		const allDevices = generateMockDevices(Math.max(1, Math.floor(total * 0.35)));

		scan = {
			status: 'running',
			scanned: 0,
			total,
			devices: [],
			startedAt: Date.now(),
			elapsedMs: 0,
			error: null
		};

		// Elapsed timer
		elapsedInterval = setInterval(() => {
			if (scan.startedAt !== null) {
				scan.elapsedMs = Date.now() - scan.startedAt;
			}
		}, 500);

		// Scan progress simulator
		const step = Math.max(1, Math.floor(config.concurrency * 0.8));
		let deviceIdx = 0;

		scanInterval = setInterval(() => {
			const next = Math.min(scan.scanned + step, scan.total);
			const newDevices: Device[] = [];

			while (deviceIdx < allDevices.length && allDevices[deviceIdx].ip <= ipFromIdx(next)) {
				newDevices.push(allDevices[deviceIdx]);
				deviceIdx++;
			}

			scan.scanned = next;
			if (newDevices.length) {
				scan.devices = [...scan.devices, ...newDevices];
			}

			if (next >= scan.total) {
				finishScan();
			}
		}, 300);
	}

	function ipFromIdx(idx: number): string {
		const [base] = (config.subnet || '10.0.0.0/24').split('/');
		const parts = base.split('.');
		return `${parts[0]}.${parts[1]}.${parts[2]}.${idx}`;
	}

	function finishScan() {
		clearInterval(scanInterval!);
		clearInterval(elapsedInterval!);
		scanInterval = null;
		elapsedInterval = null;
		if (scan.startedAt !== null) {
			scan.elapsedMs = Date.now() - scan.startedAt;
		}
		scan.status = 'complete';
	}

	function resetScan() {
		clearInterval(scanInterval!);
		clearInterval(elapsedInterval!);
		scanInterval = null;
		elapsedInterval = null;
		scan = {
			status: 'idle',
			scanned: 0,
			total: 0,
			devices: [],
			startedAt: null,
			elapsedMs: 0,
			error: null
		};
	}
</script>

<div class="scan-page">
	<!-- ------------------------------------------------------------------ -->
	<!-- Header                                                               -->
	<!-- ------------------------------------------------------------------ -->
	<header class="scan-page__header">
		<h1>Scan Runner</h1>
		<p class="scan-page__subtitle">Launch a network scan and monitor live progress.</p>
	</header>

	<!-- ------------------------------------------------------------------ -->
	<!-- Configuration form                                                  -->
	<!-- ------------------------------------------------------------------ -->
	<section class="card" aria-labelledby="config-heading">
		<h2 id="config-heading" class="card__title">Scan Configuration</h2>

		<form
			class="config-form"
			onsubmit={(e) => {
				e.preventDefault();
				startScan();
			}}
		>
			<div class="form-row">
				<label class="form-label" for="subnet">Subnet (CIDR)</label>
				<input
					id="subnet"
					class="form-input"
					type="text"
					bind:value={config.subnet}
					placeholder="10.0.0.0/24"
					pattern={subnetPattern}
					aria-describedby="subnet-hint"
					disabled={scan.status === 'running'}
					required
				/>
				<span id="subnet-hint" class="form-hint">e.g. 192.168.1.0/24</span>
			</div>

			<div class="form-row">
				<label class="form-label" for="csv-path">CSV File Path</label>
				<input
					id="csv-path"
					class="form-input"
					type="text"
					bind:value={config.csvPath}
					placeholder="/path/to/hosts.csv"
					disabled={scan.status === 'running'}
				/>
				<span class="form-hint">Optional — path to a CSV file with hosts</span>
			</div>

			<div class="form-row form-row--inline">
				<div class="form-field">
					<label class="form-label" for="username">Username</label>
					<input
						id="username"
						class="form-input"
						type="text"
						bind:value={config.username}
						placeholder="admin"
						disabled={scan.status === 'running'}
						required
					/>
				</div>

				<div class="form-field">
					<label class="form-label" for="password">Password</label>
					<input
						id="password"
						class="form-input"
						type="password"
						bind:value={config.password}
						placeholder="••••••••"
						disabled={scan.status === 'running'}
					/>
				</div>

				<div class="form-field form-field--toggle">
					<label class="form-label" for="deep-scan">Deep Scan</label>
					<div class="toggle-wrap">
						<input
							id="deep-scan"
							class="toggle-input"
							type="checkbox"
							role="switch"
							bind:checked={config.deepScan}
							aria-label="Enable deep scan"
							disabled={scan.status === 'running'}
						/>
						<span class="toggle-track" aria-hidden="true">
							<span class="toggle-thumb"></span>
						</span>
					</div>
				</div>
			</div>

			<div class="form-row">
				<label class="form-label" for="concurrency">
					Concurrency
					<span class="form-label__value">{config.concurrency}</span>
				</label>
				<input
					id="concurrency"
					class="form-range"
					type="range"
					min={1}
					max={50}
					bind:value={config.concurrency}
					aria-valuemin={1}
					aria-valuemax={50}
					aria-valuenow={config.concurrency}
					aria-label="Concurrency — number of parallel SSH sessions"
					disabled={scan.status === 'running'}
				/>
				<div class="form-range-labels" aria-hidden="true">
					<span>1</span>
					<span>50</span>
				</div>
			</div>

			<div class="form-actions">
				{#if scan.status === 'idle' || scan.status === 'complete' || scan.status === 'error'}
					<button class="btn btn--primary" type="submit" aria-label="Start network scan">
						<span aria-hidden="true">▶</span> Start Scan
					</button>
				{:else}
					<button class="btn btn--danger" type="button" onclick={resetScan} aria-label="Cancel scan">
						<span aria-hidden="true">■</span> Cancel
					</button>
				{/if}
			</div>
		</form>
	</section>

	<!-- ------------------------------------------------------------------ -->
	<!-- Progress section (visible during / after scan)                      -->
	<!-- ------------------------------------------------------------------ -->
	{#if scan.status !== 'idle'}
		<section class="card" aria-labelledby="progress-heading" aria-live="polite">
			<h2 id="progress-heading" class="card__title">
				{#if scan.status === 'running'}
					Scanning…
				{:else if scan.status === 'complete'}
					Scan Complete
				{:else}
					Scan Error
				{/if}
			</h2>

			<div class="progress-row">
				<ProgressBar
					value={scan.scanned}
					max={scan.total}
					label={`Scan progress — ${scan.scanned} of ${scan.total} hosts checked`}
				/>
				<span
					class="progress-count"
					aria-label={`Scanned ${scan.scanned} of ${scan.total} hosts`}
				>
					{scan.scanned}/{scan.total}
				</span>
			</div>

			<dl class="scan-stats">
				<div class="scan-stats__item">
					<dt>Devices found</dt>
					<dd>{scan.devices.length}</dd>
				</div>
				<div class="scan-stats__item">
					<dt>Elapsed</dt>
					<dd>{elapsedLabel}</dd>
				</div>
				{#if scan.status === 'complete'}
					<div class="scan-stats__item">
						<dt>Coverage</dt>
						<dd>{Math.round(progressPct)}%</dd>
					</div>
				{/if}
			</dl>

			{#if scan.status === 'complete'}
				<div class="scan-complete-banner" role="status">
					<span class="scan-complete-banner__icon" aria-hidden="true">✓</span>
					<div>
						<strong>Scan finished</strong> — {scan.devices.length} device{scan.devices.length === 1
							? ''
							: 's'} discovered across {scan.total} hosts in {elapsedLabel}.
					</div>
					<a class="btn btn--secondary" href="/inventory" aria-label="View inventory">
						View Inventory →
					</a>
				</div>

				{#if Object.keys(vendorSummary).length > 0}
					<div class="vendor-summary">
						<h3 class="vendor-summary__title">Vendor Breakdown</h3>
						<ul class="vendor-summary__list" aria-label="Vendor breakdown">
							{#each Object.entries(vendorSummary) as [vendor, count]}
								<li class="vendor-badge">
									<span class="vendor-badge__name">{vendor}</span>
									<span class="vendor-badge__count">{count}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</section>
	{/if}

	<!-- ------------------------------------------------------------------ -->
	<!-- Live results table                                                  -->
	<!-- ------------------------------------------------------------------ -->
	{#if scan.devices.length > 0}
		<section class="card" aria-labelledby="results-heading">
			<h2 id="results-heading" class="card__title">
				Live Results
				<span class="badge">{scan.devices.length} found</span>
			</h2>

			<div class="table-wrap" role="region" aria-label="Live scan results table">
				<table class="results-table" aria-label="Discovered devices">
					<thead>
						<tr>
							<th scope="col">Hostname</th>
							<th scope="col">IP Address</th>
							<th scope="col">Vendor</th>
							<th scope="col">Version</th>
							<th scope="col">Model</th>
						</tr>
					</thead>
					<tbody>
						{#each scan.devices as device (device.ip)}
							<tr>
								<td class="mono">{device.hostname}</td>
								<td class="mono">{device.ip}</td>
								<td>
									<span class="vendor-chip vendor-chip--{device.vendor}">{device.vendor}</span>
								</td>
								<td class="mono">{device.version}</td>
								<td class="mono">{device.model ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	/* ------------------------------------------------------------------ */
	/* Page shell                                                           */
	/* ------------------------------------------------------------------ */
	.scan-page {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.scan-page__header h1 {
		margin: 0 0 var(--space-1);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.scan-page__subtitle {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	/* ------------------------------------------------------------------ */
	/* Card                                                                 */
	/* ------------------------------------------------------------------ */
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.card__title {
		margin: 0 0 var(--space-6);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* ------------------------------------------------------------------ */
	/* Form                                                                 */
	/* ------------------------------------------------------------------ */
	.config-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.form-row--inline {
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--space-4);
		align-items: flex-end;
	}

	.form-field {
		flex: 1;
		min-width: 120px;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.form-field--toggle {
		flex: 0 0 auto;
		align-items: flex-start;
	}

	.form-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-muted);
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
	}

	.form-label__value {
		color: var(--color-primary);
		font-variant-numeric: tabular-nums;
	}

	.form-input {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		font-size: 0.875rem;
		font-family: var(--font-mono);
		outline: none;
		transition: border-color 0.15s;
	}

	.form-input:focus {
		border-color: var(--color-primary);
	}

	.form-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* Range slider */
	.form-range {
		width: 100%;
		accent-color: var(--color-primary);
		cursor: pointer;
	}

	.form-range:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-range-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* Toggle switch */
	.toggle-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		cursor: pointer;
	}

	.toggle-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-track {
		display: inline-block;
		width: 40px;
		height: 22px;
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		position: relative;
		transition: background 0.2s, border-color 0.2s;
	}

	.toggle-input:checked + .toggle-track {
		background: var(--color-primary);
		border-color: var(--color-primary);
	}

	.toggle-input:focus-visible + .toggle-track {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.toggle-thumb {
		display: block;
		width: 16px;
		height: 16px;
		background: var(--color-text);
		border-radius: 50%;
		position: absolute;
		top: 2px;
		left: 2px;
		transition: transform 0.2s;
	}

	.toggle-input:checked + .toggle-track .toggle-thumb {
		transform: translateX(18px);
	}

	/* ------------------------------------------------------------------ */
	/* Buttons                                                              */
	/* ------------------------------------------------------------------ */
	.form-actions {
		display: flex;
		gap: var(--space-3);
		padding-top: var(--space-2);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-6);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: background 0.15s, opacity 0.15s;
		text-decoration: none;
	}

	.btn--primary {
		background: var(--color-primary);
		color: #fff;
	}

	.btn--primary:hover {
		background: var(--color-primary-hover);
	}

	.btn--danger {
		background: var(--color-error);
		color: #fff;
	}

	.btn--danger:hover {
		opacity: 0.85;
	}

	.btn--secondary {
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		color: var(--color-text);
	}

	.btn--secondary:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		text-decoration: none;
	}

	/* ------------------------------------------------------------------ */
	/* Progress section                                                     */
	/* ------------------------------------------------------------------ */
	.progress-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.progress-count {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--color-text-muted);
		min-width: 7ch;
		text-align: right;
	}

	.scan-stats {
		display: flex;
		gap: var(--space-6);
		flex-wrap: wrap;
		margin: 0 0 var(--space-4);
		padding: 0;
	}

	.scan-stats__item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.scan-stats__item dt {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.scan-stats__item dd {
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		margin: 0;
		color: var(--color-text);
	}

	/* Completion banner */
	.scan-complete-banner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-success) 40%, transparent);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		font-size: 0.875rem;
		flex-wrap: wrap;
	}

	.scan-complete-banner__icon {
		font-size: 1.25rem;
		color: var(--color-success);
		flex-shrink: 0;
	}

	.scan-complete-banner > div {
		flex: 1;
		min-width: 200px;
	}

	/* Vendor summary */
	.vendor-summary {
		margin-top: var(--space-4);
	}

	.vendor-summary__title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--space-2);
	}

	.vendor-summary__list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.vendor-badge {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-1) var(--space-3);
		font-size: 0.8125rem;
	}

	.vendor-badge__name {
		font-weight: 500;
	}

	.vendor-badge__count {
		background: var(--color-border);
		border-radius: 9999px;
		padding: 0 var(--space-2);
		font-variant-numeric: tabular-nums;
		font-size: 0.75rem;
	}

	/* ------------------------------------------------------------------ */
	/* Results table                                                        */
	/* ------------------------------------------------------------------ */
	.badge {
		background: var(--color-primary);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: var(--radius-lg);
		padding: 1px var(--space-2);
	}

	.table-wrap {
		overflow-x: auto;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.results-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.results-table thead {
		background: var(--color-surface-2);
		position: sticky;
		top: 0;
	}

	.results-table th {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.results-table td {
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--color-border);
		color: var(--color-text);
	}

	.results-table tbody tr:hover {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.mono {
		font-family: var(--font-mono);
	}

	/* Vendor chips */
	.vendor-chip {
		display: inline-block;
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--color-surface-2);
		border: 1px solid var(--color-border);
	}

	.vendor-chip--cisco {
		color: #1ba0d8;
		border-color: #1ba0d833;
		background: #1ba0d814;
	}

	.vendor-chip--nokia {
		color: #00a9e0;
		border-color: #00a9e033;
		background: #00a9e014;
	}

	.vendor-chip--juniper {
		color: #84bd00;
		border-color: #84bd0033;
		background: #84bd0014;
	}

	.vendor-chip--arista {
		color: #ff6600;
		border-color: #ff660033;
		background: #ff660014;
	}

	.vendor-chip--huawei {
		color: #cf0a2c;
		border-color: #cf0a2c33;
		background: #cf0a2c14;
	}
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Table,
		SearchInput,
		SplitPane,
		Pane,
		StatusBar,
		StatusBarItem,
		StatusBarSpacer,
		Badge,
		Button,
		useTui
	} from '@plures/design-dojo';
	import type { SearchResult } from '@plures/design-dojo';
	import { mockInventory, LAST_SCAN_TIME } from '$lib/data/mock-inventory';
	import type { Device } from '$lib/data/mock-inventory';

	const getTui = useTui();

	// --- Vendor filter state ---
	type VendorFilter = 'all' | 'cisco_ios' | 'nokia_sros' | 'arista_eos';
	let vendorFilter = $state<VendorFilter>('all');

	// --- Search state ---
	let searchQuery = $state('');

	// --- Row selection ---
	let selectedIndex = $state<number | undefined>(undefined);

	// --- Table columns ---
	const columns = [
		{ key: 'name', label: 'Name', width: 16 },
		{ key: 'host', label: 'Host', width: 14 },
		{ key: 'vendor', label: 'Vendor', width: 12 },
		{ key: 'model', label: 'Model', width: 18 },
		{ key: 'version', label: 'Version', width: 12 },
		{ key: 'serial', label: 'Serial', width: 14 },
		{ key: 'site', label: 'Site', width: 10 }
	];

	// --- Filtered rows ---
	let filteredDevices = $derived(
		mockInventory.filter((d) => {
			const matchesVendor = vendorFilter === 'all' || d.vendor === vendorFilter;
			const q = searchQuery.toLowerCase();
			const matchesSearch =
				q === '' ||
				d.name.toLowerCase().includes(q) ||
				d.host.toLowerCase().includes(q) ||
				d.model.toLowerCase().includes(q) ||
				d.site.toLowerCase().includes(q);
			return matchesVendor && matchesSearch;
		})
	);

	let tableRows = $derived(
		filteredDevices.map((d) => ({
			name: d.name,
			host: d.host,
			vendor: vendorLabel(d.vendor),
			model: d.model,
			version: d.version,
			serial: d.serial,
			site: d.site
		}))
	);

	let selectedDevice = $derived<Device | undefined>(
		selectedIndex !== undefined ? filteredDevices[selectedIndex] : undefined
	);

	// --- Vendor counts ---
	let vendorCounts = $derived({
		cisco_ios: mockInventory.filter((d) => d.vendor === 'cisco_ios').length,
		nokia_sros: mockInventory.filter((d) => d.vendor === 'nokia_sros').length,
		arista_eos: mockInventory.filter((d) => d.vendor === 'arista_eos').length
	});

	function vendorLabel(v: Device['vendor']): string {
		const labels: Record<Device['vendor'], string> = {
			cisco_ios: 'Cisco IOS',
			nokia_sros: 'Nokia SR OS',
			arista_eos: 'Arista EOS'
		};
		return labels[v];
	}

	function vendorBadgeVariant(
		v: VendorFilter
	): 'accent' | 'info' | 'success' | 'neutral' {
		if (v === 'cisco_ios') return 'accent';
		if (v === 'nokia_sros') return 'info';
		if (v === 'arista_eos') return 'success';
		return 'neutral';
	}

	function handleRowSelect(index: number): void {
		const device = filteredDevices[index];
		if (device) {
			goto(`/device/${encodeURIComponent(device.name)}`);
		}
	}

	// --- SearchInput handlers ---
	async function handleSearch(query: string): Promise<SearchResult[]> {
		searchQuery = query;
		if (!query) return [];
		const q = query.toLowerCase();
		return mockInventory
			.filter(
				(d) =>
					d.name.toLowerCase().includes(q) ||
					d.host.toLowerCase().includes(q) ||
					d.site.toLowerCase().includes(q)
			)
			.slice(0, 8)
			.map((d) => ({
				text: `${d.name} (${d.host})`,
				score: 1,
				id: d.id,
				meta: { site: d.site }
			}));
	}

	function handleSearchSelect(item: SearchResult): void {
		const device = mockInventory.find((d) => d.id === item.id);
		if (device) {
			goto(`/device/${encodeURIComponent(device.name)}`);
		}
	}

	// --- Last scan formatting ---
	let lastScanFormatted = $derived(
		new Date(LAST_SCAN_TIME).toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	);
</script>

<div class="inventory-page" class:tui={getTui()}>
	<!-- Toolbar: search + vendor filters -->
	<div class="toolbar" role="toolbar" aria-label="Inventory filters">
		<div class="search-wrapper">
			<SearchInput
				tui={getTui()}
				placeholder="Search devices…"
				onSearch={handleSearch}
				onSelect={handleSearchSelect}
				cols={40}
			/>
		</div>

		<div class="vendor-filters" role="group" aria-label="Filter by vendor">
			<Button
				variant={vendorFilter === 'all' ? 'solid' : 'ghost'}
				size="sm"
				tui={getTui()}
				onclick={() => { vendorFilter = 'all'; selectedIndex = undefined; }}
			>
				All ({mockInventory.length})
			</Button>
			<Button
				variant={vendorFilter === 'cisco_ios' ? 'solid' : 'ghost'}
				size="sm"
				tui={getTui()}
				onclick={() => { vendorFilter = vendorFilter === 'cisco_ios' ? 'all' : 'cisco_ios'; selectedIndex = undefined; }}
			>
				<Badge variant={vendorBadgeVariant('cisco_ios')} size="sm" tui={getTui()}>Cisco</Badge>
				({vendorCounts.cisco_ios})
			</Button>
			<Button
				variant={vendorFilter === 'nokia_sros' ? 'solid' : 'ghost'}
				size="sm"
				tui={getTui()}
				onclick={() => { vendorFilter = vendorFilter === 'nokia_sros' ? 'all' : 'nokia_sros'; selectedIndex = undefined; }}
			>
				<Badge variant={vendorBadgeVariant('nokia_sros')} size="sm" tui={getTui()}>Nokia</Badge>
				({vendorCounts.nokia_sros})
			</Button>
			<Button
				variant={vendorFilter === 'arista_eos' ? 'solid' : 'ghost'}
				size="sm"
				tui={getTui()}
				onclick={() => { vendorFilter = vendorFilter === 'arista_eos' ? 'all' : 'arista_eos'; selectedIndex = undefined; }}
			>
				<Badge variant={vendorBadgeVariant('arista_eos')} size="sm" tui={getTui()}>Arista</Badge>
				({vendorCounts.arista_eos})
			</Button>
		</div>
	</div>

	<!-- Table + detail panel -->
	<div class="content">
		{#if selectedDevice}
			<SplitPane direction="horizontal" tui={getTui()}>
				<Pane tui={getTui()} flex={3} scrollable>
					<Table
						tui={getTui()}
						{columns}
						rows={tableRows}
						selected={selectedIndex}
						onselect={handleRowSelect}
					/>
				</Pane>
				<Pane tui={getTui()} flex={1} title="Device Detail" scrollable>
					<dl class="detail-list">
						<div class="detail-row">
							<dt>Name</dt>
							<dd>{selectedDevice.name}</dd>
						</div>
						<div class="detail-row">
							<dt>Host</dt>
							<dd>{selectedDevice.host}</dd>
						</div>
						<div class="detail-row">
							<dt>Vendor</dt>
							<dd>
								<Badge variant={vendorBadgeVariant(selectedDevice.vendor)} tui={getTui()}>
									{vendorLabel(selectedDevice.vendor)}
								</Badge>
							</dd>
						</div>
						<div class="detail-row">
							<dt>Model</dt>
							<dd>{selectedDevice.model}</dd>
						</div>
						<div class="detail-row">
							<dt>Version</dt>
							<dd>{selectedDevice.version}</dd>
						</div>
						<div class="detail-row">
							<dt>Serial</dt>
							<dd>{selectedDevice.serial}</dd>
						</div>
						<div class="detail-row">
							<dt>Site</dt>
							<dd>{selectedDevice.site}</dd>
						</div>
					</dl>
					<div class="detail-close">
						<Button variant="ghost" size="sm" tui={getTui()} onclick={() => { selectedIndex = undefined; }}>
							✕ Close
						</Button>
					</div>
				</Pane>
			</SplitPane>
		{:else}
			<div class="table-wrapper">
				<Table
					tui={getTui()}
					{columns}
					rows={tableRows}
					selected={selectedIndex}
					onselect={handleRowSelect}
				/>
				{#if tableRows.length === 0}
					<p class="empty-state">No devices match the current filters.</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Status bar -->
	<StatusBar tui={getTui()} position="bottom">
		<StatusBarItem label="Devices" value={String(filteredDevices.length)} />
		{#if vendorFilter !== 'all'}
			<StatusBarItem
				label="Filter"
				value={vendorLabel(vendorFilter)}
				color="accent"
				separator
			/>
		{/if}
		<StatusBarSpacer />
		<StatusBarItem label="Last scan" value={lastScanFormatted} color="default" />
	</StatusBar>
</div>

<style>
	.inventory-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: var(--surface-1, #141414);
		color: var(--color-text, #e8e8e8);
	}

	.inventory-page.tui {
		background: var(--tui-bg, #1a1a2e);
		color: var(--tui-text, #e0e0e0);
		font-family: var(--font-mono);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
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

	.search-wrapper {
		flex: 0 0 auto;
	}

	.vendor-filters {
		display: flex;
		align-items: center;
		gap: var(--space-2, 8px);
		flex-wrap: wrap;
	}

	/* Content area */
	.content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.table-wrapper {
		flex: 1;
		overflow: auto;
	}

	.empty-state {
		text-align: center;
		padding: var(--space-12, 48px);
		color: var(--color-text-muted, #888);
		font-size: var(--text-sm, 14px);
	}

	.tui .empty-state {
		color: var(--tui-text-dim, #888);
	}

	/* Detail panel */
	.detail-list {
		margin: 0;
		padding: var(--space-4, 16px);
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 12px);
	}

	.detail-row {
		display: flex;
		gap: var(--space-3, 12px);
	}

	.detail-row dt {
		color: var(--color-text-muted, #888);
		font-size: var(--text-sm, 14px);
		min-width: 60px;
		flex-shrink: 0;
	}

	.detail-row dd {
		margin: 0;
		color: var(--color-text, #e8e8e8);
		font-size: var(--text-sm, 14px);
		display: flex;
		align-items: center;
	}

	.tui .detail-row dt {
		color: var(--tui-text-dim, #888);
	}

	.tui .detail-row dd {
		color: var(--tui-text, #e0e0e0);
	}

	.detail-close {
		padding: var(--space-2, 8px) var(--space-4, 16px);
	}
</style>

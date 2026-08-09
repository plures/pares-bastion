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
	import { inventoryStore } from '$lib/stores/inventory-store.svelte.js';
	import { partitionStore } from '$lib/stores/partition-store.svelte.js';

	const getTui = useTui();

	// --- Source: use persisted inventory when available, fall back to mock data ---
	let storedDevices = $derived(
		partitionStore.activePartitionId
			? inventoryStore.forPartition(partitionStore.activePartitionId)
			: []
	);

	/** Adapt stored devices to the table-friendly shape used by the UI. */
	interface DisplayDevice {
		id: string;
		name: string;
		host: string;
		vendor: string;
		model: string;
		version: string;
		serial: string;
		site: string;
	}

	let allDevices = $derived<DisplayDevice[]>(
		storedDevices.length > 0
			? storedDevices.map((d) => ({
					id: d.id,
					name: d.hostname,
					host: d.ip,
					vendor: d.vendor,
					model: d.model,
					version: d.version,
					serial: d.serialNumber,
					site: d.site
				}))
			: mockInventory.map((d) => ({
					id: d.id,
					name: d.name,
					host: d.host,
					vendor: d.vendor,
					model: d.model,
					version: d.version,
					serial: d.serial,
					site: d.site
				}))
	);

	// --- Last scan from store, fall back to constant ---
	let lastScanRecord = $derived(
		partitionStore.activePartitionId
			? inventoryStore.lastScan(partitionStore.activePartitionId)
			: null
	);

	// --- Vendor filter state ---
	type VendorFilter = 'all' | string;
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

	// --- Derived unique vendors ---
	let uniqueVendors = $derived(
		[...new Set(allDevices.map((d) => d.vendor))].sort()
	);

	// --- Filtered rows ---
	let filteredDevices = $derived(
		allDevices.filter((d) => {
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
			vendor: d.vendor,
			model: d.model,
			version: d.version,
			serial: d.serial,
			site: d.site
		}))
	);

	let selectedDevice = $derived<DisplayDevice | undefined>(
		selectedIndex !== undefined ? filteredDevices[selectedIndex] : undefined
	);

	// --- Vendor counts ---
	let vendorCounts = $derived(
		allDevices.reduce<Record<string, number>>((acc, d) => {
			acc[d.vendor] = (acc[d.vendor] ?? 0) + 1;
			return acc;
		}, {})
	);

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
		return allDevices
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
		const device = allDevices.find((d) => d.id === item.id);
		if (device) {
			goto(`/device/${encodeURIComponent(device.name)}`);
		}
	}

	const scanDateFmtOptions: Intl.DateTimeFormatOptions = {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	};

	// --- Last scan formatting ---
	let lastScanFormatted = $derived(
		lastScanRecord
			? new Date(lastScanRecord.completedAt).toLocaleString('en-GB', scanDateFmtOptions)
			: new Date(LAST_SCAN_TIME).toLocaleString('en-GB', scanDateFmtOptions)
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
				All ({allDevices.length})
			</Button>
			{#each uniqueVendors as vendor (vendor)}
				<Button
					variant={vendorFilter === vendor ? 'solid' : 'ghost'}
					size="sm"
					tui={getTui()}
					onclick={() => { vendorFilter = vendorFilter === vendor ? 'all' : vendor; selectedIndex = undefined; }}
				>
					<Badge variant="neutral" size="sm" tui={getTui()}>{vendor}</Badge>
					({vendorCounts[vendor] ?? 0})
				</Button>
			{/each}
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
								<Badge variant="neutral" tui={getTui()}>
									{selectedDevice.vendor}
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
				value={vendorFilter}
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

<script lang="ts">
	import { goto } from '$app/navigation';
	import { Table, Button, SearchInput, StatusBar, StatusBarItem, StatusBarSpacer } from '@plures/design-dojo';
	import type { SearchResult } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import type { ConfigBackup } from '$lib/types/config.types.js';
	import { mockBackups } from '$lib/data/mock-config.js';

	const getTui = useTui();
	let tui = $derived(getTui());

	let backups = $state<ConfigBackup[]>(mockBackups);
	let loading = $state(false);
	let searchQuery = $state('');
	let selectedIndex = $state<number | undefined>(undefined);

	const columns = [
		{ key: 'hostname', label: 'Device', width: 16 },
		{ key: 'version', label: 'Version', width: 10 },
		{ key: 'timestamp', label: 'Timestamp', width: 22 },
		{ key: 'size', label: 'Size', width: 10 }
	];

	let filteredBackups = $derived.by(() => {
		if (!searchQuery.trim()) return backups;
		const q = searchQuery.toLowerCase();
		return backups.filter(
			(b) =>
				b.hostname.toLowerCase().includes(q) ||
				b.version.toLowerCase().includes(q)
		);
	});

	let rows = $derived(
		filteredBackups.map((b) => ({
			hostname: b.hostname,
			version: b.version,
			timestamp: new Date(b.timestamp).toLocaleString(),
			size: formatSize(b.size)
		}))
	);

	let uniqueDevices = $derived(new Set(backups.map((b) => b.hostname)).size);

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	function handleSelect(index: number): void {
		selectedIndex = index;
		const backup = filteredBackups[index];
		if (backup) {
			goto(`/config/${encodeURIComponent(backup.hostname)}`);
		}
	}

	async function handleCollectAll(): Promise<void> {
		loading = true;
		try {
			const { listBackups } = await import('$lib/services/config.js');
			backups = await listBackups();
		} catch {
			// Fallback: keep mock data
		} finally {
			loading = false;
		}
	}

	async function handleSearch(query: string): Promise<SearchResult[]> {
		searchQuery = query;
		if (!query) return [];
		const q = query.toLowerCase();
		return filteredBackups
			.filter(
				(b) =>
					b.hostname.toLowerCase().includes(q) ||
					b.version.toLowerCase().includes(q)
			)
			.slice(0, 8)
			.map((b) => ({
				id: b.hostname,
				text: `${b.hostname} (${b.version})`,
				score: 1
			}));
	}

	function handleSearchSelect(result: SearchResult): void {
		const index = filteredBackups.findIndex((b) => b.hostname === result.id);
		if (index >= 0) handleSelect(index);
	}
</script>

{#if tui}
	<div class="config-page tui">
		<div class="header">
			<span class="title">CONFIG BACKUPS</span>
			<span class="info">{filteredBackups.length} backups | {uniqueDevices} devices</span>
		</div>

		{#if searchQuery}
			<div class="search-info">Filter: {searchQuery}</div>
		{/if}

		<Table
			{columns}
			{rows}
			selected={selectedIndex}
			onselect={handleSelect}
			tui={true}
		/>

		<div class="tui-actions">
			<span>[C] Collect All</span>
			<span>[/] Search</span>
			<span>[Enter] View Device</span>
		</div>
	</div>
{:else}
	<div class="config-page gui">
		<div class="toolbar">
			<h2>Config Backups</h2>
			<div class="toolbar-actions">
				<SearchInput
					placeholder="Search devices…"
					onSearch={handleSearch}
					onSelect={handleSearchSelect}
					cols={30}
				/>
				<Button variant="solid" onclick={handleCollectAll} disabled={loading}>
					{loading ? 'Collecting…' : '📥 Collect All'}
				</Button>
				<Button variant="outline" onclick={() => goto('/config/diff')}>
					📊 Diff Viewer
				</Button>
			</div>
		</div>

		<div class="table-container">
			<Table
				{columns}
				{rows}
				selected={selectedIndex}
				onselect={handleSelect}
			/>
		</div>

		<StatusBar>
			<StatusBarItem label="Backups" value={String(filteredBackups.length)} />
			<StatusBarItem label="Devices" value={String(uniqueDevices)} color="accent" separator />
			<StatusBarSpacer />
			<StatusBarItem label="View" value="Config Management" />
		</StatusBar>
	</div>
{/if}

<style>
	/* ── TUI ─────────────────────────────────────────── */

	.config-page.tui {
		font-family: monospace;
		color: var(--color-text, #e0e0e0);
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.config-page.tui .header {
		display: flex;
		justify-content: space-between;
		padding: 0.5ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.config-page.tui .title {
		color: var(--color-accent, #7fefbd);
		font-weight: bold;
	}

	.config-page.tui .info {
		color: var(--tui-text-dim, #888);
	}

	.config-page.tui .search-info {
		color: var(--tui-text-dim, #888);
		margin-bottom: 0.5ch;
	}

	.config-page.tui .tui-actions {
		display: flex;
		gap: 2ch;
		padding: 0.5ch 0;
		border-top: 1px solid var(--tui-border, #0f3460);
		color: var(--tui-text-dim, #888);
		font-size: 0.875rem;
	}

	/* ── GUI ─────────────────────────────────────────── */

	.config-page.gui {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.toolbar h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.table-container {
		flex: 1;
		overflow: auto;
	}
</style>

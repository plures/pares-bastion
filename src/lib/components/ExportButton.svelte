<script lang="ts">
	import { Button } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import { exportTable, type ExportFormat, type ExportOptions } from '$lib/services/export.js';

	interface Props {
		columns: string[];
		rows: Record<string, unknown>[];
		filename?: string;
		sheetName?: string;
		feature?: string;
		format?: ExportFormat;
		label?: string;
	}

	let {
		columns,
		rows,
		filename = 'export',
		sheetName = 'Data',
		feature,
		format,
		label = '📥 Export',
	}: Props = $props();

	const getTui = useTui();
	let tui = $derived(getTui());

	let exporting = $state(false);
	let lastResult = $state<string | null>(null);

	async function handleExport(): Promise<void> {
		exporting = true;
		lastResult = null;

		const result = await exportTable(columns, rows, {
			filename,
			sheetName,
			feature,
			format,
		});

		if (result.ok) {
			lastResult = result.gated
				? `Exported ${rows.length > 10 ? '10' : rows.length} rows (free tier limit). Upgrade for full export.`
				: `Exported ${rows.length} rows → ${result.filename}`;
		} else {
			lastResult = `Error: ${result.error}`;
		}

		exporting = false;
		setTimeout(() => { lastResult = null; }, 4000);
	}
</script>

{#if tui}
	<span
		role="button"
		tabindex="0"
		class="tui-export"
		onclick={handleExport}
		onkeydown={(e) => { if (e.key === 'Enter') handleExport(); }}
	>
		[E] Export
		{#if lastResult}<span class="tui-result"> {lastResult}</span>{/if}
	</span>
{:else}
	<div class="export-wrapper">
		<Button variant="outline" onclick={handleExport} disabled={exporting}>
			{exporting ? '⏳ Exporting…' : label}
		</Button>
		{#if lastResult}
			<span class="export-result">{lastResult}</span>
		{/if}
	</div>
{/if}

<style>
	.tui-export { cursor: pointer; color: var(--tui-text-dim, #888); }
	.tui-result { color: var(--color-success, #56d364); font-size: 0.875em; }
	.export-wrapper { display: flex; align-items: center; gap: 0.5rem; }
	.export-result { font-size: 0.8125rem; color: var(--color-text-secondary, #a9b1d6); }
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { Table, Button, Badge, SplitPane, Pane, StatusBar, StatusBarItem, StatusBarSpacer } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import type { ConfigBackup } from '$lib/types/config.types.js';
	import { mockBackups, mockConfigContent } from '$lib/data/mock-config.js';

	interface Props {
		data: { hostname: string };
	}

	let { data }: Props = $props();
	let hostname = $derived(data.hostname);

	const getTui = useTui();
	let tui = $derived(getTui());

	let backups = $state<ConfigBackup[]>([]);
	let selectedIndex = $state<number | undefined>(undefined);
	let selectedConfig = $state<string | null>(null);
	let rollbackTarget = $state<string | null>(null);
	let rollbackConfirm = $state(false);
	let rollbackMessage = $state<string | null>(null);
	let collecting = $state(false);

	// Reset state when hostname changes (SvelteKit may reuse the component)
	$effect(() => {
		backups = mockBackups.filter((b) => b.hostname === hostname);
		selectedIndex = undefined;
		selectedConfig = null;
		rollbackTarget = null;
		rollbackConfirm = false;
		rollbackMessage = null;
	});

	const columns = [
		{ key: 'version', label: 'Version', width: 10 },
		{ key: 'timestamp', label: 'Timestamp', width: 22 },
		{ key: 'size', label: 'Size', width: 10 }
	];

	let rows = $derived(
		backups.map((b) => ({
			version: b.version,
			timestamp: new Date(b.timestamp).toLocaleString(),
			size: formatSize(b.size)
		}))
	);

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	function handleSelect(index: number): void {
		selectedIndex = index;
		const backup = backups[index];
		if (backup) {
			const key = `${backup.hostname}:${backup.version}`;
			selectedConfig = mockConfigContent[key] ?? `! No config content available for ${key}`;
			rollbackTarget = backup.version;
			rollbackConfirm = false;
			rollbackMessage = null;
		}
	}

	async function handleBackup(): Promise<void> {
		collecting = true;
		try {
			const { backupConfig } = await import('$lib/services/config.js');
			const newBackup = await backupConfig(hostname);
			backups = [newBackup, ...backups];
		} catch {
			// Fallback: keep existing data
		} finally {
			collecting = false;
		}
	}

	async function handleRollback(): Promise<void> {
		if (!rollbackTarget) return;
		try {
			const { rollbackConfig } = await import('$lib/services/config.js');
			const result = await rollbackConfig(hostname, rollbackTarget);
			rollbackMessage = result.message;
		} catch {
			rollbackMessage = `Rolled back ${hostname} to ${rollbackTarget} (mock)`;
		}
		rollbackConfirm = false;
	}

	function handleDiff(): void {
		if (backups.length < 2) return;
		const versionA = backups.length > 1 ? backups[1].version : backups[0].version;
		const versionB = backups[0].version;
		goto(
			`/config/diff?hostname=${encodeURIComponent(hostname)}&a=${encodeURIComponent(versionA)}&b=${encodeURIComponent(versionB)}`
		);
	}
</script>

{#if tui}
	<div class="config-detail tui">
		<div class="header">
			<span class="title">CONFIG: {hostname}</span>
			<span class="breadcrumb">
				<a href="/config">&lt; Back</a>
			</span>
		</div>

		<Table
			{columns}
			{rows}
			selected={selectedIndex}
			onselect={handleSelect}
			tui={true}
		/>

		{#if selectedConfig}
			<div class="config-preview">
				<div class="preview-title">── Config {rollbackTarget} ──</div>
				<pre class="config-content">{selectedConfig}</pre>
			</div>
		{/if}

		{#if rollbackMessage}
			<div class="rollback-msg">{rollbackMessage}</div>
		{/if}

		{#if rollbackConfirm}
			<div class="rollback-confirm">
				Rollback to {rollbackTarget}? [Y/N]
			</div>
		{/if}

		<div class="tui-actions">
			<span>[B] Backup</span>
			<span>[D] Diff</span>
			<span>[R] Rollback</span>
			<span>[Enter] View</span>
		</div>
	</div>
{:else}
	<div class="config-detail gui">
		<div class="toolbar">
			<div class="toolbar-left">
				<Button variant="ghost" onclick={() => goto('/config')}>← Back</Button>
				<h2>{hostname}</h2>
				<Badge variant="info" size="sm">{backups.length} versions</Badge>
			</div>
			<div class="toolbar-actions">
				<Button variant="solid" onclick={handleBackup} disabled={collecting}>
					{collecting ? 'Collecting…' : '📥 Backup Now'}
				</Button>
				<Button variant="outline" onclick={handleDiff} disabled={backups.length < 2}>
					📊 Diff Versions
				</Button>
			</div>
		</div>

		<SplitPane direction="horizontal">
			<Pane flex={1} title="Version History" scrollable>
				<Table
					{columns}
					{rows}
					selected={selectedIndex}
					onselect={handleSelect}
				/>
			</Pane>
			<Pane flex={2} title={selectedConfig ? `Config — ${rollbackTarget}` : 'Select a version'} scrollable>
				{#if selectedConfig}
					<pre class="config-viewer">{selectedConfig}</pre>

					<div class="rollback-panel">
						{#if rollbackMessage}
							<Badge variant="success">{rollbackMessage}</Badge>
						{:else if rollbackConfirm}
							<div class="confirm-bar">
								<span>Rollback to <strong>{rollbackTarget}</strong>?</span>
								<Button variant="solid" size="sm" onclick={handleRollback}>Confirm Rollback</Button>
								<Button variant="ghost" size="sm" onclick={() => (rollbackConfirm = false)}>Cancel</Button>
							</div>
						{:else}
							<Button variant="solid" size="sm" onclick={() => (rollbackConfirm = true)}>
								🔄 Rollback to {rollbackTarget}
							</Button>
						{/if}
					</div>
				{:else}
					<div class="empty-state">
						<p>Select a config version from the left panel to view its content.</p>
					</div>
				{/if}
			</Pane>
		</SplitPane>

		<StatusBar>
			<StatusBarItem label="Device" value={hostname} color="accent" />
			<StatusBarItem label="Versions" value={String(backups.length)} separator />
			<StatusBarSpacer />
			<StatusBarItem label="View" value="Config History" />
		</StatusBar>
	</div>
{/if}

<style>
	/* ── TUI ─────────────────────────────────────────── */

	.config-detail.tui {
		font-family: monospace;
		color: var(--color-text, #e0e0e0);
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.config-detail.tui .header {
		display: flex;
		justify-content: space-between;
		padding: 0.5ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.config-detail.tui .title {
		color: var(--color-accent, #7fefbd);
		font-weight: bold;
	}

	.config-detail.tui .breadcrumb a {
		color: var(--tui-text-dim, #888);
		text-decoration: none;
	}

	.config-detail.tui .config-preview {
		flex: 1;
		overflow: auto;
		margin-top: 0.5ch;
	}

	.config-detail.tui .preview-title {
		color: var(--color-accent, #7fefbd);
		margin-bottom: 0.5ch;
	}

	.config-detail.tui .config-content {
		margin: 0;
		white-space: pre;
		font-size: 0.875rem;
	}

	.config-detail.tui .rollback-msg {
		color: var(--color-success, #a6e3a1);
		padding: 0.5ch 0;
	}

	.config-detail.tui .rollback-confirm {
		color: var(--color-warning, #f9e2af);
		padding: 0.5ch 0;
	}

	.config-detail.tui .tui-actions {
		display: flex;
		gap: 2ch;
		padding: 0.5ch 0;
		border-top: 1px solid var(--tui-border, #0f3460);
		color: var(--tui-text-dim, #888);
		font-size: 0.875rem;
	}

	/* ── GUI ─────────────────────────────────────────── */

	.config-detail.gui {
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

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toolbar-left h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.config-viewer {
		font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
		margin: 0;
		padding: 1rem;
		white-space: pre;
		color: var(--color-text, #cdd6f4);
		background: var(--surface-1, #181825);
		border-radius: var(--radius-sm, 4px);
		overflow: auto;
	}

	.config-viewer :global(.keyword) {
		color: var(--color-accent, #89b4fa);
	}

	.rollback-panel {
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--color-border, #333);
	}

	.confirm-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted, #888);
	}
</style>

<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button, Badge, SplitPane, Pane, StatusBar, StatusBarItem, StatusBarSpacer } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import type { DiffResult } from '$lib/types/config.types.js';
	import { parseDiff, searchDiffLines } from '$lib/domain/diff-utils.js';
	import type { DiffSummary, DiffSearchMatch } from '$lib/domain/diff-utils.js';
	import { mockBackups, mockDiff } from '$lib/data/mock-config.js';

	const getTui = useTui();
	let tui = $derived(getTui());

	let hostnameParam = $derived($page.url.searchParams.get('hostname') ?? '');
	let versionA = $derived($page.url.searchParams.get('a') ?? '');
	let versionB = $derived($page.url.searchParams.get('b') ?? '');

	let diffResult = $state<DiffResult | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let selectedHostname = $state('');
	let selectedVersionA = $state('');
	let selectedVersionB = $state('');
	let diffSearch = $state('');
	let currentMatchIndex = $state(0);
	let showLineNumbers = $state(true);

	// Initialize from URL params
	$effect(() => {
		selectedHostname = hostnameParam;
		selectedVersionA = versionA;
		selectedVersionB = versionB;
	});

	// Auto-load diff when params are present
	$effect(() => {
		if (selectedHostname && selectedVersionA && selectedVersionB) {
			loadDiff();
		}
	});

	let uniqueHostnames = $derived([...new Set(mockBackups.map((b) => b.hostname))]);

	let availableVersions = $derived.by(() => {
		if (!selectedHostname) return [];
		return mockBackups
			.filter((b) => b.hostname === selectedHostname)
			.map((b) => b.version);
	});

	let diffSummary: DiffSummary = $derived(
		diffResult ? parseDiff(diffResult.unified) : { lines: [], hunks: [], totalAdditions: 0, totalDeletions: 0, totalChanged: 0 }
	);

	let diffLines = $derived(diffSummary.lines);

	let searchMatches: DiffSearchMatch[] = $derived(searchDiffLines(diffSummary.lines, diffSearch));

	function jumpToMatch(index: number): void {
		if (searchMatches.length === 0) return;
		currentMatchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
		const match = searchMatches[currentMatchIndex];
		const el = document.getElementById(`diff-line-${match.line.lineNumber}`);
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function jumpToHunk(startLine: number): void {
		const el = document.getElementById(`diff-line-${startLine}`);
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function loadDiff(): Promise<void> {
		if (!selectedHostname || !selectedVersionA || !selectedVersionB) return;
		loading = true;
		error = null;
		diffResult = null;
		try {
			const { diffConfigs } = await import('$lib/services/config.js');
			diffResult = await diffConfigs(selectedHostname, selectedVersionA, selectedVersionB);
		} catch (err) {
			error = `Failed to load diff: ${err instanceof Error ? err.message : 'unknown error'}. Showing mock data.`;
			// Fallback to mock
			if (
				selectedHostname === mockDiff.hostname &&
				selectedVersionA === mockDiff.versionA &&
				selectedVersionB === mockDiff.versionB
			) {
				diffResult = mockDiff;
			} else {
				diffResult = {
					hostname: selectedHostname,
					versionA: selectedVersionA,
					versionB: selectedVersionB,
					unified: `--- ${selectedHostname} ${selectedVersionA}\n+++ ${selectedHostname} ${selectedVersionB}\n@@ -1,3 +1,3 @@\n hostname ${selectedHostname}\n-! version ${selectedVersionA}\n+! version ${selectedVersionB}\n end`,
					additions: 1,
					deletions: 1
				};
			}
		} finally {
			loading = false;
		}
	}
</script>

{#if tui}
	<div class="diff-page tui">
		<div class="header">
			<span class="title">CONFIG DIFF</span>
			<a href="/config" class="back">&lt; Back</a>
		</div>

		{#if diffResult}
			<div class="diff-info">
				{diffResult.hostname}: {diffResult.versionA} → {diffResult.versionB}
				| +{diffSummary.totalAdditions} -{diffSummary.totalDeletions} ({diffSummary.totalChanged} changed)
				| {diffSummary.hunks.length} hunk{diffSummary.hunks.length === 1 ? '' : 's'}
			</div>
			<pre class="diff-content">{#each diffLines as line}<span id="diff-line-{line.lineNumber}" class="diff-line {line.type}"><span class="line-num">{String(line.lineNumber).padStart(4, ' ')}</span> {line.text}</span>
{/each}</pre>
		{:else if loading}
			<div class="loading">Loading diff…</div>
		{:else}
			<div class="empty">No diff loaded. Provide hostname, version A, and version B.</div>
		{/if}
	</div>
{:else}
	<div class="diff-page gui">
		<div class="toolbar">
			<div class="toolbar-left">
				<Button variant="ghost" onclick={() => goto('/config')}>← Back</Button>
				<h2>Config Diff</h2>
			</div>
			<div class="toolbar-controls">
				<label class="select-label">
					Device
					<select bind:value={selectedHostname}>
						<option value="">Select device…</option>
						{#each uniqueHostnames as h}
							<option value={h}>{h}</option>
						{/each}
					</select>
				</label>
				<label class="select-label">
					Version A
					<select bind:value={selectedVersionA} disabled={!selectedHostname}>
						<option value="">Select…</option>
						{#each availableVersions as v}
							<option value={v}>{v}</option>
						{/each}
					</select>
				</label>
				<label class="select-label">
					Version B
					<select bind:value={selectedVersionB} disabled={!selectedHostname}>
						<option value="">Select…</option>
						{#each availableVersions as v}
							<option value={v}>{v}</option>
						{/each}
					</select>
				</label>
				<Button
					variant="solid"
					onclick={loadDiff}
					disabled={loading || !selectedHostname || !selectedVersionA || !selectedVersionB}
				>
					{loading ? 'Loading…' : 'Compare'}
				</Button>
			</div>
		</div>

		{#if error}
			<div class="error-banner">
				<Badge variant="danger">{error}</Badge>
			</div>
		{/if}

		{#if diffResult}
			<SplitPane direction="horizontal">
				<Pane flex={0} title="Hunks" scrollable>
					<div class="hunk-nav">
						{#each diffSummary.hunks as hunk, i}
							<button class="hunk-btn" onclick={() => jumpToHunk(hunk.startLine)}>
								<span class="hunk-label">Hunk {i + 1}</span>
								<span class="hunk-stats">
									<Badge variant="success" size="sm">+{hunk.additions}</Badge>
									<Badge variant="danger" size="sm">-{hunk.deletions}</Badge>
								</span>
							</button>
						{/each}
						{#if diffSummary.hunks.length === 0}
							<div class="hunk-empty">No hunks</div>
						{/if}
					</div>
				</Pane>
				<Pane flex={1} title="Diff: {diffResult.versionA} → {diffResult.versionB}" scrollable>
					<div class="diff-toolbar">
						<div class="diff-stats">
							<Badge variant="success" size="sm">+{diffSummary.totalAdditions}</Badge>
							<Badge variant="danger" size="sm">-{diffSummary.totalDeletions}</Badge>
							<span class="diff-stat-label">{diffSummary.totalChanged} changed · {diffSummary.hunks.length} hunk{diffSummary.hunks.length === 1 ? '' : 's'}</span>
						</div>
						<div class="diff-search-bar">
							<input
								type="search"
								class="diff-search-input"
								placeholder="Search diff…"
								bind:value={diffSearch}
								aria-label="Search diff content"
							/>
							{#if searchMatches.length > 0}
								<span class="match-count">{currentMatchIndex + 1}/{searchMatches.length}</span>
								<Button variant="ghost" size="sm" onclick={() => jumpToMatch(currentMatchIndex - 1)}>↑</Button>
								<Button variant="ghost" size="sm" onclick={() => jumpToMatch(currentMatchIndex + 1)}>↓</Button>
							{/if}
							<label class="line-num-toggle">
								<input type="checkbox" bind:checked={showLineNumbers} />
								#
							</label>
						</div>
					</div>
					<pre class="diff-viewer">{#each diffLines as line}<span id="diff-line-{line.lineNumber}" class="diff-line {line.type}">{#if showLineNumbers}<span class="line-num">{String(line.lineNumber).padStart(4, ' ')}</span> {/if}{line.text}</span>
{/each}</pre>
				</Pane>
			</SplitPane>
		{:else if !loading}
			<div class="empty-state">
				<p>Select a device and two config versions to compare.</p>
			</div>
		{/if}

		<StatusBar>
			<StatusBarItem
				label="Device"
				value={diffResult ? diffResult.hostname : 'Config Diff'}
				color="accent"
			/>
			{#if diffResult}
				<StatusBarItem label="Versions" value="{diffResult.versionA} → {diffResult.versionB}" separator />
				<StatusBarItem label="Added" value="+{diffSummary.totalAdditions}" color="success" separator />
				<StatusBarItem label="Removed" value="-{diffSummary.totalDeletions}" color="error" separator />
				<StatusBarItem label="Hunks" value={String(diffSummary.hunks.length)} separator />
			{/if}
			<StatusBarSpacer />
			<StatusBarItem label="View" value="Diff Viewer" />
		</StatusBar>
	</div>
{/if}

<style>
	/* ── TUI ─────────────────────────────────────────── */

	.diff-page.tui {
		font-family: monospace;
		color: var(--color-text, #e0e0e0);
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.diff-page.tui .header {
		display: flex;
		justify-content: space-between;
		padding: 0.5ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.diff-page.tui .title {
		color: var(--color-accent, #7fefbd);
		font-weight: bold;
	}

	.diff-page.tui .back {
		color: var(--tui-text-dim, #888);
		text-decoration: none;
	}

	.diff-page.tui .diff-info {
		color: var(--tui-text-dim, #888);
		padding: 0.25ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.diff-page.tui .diff-content {
		flex: 1;
		overflow: auto;
		margin: 0;
		font-size: 0.875rem;
	}

	.diff-page.tui .loading,
	.diff-page.tui .empty {
		color: var(--tui-text-dim, #888);
		padding: 1ch 0;
	}

	/* ── GUI ─────────────────────────────────────────── */

	.diff-page.gui {
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
		flex-wrap: wrap;
		gap: 0.5rem;
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

	.toolbar-controls {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
	}

	.select-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted, #888);
		font-weight: 600;
	}

	.select-label select {
		padding: 4px 8px;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-2, #313244);
		color: var(--color-text, #cdd6f4);
		font-size: 0.875rem;
	}

	.error-banner {
		padding: 0.5rem 1rem;
	}

	.diff-stats {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.diff-viewer {
		font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
		margin: 0;
		padding: 1rem;
		white-space: pre;
		overflow: auto;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--color-text-muted, #888);
	}

	/* ── Diff line coloring (shared) ────────────────── */

	.diff-line {
		display: block;
	}

	.diff-line.add {
		color: var(--color-success, #a6e3a1);
		background: rgba(166, 227, 161, 0.08);
	}

	.diff-line.del {
		color: var(--color-error, #f38ba8);
		background: rgba(243, 139, 168, 0.08);
	}

	.diff-line.header {
		color: var(--color-accent, #89b4fa);
	}

	.diff-line.context {
		color: var(--color-text, #cdd6f4);
	}

	/* ── Hunk navigation ───────────────────────────────── */

	.hunk-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 140px;
		padding: 0.5rem;
	}

	.hunk-btn {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		background: transparent;
		border: 1px solid var(--color-border, #333);
		border-radius: var(--radius-sm, 4px);
		color: var(--color-text, #cdd6f4);
		cursor: pointer;
		text-align: left;
		font-size: 0.75rem;
		transition: background 0.15s ease;
	}

	.hunk-btn:hover {
		background: var(--surface-2, #313244);
	}

	.hunk-label {
		font-weight: 600;
	}

	.hunk-stats {
		display: flex;
		gap: 4px;
	}

	.hunk-empty {
		color: var(--color-text-muted, #888);
		font-size: 0.75rem;
		padding: 8px;
	}

	/* ── Diff toolbar ──────────────────────────────────── */

	.diff-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--color-border, #333);
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.diff-stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted, #888);
	}

	.diff-search-bar {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.diff-search-input {
		padding: 3px 8px;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-2, #313244);
		color: var(--color-text, #cdd6f4);
		font-size: 0.8125rem;
		outline: none;
		width: 160px;
	}

	.match-count {
		font-size: 0.75rem;
		color: var(--color-text-muted, #888);
		font-variant-numeric: tabular-nums;
	}

	.line-num-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 0.75rem;
		color: var(--color-text-muted, #888);
		cursor: pointer;
	}

	/* ── Line numbers ──────────────────────────────────── */

	.line-num {
		color: var(--color-text-muted, #555);
		user-select: none;
		font-size: 0.75rem;
	}

	.diff-page.tui .line-num {
		color: var(--tui-text-dim, #555);
	}
</style>

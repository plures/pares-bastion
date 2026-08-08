<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Badge, SplitPane, Pane, StatusBar, StatusBarItem, StatusBarSpacer, Table } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import {
		extractTemplateVariables,
		renderBulkPreviews,
		validateTemplate,
	} from '$lib/domain/bulk-config.js';
	import type { BulkConfigTemplate, BulkConfigTarget, BulkConfigPreview } from '$lib/domain/bulk-config.js';
	import { mockBackups } from '$lib/data/mock-config.js';

	const getTui = useTui();
	let tui = $derived(getTui());

	// ── State ─────────────────────────────────────────────────────────────

	let templateName = $state('NTP Config');
	let templateBody = $state(`ntp server {{ntpServer}}
ntp source {{sourceInterface}}
!`);
	let templateErrors = $state<string[]>([]);

	let selectedDevices = $state<Set<string>>(new Set());
	let variableValues = $state<Record<string, Record<string, string>>>({});
	let previews = $state<BulkConfigPreview[]>([]);
	let activePreviewIndex = $state<number | undefined>(undefined);

	// ── Derived ───────────────────────────────────────────────────────────

	let availableDevices = $derived([...new Set(mockBackups.map((b) => b.hostname))]);
	let variables = $derived(extractTemplateVariables(templateBody));
	let selectedCount = $derived(selectedDevices.size);

	let deviceColumns = [
		{ key: 'hostname', label: 'Device', width: 20 },
		{ key: 'selected', label: 'Selected', width: 10 },
	];

	let deviceRows = $derived(
		availableDevices.map((h) => ({
			hostname: h,
			selected: selectedDevices.has(h) ? '✓' : '',
		}))
	);

	let previewColumns = [
		{ key: 'hostname', label: 'Device', width: 16 },
		{ key: 'status', label: 'Status', width: 12 },
		{ key: 'warnings', label: 'Warnings', width: 10 },
	];

	let previewRows = $derived(
		previews.map((p) => ({
			hostname: p.hostname,
			status: p.warnings.length > 0 ? '⚠ Warning' : '✓ Ready',
			warnings: String(p.warnings.length),
		}))
	);

	// ── Actions ───────────────────────────────────────────────────────────

	function toggleDevice(index: number): void {
		const hostname = availableDevices[index];
		if (!hostname) return;
		const next = new Set(selectedDevices);
		if (next.has(hostname)) {
			next.delete(hostname);
		} else {
			next.add(hostname);
		}
		selectedDevices = next;
	}

	function selectAll(): void {
		selectedDevices = new Set(availableDevices);
	}

	function selectNone(): void {
		selectedDevices = new Set();
	}

	function generatePreviews(): void {
		templateErrors = validateTemplate(templateBody);
		if (templateErrors.length > 0) return;

		const template: BulkConfigTemplate = {
			id: 'user-template',
			name: templateName,
			body: templateBody,
			variables,
		};

		const targets: BulkConfigTarget[] = [...selectedDevices].map((hostname) => ({
			hostname,
			variables: variableValues[hostname] ?? {},
		}));

		previews = renderBulkPreviews(template, targets);
		activePreviewIndex = previews.length > 0 ? 0 : undefined;
	}

	function handlePreviewSelect(index: number): void {
		activePreviewIndex = index;
	}

	function setVariable(hostname: string, varName: string, value: string): void {
		const current = variableValues[hostname] ?? {};
		variableValues = {
			...variableValues,
			[hostname]: { ...current, [varName]: value },
		};
	}
</script>

{#if tui}
	<div class="bulk-page tui">
		<div class="header">
			<span class="title">BULK CONFIG PREVIEW</span>
			<a href="/config" class="back">&lt; Back</a>
		</div>

		<div class="tui-section">
			Template: {templateName} | Devices: {selectedCount} | Vars: {variables.join(', ') || 'none'}
		</div>

		{#if previews.length > 0}
			{#each previews as preview}
				<div class="tui-preview-block">
					<div class="tui-preview-header">── {preview.hostname} {preview.warnings.length > 0 ? `[${preview.warnings.length} warnings]` : '[OK]'} ──</div>
					<pre class="tui-preview-content">{preview.rendered}</pre>
				</div>
			{/each}
		{:else}
			<div class="tui-empty">Select devices and generate previews.</div>
		{/if}

		<div class="tui-actions">
			<span>[G] Generate</span>
			<span>[A] Select All</span>
			<span>[N] Select None</span>
		</div>
	</div>
{:else}
	<div class="bulk-page gui">
		<div class="toolbar">
			<div class="toolbar-left">
				<Button variant="ghost" onclick={() => goto('/config')}>← Back</Button>
				<h2>Bulk Config Preview</h2>
			</div>
			<div class="toolbar-actions">
				<Button variant="ghost" size="sm" onclick={selectAll}>Select All</Button>
				<Button variant="ghost" size="sm" onclick={selectNone}>Clear</Button>
				<Button
					variant="solid"
					onclick={generatePreviews}
					disabled={selectedCount === 0}
				>
					🔄 Generate Previews ({selectedCount})
				</Button>
			</div>
		</div>

		{#if templateErrors.length > 0}
			<div class="error-banner">
				{#each templateErrors as err}
					<Badge variant="danger">{err}</Badge>
				{/each}
			</div>
		{/if}

		<SplitPane direction="horizontal">
			<!-- Left: template + device selection -->
			<Pane flex={1} title="Template & Devices" scrollable>
				<div class="template-editor">
					<label class="field-label">
						Template Name
						<input type="text" class="field-input" bind:value={templateName} />
					</label>
					<label class="field-label">
						Template Body
						<textarea class="template-textarea" bind:value={templateBody} rows={8}></textarea>
					</label>
					{#if variables.length > 0}
						<div class="vars-label">Variables: {variables.map((v) => `{{${v}}}`).join(', ')}</div>
					{/if}
				</div>

				<div class="device-select-section">
					<h3 class="section-title">Devices</h3>
					<Table
						columns={deviceColumns}
						rows={deviceRows}
						onselect={toggleDevice}
					/>
				</div>

				{#if selectedCount > 0 && variables.length > 0}
					<div class="var-values-section">
						<h3 class="section-title">Variable Values</h3>
						{#each [...selectedDevices] as hostname}
							<div class="var-device-group">
								<div class="var-device-name">{hostname}</div>
								{#each variables as varName}
									<label class="var-field">
										<span class="var-name">{`{{${varName}}}`}</span>
										<input
											type="text"
											class="field-input"
											value={variableValues[hostname]?.[varName] ?? ''}
											oninput={(e) => setVariable(hostname, varName, (e.target as HTMLInputElement).value)}
										/>
									</label>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</Pane>

			<!-- Right: preview results -->
			<Pane flex={1} title={previews.length > 0 ? `Previews (${previews.length})` : 'Preview'} scrollable>
				{#if previews.length > 0}
					<Table
						columns={previewColumns}
						rows={previewRows}
						selected={activePreviewIndex}
						onselect={handlePreviewSelect}
					/>

					{#if activePreviewIndex !== undefined && previews[activePreviewIndex]}
						{@const preview = previews[activePreviewIndex]}
						<div class="preview-detail">
							<div class="preview-header">
								<strong>{preview.hostname}</strong>
								{#if preview.warnings.length > 0}
									{#each preview.warnings as w}
										<Badge variant="warning" size="sm">{w}</Badge>
									{/each}
								{:else}
									<Badge variant="success" size="sm">Ready</Badge>
								{/if}
							</div>
							<pre class="preview-content">{preview.rendered}</pre>
						</div>
					{/if}
				{:else}
					<div class="empty-state">
						<p>Configure a template, select devices, fill variable values, then generate previews.</p>
					</div>
				{/if}
			</Pane>
		</SplitPane>

		<StatusBar>
			<StatusBarItem label="Template" value={templateName} color="accent" />
			<StatusBarItem label="Devices" value={String(selectedCount)} separator />
			<StatusBarItem label="Variables" value={String(variables.length)} separator />
			{#if previews.length > 0}
				<StatusBarItem label="Previews" value={String(previews.length)} separator />
				<StatusBarItem
					label="Warnings"
					value={String(previews.filter((p) => p.warnings.length > 0).length)}
					color={previews.some((p) => p.warnings.length > 0) ? 'warning' : 'success'}
					separator
				/>
			{/if}
			<StatusBarSpacer />
			<StatusBarItem label="View" value="Bulk Config" />
		</StatusBar>
	</div>
{/if}

<style>
	/* ── TUI ─────────────────────────────────────────── */

	.bulk-page.tui {
		font-family: monospace;
		color: var(--color-text, #e0e0e0);
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.bulk-page.tui .header {
		display: flex;
		justify-content: space-between;
		padding: 0.5ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.bulk-page.tui .title {
		color: var(--color-accent, #7fefbd);
		font-weight: bold;
	}

	.bulk-page.tui .back {
		color: var(--tui-text-dim, #888);
		text-decoration: none;
	}

	.bulk-page.tui .tui-section {
		color: var(--tui-text-dim, #888);
		padding: 0.25ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.bulk-page.tui .tui-preview-block {
		margin-bottom: 1ch;
	}

	.bulk-page.tui .tui-preview-header {
		color: var(--color-accent, #7fefbd);
		margin-bottom: 0.25ch;
	}

	.bulk-page.tui .tui-preview-content {
		margin: 0;
		font-size: 0.875rem;
	}

	.bulk-page.tui .tui-empty {
		color: var(--tui-text-dim, #888);
		padding: 1ch 0;
	}

	.bulk-page.tui .tui-actions {
		display: flex;
		gap: 2ch;
		padding: 0.5ch 0;
		border-top: 1px solid var(--tui-border, #0f3460);
		color: var(--tui-text-dim, #888);
		font-size: 0.875rem;
		margin-top: auto;
	}

	/* ── GUI ─────────────────────────────────────────── */

	.bulk-page.gui {
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

	.error-banner {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
	}

	/* Template editor */
	.template-editor {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.field-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted, #888);
	}

	.field-input {
		padding: 4px 8px;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-2, #313244);
		color: var(--color-text, #cdd6f4);
		font-size: 0.875rem;
	}

	.template-textarea {
		font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
		padding: 0.5rem;
		border: 1px solid var(--color-border, #444);
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-1, #181825);
		color: var(--color-text, #cdd6f4);
		resize: vertical;
	}

	.vars-label {
		font-size: 0.75rem;
		color: var(--color-accent, #89b4fa);
	}

	/* Device selection */
	.device-select-section,
	.var-values-section {
		padding: 0.75rem 1rem;
	}

	.section-title {
		font-size: 0.8125rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
		color: var(--color-text, #cdd6f4);
	}

	.var-device-group {
		margin-bottom: 0.75rem;
		padding: 0.5rem;
		border: 1px solid var(--color-border, #333);
		border-radius: var(--radius-sm, 4px);
	}

	.var-device-name {
		font-weight: 600;
		font-size: 0.8125rem;
		margin-bottom: 0.5rem;
		color: var(--color-text, #cdd6f4);
	}

	.var-field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted, #888);
	}

	.var-name {
		min-width: 100px;
		font-family: monospace;
		color: var(--color-accent, #89b4fa);
	}

	/* Preview detail */
	.preview-detail {
		padding: 1rem;
		border-top: 1px solid var(--color-border, #333);
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.preview-content {
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

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--color-text-muted, #888);
	}
</style>

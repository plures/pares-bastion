<script lang="ts">
	import {
		Table,
		Button,
		Badge,
		StatusBar,
		StatusBarItem,
		StatusBarSpacer
	} from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import type {
		AnsibleInventory,
		InventoryFormat,
		PlaybookTemplate,
		GeneratedPlaybook
	} from '$lib/types/ansible.types.js';
	import { mockInventory } from '$lib/data/mock-inventory.js';
	import {
		mockInventoryYaml,
		mockInventoryJson,
		mockPlaybookTemplates,
		mockGeneratedPlaybook
	} from '$lib/data/mock-ansible.js';

	// ── TUI context ──────────────────────────────────────────────────────────

	const getTui = useTui();
	let tui = $derived(getTui());

	// ── Tab state ────────────────────────────────────────────────────────────

	type TabView = 'inventory' | 'playbook';
	let activeTab = $state<TabView>('inventory');

	// ── Inventory state ──────────────────────────────────────────────────────

	let inventoryFormat = $state<InventoryFormat>('yaml');
	let inventoryVendorFilter = $state('');
	let inventorySiteFilter = $state('');
	let inventoryPreview = $state<AnsibleInventory | null>(null);
	let inventoryLoading = $state(false);

	// ── Playbook state ───────────────────────────────────────────────────────

	let templates = $state<PlaybookTemplate[]>(mockPlaybookTemplates);
	let selectedTemplateId = $state('');
	let selectedDevices = $state<string[]>([]);
	let templateVariables = $state<Record<string, string>>({});
	let playbookPreview = $state<GeneratedPlaybook | null>(null);
	let playbookLoading = $state(false);
	let tuiTemplateIndex = $state(0);

	// ── Load templates from backend on mount ─────────────────────────────────

	let templatesLoaded = false;

	async function loadTemplates(): Promise<void> {
		try {
			const { listPlaybookTemplates } = await import('$lib/services/ansible.js');
			templates = await listPlaybookTemplates();
		} catch (err) {
			console.warn('Failed to load playbook templates, using mock data:', err);
			templates = mockPlaybookTemplates;
		}
	}

	$effect(() => {
		if (!templatesLoaded) {
			templatesLoaded = true;
			loadTemplates();
		}
	});

	// ── Derived ──────────────────────────────────────────────────────────────

	let devices = $derived(
		mockInventory.map((d) => ({
			id: d.id,
			name: d.name,
			host: d.host,
			vendor: d.vendor,
			site: d.site
		}))
	);

	let deviceRows = $derived(
		devices.map((d) => ({
			name: d.name,
			host: d.host,
			vendor: d.vendor,
			site: d.site,
			selected: selectedDevices.includes(d.name) ? '✓' : ''
		}))
	);

	let selectedTemplate = $derived(templates.find((t) => t.id === selectedTemplateId));

	let vendors = $derived([...new Set(mockInventory.map((d) => d.vendor))]);
	let sites = $derived([...new Set(mockInventory.map((d) => d.site))]);

	// ── Inventory actions ────────────────────────────────────────────────────

	async function handleExportPreview(): Promise<void> {
		inventoryLoading = true;
		try {
			const { exportAnsibleInventory } = await import('$lib/services/ansible.js');
			const filter: Record<string, string | string[] | undefined> = {};
			if (inventoryVendorFilter) filter.vendor = inventoryVendorFilter;
			if (inventorySiteFilter) filter.site = inventorySiteFilter;
			inventoryPreview = await exportAnsibleInventory(
				inventoryFormat,
				Object.keys(filter).length > 0 ? filter : undefined
			);
		} catch (err) {
			console.warn('Ansible inventory export failed, using mock data:', err);
			inventoryPreview =
				inventoryFormat === 'json' ? mockInventoryJson : mockInventoryYaml;
		} finally {
			inventoryLoading = false;
		}
	}

	// ── Playbook actions ─────────────────────────────────────────────────────

	function handleDeviceToggle(index: number): void {
		const device = devices[index];
		if (!device) return;
		if (selectedDevices.includes(device.name)) {
			selectedDevices = selectedDevices.filter((d) => d !== device.name);
		} else {
			selectedDevices = [...selectedDevices, device.name];
		}
	}

	function handleSelectAllDevices(): void {
		if (selectedDevices.length === devices.length) {
			selectedDevices = [];
		} else {
			selectedDevices = devices.map((d) => d.name);
		}
	}

	function handleTemplateChange(templateId: string): void {
		selectedTemplateId = templateId;
		const tmpl = templates.find((t) => t.id === templateId);
		if (tmpl) {
			const vars: Record<string, string> = {};
			for (const v of tmpl.variables) {
				vars[v.name] = v.defaultValue;
			}
			templateVariables = vars;
		}
	}

	async function handleGeneratePlaybook(): Promise<void> {
		if (!selectedTemplateId || selectedDevices.length === 0) return;
		playbookLoading = true;
		try {
			const { generatePlaybook } = await import('$lib/services/ansible.js');
			playbookPreview = await generatePlaybook(
				selectedDevices,
				selectedTemplateId,
				templateVariables
			);
		} catch (err) {
			console.warn('Playbook generation failed, using mock data:', err);
			playbookPreview = mockGeneratedPlaybook;
		} finally {
			playbookLoading = false;
		}
	}

	// ── TUI keyboard handler ─────────────────────────────────────────────────

	function handleTuiKeydown(e: KeyboardEvent): void {
		if (!tui) return;

		const key = e.key.toLowerCase();

		// Tab switching
		if (key === 'tab') {
			e.preventDefault();
			activeTab = activeTab === 'inventory' ? 'playbook' : 'inventory';
			return;
		}
		if (key === '1') {
			activeTab = 'inventory';
			return;
		}
		if (key === '2') {
			activeTab = 'playbook';
			return;
		}

		if (activeTab === 'inventory') {
			if (key === 'e') {
				handleExportPreview();
			} else if (key === 'f') {
				inventoryFormat = inventoryFormat === 'yaml' ? 'json' : 'yaml';
			}
		} else {
			if (key === 'a') {
				handleSelectAllDevices();
			} else if (key === 'g') {
				handleGeneratePlaybook();
			} else if (key === 't') {
				// Cycle through templates
				if (templates.length > 0) {
					tuiTemplateIndex = (tuiTemplateIndex + 1) % templates.length;
					handleTemplateChange(templates[tuiTemplateIndex].id);
				}
			}
		}
	}

	const deviceColumns = [
		{ key: 'name', label: 'Device', width: 16 },
		{ key: 'host', label: 'IP', width: 14 },
		{ key: 'vendor', label: 'Vendor', width: 12 },
		{ key: 'site', label: 'Site', width: 10 },
		{ key: 'selected', label: '✓', width: 4 }
	];
</script>

{#if tui}
	<!-- ── TUI MODE ──────────────────────────────────────────────────────── -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="ansible-page tui" tabindex="-1" onkeydown={handleTuiKeydown}>
		<div class="header">
			<span class="title">ANSIBLE INTEGRATION</span>
			<span class="tabs">
				<span
					class="tab"
					class:active={activeTab === 'inventory'}
					role="tab"
					tabindex="0"
					aria-selected={activeTab === 'inventory'}
					onclick={() => (activeTab = 'inventory')}
					onkeydown={(e) => e.key === 'Enter' && (activeTab = 'inventory')}
				>[1] Inventory</span>
				<span
					class="tab"
					class:active={activeTab === 'playbook'}
					role="tab"
					tabindex="0"
					aria-selected={activeTab === 'playbook'}
					onclick={() => (activeTab = 'playbook')}
					onkeydown={(e) => e.key === 'Enter' && (activeTab = 'playbook')}
				>[2] Playbook</span>
			</span>
		</div>

		{#if activeTab === 'inventory'}
			<div class="section">
				<div class="section-header">Export Inventory ({inventoryFormat.toUpperCase()})</div>
				{#if inventoryPreview}
					<div class="preview-scroll">
						<pre>{inventoryPreview.content}</pre>
					</div>
					<div class="info">
						{inventoryPreview.groupCount} groups | {inventoryPreview.hostCount} hosts
					</div>
				{:else}
					<div class="info">Press [E] to generate inventory preview</div>
				{/if}
			</div>
			<div class="tui-actions">
				<span>[E] Export Preview</span>
				<span>[F] Toggle Format</span>
				<span>[Tab] Switch Tab</span>
			</div>
		{:else}
			<div class="section">
				<div class="section-header">
					Playbook Generator
					{#if selectedTemplate}
						— {selectedTemplate.name}
					{:else}
						— Press [T] to select template
					{/if}
				</div>
				<Table
					columns={deviceColumns}
					rows={deviceRows}
					onselect={handleDeviceToggle}
					tui={true}
				/>
				{#if playbookPreview}
					<div class="preview-scroll">
						<pre>{playbookPreview.content}</pre>
					</div>
				{/if}
			</div>
			<div class="tui-actions">
				<span>[T] Cycle Template</span>
				<span>[A] Select All</span>
				<span>[G] Generate</span>
				<span>[Tab] Switch Tab</span>
			</div>
		{/if}
	</div>
{:else}
	<!-- ── GUI MODE ──────────────────────────────────────────────────────── -->
	<div class="ansible-page gui">
		<div class="toolbar">
			<h2>Ansible Integration</h2>
			<div class="tab-bar">
				<button
					class="tab-btn"
					class:active={activeTab === 'inventory'}
					onclick={() => (activeTab = 'inventory')}
				>📦 Inventory Export</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'playbook'}
					onclick={() => (activeTab = 'playbook')}
				>📝 Playbook Generator</button>
			</div>
		</div>

		{#if activeTab === 'inventory'}
			<!-- ── Inventory Export ─────────────────────────────────────── -->
			<div class="content">
				<div class="controls">
					<div class="control-group">
						<label for="inv-format">Format</label>
						<select
							id="inv-format"
							bind:value={inventoryFormat}
						>
							<option value="yaml">YAML</option>
							<option value="json">JSON</option>
						</select>
					</div>
					<div class="control-group">
						<label for="inv-vendor">Vendor</label>
						<select id="inv-vendor" bind:value={inventoryVendorFilter}>
							<option value="">All Vendors</option>
							{#each vendors as v}
								<option value={v}>{v}</option>
							{/each}
						</select>
					</div>
					<div class="control-group">
						<label for="inv-site">Site</label>
						<select id="inv-site" bind:value={inventorySiteFilter}>
							<option value="">All Sites</option>
							{#each sites as s}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</div>
					<Button
						variant="solid"
						onclick={handleExportPreview}
						disabled={inventoryLoading}
					>
						{inventoryLoading ? 'Generating…' : '📤 Generate Preview'}
					</Button>
				</div>

				{#if inventoryPreview}
					<div class="preview-panel">
						<div class="preview-header">
							<span class="preview-title">
								Inventory Preview
								<Badge variant="info">{inventoryPreview.format.toUpperCase()}</Badge>
							</span>
							<span class="preview-meta">
								{inventoryPreview.groupCount} groups · {inventoryPreview.hostCount} hosts
							</span>
						</div>
						<div class="preview-content">
							<pre>{inventoryPreview.content}</pre>
						</div>
					</div>
				{:else}
					<div class="placeholder">
						<p>Select format and filters, then click <strong>Generate Preview</strong> to view the Ansible inventory.</p>
					</div>
				{/if}
			</div>
		{:else}
			<!-- ── Playbook Generator ──────────────────────────────────── -->
			<div class="content playbook-layout">
				<div class="playbook-sidebar">
					<div class="sidebar-section">
						<h3>Template</h3>
						<select
							class="template-select"
							value={selectedTemplateId}
							onchange={(e) => handleTemplateChange(e.currentTarget.value)}
						>
							<option value="">Select a template…</option>
							{#each templates as t}
								<option value={t.id}>{t.name}</option>
							{/each}
						</select>
						{#if selectedTemplate}
							<p class="template-desc">{selectedTemplate.description}</p>
						{/if}
					</div>

					{#if selectedTemplate}
						<div class="sidebar-section">
							<h3>Variables</h3>
							{#each selectedTemplate.variables as v}
								<div class="var-field">
									<label for="var-{v.name}">
										{v.name}
										{#if v.required}<span class="required">*</span>{/if}
									</label>
									<input
										id="var-{v.name}"
										type="text"
										value={templateVariables[v.name] ?? v.defaultValue}
										oninput={(e) => {
											templateVariables = {
												...templateVariables,
												[v.name]: e.currentTarget.value
											};
										}}
										placeholder={v.description}
									/>
								</div>
							{/each}
						</div>
					{/if}

					<div class="sidebar-section">
						<h3>
							Devices
							<Button variant="outline" onclick={handleSelectAllDevices}>
								{selectedDevices.length === devices.length ? 'Deselect All' : 'Select All'}
							</Button>
						</h3>
						<div class="device-list">
							{#each devices as d}
								<label class="device-checkbox">
									<input
										type="checkbox"
										checked={selectedDevices.includes(d.name)}
										onchange={() => {
											if (selectedDevices.includes(d.name)) {
												selectedDevices = selectedDevices.filter((n) => n !== d.name);
											} else {
												selectedDevices = [...selectedDevices, d.name];
											}
										}}
									/>
									<span class="device-name">{d.name}</span>
									<Badge variant="neutral">{d.vendor}</Badge>
								</label>
							{/each}
						</div>
					</div>

					<Button
						variant="solid"
						onclick={handleGeneratePlaybook}
						disabled={playbookLoading || !selectedTemplateId || selectedDevices.length === 0}
					>
						{playbookLoading ? 'Generating…' : '⚡ Generate Playbook'}
					</Button>
				</div>

				<div class="playbook-main">
					{#if playbookPreview}
						<div class="preview-panel">
							<div class="preview-header">
								<span class="preview-title">
									{playbookPreview.name}
									<Badge variant="success">{playbookPreview.deviceCount} devices</Badge>
								</span>
							</div>
							<div class="preview-content">
								<pre>{playbookPreview.content}</pre>
							</div>
						</div>
					{:else}
						<div class="placeholder">
							<p>Select a template, choose devices, and click <strong>Generate Playbook</strong> to preview.</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<StatusBar>
			<StatusBarItem label="Tab" value={activeTab === 'inventory' ? 'Inventory Export' : 'Playbook Generator'} />
			{#if activeTab === 'inventory' && inventoryPreview}
				<StatusBarItem label="Groups" value={String(inventoryPreview.groupCount)} color="accent" separator />
				<StatusBarItem label="Hosts" value={String(inventoryPreview.hostCount)} separator />
			{/if}
			{#if activeTab === 'playbook'}
				<StatusBarItem label="Selected" value={String(selectedDevices.length)} color="accent" separator />
				<StatusBarItem label="Template" value={selectedTemplate?.name ?? 'None'} separator />
			{/if}
			<StatusBarSpacer />
			<StatusBarItem label="View" value="Ansible" />
		</StatusBar>
	</div>
{/if}

<style>
	/* ── TUI ─────────────────────────────────────────── */

	.ansible-page.tui {
		font-family: monospace;
		color: var(--color-text, #e0e0e0);
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.ansible-page.tui .header {
		display: flex;
		justify-content: space-between;
		padding: 0.5ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.ansible-page.tui .title {
		color: var(--color-accent, #7fefbd);
		font-weight: bold;
	}

	.ansible-page.tui .tabs {
		display: flex;
		gap: 2ch;
	}

	.ansible-page.tui .tab {
		cursor: pointer;
		color: var(--tui-text-dim, #888);
	}

	.ansible-page.tui .tab.active {
		color: var(--color-accent, #7fefbd);
		text-decoration: underline;
	}

	.ansible-page.tui .section {
		flex: 1;
		overflow: auto;
	}

	.ansible-page.tui .section-header {
		color: var(--color-accent, #7fefbd);
		border-bottom: 1px dashed var(--tui-border, #0f3460);
		padding-bottom: 0.5ch;
		margin-bottom: 0.5ch;
	}

	.ansible-page.tui .info {
		color: var(--tui-text-dim, #888);
		padding: 0.5ch 0;
	}

	.ansible-page.tui .preview-scroll {
		overflow: auto;
		flex: 1;
		max-height: 60vh;
	}

	.ansible-page.tui .preview-scroll pre {
		margin: 0;
		white-space: pre;
		font-size: 0.875rem;
	}

	.ansible-page.tui .tui-actions {
		display: flex;
		gap: 2ch;
		padding: 0.5ch 0;
		border-top: 1px solid var(--tui-border, #0f3460);
		color: var(--tui-text-dim, #888);
		font-size: 0.875rem;
	}

	/* ── GUI ─────────────────────────────────────────── */

	.ansible-page.gui {
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

	.tab-bar {
		display: flex;
		gap: 0.25rem;
	}

	.tab-btn {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border, #444);
		background: transparent;
		color: var(--color-text, #ccc);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.tab-btn.active {
		background: var(--color-accent, #7fefbd);
		color: var(--color-bg, #111);
		border-color: var(--color-accent, #7fefbd);
	}

	.content {
		flex: 1;
		overflow: auto;
		padding: 1rem;
	}

	/* ── Inventory ───────────────────────────────────── */

	.controls {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.control-group label {
		font-size: 0.75rem;
		color: var(--color-text-dim, #999);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.control-group select {
		padding: 0.375rem 0.5rem;
		background: var(--color-bg-secondary, #1a1a2e);
		color: var(--color-text, #e0e0e0);
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		font-size: 0.875rem;
	}

	/* ── Preview panel ───────────────────────────────── */

	.preview-panel {
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-secondary, #1a1a2e);
		border-bottom: 1px solid var(--color-border, #333);
	}

	.preview-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.preview-meta {
		font-size: 0.75rem;
		color: var(--color-text-dim, #999);
	}

	.preview-content {
		overflow: auto;
		max-height: 55vh;
		padding: 0.75rem;
	}

	.preview-content pre {
		margin: 0;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.8125rem;
		line-height: 1.6;
		white-space: pre;
	}

	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: 200px;
		color: var(--color-text-dim, #999);
	}

	.placeholder p {
		text-align: center;
		max-width: 400px;
	}

	/* ── Playbook layout ─────────────────────────────── */

	.playbook-layout {
		display: flex;
		gap: 1rem;
	}

	.playbook-sidebar {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-y: auto;
	}

	.playbook-main {
		flex: 1;
		min-width: 0;
	}

	.sidebar-section {
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		padding: 0.75rem;
	}

	.sidebar-section h3 {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.template-select {
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: var(--color-bg-secondary, #1a1a2e);
		color: var(--color-text, #e0e0e0);
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.template-desc {
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--color-text-dim, #999);
	}

	/* ── Variables ────────────────────────────────────── */

	.var-field {
		margin-bottom: 0.5rem;
	}

	.var-field label {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-dim, #999);
		margin-bottom: 0.125rem;
	}

	.var-field .required {
		color: var(--color-warning, #ff6b6b);
	}

	.var-field input {
		width: 100%;
		padding: 0.3rem 0.5rem;
		background: var(--color-bg-secondary, #1a1a2e);
		color: var(--color-text, #e0e0e0);
		border: 1px solid var(--color-border, #333);
		border-radius: 4px;
		font-size: 0.8125rem;
		box-sizing: border-box;
	}

	/* ── Device list ──────────────────────────────────── */

	.device-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
	}

	.device-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0.125rem 0;
	}

	.device-checkbox input[type='checkbox'] {
		accent-color: var(--color-accent, #7fefbd);
	}

	.device-name {
		flex: 1;
	}
</style>

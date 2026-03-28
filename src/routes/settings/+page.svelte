<script lang="ts">
	import { Button, Badge, SearchInput, StatusBar, StatusBarItem, StatusBarSpacer } from '@plures/design-dojo';
	import type { SearchResult } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import { yamlSettingsStore } from '$lib/stores/yaml-settings.svelte.js';
	import {
		CATEGORIES,
		SETTINGS_SCHEMA,
		getSettingsByCategory,
		type SettingCategory,
		type SettingDefinition,
	} from '$lib/types/settings-schema.js';

	const getTui = useTui();
	let tui = $derived(getTui());

	// ── State ────────────────────────────────────────────────────────────────

	type SettingsView = 'gui' | 'yaml';

	let view = $state<SettingsView>('gui');
	let activeCategory = $state<SettingCategory>('general');
	let searchQuery = $state('');
	let successMsg = $state('');

	// ── Search ──────────────────────────────────────────────────────────────

	let filteredSettings = $derived.by(() => {
		if (!searchQuery.trim()) return getSettingsByCategory(activeCategory);
		const q = searchQuery.toLowerCase();
		return SETTINGS_SCHEMA.filter(
			(s) =>
				s.label.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q) ||
				s.key.toLowerCase().includes(q),
		);
	});

	async function handleSearch(query: string): Promise<SearchResult[]> {
		searchQuery = query;
		if (!query) return [];
		const q = query.toLowerCase();
		return SETTINGS_SCHEMA.filter(
			(s) =>
				s.label.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q) ||
				s.key.toLowerCase().includes(q),
		)
			.slice(0, 10)
			.map((s) => ({
				id: s.key,
				text: `${s.label} — ${s.description}`,
				score: 1,
			}));
	}

	function handleSearchSelect(result: SearchResult): void {
		const setting = SETTINGS_SCHEMA.find((s) => s.key === result.id);
		if (setting) {
			activeCategory = setting.category;
			searchQuery = '';
		}
	}

	// ── Value Updates ───────────────────────────────────────────────────────

	function handleValueChange(key: string, value: unknown): void {
		yamlSettingsStore.set(key, value);
	}

	function handleYamlApply(): void {
		if (yamlSettingsStore.applyYaml()) {
			successMsg = 'Settings applied.';
			setTimeout(() => { successMsg = ''; }, 3000);
		}
	}

	function handleReset(): void {
		yamlSettingsStore.resetToDefaults();
		successMsg = 'Settings reset to defaults.';
		setTimeout(() => { successMsg = ''; }, 3000);
	}

	function handleExportYaml(): void {
		const blob = new Blob([yamlSettingsStore.yamlText], { type: 'text/yaml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'netops-settings.yaml';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!--  TUI MODE                                                               -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{#if tui}
	<div class="settings-page tui">
		<div class="header">
			<span class="title">SETTINGS</span>
			<span class="info">YAML ({yamlSettingsStore.dirty ? 'unsaved' : 'saved'})</span>
		</div>

		<!-- Category tabs -->
		<div class="tui-tabs">
			{#each CATEGORIES as cat}
				<span
					role="button"
					tabindex="0"
					class="tui-tab"
					class:active={activeCategory === cat.id}
					onclick={() => { activeCategory = cat.id; }}
					onkeydown={(e) => { if (e.key === 'Enter') activeCategory = cat.id; }}
				>{cat.icon} {cat.label}</span>
			{/each}
		</div>

		<!-- Settings list -->
		<div class="tui-settings-list">
			{#each filteredSettings as setting}
				<div class="tui-setting">
					<div class="tui-setting-label">{setting.label}</div>
					<div class="tui-setting-desc">{setting.description}</div>
					<div class="tui-setting-value">
						{#if setting.type === 'boolean'}
							<span
								role="checkbox"
								tabindex="0"
								aria-checked={yamlSettingsStore.get(setting.key) === true}
								onclick={() => handleValueChange(setting.key, !yamlSettingsStore.get(setting.key))}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleValueChange(setting.key, !yamlSettingsStore.get(setting.key)); }}
							>[{yamlSettingsStore.get(setting.key) ? 'X' : ' '}]</span>
						{:else if setting.type === 'enum'}
							<select
								value={String(yamlSettingsStore.get(setting.key))}
								onchange={(e) => handleValueChange(setting.key, (e.currentTarget as HTMLSelectElement).value)}
								class="tui-select"
								aria-label={setting.label}
							>
								{#each setting.options ?? [] as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						{:else}
							<input
								type={setting.type === 'number' ? 'number' : 'text'}
								value={String(yamlSettingsStore.get(setting.key) ?? '')}
								onchange={(e) => {
									const v = setting.type === 'number' ? Number((e.currentTarget as HTMLInputElement).value) : (e.currentTarget as HTMLInputElement).value;
									handleValueChange(setting.key, v);
								}}
								class="tui-input"
								aria-label={setting.label}
								min={setting.min}
								max={setting.max}
								placeholder={setting.placeholder}
							/>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="tui-actions">
			<span>[Tab] Category</span>
			<span>[/] Search</span>
			<span>[R] Reset defaults</span>
			<span>[E] Export YAML</span>
		</div>
	</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!--  GUI MODE                                                               -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{:else}
	<div class="settings-page gui">
		<!-- Toolbar -->
		<div class="toolbar">
			<h2>Settings</h2>
			<div class="toolbar-actions">
				<SearchInput
					placeholder="Search settings…"
					onSearch={handleSearch}
					onSelect={handleSearchSelect}
					cols={32}
				/>
				<div class="view-toggle">
					<button
						class="toggle-btn"
						class:active={view === 'gui'}
						onclick={() => { view = 'gui'; }}
					>GUI</button>
					<button
						class="toggle-btn"
						class:active={view === 'yaml'}
						onclick={() => { view = 'yaml'; }}
					>YAML</button>
				</div>
				<Button variant="ghost" onclick={handleExportYaml}>📥 Export</Button>
				<Button variant="ghost" onclick={handleReset}>↺ Reset</Button>
			</div>
		</div>

		{#if successMsg}
			<div class="banner success">{successMsg}</div>
		{/if}

		{#if view === 'yaml'}
			<!-- YAML Editor (VS Code style) -->
			<div class="yaml-editor-container">
				<div class="yaml-toolbar">
					<span class="yaml-filename">netops-settings.yaml</span>
					{#if yamlSettingsStore.dirty}
						<Badge variant="warning" size="sm">Modified</Badge>
					{/if}
					{#if yamlSettingsStore.parseError}
						<Badge variant="danger" size="sm">Parse Error</Badge>
					{/if}
					<div class="yaml-actions">
						<Button variant="solid" onclick={handleYamlApply} disabled={!yamlSettingsStore.dirty}>
							Apply Changes
						</Button>
					</div>
				</div>
				{#if yamlSettingsStore.parseError}
					<div class="yaml-error">{yamlSettingsStore.parseError}</div>
				{/if}
				<textarea
					class="yaml-editor"
					spellcheck="false"
					value={yamlSettingsStore.yamlText}
					oninput={(e) => yamlSettingsStore.updateYaml((e.currentTarget as HTMLTextAreaElement).value)}
				></textarea>
			</div>

		{:else}
			<!-- GUI Settings (VS Code style: sidebar categories + setting controls) -->
			<div class="settings-split">
				<!-- Category sidebar -->
				<nav class="category-nav" aria-label="Settings categories">
					{#each CATEGORIES as cat}
						<button
							class="category-btn"
							class:active={activeCategory === cat.id}
							onclick={() => { activeCategory = cat.id; searchQuery = ''; }}
						>
							<span class="cat-icon">{cat.icon}</span>
							<span class="cat-label">{cat.label}</span>
						</button>
					{/each}
				</nav>

				<!-- Settings panel -->
				<div class="settings-panel">
					{#if searchQuery}
						<div class="panel-header">
							<h3>Search Results</h3>
							<span class="result-count">{filteredSettings.length} settings</span>
						</div>
					{:else}
						{@const catMeta = CATEGORIES.find((c) => c.id === activeCategory)}
						<div class="panel-header">
							<h3>{catMeta?.icon} {catMeta?.label}</h3>
							<span class="panel-desc">{catMeta?.description}</span>
						</div>
					{/if}

					<div class="settings-list">
						{#each filteredSettings as setting (setting.key)}
							<div class="setting-item">
								<div class="setting-meta">
									<label for="setting-{setting.key}" class="setting-label">
										{setting.label}
									</label>
									<span class="setting-key">{setting.key}</span>
									<p class="setting-desc">{setting.description}</p>
								</div>
								<div class="setting-control">
									{#if setting.type === 'boolean'}
										<label class="toggle-switch">
											<input
												id="setting-{setting.key}"
												type="checkbox"
												checked={yamlSettingsStore.get(setting.key) === true}
												onchange={(e) => handleValueChange(setting.key, (e.currentTarget as HTMLInputElement).checked)}
											/>
											<span class="toggle-track"></span>
										</label>
									{:else if setting.type === 'enum'}
										<select
											id="setting-{setting.key}"
											class="setting-select"
											value={String(yamlSettingsStore.get(setting.key))}
											onchange={(e) => handleValueChange(setting.key, (e.currentTarget as HTMLSelectElement).value)}
										>
											{#each setting.options ?? [] as opt}
												<option value={opt}>{opt}</option>
											{/each}
										</select>
									{:else if setting.type === 'number'}
										<input
											id="setting-{setting.key}"
											type="number"
											class="setting-input number"
											value={String(yamlSettingsStore.get(setting.key) ?? '')}
											onchange={(e) => handleValueChange(setting.key, Number((e.currentTarget as HTMLInputElement).value))}
											min={setting.min}
											max={setting.max}
										/>
									{:else}
										<input
											id="setting-{setting.key}"
											type={setting.secret ? 'password' : 'text'}
											class="setting-input"
											value={String(yamlSettingsStore.get(setting.key) ?? '')}
											onchange={(e) => handleValueChange(setting.key, (e.currentTarget as HTMLInputElement).value)}
											placeholder={setting.placeholder}
										/>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<StatusBar>
			<StatusBarItem label="Category" value={activeCategory} />
			<StatusBarItem label="Settings" value={String(SETTINGS_SCHEMA.length)} />
			<StatusBarSpacer />
			<StatusBarItem label="Format" value="YAML" />
		</StatusBar>
	</div>
{/if}

<style>
	.settings-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

	/* ── TUI ─────────────────────────────── */
	.settings-page.tui { font-family: monospace; color: var(--color-text, #e0e0e0); }
	.settings-page.tui .header { display: flex; justify-content: space-between; padding: 0.5ch 0; border-bottom: 1px solid var(--tui-border, #0f3460); margin-bottom: 0.5ch; }
	.settings-page.tui .title { color: var(--color-accent, #7fefbd); font-weight: bold; }
	.settings-page.tui .info { color: var(--tui-text-dim, #888); }
	.tui-tabs { display: flex; gap: 1ch; flex-wrap: wrap; padding: 0.5ch 0; border-bottom: 1px solid var(--tui-border, #333); }
	.tui-tab { padding: 0.25ch 0.5ch; color: var(--tui-text-dim, #888); cursor: pointer; }
	.tui-tab.active { color: var(--color-accent, #7fefbd); border-bottom: 1px solid var(--color-accent, #7fefbd); }
	.tui-settings-list { flex: 1; overflow-y: auto; padding: 0.5ch 0; }
	.tui-setting { padding: 0.5ch 0; border-bottom: 1px solid var(--tui-border, #222); }
	.tui-setting-label { color: var(--color-text, #e0e0e0); font-weight: bold; }
	.tui-setting-desc { color: var(--tui-text-dim, #888); font-size: 0.875em; }
	.tui-setting-value { margin-top: 0.25ch; }
	.tui-select, .tui-input { background: transparent; border: 1px solid var(--tui-border, #444); color: inherit; font-family: monospace; padding: 0.25ch 0.5ch; font-size: 1em; }
	.tui-actions { display: flex; gap: 2ch; padding: 0.5ch 0; border-top: 1px solid var(--tui-border, #0f3460); color: var(--tui-text-dim, #888); font-size: 0.875rem; margin-top: auto; }

	/* ── GUI ─────────────────────────────── */
	.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border, #333); flex-shrink: 0; }
	.toolbar h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
	.toolbar-actions { display: flex; align-items: center; gap: 0.5rem; }
	.view-toggle { display: flex; border: 1px solid var(--color-border, #3b4261); border-radius: 4px; overflow: hidden; }
	.toggle-btn { padding: 0.25rem 0.75rem; background: transparent; border: none; color: var(--color-text-secondary, #a9b1d6); font-size: 0.8125rem; cursor: pointer; }
	.toggle-btn.active { background: var(--color-accent, #7aa2f7); color: var(--color-bg, #1a1b26); }
	.banner.success { background: var(--color-success-bg, #1a3a2a); color: var(--color-success, #9ece6a); padding: 0.5rem 1rem; font-size: 0.875rem; border-bottom: 1px solid var(--color-border, #333); }

	/* YAML editor */
	.yaml-editor-container { flex: 1; display: flex; flex-direction: column; min-height: 0; }
	.yaml-toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1rem; background: var(--color-bg-card, #1e2030); border-bottom: 1px solid var(--color-border, #3b4261); }
	.yaml-filename { font-family: 'SF Mono', monospace; font-size: 0.8125rem; color: var(--color-text-secondary, #a9b1d6); }
	.yaml-actions { margin-left: auto; }
	.yaml-error { padding: 0.5rem 1rem; background: rgba(248, 81, 73, 0.1); color: var(--color-error, #f85149); font-size: 0.8125rem; font-family: monospace; border-bottom: 1px solid var(--color-error, #f85149); }
	.yaml-editor { flex: 1; resize: none; border: none; background: var(--color-bg, #1a1b26); color: var(--color-text, #c0caf5); font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 13px; line-height: 1.6; padding: 1rem; outline: none; tab-size: 2; }

	/* Settings split */
	.settings-split { flex: 1; display: flex; min-height: 0; overflow: hidden; }
	.category-nav { width: 200px; flex-shrink: 0; border-right: 1px solid var(--color-border, #3b4261); padding: 0.5rem 0; overflow-y: auto; background: var(--color-bg-card, #1e2030); }
	.category-btn { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 1rem; background: transparent; border: none; color: var(--color-text-secondary, #a9b1d6); font-size: 0.875rem; cursor: pointer; text-align: left; }
	.category-btn:hover { background: var(--color-bg-hover, #292e42); }
	.category-btn.active { color: var(--color-text, #c0caf5); background: var(--color-bg-hover, #292e42); border-left: 2px solid var(--color-accent, #7aa2f7); }
	.cat-icon { font-size: 1rem; }
	.settings-panel { flex: 1; overflow-y: auto; padding: 0; }
	.panel-header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--color-border, #3b4261); }
	.panel-header h3 { margin: 0 0 0.25rem; font-size: 1rem; color: var(--color-text, #c0caf5); }
	.panel-desc, .result-count { color: var(--color-text-secondary, #565f89); font-size: 0.8125rem; }
	.settings-list { padding: 0; }
	.setting-item { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem 1.5rem; border-bottom: 1px solid var(--color-border, #292e42); gap: 2rem; }
	.setting-item:hover { background: var(--color-bg-card, #1e2030); }
	.setting-meta { flex: 1; min-width: 0; }
	.setting-label { display: block; font-size: 0.9375rem; font-weight: 500; color: var(--color-text, #c0caf5); cursor: pointer; }
	.setting-key { font-family: 'SF Mono', monospace; font-size: 0.75rem; color: var(--color-text-secondary, #565f89); }
	.setting-desc { margin: 0.25rem 0 0; font-size: 0.8125rem; color: var(--color-text-secondary, #a9b1d6); }
	.setting-control { flex-shrink: 0; min-width: 200px; display: flex; align-items: center; }

	/* Toggle switch */
	.toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
	.toggle-switch input { opacity: 0; width: 0; height: 0; }
	.toggle-track { position: absolute; inset: 0; background: var(--color-border, #3b4261); border-radius: 11px; transition: background 0.2s; }
	.toggle-track::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; background: var(--color-text, #c0caf5); border-radius: 50%; transition: transform 0.2s; }
	.toggle-switch input:checked + .toggle-track { background: var(--color-accent, #7aa2f7); }
	.toggle-switch input:checked + .toggle-track::before { transform: translateX(18px); }

	/* Inputs */
	.setting-select { padding: 0.375rem 0.625rem; border: 1px solid var(--color-border, #3b4261); border-radius: 4px; background: var(--color-bg, #1a1b26); color: var(--color-text, #c0caf5); font-size: 0.875rem; width: 100%; }
	.setting-input { padding: 0.375rem 0.625rem; border: 1px solid var(--color-border, #3b4261); border-radius: 4px; background: var(--color-bg, #1a1b26); color: var(--color-text, #c0caf5); font-size: 0.875rem; width: 100%; box-sizing: border-box; }
	.setting-input.number { max-width: 100px; }
	.setting-select:focus, .setting-input:focus { outline: 2px solid var(--color-accent, #7aa2f7); outline-offset: 1px; }
</style>

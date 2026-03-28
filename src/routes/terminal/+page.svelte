<script lang="ts">
	import { Button, Badge, StatusBar, StatusBarItem, StatusBarSpacer } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import { terminalStore } from '$lib/stores/terminal.svelte.js';
	import { SHELL_OPTIONS } from '$lib/types/terminal.types.js';
	import LicenseGate from '$lib/components/LicenseGate.svelte';

	const getTui = useTui();
	let tui = $derived(getTui());

	let commandInput = $state('');
	let showNewMenu = $state(false);

	function handleSendCommand(): void {
		if (!commandInput.trim() || !terminalStore.activeTabId) return;
		terminalStore.sendCommand(terminalStore.activeTabId, commandInput);
		commandInput = '';
	}

	function handleNewLocal(): void {
		terminalStore.createLocalTab();
		showNewMenu = false;
	}

	// Create a default tab if none exist
	$effect(() => {
		if (terminalStore.tabs.length === 0) {
			terminalStore.createLocalTab();
		}
	});
</script>

<LicenseGate feature="terminal" currentCount={terminalStore.tabs.length}>

{#if tui}
	<div class="terminal-page tui">
		<div class="header">
			<span class="title">TERMINAL</span>
			<!-- Tabs -->
			{#each terminalStore.tabs as tab}
				<span
					role="tab"
					tabindex="0"
					class="tui-tab"
					class:active={tab.id === terminalStore.activeTabId}
					onclick={() => terminalStore.setActiveTab(tab.id)}
					onkeydown={(e) => { if (e.key === 'Enter') terminalStore.setActiveTab(tab.id); }}
				>
					[{tab.label}]
				</span>
			{/each}
			<span role="button" tabindex="0" class="tui-tab-new"
				onclick={handleNewLocal}
				onkeydown={(e) => { if (e.key === 'Enter') handleNewLocal(); }}
			>[+]</span>
		</div>

		<!-- Terminal output -->
		<div class="tui-terminal-output">
			{#if terminalStore.activeTab}
				{#each terminalStore.activeTab.output as line}
					<div class="tui-line">{@html ansiToHtml(line)}</div>
				{/each}
			{/if}
		</div>

		<!-- Command input -->
		<div class="tui-command-line">
			<input
				type="text"
				bind:value={commandInput}
				class="tui-command-input"
				placeholder="Type a command..."
				onkeydown={(e) => { if (e.key === 'Enter') handleSendCommand(); }}
				aria-label="Terminal command input"
			/>
		</div>

		<div class="tui-actions">
			<span>[Enter] Send</span>
			<span>[Ctrl+T] New tab</span>
			<span>[Ctrl+W] Close tab</span>
			<span>[Ctrl+Tab] Switch</span>
		</div>
	</div>

{:else}
	<div class="terminal-page gui">
		<!-- Tab bar -->
		<div class="tab-bar">
			{#each terminalStore.tabs as tab}
				<div
					class="tab"
					class:active={tab.id === terminalStore.activeTabId}
					role="tab"
					tabindex="0"
					aria-selected={tab.id === terminalStore.activeTabId}
					onclick={() => terminalStore.setActiveTab(tab.id)}
					onkeydown={(e: KeyboardEvent) => {
						if (e.target !== e.currentTarget) return;
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							terminalStore.setActiveTab(tab.id);
						}
					}}
				>
					<span class="tab-icon">{tab.type === 'ssh' ? '🔗' : '💻'}</span>
					<span class="tab-label">{tab.label}</span>
					<Badge variant={tab.status === 'connected' ? 'success' : 'neutral'} size="sm">
						{tab.status === 'connected' ? '●' : '○'}
					</Badge>
					<button
						class="tab-close"
						onclick={(e: MouseEvent) => { e.stopPropagation(); terminalStore.closeTab(tab.id); }}
						onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}
						aria-label="Close tab"
					>×</button>
				</div>
			{/each}
			<div class="tab-new-container">
				<button class="tab-new" onclick={() => { showNewMenu = !showNewMenu; }}>
					＋
				</button>
				{#if showNewMenu}
					<div class="new-menu">
						<button class="menu-item" onclick={handleNewLocal}>
							🐚 New Local Terminal
						</button>
						<div class="menu-divider"></div>
						<div class="menu-label">Shells</div>
						{#each SHELL_OPTIONS as shell}
							<button class="menu-item" onclick={() => { terminalStore.createLocalTab(); showNewMenu = false; }}>
								{shell.icon} {shell.name}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Terminal area -->
		<div class="terminal-area">
			{#if terminalStore.activeTab}
				<div class="terminal-output">
					{#each terminalStore.activeTab.output as line}
						<div class="term-line">{@html ansiToHtml(line)}</div>
					{/each}
				</div>

				<!-- Command input -->
				<div class="command-bar">
					<input
						type="text"
						bind:value={commandInput}
						class="command-input"
						placeholder="Type a command and press Enter..."
						onkeydown={(e) => { if (e.key === 'Enter') handleSendCommand(); }}
						aria-label="Terminal command input"
					/>
					<Button variant="solid" onclick={handleSendCommand}>Send</Button>
				</div>
			{:else}
				<div class="no-terminal">
					<p>No terminal open. Click ＋ to create one.</p>
				</div>
			{/if}
		</div>

		<StatusBar>
			<StatusBarItem label="Tabs" value={String(terminalStore.tabs.length)} />
			{#if terminalStore.activeTab}
				<StatusBarItem label="Type" value={terminalStore.activeTab.type} />
				{#if terminalStore.activeTab.hostname}
					<StatusBarItem label="Host" value={terminalStore.activeTab.hostname} />
				{/if}
			{/if}
			<StatusBarSpacer />
			<StatusBarItem label="View" value="Terminal" />
		</StatusBar>
	</div>
{/if}

</LicenseGate>

<script context="module" lang="ts">
	/** Minimal ANSI → HTML converter for terminal output display */
	function ansiToHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\x1b\[32m/g, '<span style="color:#9ece6a">')
			.replace(/\x1b\[34m/g, '<span style="color:#7aa2f7">')
			.replace(/\x1b\[36m/g, '<span style="color:#7dcfff">')
			.replace(/\x1b\[33m/g, '<span style="color:#e0af68">')
			.replace(/\x1b\[31m/g, '<span style="color:#f7768e">')
			.replace(/\x1b\[0m/g, '</span>');
	}
</script>

<style>
	.terminal-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

	/* TUI */
	.terminal-page.tui { font-family: monospace; color: var(--color-text, #e0e0e0); background: #0d1117; }
	.terminal-page.tui .header { display: flex; gap: 1ch; padding: 0.25ch 0; border-bottom: 1px solid var(--tui-border, #21262d); align-items: center; flex-wrap: wrap; }
	.terminal-page.tui .title { color: var(--color-accent, #7fefbd); font-weight: bold; margin-right: 1ch; }
	.tui-tab { padding: 0.125ch 0.5ch; color: var(--tui-text-dim, #484f58); cursor: pointer; }
	.tui-tab.active { color: var(--color-text, #e0e0e0); background: var(--tui-border, #21262d); }
	.tui-tab-new { color: var(--color-accent, #58a6ff); cursor: pointer; }
	.tui-terminal-output { flex: 1; overflow-y: auto; padding: 0.5ch; font-size: 13px; line-height: 1.4; }
	.tui-line { white-space: pre-wrap; word-break: break-all; }
	.tui-command-line { border-top: 1px solid var(--tui-border, #21262d); padding: 0.25ch; }
	.tui-command-input { width: 100%; background: transparent; border: none; color: var(--color-text, #e0e0e0); font-family: monospace; font-size: 13px; outline: none; }
	.tui-actions { display: flex; gap: 2ch; padding: 0.25ch 0; color: var(--tui-text-dim, #484f58); font-size: 0.875rem; }

	/* GUI */
	.tab-bar { display: flex; align-items: center; background: var(--color-bg-card, #1e2030); border-bottom: 1px solid var(--color-border, #3b4261); overflow-x: auto; flex-shrink: 0; }
	.tab { display: flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.75rem; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--color-text-secondary, #a9b1d6); font-size: 0.8125rem; cursor: pointer; white-space: nowrap; }
	.tab.active { color: var(--color-text, #c0caf5); border-bottom-color: var(--color-accent, #7aa2f7); background: var(--color-bg, #1a1b26); }
	.tab:hover { background: var(--color-bg-hover, #292e42); }
	.tab-close { background: none; border: none; color: var(--color-text-secondary, #565f89); font-size: 1rem; cursor: pointer; padding: 0 0.25rem; line-height: 1; }
	.tab-close:hover { color: var(--color-error, #f85149); }
	.tab-new-container { position: relative; }
	.tab-new { background: none; border: none; color: var(--color-accent, #7aa2f7); font-size: 1.125rem; padding: 0.5rem 0.75rem; cursor: pointer; }
	.new-menu { position: absolute; top: 100%; left: 0; background: var(--color-bg-card, #24283b); border: 1px solid var(--color-border, #3b4261); border-radius: 6px; padding: 0.25rem 0; min-width: 200px; z-index: 50; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
	.menu-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 0.75rem; background: none; border: none; color: var(--color-text, #c0caf5); font-size: 0.875rem; cursor: pointer; text-align: left; }
	.menu-item:hover { background: var(--color-bg-hover, #292e42); }
	.menu-divider { border-top: 1px solid var(--color-border, #3b4261); margin: 0.25rem 0; }
	.menu-label { padding: 0.25rem 0.75rem; font-size: 0.75rem; color: var(--color-text-secondary, #565f89); text-transform: uppercase; letter-spacing: 0.5px; }

	.terminal-area { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #0d1117; }
	.terminal-output { flex: 1; overflow-y: auto; padding: 0.75rem 1rem; font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 13px; line-height: 1.5; color: #c9d1d9; }
	.term-line { white-space: pre-wrap; word-break: break-all; }
	.command-bar { display: flex; gap: 0.5rem; padding: 0.5rem 1rem; border-top: 1px solid #21262d; background: #161b22; }
	.command-input { flex: 1; padding: 0.375rem 0.625rem; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #c9d1d9; font-family: 'SF Mono', monospace; font-size: 13px; outline: none; }
	.command-input:focus { border-color: #58a6ff; }
	.no-terminal { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary, #565f89); }
</style>

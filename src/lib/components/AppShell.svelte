<script lang="ts">
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';
	import { partitionStore } from '$lib/stores/partition-store.svelte.js';

	interface Props {
		/** Render in TUI (terminal) mode instead of GUI mode. */
		tui?: boolean;
		children: Snippet;
	}

	let { tui = false, children }: Props = $props();

	const navItems = [
		{ icon: '📊', label: 'Dashboard', href: '/' },
		{ icon: '📦', label: 'Inventory', href: '/inventory' },
		{ icon: '🔍', label: 'Scan', href: '/scan' },
		{ icon: '🩺', label: 'Health', href: '/health' },
		{ icon: '📋', label: 'Config', href: '/config' },
		{ icon: '🔐', label: 'Vault', href: '/vault' },
		{ icon: '🚇', label: 'Tunnels', href: '/tunnels' },
		{ icon: '💻', label: 'Terminal', href: '/terminal' },
		{ icon: '🗂️', label: 'Partitions', href: '/partitions' },
		{ icon: '🪪', label: 'License', href: '/license' },
		{ icon: '⚙️', label: 'Settings', href: '/settings' }
	] as const;

	function isActive(href: string): boolean {
		const pathname = $page.url.pathname;
		// Use `href + '/'` to avoid matching partial segments (e.g. /scan must not match /scanner).
		return pathname === href || pathname.startsWith(href + '/');
	}
</script>

{#if tui}
	<!-- TUI mode: plain text sidebar with > indicator for active item -->
	<div class="app-shell tui" role="application">
		<nav class="tui-sidebar" aria-label="Main navigation">
			<ul role="list">
				{#each navItems as item}
					<li>
						<a
							href={item.href}
							aria-current={isActive(item.href) ? 'page' : undefined}
							class:active={isActive(item.href)}
						>
							{isActive(item.href) ? '>' : ' '}
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<main class="tui-content">
			{@render children()}
		</main>
	</div>
{:else}
	<!-- GUI mode: styled sidebar with icons and hover effects -->
	<div class="app-shell gui" role="application">
		<nav class="gui-sidebar" aria-label="Main navigation">
			<!-- Partition Switcher -->
			{#if partitionStore.partitions.length > 1}
				<div class="partition-switcher">
					<select
						value={partitionStore.activePartitionId}
						onchange={(e) => partitionStore.switchTo((e.target as HTMLSelectElement).value)}
						aria-label="Active partition"
					>
						{#each partitionStore.partitions.filter(p => p.state !== 'archived') as p}
							<option value={p.partitionId}>
								{p.displayName} ({p.state === 'synced' ? '🔄' : p.state === 'suspended' ? '⏸️' : '📁'})
							</option>
						{/each}
					</select>
				</div>
			{:else if partitionStore.activePartition}
				<div class="partition-indicator">
					📁 {partitionStore.activePartition.displayName}
				</div>
			{/if}
			<ul role="list">
				{#each navItems as item}
					<li>
						<a
							href={item.href}
							aria-current={isActive(item.href) ? 'page' : undefined}
							class:active={isActive(item.href)}
						>
							<span class="nav-icon" aria-hidden="true">{item.icon}</span>
							<span class="nav-label">{item.label}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<main class="gui-content">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	/* ── Layout ─────────────────────────────────────────── */

	.app-shell {
		display: flex;
		height: 100dvh;
		overflow: hidden;
	}

	/* ── TUI mode ───────────────────────────────────────── */

	.app-shell.tui {
		font-family: monospace;
		background: var(--color-bg, #0d0d0d);
		color: var(--color-text, #e0e0e0);
	}

	.tui-sidebar {
		width: 16ch;
		min-width: 16ch;
		border-right: 1px solid var(--color-border, #333);
		padding: 1ch;
	}

	.tui-sidebar ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25ch;
	}

	.tui-sidebar a {
		display: block;
		color: inherit;
		text-decoration: none;
		padding: 0.25ch 0.5ch;
		white-space: pre;
	}

	.tui-sidebar a.active {
		color: var(--color-accent, #7fefbd);
	}

	.tui-sidebar a:focus-visible {
		outline: 1px solid var(--color-accent, #7fefbd);
		outline-offset: 1px;
	}

	.tui-content {
		flex: 1;
		overflow: auto;
		padding: 1ch;
	}

	/* ── GUI mode ───────────────────────────────────────── */

	.app-shell.gui {
		font-family: var(--font-sans, system-ui, sans-serif);
		background: var(--color-bg, #f5f5f5);
		color: var(--color-text, #1a1a1a);
	}

	.gui-sidebar {
		width: var(--sidebar-width, 200px);
		min-width: var(--sidebar-width, 200px);
		background: var(--color-bg-sidebar, #1e1e2e);
		color: var(--color-text-sidebar, #cdd6f4);
		display: flex;
		flex-direction: column;
		padding: var(--space-md, 1rem) 0;
		box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
	}

	.gui-sidebar ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.gui-sidebar a {
		display: flex;
		align-items: center;
		gap: var(--space-sm, 0.5rem);
		padding: 0.625rem var(--space-md, 1rem);
		color: inherit;
		text-decoration: none;
		border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
		margin-right: var(--space-sm, 0.5rem);
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.gui-sidebar a:hover {
		background: var(--color-bg-hover, rgba(205, 214, 244, 0.1));
	}

	.gui-sidebar a.active {
		background: var(--color-bg-active, rgba(137, 180, 250, 0.2));
		color: var(--color-accent, #89b4fa);
		font-weight: 600;
	}

	.gui-sidebar a:focus-visible {
		outline: 2px solid var(--color-accent, #89b4fa);
		outline-offset: 2px;
	}

	.nav-icon {
		font-size: 1.1em;
		flex-shrink: 0;
	}

	.nav-label {
		font-size: 0.9375rem;
	}

	.gui-content {
		flex: 1;
		overflow: auto;
		padding: var(--space-lg, 1.5rem);
		background: var(--color-bg-content, #ffffff);
	}
</style>

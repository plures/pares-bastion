<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		title?: string;
		children: Snippet;
		headerRight?: Snippet;
	}
	let { title, children, headerRight }: Props = $props();
</script>

<section class="card">
	{#if title}
		<header class="card__header">
			<h2 class="card__title">{title}</h2>
			{#if headerRight}{@render headerRight()}{/if}
		</header>
	{/if}
	<div class="card__body">
		{@render children()}
	</div>
</section>

<style>
	.card {
		background: var(--color-surface, #1a1b26);
		border: 1px solid var(--color-border, #2a2b3d);
		border-radius: var(--radius-lg, 8px);
		padding: var(--space-6, 1.5rem);
	}
	.card__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4, 1rem);
	}
	.card__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text, #e0e0e0);
	}
	.card__body {
		color: var(--color-text, #e0e0e0);
	}
</style>

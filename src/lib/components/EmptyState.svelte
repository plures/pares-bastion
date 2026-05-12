<script lang="ts">
	interface Props {
		icon?: string;
		title: string;
		description?: string;
	}
	let { icon = '📭', title, description }: Props = $props();
</script>

<div class="empty-state" role="status">
	<span class="empty-state__icon" aria-hidden="true">{icon}</span>
	<h3 class="empty-state__title">{title}</h3>
	{#if description}
		<p class="empty-state__desc">{description}</p>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-8, 3rem) var(--space-4, 1rem);
		text-align: center;
		color: var(--color-text-muted, #888);
	}
	.empty-state__icon {
		font-size: 2.5rem;
		margin-bottom: var(--space-3, 0.75rem);
	}
	.empty-state__title {
		margin: 0 0 var(--space-2, 0.5rem);
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text, #e0e0e0);
	}
	.empty-state__desc {
		margin: 0;
		font-size: 0.875rem;
		max-width: 32ch;
	}
</style>

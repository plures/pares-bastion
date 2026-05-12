<script lang="ts">
	interface Props {
		message: string;
		onRetry?: () => void;
	}
	let { message, onRetry }: Props = $props();
</script>

<div class="error-banner" role="alert">
	<span class="error-banner__icon" aria-hidden="true">⚠️</span>
	<span class="error-banner__msg">{message}</span>
	{#if onRetry}
		<button class="error-banner__retry" onclick={onRetry}>Retry</button>
	{/if}
</div>

<style>
	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--space-3, 0.75rem);
		background: color-mix(in srgb, var(--color-error, #f43f5e) 12%, var(--color-surface, #1a1b26));
		border: 1px solid color-mix(in srgb, var(--color-error, #f43f5e) 40%, transparent);
		border-radius: var(--radius-md, 6px);
		padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
		font-size: 0.875rem;
		color: var(--color-text, #e0e0e0);
	}
	.error-banner__icon {
		flex-shrink: 0;
	}
	.error-banner__msg {
		flex: 1;
	}
	.error-banner__retry {
		background: transparent;
		border: 1px solid var(--color-border, #2a2b3d);
		border-radius: var(--radius-sm, 4px);
		color: var(--color-text, #e0e0e0);
		padding: var(--space-1, 0.25rem) var(--space-3, 0.75rem);
		cursor: pointer;
		font-size: 0.8125rem;
	}
	.error-banner__retry:hover {
		border-color: var(--color-primary, #38bdf8);
		color: var(--color-primary, #38bdf8);
	}
</style>

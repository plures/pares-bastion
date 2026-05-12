<script lang="ts">
	interface Props {
		label?: string;
		size?: 'sm' | 'md' | 'lg';
	}
	let { label = 'Loading…', size = 'md' }: Props = $props();
</script>

<div
	class="loading"
	class:loading--sm={size === 'sm'}
	class:loading--lg={size === 'lg'}
	role="status"
	aria-label={label}
>
	<div class="spinner" aria-hidden="true"></div>
	{#if label}
		<span class="loading__label">{label}</span>
	{/if}
</div>

<style>
	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3, 0.75rem);
		padding: var(--space-6, 1.5rem);
	}
	.spinner {
		width: 2rem;
		height: 2rem;
		border: 3px solid var(--color-border, #2a2b3d);
		border-top-color: var(--color-primary, #38bdf8);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	.loading--sm .spinner {
		width: 1rem;
		height: 1rem;
		border-width: 2px;
	}
	.loading--lg .spinner {
		width: 3rem;
		height: 3rem;
		border-width: 4px;
	}
	.loading__label {
		font-size: 0.875rem;
		color: var(--color-text-muted, #888);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

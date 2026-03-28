<script lang="ts">
	/**
	 * ProgressBar — design-dojo compatible progress bar component.
	 *
	 * Props:
	 *   value   - current value (0 – max)
	 *   max     - maximum value (default 100)
	 *   label   - accessible label shown to screen readers
	 *   showPct - show the percentage text inside the bar (default true)
	 */
	interface Props {
		value: number;
		max?: number;
		label?: string;
		showPct?: boolean;
	}

	let { value, max = 100, label = 'Progress', showPct = true }: Props = $props();

	let pct = $derived(max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0);
</script>

<div
	class="progress-bar"
	role="progressbar"
	aria-valuenow={value}
	aria-valuemin={0}
	aria-valuemax={max}
	aria-label={label}
>
	<div class="progress-bar__track">
		<div class="progress-bar__fill" style="width: {pct}%"></div>
	</div>
	{#if showPct}
		<span class="progress-bar__label">{pct}%</span>
	{/if}
</div>

<style>
	.progress-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.progress-bar__track {
		flex: 1;
		height: 10px;
		background: var(--color-surface-2);
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.progress-bar__fill {
		height: 100%;
		background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-success) 100%);
		border-radius: var(--radius-lg);
		transition: width 0.3s ease;
	}

	.progress-bar__label {
		min-width: 3.5ch;
		text-align: right;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
	}
</style>

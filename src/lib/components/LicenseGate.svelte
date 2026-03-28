<script lang="ts">
	import { useTui } from '@plures/design-dojo';
	import type { LicensedFeature } from '$lib/stores/license.svelte.js';
	import { licenseStore } from '$lib/stores/license.svelte.js';

	interface Props {
		feature: LicensedFeature;
		currentCount: number;
		children: import('svelte').Snippet;
	}

	let { feature, currentCount, children }: Props = $props();

	const getTui = useTui();
	let tui = $derived(getTui());

	let gateMsg = $derived(licenseStore.gateMessage(feature, currentCount));
	let limit = $derived(licenseStore.getLimit(feature));
	let showUpgrade = $state(false);
</script>

{#if !gateMsg}
	{@render children()}
{:else}
	<!-- Content is still rendered but with an overlay gate -->
	<div class="license-gate" class:tui>
		<div class="gated-content">
			{@render children()}
		</div>
		<div class="gate-overlay">
			<div class="gate-card" class:tui>
				{#if tui}
					<div class="tui-gate">
						<span class="tui-icon">🔒</span>
						<span class="tui-msg">Free tier: {limit} device limit for {feature}</span>
						<span class="tui-hint">[U] Upgrade to Pro for unlimited</span>
					</div>
				{:else}
					<div class="gui-gate">
						<div class="gate-icon">🔓</div>
						<h3>Unlock Unlimited {feature.replace('-', ' ')}</h3>
						<p>
							You're using <strong>{currentCount}</strong> of <strong>{limit}</strong> devices
							on the free tier. Upgrade to Pro for unlimited access.
						</p>
						<div class="gate-actions">
							<button class="btn-upgrade" onclick={() => { showUpgrade = true }}>
								Upgrade to Pro
							</button>
							<button class="btn-dismiss" onclick={() => { /* User can still see content */ }}>
								Continue with {limit} devices
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if showUpgrade}
	<div class="upgrade-modal-backdrop" role="dialog" aria-modal="true">
		<div class="upgrade-modal">
			<h2>Activate Pro License</h2>
			<p>Enter your license key to unlock unlimited devices across all features.</p>
			<form onsubmit={(e) => {
				e.preventDefault();
				const form = e.currentTarget as HTMLFormElement;
				const data = new FormData(form);
				const email = data.get('email') as string;
				const key = data.get('key') as string;
				const result = licenseStore.activate(email, key);
				if (!result.ok) {
					alert(result.error);
				} else {
					showUpgrade = false;
				}
			}}>
				<div class="field">
					<label for="lic-email">Email</label>
					<input id="lic-email" name="email" type="email" placeholder="you@company.com" required />
				</div>
				<div class="field">
					<label for="lic-key">License Key</label>
					<input id="lic-key" name="key" type="text" placeholder="NETOPS-PRO-XXXX-XXXX-XXXX" required />
				</div>
				<div class="modal-actions">
					<button type="submit" class="btn-upgrade">Activate</button>
					<button type="button" class="btn-dismiss" onclick={() => { showUpgrade = false }}>Cancel</button>
				</div>
			</form>
			<p class="purchase-link">
				Don't have a key? <a href="https://plures.io/pricing" target="_blank" rel="noopener">Purchase at plures.io</a>
			</p>
		</div>
	</div>
{/if}

<style>
	.license-gate {
		position: relative;
	}

	.gated-content {
		filter: blur(1px);
		opacity: 0.6;
		pointer-events: none;
		user-select: none;
	}

	.gate-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		background: rgba(0, 0, 0, 0.15);
	}

	.gate-card {
		background: var(--color-bg-card, #24283b);
		border: 1px solid var(--color-border, #3b4261);
		border-radius: 12px;
		padding: 2rem;
		max-width: 420px;
		text-align: center;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}

	.gate-card.tui {
		background: transparent;
		border: 1px solid var(--tui-border, #444);
		border-radius: 0;
		padding: 0.5ch 1ch;
	}

	.gui-gate .gate-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.gui-gate h3 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: var(--color-text, #c0caf5);
		text-transform: capitalize;
	}

	.gui-gate p {
		margin: 0 0 1.25rem;
		color: var(--color-text-secondary, #a9b1d6);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.gate-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.btn-upgrade {
		background: linear-gradient(135deg, #7aa2f7, #bb9af7);
		color: #1a1b26;
		border: none;
		padding: 0.625rem 1.5rem;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.btn-upgrade:hover {
		opacity: 0.9;
	}

	.btn-dismiss {
		background: transparent;
		color: var(--color-text-secondary, #a9b1d6);
		border: 1px solid var(--color-border, #3b4261);
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.tui-gate {
		display: flex;
		flex-direction: column;
		gap: 0.25ch;
		font-family: monospace;
	}

	.tui-icon {
		font-size: 1rem;
	}

	.tui-msg {
		color: var(--color-warning, #e0af68);
	}

	.tui-hint {
		color: var(--tui-text-dim, #484f58);
		font-size: 0.875rem;
	}

	/* Upgrade modal */

	.upgrade-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.upgrade-modal {
		background: var(--color-bg-card, #24283b);
		border: 1px solid var(--color-border, #3b4261);
		border-radius: 12px;
		padding: 2rem;
		width: 100%;
		max-width: 440px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
	}

	.upgrade-modal h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: var(--color-text, #c0caf5);
	}

	.upgrade-modal > p {
		margin: 0 0 1.25rem;
		color: var(--color-text-secondary, #a9b1d6);
		font-size: 0.875rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.field label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-secondary, #a9b1d6);
	}

	.field input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border, #3b4261);
		border-radius: 6px;
		background: var(--color-bg, #1a1b26);
		color: var(--color-text, #c0caf5);
		font-size: 0.9375rem;
	}

	.field input:focus {
		outline: 2px solid var(--color-accent, #7aa2f7);
		outline-offset: 1px;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.purchase-link {
		margin: 1rem 0 0;
		font-size: 0.8125rem;
		color: var(--color-text-secondary, #565f89);
		text-align: center;
	}

	.purchase-link a {
		color: var(--color-accent, #7aa2f7);
		text-decoration: none;
	}

	.purchase-link a:hover {
		text-decoration: underline;
	}
</style>

<script lang="ts">
	import { licenseStore } from '$lib/stores/license-store.svelte.js';
	import { partitionStore } from '$lib/stores/partition-store.svelte.js';
	import {
		formatPartitionLimit,
		UNLIMITED_USERS_LABEL,
		checkCreateSyncedPartition,
	} from '$lib/domain/entitlements.js';
	import { TIER_MATRIX, ALL_FEATURES } from '$lib/domain/feature-matrix.js';
	import type { LicenseFile } from '$lib/domain/license.js';
	import { Button, Badge } from '@plures/design-dojo';

	let importError = $state<string | null>(null);
	let importSuccess = $state(false);
	let fileInput: HTMLInputElement;

	const entitlements = $derived(licenseStore.entitlements);
	const tierDef = $derived(TIER_MATRIX[licenseStore.tier]);

	function handleFileImport(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		importError = null;
		importSuccess = false;

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = JSON.parse(reader.result as string) as LicenseFile;
				const result = licenseStore.importLicense(parsed);
				if (result.ok) {
					importSuccess = true;
				} else {
					importError = result.error ?? 'Import failed.';
				}
			} catch {
				importError = 'Invalid license file format.';
			}
		};
		reader.readAsText(file);
	}

	function deactivate() {
		if (confirm('Deactivate license and revert to Free tier? Synced partitions will be suspended.')) {
			licenseStore.deactivate();
		}
	}

	type BadgeVariant = 'default' | 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted' | 'outline' | 'ghost';

	const STATUS_COLORS: Record<string, BadgeVariant> = {
		active: 'success',
		grace: 'warning',
		expired: 'danger',
		suspended: 'danger',
		revoked: 'danger',
	};

	const TIER_LABELS: Record<string, string> = {
		free: 'Free',
		pro: 'Pro',
		team: 'Team',
		enterprise: 'Enterprise',
	};
</script>

<div class="license-page">
	<h1>License</h1>

	<!-- Status Card -->
	<section class="card">
		<h2>Current License</h2>
		<div class="status-row">
			<span class="tier-badge">{TIER_LABELS[licenseStore.tier]}</span>
			<Badge variant={STATUS_COLORS[licenseStore.status] ?? 'neutral'}>
				{licenseStore.status}
			</Badge>
		</div>

		{#if licenseStore.inGracePeriod}
			<div class="warning-banner">
				⚠️ License is in grace period. Sync will be disabled when grace expires.
			</div>
		{/if}

		<div class="info-grid">
			<div class="info-item">
				<span class="label">Partitions</span>
				<span class="value">{formatPartitionLimit(entitlements)}</span>
			</div>
			<div class="info-item">
				<span class="label">Users</span>
				<span class="value">{UNLIMITED_USERS_LABEL}</span>
			</div>
			<div class="info-item">
				<span class="label">Org</span>
				<span class="value">{licenseStore.license.orgId}</span>
			</div>
			{#if licenseStore.license.validUntil}
				<div class="info-item">
					<span class="label">Expires</span>
					<span class="value">{new Date(licenseStore.license.validUntil).toLocaleDateString()}</span>
				</div>
			{:else}
				<div class="info-item">
					<span class="label">Expires</span>
					<span class="value">Never (perpetual)</span>
				</div>
			{/if}
		</div>
	</section>

	<!-- Entitlements -->
	<section class="card">
		<h2>Entitlements</h2>
		<div class="feature-grid">
			{#each ALL_FEATURES as feature}
				{@const level = entitlements.featureLevels[feature]}
				<div class="feature-row" class:disabled={level === 'disabled'}>
					<span class="feature-name">{feature.replace(/_/g, ' ')}</span>
					<Badge variant={level === 'disabled' ? 'neutral' : level === 'basic' ? 'info' : 'success'}>
						{level}
					</Badge>
				</div>
			{/each}
		</div>
	</section>

	<!-- Partition Usage -->
	<section class="card">
		<h2>Partition Usage</h2>
		<div class="usage-bar">
			<div class="usage-info">
				<span>{entitlements.syncedPartitionsUsed} synced</span>
				<span>{partitionStore.localCount} local</span>
				<span>{partitionStore.archivedCount} archived</span>
			</div>
			{#if entitlements.syncedPartitionLimit > 0}
				<div class="progress-bar">
					<div
						class="progress-fill"
						style:width={`${Math.min(100, (entitlements.syncedPartitionsUsed / entitlements.syncedPartitionLimit) * 100)}%`}
						class:near-limit={entitlements.syncedPartitionsRemaining === 1}
						class:at-limit={entitlements.syncedPartitionsRemaining === 0}
					></div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Import / Deactivate -->
	<section class="card actions">
		<h2>License Management</h2>

		<input
			bind:this={fileInput}
			type="file"
			accept=".netops-license,.json"
			onchange={handleFileImport}
			hidden
		/>

		<div class="button-row">
			<Button variant="solid" onclick={() => fileInput.click()}>
				Import License File
			</Button>
			{#if !licenseStore.isFree}
				<Button variant="outline" onclick={deactivate}>
					Deactivate License
				</Button>
			{/if}
		</div>

		{#if importError}
			<div class="error-message">{importError}</div>
		{/if}
		{#if importSuccess}
			<div class="success-message">License imported successfully.</div>
		{/if}
	</section>

	<!-- Tier Comparison -->
	<section class="card">
		<h2>Tier Comparison</h2>
		<p class="hint">Licenses are consumed by partitions, not users. All tiers include unlimited users per partition.</p>
		<div class="tier-grid">
			{#each (['free', 'pro', 'team', 'enterprise'] as const) as tier}
				{@const def = TIER_MATRIX[tier]}
				<div class="tier-col" class:current={tier === licenseStore.tier}>
					<h3>{TIER_LABELS[tier]}</h3>
					<div class="tier-detail">
						<span>Synced: {def.maxSyncedPartitions === -1 ? '∞' : def.maxSyncedPartitions}</span>
						<span>Local: {def.maxLocalPartitions === -1 ? '∞' : def.maxLocalPartitions}</span>
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.license-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.card {
		background: var(--surface-1, #1e1e2e);
		border: 1px solid var(--border, #333);
		border-radius: 8px;
		padding: 1.5rem;
	}

	h1 { margin: 0; }
	h2 { margin: 0 0 1rem; font-size: 1.1rem; }

	.status-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.tier-badge {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.warning-banner {
		background: var(--warning-bg, #4a3f00);
		border: 1px solid var(--warning, #ffa500);
		border-radius: 4px;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
	}

	.info-item .label {
		font-size: 0.75rem;
		opacity: 0.6;
		text-transform: uppercase;
	}

	.info-item .value {
		font-weight: 500;
	}

	.feature-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.feature-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 0;
		text-transform: capitalize;
	}

	.feature-row.disabled {
		opacity: 0.5;
	}

	.usage-bar { display: flex; flex-direction: column; gap: 0.5rem; }

	.usage-info {
		display: flex;
		gap: 1.5rem;
	}

	.progress-bar {
		height: 8px;
		background: var(--surface-2, #2a2a3e);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--primary, #7c3aed);
		border-radius: 4px;
		transition: width 0.3s;
	}

	.progress-fill.near-limit { background: var(--warning, #ffa500); }
	.progress-fill.at-limit { background: var(--danger, #ef4444); }

	.button-row { display: flex; gap: 0.75rem; }
	.error-message { color: var(--danger, #ef4444); margin-top: 0.75rem; }
	.success-message { color: var(--success, #22c55e); margin-top: 0.75rem; }

	.hint { font-size: 0.85rem; opacity: 0.7; margin: 0 0 1rem; }

	.tier-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	.tier-col {
		padding: 0.75rem;
		border: 1px solid var(--border, #333);
		border-radius: 6px;
		text-align: center;
	}

	.tier-col.current {
		border-color: var(--primary, #7c3aed);
		background: var(--surface-2, #2a2a3e);
	}

	.tier-col h3 { margin: 0 0 0.5rem; font-size: 0.95rem; }
	.tier-detail { font-size: 0.8rem; opacity: 0.7; display: flex; flex-direction: column; gap: 0.25rem; }
</style>

<script lang="ts">
	import { partitionStore } from '$lib/stores/partition-store.svelte.js';
	import { licenseStore } from '$lib/stores/license-store.svelte.js';
	import {
		formatPartitionLimit,
		UNLIMITED_USERS_LABEL,
		checkCreateSyncedPartition,
	} from '$lib/domain/entitlements.js';
	import type { Partition, PartitionState } from '$lib/domain/partition.js';
	import { Button, Badge } from '@plures/design-dojo';

	let showCreateDialog = $state(false);
	let newName = $state('');
	let newSynced = $state(false);
	let createError = $state<string | null>(null);

	const entitlements = $derived(licenseStore.entitlements);

	type BadgeVariant = 'default' | 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted' | 'outline' | 'ghost';

	const STATE_COLORS: Record<PartitionState, BadgeVariant> = {
		local_only: 'info',
		synced: 'success',
		suspended: 'warning',
		archived: 'neutral',
	};

	const STATE_LABELS: Record<PartitionState, string> = {
		local_only: 'Local',
		synced: 'Synced',
		suspended: 'Suspended',
		archived: 'Archived',
	};

	function createPartition() {
		createError = null;
		const name = newName.trim();
		if (!name) {
			createError = 'Name is required.';
			return;
		}

		const result = newSynced
			? partitionStore.createSynced(name)
			: partitionStore.createLocal(name);

		if (!result.ok) {
			createError = result.error ?? 'Failed to create partition.';
			return;
		}

		// Auto-switch to the new partition
		if (result.partition) {
			partitionStore.switchTo(result.partition.partitionId);
		}

		newName = '';
		newSynced = false;
		showCreateDialog = false;
	}

	function toggleSync(partition: Partition) {
		if (partition.state === 'local_only') {
			const result = partitionStore.enableSync(partition.partitionId);
			if (!result.allowed) {
				alert(result.reason);
			}
		} else if (partition.state === 'synced') {
			partitionStore.disableSync(partition.partitionId);
		}
	}

	function archivePartition(partition: Partition) {
		if (confirm(`Archive "${partition.displayName}"? Sync will stop and it won't count toward your limit.`)) {
			partitionStore.archive(partition.partitionId);
		}
	}
</script>

<div class="partitions-page">
	<div class="header">
		<h1>Partitions</h1>
		<Button variant="solid" onclick={() => (showCreateDialog = true)}>
			+ New Partition
		</Button>
	</div>

	<!-- Usage Summary -->
	<section class="usage-summary">
		<span>{formatPartitionLimit(entitlements)}</span>
		<span class="separator">·</span>
		<span>{UNLIMITED_USERS_LABEL}</span>
	</section>

	<!-- Partition List -->
	<section class="partition-list">
		{#each partitionStore.partitions as partition}
			{@const isActive = partition.partitionId === partitionStore.activePartitionId}
			<div class="partition-card" class:active={isActive}>
				<div class="partition-header">
					<div class="partition-title">
						{#if isActive}<span class="active-dot">●</span>{/if}
						<h3>{partition.displayName}</h3>
						<Badge variant={STATE_COLORS[partition.state]}>{STATE_LABELS[partition.state]}</Badge>
					</div>
					<span class="partition-slug">{partition.slug}</span>
				</div>

				{#if partition.tags.length > 0}
					<div class="tags">
						{#each partition.tags as tag}
							<Badge variant="neutral">{tag}</Badge>
						{/each}
					</div>
				{/if}

				{#if partition.classification}
					<div class="classification">
						{#if partition.classification.environment}
							<span>{partition.classification.environment}</span>
						{/if}
						{#if partition.classification.department}
							<span>{partition.classification.department}</span>
						{/if}
					</div>
				{/if}

				<div class="partition-meta">
					<span>Created {new Date(partition.createdAt).toLocaleDateString()}</span>
					<span>by {partition.createdBy}</span>
				</div>

				<div class="partition-actions">
					{#if !isActive && partition.state !== 'archived'}
						<Button variant="outline" onclick={() => partitionStore.switchTo(partition.partitionId)}>
							Switch
						</Button>
					{/if}

					{#if partition.state === 'local_only'}
						<Button variant="outline" onclick={() => toggleSync(partition)}>
							Enable Sync
						</Button>
					{:else if partition.state === 'synced'}
						<Button variant="outline" onclick={() => toggleSync(partition)}>
							Disable Sync
						</Button>
					{/if}

					{#if partition.state !== 'archived'}
						<Button variant="outline" onclick={() => archivePartition(partition)}>
							Archive
						</Button>
					{/if}
				</div>
			</div>
		{/each}
	</section>

	<!-- Create Dialog -->
	{#if showCreateDialog}
		<div class="dialog-overlay" onclick={() => (showCreateDialog = false)} role="presentation">
			<div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog">
				<h2>Create Partition</h2>

				<label class="field">
					<span>Name</span>
					<input type="text" bind:value={newName} placeholder="e.g. Production DC" autofocus />
				</label>

				<label class="field checkbox-field">
					<input type="checkbox" bind:checked={newSynced} disabled={!entitlements.canCreateSyncedPartition} />
					<span>Enable sync</span>
					{#if !entitlements.canCreateSyncedPartition}
						<span class="hint">
							{entitlements.syncedPartitionLimit === 0
								? 'Upgrade to Pro for synced partitions'
								: 'Synced partition limit reached'}
						</span>
					{/if}
				</label>

				{#if createError}
					<div class="error-message">{createError}</div>
				{/if}

				<div class="dialog-actions">
					<Button variant="outline" onclick={() => (showCreateDialog = false)}>Cancel</Button>
					<Button variant="solid" onclick={createPartition}>Create</Button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.partitions-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h1 { margin: 0; }

	.usage-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		opacity: 0.8;
	}

	.separator { opacity: 0.4; }

	.partition-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.partition-card {
		background: var(--surface-1, #1e1e2e);
		border: 1px solid var(--border, #333);
		border-radius: 8px;
		padding: 1.25rem;
	}

	.partition-card.active {
		border-color: var(--primary, #7c3aed);
	}

	.partition-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.partition-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.partition-title h3 { margin: 0; }

	.active-dot {
		color: var(--primary, #7c3aed);
		font-size: 0.75rem;
	}

	.partition-slug {
		font-size: 0.8rem;
		opacity: 0.5;
		font-family: monospace;
	}

	.tags, .classification {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.classification span {
		font-size: 0.8rem;
		opacity: 0.7;
	}

	.partition-meta {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		opacity: 0.5;
		display: flex;
		gap: 0.5rem;
	}

	.partition-actions {
		margin-top: 0.75rem;
		display: flex;
		gap: 0.5rem;
	}

	/* Dialog */
	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.dialog {
		background: var(--surface-1, #1e1e2e);
		border: 1px solid var(--border, #333);
		border-radius: 12px;
		padding: 2rem;
		width: 90%;
		max-width: 420px;
	}

	.dialog h2 { margin: 0 0 1.5rem; }

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 1rem;
	}

	.field span { font-size: 0.85rem; opacity: 0.8; }

	.field input[type="text"] {
		background: var(--surface-2, #2a2a3e);
		border: 1px solid var(--border, #333);
		border-radius: 4px;
		padding: 0.5rem;
		color: inherit;
		font-size: 1rem;
	}

	.checkbox-field {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.hint { font-size: 0.8rem; opacity: 0.5; }

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.error-message { color: var(--danger, #ef4444); font-size: 0.9rem; }
</style>

<script lang="ts">
	import {
		Table,
		Button,
		Badge,
		SearchInput,
		StatusBar,
		StatusBarItem,
		StatusBarSpacer
	} from '@plures/design-dojo';
	import type { SearchResult } from '@plures/design-dojo';
	import { useTui } from '@plures/design-dojo';
	import type {
		AuthMethod,
		CredentialScope,
		VaultCredential,
		VaultSetPayload
	} from '$lib/types/vault.types.js';
	import { mockCredentials, mockVaultStatus } from '$lib/data/mock-vault.js';

	// ── TUI context ──────────────────────────────────────────────────────────

	const getTui = useTui();
	let tui = $derived(getTui());

	// ── Vault state ──────────────────────────────────────────────────────────

	type VaultView = 'locked' | 'init' | 'list' | 'form' | 'delete' | 'resolve';

	let view = $state<VaultView>(mockVaultStatus.unlocked ? 'list' : 'locked');
	let credentials = $state<VaultCredential[]>([]);
	let loading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// ── Unlock / Init ────────────────────────────────────────────────────────

	let masterPassword = $state('');
	let masterPasswordConfirm = $state('');
	let showMasterPassword = $state(false);
	let isFirstRun = $state(false);

	async function handleUnlock(): Promise<void> {
		if (!masterPassword) return;
		loading = true;
		errorMsg = '';
		try {
			const { vaultUnlock } = await import('$lib/services/vault.js');
			await vaultUnlock(masterPassword);
			masterPassword = '';
			await loadCredentials();
			view = 'list';
		} catch (err) {
			// Tauri rejects with an Error object when the Rust command returns Err(String).
			// Surface the message so the user knows if the password was wrong.
			// If the sidecar was unavailable the Rust side already fell back to mock and
			// returned Ok, so this catch only fires on real backend errors.
			const message = err instanceof Error ? err.message : String(err);
			errorMsg = message || 'Unlock failed.';
		} finally {
			loading = false;
		}
	}

	async function handleInit(): Promise<void> {
		const masterPasswordLength = Array.from(masterPassword).length;
		if (masterPasswordLength < 8) {
			errorMsg = 'Password must be at least 8 characters.';
			return;
		}
		if (masterPassword !== masterPasswordConfirm) {
			errorMsg = 'Passwords do not match.';
			return;
		}
		loading = true;
		errorMsg = '';
		try {
			const { vaultInit } = await import('$lib/services/vault.js');
			await vaultInit(masterPassword);
			masterPassword = '';
			masterPasswordConfirm = '';
			credentials = [];
			view = 'list';
		} catch (err) {
			// Surface backend validation errors (e.g. vault already initialised).
			// Unavailable sidecar already returns Ok(mock) from Rust.
			const message = err instanceof Error ? err.message : String(err);
			errorMsg = message || 'Vault init failed.';
		} finally {
			loading = false;
		}
	}

	// ── Credential list ──────────────────────────────────────────────────────

	async function loadCredentials(): Promise<void> {
		loading = true;
		try {
			const { vaultList } = await import('$lib/services/vault.js');
			credentials = await vaultList();
		} catch {
			credentials = mockCredentials;
		} finally {
			loading = false;
		}
	}

	let searchQuery = $state('');
	let selectedIndex = $state<number | undefined>(undefined);

	const columns = [
		{ key: 'scope', label: 'Scope', width: 10 },
		{ key: 'target', label: 'Target', width: 22 },
		{ key: 'username', label: 'Username', width: 16 },
		{ key: 'authMethod', label: 'Auth', width: 10 },
		{ key: 'enableSecret', label: 'Enable', width: 8 }
	];

	let filteredCredentials = $derived.by(() => {
		if (!searchQuery.trim()) return credentials;
		const q = searchQuery.toLowerCase();
		return credentials.filter(
			(c) =>
				c.scope.toLowerCase().includes(q) ||
				(c.target ?? '').toLowerCase().includes(q) ||
				c.username.toLowerCase().includes(q)
		);
	});

	let rows = $derived(
		filteredCredentials.map((c) => ({
			scope: c.scope,
			target: c.target ?? '(any)',
			username: c.username,
			authMethod: c.authMethod,
			enableSecret: c.hasEnableSecret ? 'yes' : 'no'
		}))
	);

	function handleSelectRow(index: number): void {
		selectedIndex = index;
		const cred = filteredCredentials[index];
		if (cred) openEditForm(cred);
	}

	async function handleSearch(query: string): Promise<SearchResult[]> {
		searchQuery = query;
		if (!query) return [];
		const q = query.toLowerCase();
		return filteredCredentials
			.filter(
				(c) =>
					c.scope.toLowerCase().includes(q) ||
					(c.target ?? '').toLowerCase().includes(q) ||
					c.username.toLowerCase().includes(q)
			)
			.slice(0, 8)
			.map((c) => ({
				id: c.id,
				text: c.target ? `${c.scope}: ${c.target} (${c.username})` : `default (${c.username})`,
				score: 1
			}));
	}

	function handleSearchSelect(result: SearchResult): void {
		const index = filteredCredentials.findIndex((c) => c.id === result.id);
		if (index >= 0) handleSelectRow(index);
	}

	// ── Add / Edit form ──────────────────────────────────────────────────────

	let editingId = $state<string | null>(null);
	let formScope = $state<CredentialScope>('default');
	let formTarget = $state('');
	let formUsername = $state('');
	let formPassword = $state('');
	let formEnableSecret = $state('');
	let formAuthMethod = $state<AuthMethod>('password');
	let showFormPassword = $state(false);
	let showFormEnable = $state(false);

	function openAddForm(): void {
		editingId = null;
		formScope = 'default';
		formTarget = '';
		formUsername = '';
		formPassword = '';
		formEnableSecret = '';
		formAuthMethod = 'password';
		showFormPassword = false;
		showFormEnable = false;
		errorMsg = '';
		view = 'form';
	}

	function openEditForm(cred: VaultCredential): void {
		editingId = cred.id;
		formScope = cred.scope;
		formTarget = cred.target ?? '';
		formUsername = cred.username;
		formPassword = '';
		formEnableSecret = '';
		formAuthMethod = cred.authMethod;
		showFormPassword = false;
		showFormEnable = false;
		errorMsg = '';
		view = 'form';
	}

	async function handleSaveCredential(): Promise<void> {
		if (!formUsername.trim()) {
			errorMsg = 'Username is required.';
			return;
		}
		if (!formPassword && !editingId) {
			errorMsg = 'Password is required for a new credential.';
			return;
		}
		if ((formScope === 'group' || formScope === 'device') && !formTarget.trim()) {
			errorMsg = 'Target is required for group or device scope.';
			return;
		}
		loading = true;
		errorMsg = '';
		try {
			const payload: VaultSetPayload = {
				vaultType: 'personal',
				scope: formScope,
				target: formTarget.trim() || undefined,
				username: formUsername.trim(),
				password: formPassword || undefined,
				enableSecret: formEnableSecret || undefined,
				authMethod: formAuthMethod
			};
			const { vaultSet } = await import('$lib/services/vault.js');
			const saved = await vaultSet(payload);
			if (editingId) {
				const idx = credentials.findIndex((c) => c.id === editingId);
				if (idx >= 0) credentials[idx] = saved;
				else credentials.push(saved);
			} else {
				credentials.push(saved);
			}
			successMsg = editingId ? 'Credential updated.' : 'Credential added.';
			view = 'list';
		} catch (err) {
			// Surface the backend error — the Rust side already mocks for offline/dev.
			const message = err instanceof Error ? err.message : String(err);
			errorMsg = message || 'Failed to save credential.';
		} finally {
			formPassword = '';
			formEnableSecret = '';
			loading = false;
		}
	}

	// ── Delete ───────────────────────────────────────────────────────────────

	let deletingId = $state<string | null>(null);

	let deletingCred = $derived(
		deletingId ? credentials.find((c) => c.id === deletingId) ?? null : null
	);

	function openDeleteConfirm(cred: VaultCredential): void {
		deletingId = cred.id;
		errorMsg = '';
		view = 'delete';
	}

	async function handleConfirmDelete(): Promise<void> {
		if (!deletingId) return;
		loading = true;
		errorMsg = '';
		try {
			const { vaultDelete } = await import('$lib/services/vault.js');
			await vaultDelete(deletingId);
		} catch {
			// Mock: proceed anyway
		} finally {
			credentials = credentials.filter((c) => c.id !== deletingId);
			deletingId = null;
			successMsg = 'Credential deleted.';
			loading = false;
			view = 'list';
		}
	}

	// ── Credential resolution preview ────────────────────────────────────────

	let resolveHostname = $state('');
	let resolveResult = $state<{
		hostname: string;
		resolved: VaultCredential | null;
		explanation: string;
	} | null>(null);
	let resolveLoading = $state(false);

	async function handleResolve(): Promise<void> {
		if (!resolveHostname.trim()) return;
		resolveLoading = true;
		resolveResult = null;
		try {
			const { vaultResolve } = await import('$lib/services/vault.js');
			resolveResult = await vaultResolve(resolveHostname.trim());
		} catch {
			// Compute mock resolution dynamically from mockCredentials so the result
			// is accurate for any hostname, not just the hardcoded "core-rtr-01" example.
			resolveResult = computeMockResolve(resolveHostname.trim());
		} finally {
			resolveLoading = false;
		}
	}

	/** Mirrors the default → group → device resolution hierarchy from the Rust mock. */
	function computeMockResolve(hostname: string): {
		hostname: string;
		resolved: VaultCredential | null;
		explanation: string;
	} {
		// device-specific match
		const device = mockCredentials.find(
			(c) => c.scope === 'device' && c.target === hostname
		);
		if (device) {
			return {
				hostname,
				resolved: device,
				explanation: `Device-specific credential matched for "${hostname}".`
			};
		}
		// group pattern match (prefix glob: "core-*" or "10.0.1.*")
		const group = mockCredentials.find((c) => {
			if (c.scope !== 'group' || !c.target) return false;
			if (c.target.endsWith('*')) return hostname.startsWith(c.target.slice(0, -1));
			return c.target === hostname;
		});
		if (group) {
			return {
				hostname,
				resolved: group,
				explanation: `Group credential matched pattern "${group.target}" for "${hostname}".`
			};
		}
		// default fallback
		const def = mockCredentials.find((c) => c.scope === 'default');
		if (def) {
			return {
				hostname,
				resolved: def,
				explanation: `No specific credential found; using default for "${hostname}".`
			};
		}
		return { hostname, resolved: null, explanation: `No credential found for "${hostname}".` };
	}

	// ── Badge helpers ─────────────────────────────────────────────────────────

	function scopeVariant(scope: CredentialScope): 'success' | 'warning' | 'neutral' {
		if (scope === 'device') return 'success';
		if (scope === 'group') return 'warning';
		return 'neutral';
	}

	function authVariant(auth: AuthMethod): 'success' | 'neutral' {
		return auth === 'key' ? 'success' : 'neutral';
	}

	// ── Auto-dismiss success message ─────────────────────────────────────────

	$effect(() => {
		if (!successMsg) return;
		const t = setTimeout(() => {
			successMsg = '';
		}, 3000);
		return () => clearTimeout(t);
	});
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!--  TUI MODE                                                               -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{#if tui}
	<div class="vault-page tui">
		<!-- ── Locked / Init ── -->
		{#if view === 'locked' || view === 'init'}
			<div class="header">
				<span class="title">CREDENTIAL VAULT</span>
			</div>
			{#if isFirstRun || view === 'init'}
				<div class="tui-form">
					<div class="form-row">VAULT INIT — create master password</div>
					<div class="form-row">
						<label for="tui-init-pw">Password (&gt;=8 chars): </label>
						<input
							id="tui-init-pw"
							type="password"
							bind:value={masterPassword}
							class="tui-input"
							aria-label="Master password"
						/>
					</div>
					<div class="form-row">
						<label for="tui-init-pw2">Confirm: </label>
						<input
							id="tui-init-pw2"
							type="password"
							bind:value={masterPasswordConfirm}
							class="tui-input"
							aria-label="Confirm master password"
						/>
					</div>
					{#if errorMsg}<div class="tui-error">{errorMsg}</div>{/if}
					<div class="tui-actions">
						<span
							role="button"
							tabindex="0"
							onclick={handleInit}
							onkeydown={(e) => {
								if (e.key === 'Enter') handleInit();
							}}>[Enter] Create Vault</span
						>
						<span
							role="button"
							tabindex="0"
							onclick={() => {
								isFirstRun = false;
								view = 'locked';
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									isFirstRun = false;
									view = 'locked';
								}
							}}>[Esc] Back</span
						>
					</div>
				</div>
			{:else}
				<div class="tui-form">
					<div class="form-row">UNLOCK VAULT</div>
					<div class="form-row">
						<label for="tui-unlock-pw">Master password: </label>
						<input
							id="tui-unlock-pw"
							type="password"
							bind:value={masterPassword}
							class="tui-input"
							aria-label="Master password"
							onkeydown={(e) => {
								if (e.key === 'Enter') handleUnlock();
							}}
						/>
					</div>
					{#if errorMsg}<div class="tui-error">{errorMsg}</div>{/if}
					<div class="tui-actions">
						<span
							role="button"
							tabindex="0"
							onclick={handleUnlock}
							onkeydown={(e) => {
								if (e.key === 'Enter') handleUnlock();
							}}>[Enter] Unlock</span
						>
						<span
							role="button"
							tabindex="0"
							onclick={() => {
								isFirstRun = true;
								view = 'init';
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									isFirstRun = true;
									view = 'init';
								}
							}}>[I] Init Vault</span
						>
					</div>
				</div>
			{/if}

		<!-- ── List ── -->
		{:else if view === 'list'}
			<div class="header">
				<span class="title">CREDENTIAL VAULT</span>
				<span class="info">{filteredCredentials.length} credentials</span>
			</div>
			{#if successMsg}<div class="tui-success">{successMsg}</div>{/if}
			<Table {columns} {rows} selected={selectedIndex} onselect={handleSelectRow} tui={true} />
			<div class="tui-actions">
				<span>[A] Add</span>
				<span>[Enter] Edit</span>
				<span>[D] Delete selected</span>
				<span>[R] Resolve</span>
				<span>[L] Lock</span>
			</div>

		<!-- ── Form ── -->
		{:else if view === 'form'}
			<div class="header">
				<span class="title">{editingId ? 'EDIT CREDENTIAL' : 'ADD CREDENTIAL'}</span>
			</div>
			<div class="tui-form">
				<div class="form-row">
					<label for="tui-scope">Scope [default/group/device]: </label>
					<input
						id="tui-scope"
						type="text"
						bind:value={formScope}
						class="tui-input short"
						aria-label="Scope"
					/>
				</div>
				{#if formScope === 'group' || formScope === 'device'}
					<div class="form-row">
						<label for="tui-target">Target: </label>
						<input
							id="tui-target"
							type="text"
							bind:value={formTarget}
							class="tui-input"
							aria-label="Target"
						/>
					</div>
				{/if}
				<div class="form-row">
					<label for="tui-user">Username: </label>
					<input
						id="tui-user"
						type="text"
						bind:value={formUsername}
						class="tui-input"
						aria-label="Username"
					/>
				</div>
				<div class="form-row">
					<label for="tui-pw">Password: </label>
					<input
						id="tui-pw"
						type="password"
						bind:value={formPassword}
						class="tui-input"
						aria-label="Password"
					/>
				</div>
				<div class="form-row">
					<label for="tui-enable">Enable secret (optional): </label>
					<input
						id="tui-enable"
						type="password"
						bind:value={formEnableSecret}
						class="tui-input"
						aria-label="Enable secret"
					/>
				</div>
				<div class="form-row">
					<label for="tui-auth">Auth method [password/key]: </label>
					<input
						id="tui-auth"
						type="text"
						bind:value={formAuthMethod}
						class="tui-input short"
						aria-label="Auth method"
					/>
				</div>
				{#if errorMsg}<div class="tui-error">{errorMsg}</div>{/if}
				<div class="tui-actions">
					<span
						role="button"
						tabindex="0"
						onclick={handleSaveCredential}
						onkeydown={(e) => {
							if (e.key === 'Enter') handleSaveCredential();
						}}>[Enter] Save</span
					>
					<span
						role="button"
						tabindex="0"
						onclick={() => {
							view = 'list';
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') view = 'list';
						}}>[Esc] Cancel</span
					>
				</div>
			</div>

		<!-- ── Delete confirm ── -->
		{:else if view === 'delete'}
			<div class="header">
				<span class="title">DELETE CREDENTIAL</span>
			</div>
			<div class="tui-form">
				<div class="form-row tui-warn">
					Delete: {deletingCred?.scope}{deletingCred?.target
						? ` / ${deletingCred.target}`
						: ''} ({deletingCred?.username})?
				</div>
				<div class="tui-actions">
					<span
						role="button"
						tabindex="0"
						onclick={handleConfirmDelete}
						onkeydown={(e) => {
							if (e.key === 'Enter') handleConfirmDelete();
						}}>[Y] Yes, Delete</span
					>
					<span
						role="button"
						tabindex="0"
						onclick={() => {
							view = 'list';
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') view = 'list';
						}}>[N] Cancel</span
					>
				</div>
			</div>

		<!-- ── Resolve preview ── -->
		{:else if view === 'resolve'}
			<div class="header">
				<span class="title">CREDENTIAL RESOLVE</span>
			</div>
			<div class="tui-form">
				<div class="form-row">
					<label for="tui-resolve-host">Hostname: </label>
					<input
						id="tui-resolve-host"
						type="text"
						bind:value={resolveHostname}
						class="tui-input"
						aria-label="Hostname to resolve"
						onkeydown={(e) => {
							if (e.key === 'Enter') handleResolve();
						}}
					/>
				</div>
				{#if resolveResult}
					<div class="form-row">{resolveResult.explanation}</div>
					{#if resolveResult.resolved}
						<div class="form-row">
							Username: {resolveResult.resolved.username} | Auth: {resolveResult.resolved
								.authMethod}
						</div>
					{/if}
				{/if}
				<div class="tui-actions">
					<span
						role="button"
						tabindex="0"
						onclick={handleResolve}
						onkeydown={(e) => {
							if (e.key === 'Enter') handleResolve();
						}}>[Enter] Resolve</span
					>
					<span
						role="button"
						tabindex="0"
						onclick={() => {
							view = 'list';
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') view = 'list';
						}}>[Esc] Back</span
					>
				</div>
			</div>
		{/if}
	</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!--  GUI MODE                                                               -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{:else}
	<div class="vault-page gui">

		<!-- ════════════════════════════════ LOCKED / INIT ════════════════════ -->
		{#if view === 'locked' || view === 'init'}
			<div class="lock-screen">
				<div class="lock-card">
					<div class="lock-icon" aria-hidden="true">🔐</div>
					<h2>{isFirstRun || view === 'init' ? 'Create Vault' : 'Unlock Vault'}</h2>

					{#if isFirstRun || view === 'init'}
						<p class="lock-subtitle">
							Create a master password to initialise the encrypted credential store.
						</p>

						<div class="field">
							<label for="init-pw">Master password</label>
							<div class="password-wrap">
								<input
									id="init-pw"
									type={showMasterPassword ? 'text' : 'password'}
									bind:value={masterPassword}
									placeholder="At least 8 characters"
									aria-label="Master password"
									autocomplete="new-password"
									class="text-input"
								/>
								<button
									type="button"
									class="reveal-btn"
									aria-label={showMasterPassword ? 'Hide password' : 'Show password'}
									onclick={() => {
										showMasterPassword = !showMasterPassword;
									}}
								>
									{showMasterPassword ? '🙈' : '👁'}
								</button>
							</div>
						</div>

						<div class="field">
							<label for="init-pw2">Confirm password</label>
							<div class="password-wrap">
								<input
									id="init-pw2"
									type={showMasterPassword ? 'text' : 'password'}
									bind:value={masterPasswordConfirm}
									placeholder="Repeat password"
									aria-label="Confirm master password"
									autocomplete="new-password"
									class="text-input"
								/>
							</div>
						</div>

						{#if errorMsg}<p class="error-msg" role="alert">{errorMsg}</p>{/if}

						<div class="lock-actions">
							<Button variant="solid" onclick={handleInit} disabled={loading}>
								{loading ? 'Creating…' : 'Create Vault'}
							</Button>
							<Button
								variant="ghost"
								onclick={() => {
									isFirstRun = false;
									view = 'locked';
									errorMsg = '';
								}}
							>
								Back
							</Button>
						</div>
					{:else}
						<p class="lock-subtitle">Enter your master password to access stored credentials.</p>

						<div class="field">
							<label for="unlock-pw">Master password</label>
							<div class="password-wrap">
								<input
									id="unlock-pw"
									type={showMasterPassword ? 'text' : 'password'}
									bind:value={masterPassword}
									placeholder="Master password"
									aria-label="Master password"
									autocomplete="current-password"
									class="text-input"
									onkeydown={(e) => {
										if (e.key === 'Enter') handleUnlock();
									}}
								/>
								<button
									type="button"
									class="reveal-btn"
									aria-label={showMasterPassword ? 'Hide password' : 'Show password'}
									onclick={() => {
										showMasterPassword = !showMasterPassword;
									}}
								>
									{showMasterPassword ? '🙈' : '👁'}
								</button>
							</div>
						</div>

						{#if errorMsg}<p class="error-msg" role="alert">{errorMsg}</p>{/if}

						<div class="lock-actions">
							<Button variant="solid" onclick={handleUnlock} disabled={loading}>
								{loading ? 'Unlocking…' : 'Unlock'}
							</Button>
							<Button
								variant="ghost"
								onclick={() => {
									isFirstRun = true;
									view = 'init';
									errorMsg = '';
								}}
							>
								Init New Vault
							</Button>
						</div>
					{/if}
				</div>
			</div>

		<!-- ════════════════════════════════ LIST ═════════════════════════════ -->
		{:else if view === 'list'}
			<div class="toolbar">
				<h2>Credential Vault</h2>
				<div class="toolbar-actions">
					<SearchInput
						placeholder="Search credentials…"
						onSearch={handleSearch}
						onSelect={handleSearchSelect}
						cols={28}
					/>
					<Button variant="solid" onclick={openAddForm}>＋ Add Credential</Button>
					<Button
						variant="outline"
						onclick={() => {
							view = 'resolve';
							resolveHostname = '';
							resolveResult = null;
						}}
					>
						🔎 Resolve
					</Button>
					<Button
						variant="ghost"
						onclick={() => {
							view = 'locked';
							credentials = [];
						}}
					>
						🔒 Lock
					</Button>
				</div>
			</div>

			{#if successMsg}
				<div class="banner success" role="status">{successMsg}</div>
			{/if}

			<div class="table-container">
				<Table
					{columns}
					{rows}
					selected={selectedIndex}
					onselect={handleSelectRow}
				/>
			</div>

			<div class="row-actions">
				{#each filteredCredentials as cred, i}
					<div class="row-action-item">
						<Badge variant={scopeVariant(cred.scope)} size="sm">{cred.scope}</Badge>
						<span class="row-target">{cred.target ?? '(any)'}</span>
						<Badge variant={authVariant(cred.authMethod)} size="sm">{cred.authMethod}</Badge>
						<div class="row-btns">
							<Button variant="ghost" onclick={() => openEditForm(cred)}>✏️ Edit</Button>
							<Button variant="ghost" onclick={() => openDeleteConfirm(cred)}>🗑 Delete</Button>
						</div>
					</div>
				{/each}
			</div>

			<StatusBar>
				<StatusBarItem label="Credentials" value={String(filteredCredentials.length)} />
				<StatusBarSpacer />
				<StatusBarItem label="View" value="Credential Vault" />
			</StatusBar>

		<!-- ════════════════════════════════ FORM ═════════════════════════════ -->
		{:else if view === 'form'}
			<div class="toolbar">
				<h2>{editingId ? 'Edit Credential' : 'Add Credential'}</h2>
				<div class="toolbar-actions">
					<Button
						variant="ghost"
						onclick={() => {
							view = 'list';
							errorMsg = '';
						}}
					>
						← Back
					</Button>
				</div>
			</div>

			<div class="form-card">
				<div class="field">
					<label for="form-scope">Scope</label>
					<select id="form-scope" bind:value={formScope} class="select-input" aria-label="Scope">
						<option value="default">default — catch-all fallback</option>
						<option value="group">group — hostname/IP pattern</option>
						<option value="device">device — specific hostname</option>
					</select>
				</div>

				{#if formScope === 'group' || formScope === 'device'}
					<div class="field">
						<label for="form-target">
							{formScope === 'group' ? 'Pattern (e.g. 10.0.1.* or core-*)' : 'Hostname / IP'}
						</label>
						<input
							id="form-target"
							type="text"
							bind:value={formTarget}
							placeholder={formScope === 'group' ? '10.0.1.*' : 'core-rtr-01'}
							class="text-input"
							aria-label="Target"
						/>
					</div>
				{/if}

				<div class="field">
					<label for="form-username">Username</label>
					<input
						id="form-username"
						type="text"
						bind:value={formUsername}
						placeholder="admin"
						class="text-input"
						aria-label="Username"
						autocomplete="username"
					/>
				</div>

				<div class="field">
					<label for="form-password">
						Password{editingId ? ' (leave blank to keep existing)' : ''}
					</label>
					<div class="password-wrap">
						<input
							id="form-password"
							type={showFormPassword ? 'text' : 'password'}
							bind:value={formPassword}
							placeholder={editingId ? '••••••••' : 'Password'}
							class="text-input"
							aria-label="Password"
							autocomplete={editingId ? 'current-password' : 'new-password'}
						/>
						<button
							type="button"
							class="reveal-btn"
							aria-label={showFormPassword ? 'Hide password' : 'Show password'}
							onclick={() => {
								showFormPassword = !showFormPassword;
							}}
						>
							{showFormPassword ? '🙈' : '👁'}
						</button>
					</div>
				</div>

				<div class="field">
					<label for="form-enable">Enable secret (optional)</label>
					<div class="password-wrap">
						<input
							id="form-enable"
							type={showFormEnable ? 'text' : 'password'}
							bind:value={formEnableSecret}
							placeholder="Enable / privilege secret"
							class="text-input"
							aria-label="Enable secret"
							autocomplete="off"
						/>
						<button
							type="button"
							class="reveal-btn"
							aria-label={showFormEnable ? 'Hide enable secret' : 'Show enable secret'}
							onclick={() => {
								showFormEnable = !showFormEnable;
							}}
						>
							{showFormEnable ? '🙈' : '👁'}
						</button>
					</div>
				</div>

				<div class="field">
					<label for="form-auth">Auth method</label>
					<select
						id="form-auth"
						bind:value={formAuthMethod}
						class="select-input"
						aria-label="Auth method"
					>
						<option value="password">password</option>
						<option value="key">SSH key</option>
					</select>
				</div>

				{#if errorMsg}<p class="error-msg" role="alert">{errorMsg}</p>{/if}

				<div class="form-actions">
					<Button variant="solid" onclick={handleSaveCredential} disabled={loading}>
						{loading ? 'Saving…' : editingId ? 'Update' : 'Add Credential'}
					</Button>
					<Button
						variant="outline"
						onclick={() => {
							view = 'list';
							errorMsg = '';
						}}
					>
						Cancel
					</Button>
				</div>
			</div>

		<!-- ════════════════════════════════ DELETE ════════════════════════════ -->
		{:else if view === 'delete'}
			<div class="toolbar">
				<h2>Delete Credential</h2>
			</div>

			<div class="form-card">
				<p class="delete-warning" role="alert">
					Are you sure you want to delete this credential?
				</p>
				{#if deletingCred}
					<dl class="delete-detail">
						<dt>Scope</dt>
						<dd>
							<Badge variant={scopeVariant(deletingCred.scope)} size="sm"
								>{deletingCred.scope}</Badge
							>
						</dd>
						{#if deletingCred.target}
							<dt>Target</dt>
							<dd>{deletingCred.target}</dd>
						{/if}
						<dt>Username</dt>
						<dd>{deletingCred.username}</dd>
						<dt>Auth</dt>
						<dd>
							<Badge variant={authVariant(deletingCred.authMethod)} size="sm"
								>{deletingCred.authMethod}</Badge
							>
						</dd>
					</dl>
				{/if}
				<div class="form-actions">
					<Button variant="solid" onclick={handleConfirmDelete} disabled={loading}>
						{loading ? 'Deleting…' : 'Yes, Delete'}
					</Button>
					<Button
						variant="outline"
						onclick={() => {
							view = 'list';
							deletingId = null;
						}}
					>
						Cancel
					</Button>
				</div>
			</div>

		<!-- ════════════════════════════════ RESOLVE ═══════════════════════════ -->
		{:else if view === 'resolve'}
			<div class="toolbar">
				<h2>Credential Resolution Preview</h2>
				<div class="toolbar-actions">
					<Button
						variant="ghost"
						onclick={() => {
							view = 'list';
						}}
					>
						← Back
					</Button>
				</div>
			</div>

			<div class="form-card">
				<p class="resolve-info">
					Shows which credential would be used for a given hostname using the
					<strong>default → group → device</strong> resolution hierarchy.
				</p>

				<div class="field resolve-row">
					<label for="resolve-host">Hostname</label>
					<input
						id="resolve-host"
						type="text"
						bind:value={resolveHostname}
						placeholder="e.g. core-rtr-01 or 10.0.1.5"
						class="text-input"
						aria-label="Hostname to resolve"
						onkeydown={(e) => {
							if (e.key === 'Enter') handleResolve();
						}}
					/>
					<Button variant="solid" onclick={handleResolve} disabled={resolveLoading}>
						{resolveLoading ? 'Resolving…' : 'Resolve'}
					</Button>
				</div>

				{#if resolveResult}
					<div class="resolve-result">
						<p class="resolve-explanation">{resolveResult.explanation}</p>
						{#if resolveResult.resolved}
							<dl class="resolve-detail">
								<dt>Scope</dt>
								<dd>
									<Badge variant={scopeVariant(resolveResult.resolved.scope)} size="sm">
										{resolveResult.resolved.scope}
									</Badge>
								</dd>
								{#if resolveResult.resolved.target}
									<dt>Target</dt>
									<dd>{resolveResult.resolved.target}</dd>
								{/if}
								<dt>Username</dt>
								<dd>{resolveResult.resolved.username}</dd>
								<dt>Auth</dt>
								<dd>
									<Badge variant={authVariant(resolveResult.resolved.authMethod)} size="sm">
										{resolveResult.resolved.authMethod}
									</Badge>
								</dd>
								<dt>Enable secret</dt>
								<dd>{resolveResult.resolved.hasEnableSecret ? 'configured' : 'none'}</dd>
							</dl>
						{:else}
							<p class="resolve-no-match">No credential found for this hostname.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* ── Shared ──────────────────────────────────────────── */

	.vault-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	/* ── TUI ─────────────────────────────────────────────── */

	.vault-page.tui {
		font-family: monospace;
		color: var(--color-text, #e0e0e0);
	}

	.vault-page.tui .header {
		display: flex;
		justify-content: space-between;
		padding: 0.5ch 0;
		border-bottom: 1px solid var(--tui-border, #0f3460);
		margin-bottom: 0.5ch;
	}

	.vault-page.tui .title {
		color: var(--color-accent, #7fefbd);
		font-weight: bold;
	}

	.vault-page.tui .info {
		color: var(--tui-text-dim, #888);
	}

	.tui-form {
		padding: 0.5ch 0;
		display: flex;
		flex-direction: column;
		gap: 0.5ch;
	}

	.form-row {
		display: flex;
		align-items: center;
		gap: 1ch;
	}

	.tui-input {
		background: transparent;
		border: 1px solid var(--tui-border, #444);
		color: inherit;
		font-family: monospace;
		padding: 0.25ch 0.5ch;
		font-size: 1em;
		width: 24ch;
	}

	.tui-input.short {
		width: 12ch;
	}

	.tui-error {
		color: var(--color-error, #f38ba8);
	}

	.tui-success {
		color: var(--color-success, #a6e3a1);
		margin-bottom: 0.5ch;
	}

	.tui-warn {
		color: var(--color-warning, #fab387);
	}

	.vault-page.tui .tui-actions {
		display: flex;
		gap: 2ch;
		padding: 0.5ch 0;
		border-top: 1px solid var(--tui-border, #0f3460);
		color: var(--tui-text-dim, #888);
		font-size: 0.875rem;
		margin-top: auto;
	}

	/* ── GUI ─────────────────────────────────────────────── */

	.vault-page.gui {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	/* Lock screen */

	.lock-screen {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.lock-card {
		background: var(--color-bg-card, #ffffff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: var(--radius-md, 8px);
		padding: 2rem;
		width: 100%;
		max-width: 420px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.lock-icon {
		font-size: 2.5rem;
		text-align: center;
	}

	.lock-card h2 {
		margin: 0;
		text-align: center;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.lock-subtitle {
		margin: 0;
		color: var(--color-text-secondary, #64748b);
		font-size: 0.9rem;
		text-align: center;
	}

	.lock-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Toolbar */

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border, #333);
		flex-shrink: 0;
	}

	.toolbar h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Banner */

	.banner.success {
		background: var(--color-success-bg, #d1fae5);
		color: var(--color-success-text, #065f46);
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-success-border, #a7f3d0);
	}

	/* Table */

	.table-container {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}

	/* Row actions */

	.row-actions {
		padding: 0.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-top: 1px solid var(--color-border, #e2e8f0);
		max-height: 200px;
		overflow-y: auto;
		flex-shrink: 0;
	}

	.row-action-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.row-target {
		flex: 1;
		color: var(--color-text-secondary, #64748b);
		font-family: var(--font-mono, monospace);
		font-size: 0.8125rem;
	}

	.row-btns {
		display: flex;
		gap: 0.25rem;
	}

	/* Form card */

	.form-card {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 560px;
		overflow-y: auto;
		flex: 1;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary, #475569);
	}

	.text-input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border, #cbd5e1);
		border-radius: var(--radius-sm, 4px);
		font-size: 0.9375rem;
		background: var(--color-bg-input, #ffffff);
		color: var(--color-text, #1a1a1a);
		width: 100%;
		box-sizing: border-box;
	}

	.text-input:focus {
		outline: 2px solid var(--color-accent, #89b4fa);
		outline-offset: 1px;
	}

	.select-input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border, #cbd5e1);
		border-radius: var(--radius-sm, 4px);
		font-size: 0.9375rem;
		background: var(--color-bg-input, #ffffff);
		color: var(--color-text, #1a1a1a);
		width: 100%;
		box-sizing: border-box;
	}

	.select-input:focus {
		outline: 2px solid var(--color-accent, #89b4fa);
		outline-offset: 1px;
	}

	.password-wrap {
		position: relative;
		display: flex;
	}

	.password-wrap .text-input {
		padding-right: 2.5rem;
	}

	.reveal-btn {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		padding: 0.25rem;
		color: var(--color-text-secondary, #64748b);
		line-height: 1;
	}

	.reveal-btn:focus-visible {
		outline: 2px solid var(--color-accent, #89b4fa);
		border-radius: 2px;
	}

	.error-msg {
		margin: 0;
		color: var(--color-error, #dc2626);
		font-size: 0.875rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}

	/* Delete */

	.delete-warning {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-error, #dc2626);
	}

	.delete-detail {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		font-size: 0.9rem;
	}

	.delete-detail dt {
		color: var(--color-text-secondary, #64748b);
		font-weight: 500;
	}

	.delete-detail dd {
		margin: 0;
	}

	/* Resolve */

	.resolve-info {
		margin: 0;
		color: var(--color-text-secondary, #64748b);
		font-size: 0.875rem;
	}

	.resolve-row {
		flex-direction: row;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.resolve-row label {
		align-self: flex-start;
	}

	.resolve-row .text-input {
		flex: 1;
	}

	.resolve-result {
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: var(--radius-sm, 4px);
		padding: 1rem;
		background: var(--color-bg-subtle, #f8fafc);
	}

	.resolve-explanation {
		margin: 0 0 0.75rem;
		font-weight: 500;
		font-size: 0.9375rem;
	}

	.resolve-detail {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		font-size: 0.9rem;
	}

	.resolve-detail dt {
		color: var(--color-text-secondary, #64748b);
		font-weight: 500;
	}

	.resolve-detail dd {
		margin: 0;
	}

	.resolve-no-match {
		margin: 0;
		color: var(--color-error, #dc2626);
		font-size: 0.9rem;
	}
</style>

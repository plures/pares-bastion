# Licensing & Partitions — Design Document

## 1. Architecture Summary

### Current State
- **Frontend**: Svelte 5 (runes) + SvelteKit (adapter-static) + design-dojo components
- **Backend**: Tauri 2 Rust commands, currently shelling out to Python `netops-toolkit` sidecar
- **Persistence**: localStorage only (license store, settings store), no database
- **Sync**: None — no pluresDB, no hyperswarm, no multi-device
- **Licensing**: Device-count gates per feature (free=10 devices, pro=unlimited). Per-seat NOT implemented (good). License stored in localStorage as JSON, "validated" by key prefix (`NETOPS-PRO-*`)
- **Partitioning**: None — single implicit workspace, no concept of org, partition, or multi-tenancy

### Target State
- **Persistence**: pluresDB (embedded, local-first) for all app data
- **Sync**: Hyperswarm replication per partition
- **Billing unit**: Partition (sync group / security boundary), NOT seats
- **License enforcement**: Offline-signed license files, Ed25519 signature verification, grace periods
- **Partitions**: Explicitly managed, switchable, isolated data scopes

### Patterns to Preserve
- Service layer wraps `invoke()` (Tauri commands) — all domain services follow this
- Svelte 5 rune stores (class with `$state`/`$derived`) — all stores follow this
- Types in `src/lib/types/`, services in `src/lib/services/`, stores in `src/lib/stores/`
- Rust commands in `src-tauri/src/commands.rs` (currently monolithic, will split into modules)

---

## 2. Domain Model

### License

```typescript
interface License {
  licenseId: string;          // UUID
  orgId: string;              // Organization this license belongs to
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  status: 'active' | 'expired' | 'suspended' | 'revoked' | 'grace';
  issuedAt: number;           // Unix ms
  validFrom: number;          // Unix ms
  validUntil: number | null;  // null = perpetual
  graceUntil: number | null;  // null = no grace period
  maxSyncedPartitions: number; // 0=free, 1=pro, 5=team, -1=unlimited (enterprise)
  features: FeatureEntitlement[];
  signature: string;          // Ed25519 signature (base64)
  issuer: string;             // Key ID of signing key
  offlineCapable: boolean;
  metadata: Record<string, string>;
}

interface FeatureEntitlement {
  feature: FeatureFlag;
  level: 'disabled' | 'basic' | 'full';
}
```

### Partition

```typescript
interface Partition {
  partitionId: string;        // UUID
  orgId: string;
  displayName: string;
  slug: string;               // URL-safe, unique within org
  state: 'local_only' | 'synced' | 'suspended' | 'archived';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  tags: string[];
  classification?: {
    businessUnit?: string;
    department?: string;
    environment?: string;     // e.g. 'production' | 'staging' | 'lab'
  };
}
```

### Feature Flags

```typescript
type FeatureFlag =
  | 'sync'
  | 'audit_logs'
  | 'advanced_policy'
  | 'offline_license_import'
  | 'partition_snapshots'
  | 'cross_partition_federation'
  | 'enterprise_admin_controls'
  | 'priority_sync'
  | 'advanced_conflict_resolution';
```

### Entitlement Engine (Centralized Policy)

```typescript
interface Entitlements {
  canCreateSyncedPartition: boolean;
  canSyncPartition: boolean;
  canArchivePartition: boolean;
  canUseAdvancedPolicy: boolean;
  canUseAuditLogs: boolean;
  canUseCrossPartitionFederation: boolean;
  canUseEnterpriseAdminControls: boolean;
  canUseOfflineLicenseImport: boolean;
  canUsePartitionSnapshots: boolean;
  canUsePrioritySync: boolean;
  canUseAdvancedConflictResolution: boolean;
  syncedPartitionLimit: number;   // 0, 1, 5, or -1 (unlimited)
  syncedPartitionsUsed: number;   // counted from partition registry
  syncedPartitionsRemaining: number;
}
```

---

## 3. Feature Matrix (Data-Driven)

| Feature                        | Free     | Pro     | Team    | Enterprise    |
|-------------------------------|----------|---------|---------|---------------|
| Local partitions              | 1        | unlimited | unlimited | unlimited   |
| Synced partitions             | 0        | 1       | 5       | configurable  |
| Users per partition           | unlimited | unlimited | unlimited | unlimited |
| Audit logs                    | —        | basic   | full    | full          |
| Advanced policy               | —        | —       | basic   | full          |
| Offline license import        | —        | ✓       | ✓       | ✓             |
| Partition snapshots           | —        | basic   | full    | full          |
| Cross-partition federation    | —        | —       | —       | optional      |
| Enterprise admin controls     | —        | —       | —       | ✓             |
| Priority sync                 | —        | —       | —       | optional      |
| Advanced conflict resolution  | —        | —       | ✓       | ✓             |

Implemented as a single `TIER_MATRIX` constant, not scattered conditionals.

---

## 4. Counting Policy

Partitions that count toward `maxSyncedPartitions`:
- **`synced`**: YES — actively consuming license entitlement
- **`suspended` (due to license)**: YES — prevents abuse (create-suspend-create loop)
- **`local_only`**: NO — local-only partitions are free
- **`archived`**: NO — archived partitions are inactive

This policy is implemented in exactly one function: `countSyncedPartitions()`.

---

## 5. License Lifecycle

```
[No License] → activate(file) → [Active]
[Active] → validUntil reached → [Grace] (if graceUntil set)
[Active] → validUntil reached → [Expired] (if no grace)
[Grace] → graceUntil reached → [Expired]
[Active/Grace] → admin revokes → [Revoked]
[Expired] → re-activate → [Active]

On expiry/revoke:
  - Synced partitions → state=suspended (sync stops)
  - Local data access → preserved (never blocked)
  - Admin must choose which partitions to re-enable on re-license
```

---

## 6. Migration Plan

### From Current State
The existing `license.types.ts` and `license.svelte.ts` implement per-feature device-count gating. This must be replaced:

1. **Replace `LicensedFeature` + `maxDevices`** with partition-based `License` + `FeatureEntitlement[]`
2. **Replace `LicenseStore.activate(email, key)`** with `LicenseStore.importLicense(signedFile)`
3. **Replace `LicenseGate.svelte`** device-count checks with entitlement-based checks
4. **Add `PartitionStore`** for partition CRUD + switching
5. **Add Rust `licensing` + `partitions` modules** for backend enforcement + signature verification

### Data Migration
- No user data to migrate (all mock data currently)
- localStorage license → migrated to pluresDB on first run with partition support
- Settings → migrated from localStorage to partition-scoped pluresDB collection

---

## 7. Implementation Plan

### Phase 1: Domain Types + Entitlement Engine (Frontend)
Files created/modified:
- `src/lib/domain/license.ts` — License, FeatureEntitlement, FeatureFlag types
- `src/lib/domain/partition.ts` — Partition, PartitionState types
- `src/lib/domain/entitlements.ts` — TIER_MATRIX, computeEntitlements(), all `can*` checks
- `src/lib/domain/feature-matrix.ts` — Data-driven tier→feature mapping

### Phase 2: Stores + Services (Frontend)
- `src/lib/stores/license-store.svelte.ts` — Replace existing, add import/validate/grace
- `src/lib/stores/partition-store.svelte.ts` — Partition CRUD, active partition, switcher state
- `src/lib/services/license-service.ts` — Tauri invoke wrappers for Rust backend
- `src/lib/services/partition-service.ts` — Tauri invoke wrappers

### Phase 3: Rust Backend
- `src-tauri/src/licensing/mod.rs` — Module root
- `src-tauri/src/licensing/models.rs` — Rust domain types (mirror TS)
- `src-tauri/src/licensing/verify.rs` — Ed25519 signature verification
- `src-tauri/src/licensing/commands.rs` — Tauri commands: import_license, get_license, validate_license
- `src-tauri/src/partitions/mod.rs` — Module root
- `src-tauri/src/partitions/models.rs` — Rust partition types
- `src-tauri/src/partitions/service.rs` — Partition CRUD, counting, state transitions
- `src-tauri/src/partitions/commands.rs` — Tauri commands
- `src-tauri/src/policy/mod.rs` — Centralized entitlement enforcement (Rust side)

### Phase 4: UI Screens
- `src/routes/license/+page.svelte` — Rewrite: license dashboard, import, entitlements view
- `src/routes/partitions/+page.svelte` — New: partition management, create/archive/suspend
- Update `AppShell.svelte` — Add partition switcher to sidebar
- Update `LicenseGate.svelte` — Entitlement-based checks instead of device counts
- TUI parity for partition inspect + license status

### Phase 5: Tests + Documentation
- `src/lib/domain/__tests__/entitlements.test.ts` — Entitlement computation tests
- `src/lib/domain/__tests__/license.test.ts` — License parsing, expiry, grace
- `src-tauri/src/licensing/tests.rs` — Signature verification, counting policy
- `docs/admin-guide.md` — How licensing, partitions, limits, downgrades work

---

## 8. Affected Files

### New Files
- `src/lib/domain/license.ts`
- `src/lib/domain/partition.ts`
- `src/lib/domain/entitlements.ts`
- `src/lib/domain/feature-matrix.ts`
- `src/lib/stores/partition-store.svelte.ts`
- `src/lib/services/license-service.ts`
- `src/lib/services/partition-service.ts`
- `src/lib/guards/partition-guard.ts`
- `src/routes/partitions/+page.svelte`
- `src-tauri/src/licensing/` (mod, models, verify, commands)
- `src-tauri/src/partitions/` (mod, models, service, commands)
- `src-tauri/src/policy/mod.rs`

### Modified Files
- `src/lib/types/license.types.ts` — Replaced (old types removed)
- `src/lib/stores/license.svelte.ts` → `license-store.svelte.ts` (rewritten)
- `src/lib/components/LicenseGate.svelte` — Rewritten for entitlements
- `src/routes/license/+page.svelte` — Rewritten
- `src/lib/components/AppShell.svelte` — Partition switcher added
- `src-tauri/src/lib.rs` — Register new command modules
- `src-tauri/src/commands.rs` — Extract licensing/vault commands to modules
- `src-tauri/Cargo.toml` — Add ed25519-dalek, uuid, chrono deps

### Deleted Files
- `src/lib/types/license.types.ts` (absorbed into `domain/license.ts`)

---

## 9. Credential Vault Model

### Two-Tier Vault Architecture

The credential vault has two distinct tiers with different encryption and sync models:

#### Personal Vault (Free / Default)
- **Encryption**: User master password only (single-key)
- **Scope**: Per-user, per-device
- **Sync**: Never — credentials stay local
- **Access**: Master password unlocks
- **Available**: All tiers (free, pro, team, enterprise)

#### Shared Vault (Licensed)
- **Encryption**: Dual-key — license key encrypts in transit/at-rest for sync, but decryption requires BOTH user master password AND license key
- **Scope**: Per-partition — shared across all users/devices in the partition
- **Sync**: Via hyperswarm, encrypted with partition's license key
- **Access**: User must possess both their master password AND a valid license key for the partition
- **Available**: Pro, Team, Enterprise tiers only

#### Security Properties
| Property | Personal Vault | Shared Vault |
|----------|---------------|-------------|
| License key alone can read | N/A | ❌ No |
| Master password alone can read | ✅ Yes | ❌ No |
| Both keys together | N/A | ✅ Yes |
| Syncs across devices | ❌ No | ✅ Yes (within partition) |
| Survives license expiry | ✅ Always | ⚠️ Read-only (no sync, local cache preserved) |
| Cross-partition isolation | N/A | ✅ Each partition has its own license key |

#### Encryption Flow (Shared Vault)
```
Write:  plaintext → encrypt(masterPassword + licenseKey) → ciphertext → sync via hyperswarm
Read:   receive ciphertext → decrypt(masterPassword + licenseKey) → plaintext
```

The license key acts as a partition-scoped transport/storage key. The master password acts as the user-scoped access key. Neither alone is sufficient.

#### License Expiry Behavior
- Personal vault: Unaffected — always accessible
- Shared vault: Sync stops. Local cache preserved (read-only). User can still decrypt cached entries with both keys. New writes blocked until license renewed.

#### Implementation Notes
- `VaultCredential` gains a `vault_type: 'personal' | 'shared'` field
- Shared vault entries are tagged with `partition_id`
- Encryption uses the license key as additional authenticated data (AAD) in AEAD construction
- Key derivation: `derive_key(master_password, license_key, salt)` → AES-256-GCM
- On license change: shared vault re-encrypted with new license key (background migration)

---

## 10. Risks & Open Questions

| # | Risk/Question | Mitigation |
|---|---------------|------------|
| 1 | pluresDB integration not yet in this app — partition-scoped data storage needs it | Phase 1-3 use localStorage/filesystem; pluresDB integration is a follow-up |
| 2 | Ed25519 key distribution — how do users get the public key? | Embed in binary at build time; future: fetch from license server |
| 3 | License file format — JSON? JWT? Custom? | Start with signed JSON (license payload + detached Ed25519 sig). JWT adds unnecessary complexity for offline-first |
| 4 | Hyperswarm sync integration — partition sync toggle needs actual sync implementation | Partition model is sync-ready; actual hyperswarm wiring is a separate phase |
| 5 | Offline license file size — large enough to embed feature matrix? | Yes — license files will be <4KB even with full entitlement list |
| 6 | Grace period default — how long? | 14 days. Configurable per license. Documented in admin guide |

---

## 10. TODOs (Grouped)

### Deferred to pluresDB Integration Phase
- [ ] Migrate localStorage → pluresDB collections
- [ ] Partition-scoped data access (all queries filtered by active partition)
- [ ] Hyperswarm sync toggle per partition

### Deferred to Online Activation Phase
- [ ] License server for online activation/validation
- [ ] License refresh/renewal flow
- [ ] Telemetry events for license status changes

### Deferred to Enterprise Phase
- [ ] Cross-partition federation
- [ ] Enterprise admin controls (fleet-wide policy push)
- [ ] Priority sync queuing

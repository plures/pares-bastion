# Licensing & Partitions — Admin Guide

## Overview

netops-toolkit-app uses a **partition-based** licensing model. The billing unit is a **partition** — NOT user seats. Every partition includes unlimited users.

## Tiers

| Tier | Synced Partitions | Local Partitions | Price |
|------|------------------|-----------------|-------|
| **Free** | 0 (local only) | 1 | $0 |
| **Pro** | 1 | Unlimited | Contact sales |
| **Team** | 5 | Unlimited | Contact sales |
| **Enterprise** | Configurable | Unlimited | Contact sales |

All tiers include **unlimited users per partition**.

## How Licensing Works

### License Files
Licenses are distributed as `.netops-license` files (signed JSON). Import via:
- **GUI**: License page → "Import License File"
- **CLI**: `netops-toolkit license import <path>`

### License Lifecycle
```
No License → Import file → Active
Active → Expiry date reached → Grace (14 days default)
Grace → Grace period ends → Expired (sync stops)
Expired → Re-import valid license → Active

At any time:
Active → Admin deactivates → Free tier
Active → Issuer revokes → Revoked (sync stops)
```

### What Happens When a License Expires
1. Synced partitions are **suspended** (sync stops)
2. Local data access is **preserved** (never blocked)
3. Personal vault remains fully functional
4. Shared vault becomes read-only (no sync, cached entries still decryptable)

### Grace Period
Default: 14 days after expiry. During grace:
- Existing synced partitions continue syncing
- New synced partition creation is blocked
- Warning banners appear in UI

## How Partitions Work

### What Is a Partition?
A partition is simultaneously:
- A **sync group** — data replicates within a partition
- A **security boundary** — credentials and data are isolated per partition
- A **billing unit** — license consumption is counted per partition
- A **policy boundary** — admin controls are scoped per partition

### Partition States
| State | Syncs? | Counts toward limit? | Data accessible? |
|-------|--------|---------------------|-----------------|
| `local_only` | No | No | Yes |
| `synced` | Yes | **Yes** | Yes |
| `suspended` | No | **Yes** | Yes (local cache) |
| `archived` | No | No | Read-only |

### Creating Partitions
- **Free**: 1 local partition (no sync)
- **Pro**: 1 local + 1 synced
- **Team**: Unlimited local + 5 synced
- **Enterprise**: Unlimited local + configurable synced

### Switching Partitions
Use the partition switcher in the sidebar (GUI) or `netops-toolkit partition switch <name>` (CLI). All data views are scoped to the active partition.

## How Limits Are Counted

Only partitions in state `synced` or `suspended` count toward the synced partition limit.

- `local_only` → does NOT count
- `synced` → **counts**
- `suspended` → **counts** (prevents abuse: can't create→suspend→create to exceed limit)
- `archived` → does NOT count

To free a partition slot: archive or delete a synced/suspended partition.

## Credential Vault

### Two-Tier Architecture

**Personal Vault** (all tiers):
- Encrypted by your master password only
- Local to your device
- Never syncs
- Always available

**Shared Vault** (Pro+ only):
- Encrypted with **both** your master password AND the license key
- Syncs across all devices in the partition via hyperswarm
- Neither key alone can decrypt — you need both

### Security Properties
- License key alone → ❌ cannot read shared credentials
- Master password alone → ❌ cannot read shared credentials
- Both together → ✅ decrypts shared vault
- License expired → shared vault becomes read-only (local cache preserved)

## How to Import/Update Licenses

### Import
1. Navigate to License page (🪪 in sidebar)
2. Click "Import License File"
3. Select the `.netops-license` file
4. Signature is verified automatically
5. Entitlements update immediately

### Update
Import a new license file. It replaces the previous one.

### Deactivate
1. License page → "Deactivate License"
2. Reverts to Free tier
3. Synced partitions are suspended
4. **Data is NOT deleted** — admin must choose which partitions to keep

## How Downgrade/Grace Works

### Downgrade (e.g., Team → Pro)
1. License is imported with lower tier
2. Excess synced partitions are marked as **over-limit** (suspended)
3. The most recently created partitions are suspended first (LIFO)
4. Admin must decide: archive, delete, or keep suspended
5. No data is deleted automatically

### Grace Period
1. License expires → enters grace state (14 days default)
2. Existing sync continues
3. New synced partition creation blocked
4. Warning banners appear
5. After grace: sync stops on all synced partitions
6. Local data always accessible

### Recovery
Import a valid license at any time to restore sync. Previously suspended partitions can be re-enabled if within the new license's partition limit.

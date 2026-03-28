# pares-bastion

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
[![CI](https://github.com/plures/pares-bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/plures/pares-bastion/actions/workflows/ci.yml)

**Infrastructure operations platform for network and systems engineers.**

Built with **Svelte 5 + Tauri 2 + [design-dojo](https://github.com/plures/design-dojo)**. Runs as both a desktop GUI and terminal TUI.

> 🏰 A bastion is the one secure entry point into your infrastructure. Pares Bastion is the command center from which you manage it all.

## Features

### Inventory & Discovery
- **Network devices**: Routers, switches, firewalls, access points, load balancers
- **Systems**: Servers, VMs, containers, hypervisors, storage arrays
- **Cloud**: AWS, Azure, GCP resources (via API discovery)
- **Custom categories**: Define your own device types and metadata schemas

### Scanning & Health
- SNMP, ICMP, SSH-based discovery
- Continuous health monitoring with alerting
- Config drift detection and diff visualization

### Credential Vault
- **Personal vault**: Master password encryption, local-only, never syncs
- **Shared vault** (licensed): Dual-key encryption (master password + license key), syncs within partition
- Scope-based resolution: default → group pattern → device-specific

### SSH Tunneling
- Tunnel profiles with bastion host / jump box support
- Credential integration from vault
- Multi-hop tunneling

### Integrated Terminal
- xterm.js (GUI) / direct PTY (TUI)
- Multi-tab, split panes
- Session recording and playback

### Configuration Management
- Config backup and versioning
- Side-by-side diff with syntax highlighting
- Bulk config push with dry-run preview

### Document Pinning
- Pin runbooks, SOPs, and reference docs to devices or device groups
- Inline markdown viewer
- Version-tracked documentation per device category

### Data Export
- Excel export with formatting (powered by `rust_xlsxwriter`)
- CSV, JSON export
- Free tier: 10 rows; licensed: unlimited

### Partitions & Licensing
- **Billing unit: partitions** (not seats) — unlimited users per partition
- Tiers: Free (local-only), Pro (1 synced), Team (5 synced), Enterprise (configurable)
- Offline-signed Ed25519 license files
- See [Admin Guide](docs/admin-guide.md) for full details

## Screenshots

See [docs/screenshots/](docs/screenshots/) for GUI and TUI views.

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev          # Svelte dev server
npm run tauri:dev    # Tauri + Svelte

# Build
npm run build        # Svelte build
npm run tauri:build  # Tauri release build

# Quality
npm run lint         # ESLint
npm run check        # TypeScript type check
npm test             # Vitest (33 tests)
```

## Architecture

```
src/                    # Svelte 5 frontend
├── lib/
│   ├── domain/         # Business logic (entitlements, licensing, partitions)
│   ├── stores/         # Svelte 5 rune stores
│   ├── guards/         # Data isolation (partition guard)
│   ├── services/       # Tauri invoke wrappers
│   ├── components/     # UI components (imports from @plures/design-dojo)
│   └── types/          # TypeScript types
├── routes/             # SvelteKit pages
src-tauri/              # Rust backend
├── src/
│   ├── licensing/      # Ed25519 license verification
│   ├── partitions/     # Partition CRUD + limit enforcement
│   └── policy/         # Feature matrix + entitlement checks
```

## Device Categories

### Network
Router, Switch, Firewall, Access Point, Load Balancer, WAN Optimizer, Wireless Controller, Network TAP, Packet Broker

### Systems
Server (Physical), Virtual Machine, Hypervisor, Container Host, Storage Array, Backup Appliance, UPS/PDU, KVM/Console Server, BMC/IPMI

### Cloud
Cloud VPC/VNet, Cloud Instance, Cloud Load Balancer, Cloud Gateway, Cloud Storage, Cloud Database

### Custom
User-defined categories with custom metadata schemas, health checks, and credential templates.

## License

This project is licensed under the [Business Source License 1.1](LICENSE).

- **Personal / non-commercial use**: Free, always
- **Commercial use**: Requires a valid license key ([tiers & pricing](docs/admin-guide.md))
- **Change date**: March 28, 2030 — this version becomes Apache 2.0

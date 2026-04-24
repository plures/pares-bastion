# Pares Bastion Roadmap

## Role in OASIS
Pares Bastion is the operator-facing control center for OASIS infrastructure. It provides inventory, secure access, auditing, and operational workflows for managing the mesh while keeping sensitive data local-first and policy-governed.

## Current State
The product is active with a Svelte 5 + Tauri 2 UI, inventory/scanning features, credential vault, and SSH tunneling. Core workflows exist but deeper OASIS integrations and automation hooks are still missing.

## Phases

### Phase 1 — Stabilize MVP Ops Workflows
- Finish end-to-end inventory + scan ingestion with durable local storage.
- Harden credential vault flows (rotation, scoped access, audit events).
- Improve device detail views, diff tooling, and bulk configuration previews.
- Expand test coverage for licensing/partition guards.

### Phase 2 — OASIS Data Plane Integration
- Persist operational state in PluresDB for local-first sync.
- Apply Praxis policy enforcement on actions (access, change control).
- Add agent-assisted runbooks (pares-agens suggestions, gated execution).
- Emit Chronos-compatible audit trails for every operation.

### Phase 3 — Collaboration & Enterprise Readiness
- Multi-partition collaboration with granular RBAC.
- Secure sharing of runbooks and device metadata across teams.
- Performance profiling for large fleets (10k+ assets).
- Compliance reporting and export automation.

### Phase 4 — OASIS Marketplace & Managed Ops
- Operator marketplace for vetted automation workflows.
- Managed fleet templates for common OASIS deployments.
- Advanced analytics (drift trends, SLA dashboards, risk scoring).
- Partner integrations (ticketing, CMDB, SIEM).

## Status
🚧 Active product — needs deeper OASIS integrations and scale hardening.

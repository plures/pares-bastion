## [0.16.0] — 2026-08-09

- Merge pull request #9 from plures/copilot/finish-end-to-end-inventory-scan-ingestion (4a74dd6)
- fix(scan): restore missing inventory ingest call in finishScan (359a2d9)
- Potential fix for pull request finding (03267c8)
- Potential fix for pull request finding (17b4605)
- Potential fix for pull request finding (9470dfd)
- fix: derive startedAt from now parameter and extract date format options (9182bf3)
- feat: add durable local storage for inventory and scan ingestion (05065da)
- Initial plan (0884a5e)

## [0.15.3] — 2026-07-28

- Merge pull request #8 from plures/chore/dependabot-auto-merge-workflow-call (d75605a)
- fix: gate dependabot auto-merge workflow and reduce secret scope (0cc0204)
- chore: delegate dependabot-auto-merge.yml to plures/.github reusable template (8438e44)

## [0.15.2] — 2026-07-24

- Merge pull request #7 from plures/release-trigger-autobump (fe33826)
- Potential fix for pull request finding (41d223f)
- Merge pull request #6 from plures/fix/ci-green (42c0677)
- fix(license): correct test to use validUntil/graceUntil instead of expiresAt/gracePeriodDays (cf01bb3)
- fix: exclude tests/e2e from root tsconfig to resolve CI typecheck failure (01406f0)
- fix: satisfy lint for unused service stub parameters (2751b96)
- fix: resolve all ESLint errors causing CI node job failure (c7c0407)
- fix(lint): remove missing design-dojo enforce plugin from eslint config (3837d1a)
- ci(release): trigger release pipeline on merge to main (f78fa1f)
- fix(ci): sync package-lock.json with package.json (cd780c1)
- ci: migrate Tech Doc Writer to shared reusable (743d2cd)
- fix(ci): repair tech-doc-writer YAML indentation / remove empty workflow (ad83760)
- ci: add security-aware Dependabot auto-merge workflow (org backfill) (0da3d57)
- ci: change release trigger from push-to-main to tag-only (0443c35)
- docs: update README license section for BSL-1.1 OR MIT dual-license (ce66c6b)
- license: dual-license under BSL-1.1 OR MIT (d6a13ec)
- wip: save work in progress (df777f9)

## [0.15.1] — 2026-05-11

- refactor: replace inline lifecycle with reusable workflow call (4801549)
- docs: refresh ROADMAP.md with OASIS strategic alignment (fb25cc0)
- docs: update copilot-instructions with praxis, design-dojo, automation rules (afa7372)

## [0.15.0] — 2026-04-23

- feat(release): add target_version input for milestone-driven releases (03ace83)
- feat(lifecycle): milestone-close triggers roadmap-aware release (76c0051)

## [0.14.0] — 2026-04-18

- feat(lifecycle v12): auto-release when milestone completes (74bb3f4)

## [0.13.0] — 2026-04-18

- feat(lifecycle v11): smart CI failure handling — infra vs code (9800848)

## [0.12.7] — 2026-04-17

- fix(lifecycle): label-based retry counter + CI fix priority (d914707)
- ci: inline lifecycle workflow — fix schedule failures (51590b8)
- chore: centralize CI to org-wide reusable workflow (a928109)
- ci: standardize Node version to lts/* — remove hardcoded versions (a1e5ac9)
- ci: centralize lifecycle — event-driven with schedule guard (010f11a)

## [0.12.6] — 2026-04-01

- fix(lifecycle): v9.2 — process all PRs per tick (return→continue), widen bot filter (39f702f)

## [0.12.5] — 2026-04-01

- fix(lifecycle): change return→continue so all PRs process in one tick (dce6afd)

## [0.12.4] — 2026-03-31

- fix(lifecycle): v9.1 — fix QA dispatch (client_payload as JSON object) (d3aa75a)

## [0.12.3] — 2026-03-31

- fix(lifecycle): rewrite v9 — apply suggestions, merge, no nudges (aadfaa9)

## [0.12.2] — 2026-03-28

- refactor: pure Rust backend — remove all Python dependencies (116f7b7)

## [0.12.1] — 2026-03-28

- fix: remove unused externalBin sidecar, use platform-correct python (3980352)

## [0.12.0] — 2026-03-28

- feat: pares-bastion — infrastructure operations platform (4bbed70)

## [0.11.0] — 2026-03-28

- feat: add tests (33 passing), admin guide, vitest setup (63b58de)

## [0.10.0] — 2026-03-28

- feat: partition-based licensing system (replaces device-count model) (19311e2)

## [0.9.1] — 2026-03-28

- fix: replace local design-dojo shim with real @plures/design-dojo (4d888c7)

## [0.9.0] — 2026-03-28

- feat: Ansible integration — dynamic inventory export and playbook generation (#33) (b18f175)

## [0.8.2] — 2026-03-28

- fix: add packages:write + id-token:write to release workflow (fa3b1e6)

## [0.8.1] — 2026-03-28

- fix: resolve TypeScript and Svelte 5 errors blocking CI (#32) (b4745d8)

## [0.8.0] — 2026-03-28

- feat: add licensing, YAML settings, export, SSH tunnels, and terminal (ff14ebf)
- docs: add credential vault screenshots (GUI + TUI) (7b204a1)
- docs: add extensive screenshots for all views in GUI and TUI mode (494172d)

## [0.7.0] — 2026-03-28

- feat: Credential Vault UI — encrypted credential management (#31) (3a4df80)
- docs: add ROADMAP.md (8b4244e)
- chore: cleanup and housekeeping (48212c6)
- chore: standardize CI workflow (7057a60)
- chore: standardize lint-clean across org (85afcf4)

## [0.6.0] — 2026-03-27

- feat: health dashboard — fleet-wide CPU, memory, interface errors, log alerts (#30) (baa7d98)

## [0.5.0] — 2026-03-27

- feat: Config backup viewer — collect, diff, and rollback (#29) (63d52cc)

## [0.4.1] — 2026-03-27

- fix: use SplitPane/Pane layout, fix $derived.by, remove dead code in device detail (#28) (d77df8c)

## [0.4.0] — 2026-03-27

- fix: align package version to v0.3.0 to unblock Release workflow (#27) (0760bb3)
- fix: add strict-peer-deps to prevent peer dependency conflicts (#26) (c5d338f)
- feat: Device Detail view — system info, interfaces, health, BGP, config tabs (#24) (5847903)
- docs: add TUI mode screenshot (baeff9a)
- docs: add screenshots for inventory, scan runner, and settings views (64bf9e1)
- [WIP] Add scan runner view with progress tracking (#11) (59a0b57)
- feat: settings view for credentials and scan profiles (#13) (733a82d)
- feat: Inventory Dashboard view with design-dojo Table (#12) (8873844)
- feat: wire netops-toolkit Python CLI as Tauri sidecar (#14) (7904daa)
- feat: app shell with sidebar navigation (#10) (098cd27)

# Changelog

## [0.2.0] — 2026-03-26

- Merge pull request #8 from plures/copilot/bootstrap-svelte-tauri-project (0670611)
- Update src/app.html (9dd362f)
- Update src-tauri/tauri.conf.json (c6dfbed)
- Update src-tauri/Cargo.toml (5296885)
- ci: add standard plures org automation (02cec33)
- feat: bootstrap Svelte 5 + Tauri 2 project from svelte-tauri-template (af629ee)
- Initial plan (d0538d0)
- ci: add GitHub Actions CI and Copilot setup steps (10802f7)
- Initial scaffold: README, package.json (fd78107)


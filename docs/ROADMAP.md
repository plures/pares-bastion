# netops-toolkit-app Roadmap

## Role in Plures Ecosystem
netops-toolkit-app is the GUI/TUI product shell for netops-toolkit, showcasing the Plures stack (Svelte 5, Tauri 2, design-dojo, Praxis, PluresDB). It serves as both a real operator console and a dogfood platform for the design-once-run-everywhere UI model.

## Current State
The app includes a working Svelte 5 UI with routes for inventory, scans, health, and settings. TUI mode is documented via the svelte-ratatui adapter, and screenshots show the core views. The Python backend runs as a Tauri sidecar, but data wiring, workflow depth, and device detail views are still thin.

## Milestones

### Near-term (Q2 2026)
- Finish inventory dashboard wiring (live data from netops-toolkit scans).
- Implement scan runner UX end-to-end: launch, progress, and result ingestion.
- Build device detail view (interfaces, neighbors, health summary).
- TUI mode polish: keyboard navigation, focus states, status bar.
- Add basic persistence via PluresDB for scan history.

### Mid-term (Q3–Q4 2026)
- Introduce job scheduling (recurring scans, retention policies).
- Add multi-tenant profiles and credential vault integration.
- Expand health view to show trending metrics and alerts.
- Export reports (CSV/PDF) directly from the UI.
- Add guided workflows (backup, diff, safe push).

### Long-term
- Full offline-first operator console with sync across devices.
- Plugin system for custom scan modules and vendor packs.
- Advanced topology visualization and dependency mapping.
- Integrate with broader Plures governance (Praxis rules + Chronos history).

# Copilot Instructions

## Organization Standards

You are working in the **plures** organization. Before making changes, understand our standards.

### Source of Truth
- **Development guide:** https://github.com/plures/development-guide
  - `standards/` — commit conventions, CI/CD, PR workflow, repo setup, code style
  - `practices/` — copilot delegation, merge sweeps, local-first development
  - `lessons-learned/` — past mistakes to avoid

### Key Standards (DO NOT SKIP)

**Conventional Commits** — all commit messages MUST follow:
```
<type>[optional scope]: <description>
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`
Breaking changes: add `!` after type or `BREAKING CHANGE:` in footer.

**PR Titles** — use conventional commit format (they become the squash commit message).

**Squash merge** — always. Clean single commit on `main`.

**Tests required** — all new features need tests. All bug fixes need a failing test first.

### Project-Specific

This is a **Svelte 5 + Tauri 2** application using design-dojo components.

**Component Library:** Use `@plures/design-dojo` components whenever possible.
  - Every design-dojo component has a `tui` prop — pass it through for TUI mode support.
  - Use `provideTui()`/`useTui()` from design-dojo's `useTui.ts` for TUI context propagation.

**Stack:**
  - Frontend: SvelteKit + `@sveltejs/adapter-static`
  - Desktop: Tauri 2 (src-tauri/)
  - Backend: netops-toolkit Python CLI (Tauri sidecar)
  - TUI: tauri-plugin-tui (from svelte-ratatui)

### Release Pipeline

We use a **reusable release workflow** from `plures/.github`:

```yaml
name: Release
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      bump:
        type: choice
        options: [patch, minor, major]
jobs:
  release:
    uses: plures/.github/.github/workflows/release-reusable.yml@main
    with:
      bump: ${{ inputs.bump || '' }}
    secrets: inherit
```

### What NOT to Do
- Do NOT add `eslint-disable` — fix the underlying issue
- Do NOT create sub-PRs that depend on other PRs
- Do NOT touch files outside the requested scope
- Do NOT manually bump version numbers
- Do NOT skip tests or add `skip` annotations to make CI pass

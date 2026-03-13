# STATE

## Mission
- Reduce cold-start and first-open latency across dashboard, splits, and history.
- Keep API contracts stable while preparing Python -> TypeScript migration lanes.

## Current focus
- Baseline end-to-end timings before large refactors.
- Ship low-risk wins first (query orchestration, render gating, 3D deferral).

## Active blockers
- None logged.

## Handoffs
### 2026-03-12 bootstrap
- Workspace initialized.
- Worktrees/branches created:
  - `perf/a-mobile-render` -> `..\\Split.Ai.wt-a-mobile-render`
  - `perf/b-query-cache` -> `..\\Split.Ai.wt-b-query-cache`
  - `perf/c-dashboard-3d` -> `..\\Split.Ai.wt-c-dashboard-3d`
  - `perf/d-backend-critical-path` -> `..\\Split.Ai.wt-d-backend-critical-path`
  - `perf/e-py-ts-bridge` -> `..\\Split.Ai.wt-e-py-ts-bridge`
  - `perf/f-browser-loop` -> `..\\Split.Ai.wt-f-browser-loop`
- Dev loop initialized via `run-stack.sh`.

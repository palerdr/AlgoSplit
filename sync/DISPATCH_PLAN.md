# Parallel Dispatch Plan (Steps 4+)

## Step 4: Assign lanes
- A: `perf/a-mobile-render`
- B: `perf/b-query-cache`
- C: `perf/c-dashboard-3d`
- D: `perf/d-backend-critical-path`
- E: `perf/e-py-ts-bridge`
- F: `perf/f-browser-loop`

Each agent must read and update these shared files first:
- `STATE.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `SCOREBOARD.md`

## Step 5: Baseline pass (no behavior changes)
1. Capture 10 cold + 10 warm runs per screen:
   - sign-in -> dashboard
   - first-open splits
   - first-open history
2. Record median and p95 in `SCOREBOARD.md`.
3. Log top 5 bottlenecks in `STATE.md`.

## Step 6: Parallel implementation goals
- A: route mount/render cost reductions and non-blocking first paint.
- B: query ordering, prefetch strategy, avoid first-load fan-out.
- C: decouple dashboard text readiness from 3D readiness.
- D: backend endpoint profiling + hot-path cleanup without contract changes.
- E: Python -> TS transform lane definitions + parity harness design.
- F: browser-first verification runbook and tight edit->verify loop.

## Step 7: Merge order
1. D (backend critical path)
2. B (query/cache sequencing)
3. A (render/navigation first paint)
4. C (dashboard 3D path)
5. F (browser loop/runbook)
6. E (migration scaffold)

## Step 8: Exit criteria
- Dashboard cold-start median improved >= 30%.
- Splits/history first-open median improved >= 30%.
- Dashboard KPIs render before 3D completes.
- Hot backend endpoint p95s documented and improved.
- First two Python -> TS migrations scoped with parity checks.

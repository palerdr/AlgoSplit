# DECISIONS

## ADR-001 Markdown Shared Context
- Date: 2026-03-12
- Decision: Use shared markdown files in `Split.Ai.sync` as single source of coordination truth across worktrees.
- Why: Keep agent sessions coherent and auditable.

## ADR-002 Perf Before Rewrite
- Date: 2026-03-12
- Decision: Do baseline measurement before architecture-level optimization.
- Why: Prevent churn and optimize true bottlenecks.

## ADR-003 Stable API Contracts
- Date: 2026-03-12
- Decision: Keep backend response contracts stable while refactoring internals.
- Why: Unblock parallel mobile and migration work.

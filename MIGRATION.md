# Refreshed Frontend — Migration Notes

This branch (`refreshed-frontend`) replaces `app/` with a rebuilt frontend.
**The backend is byte-identical to `main`** — nothing under `backend/` changed.

## What the refreshed frontend is

A heatmap-first redesign, built iOS-26-native:

- **Home**: the segmented 3D body (same `segmented_body.glb`) fills the screen
  as a rolling weekly heatmap; a liquid-glass pill (with the Week Effort meter
  inside it) morphs into the workout sheet when dragged.
- **Session flow**: Apple-picker wheels for weight/reps (last-used star
  marker), power-off-style slide-to-complete, per-set segmented progress, a
  full-screen draining-water rest timer with hold-to-skip physics, and a
  seamless finish: the same body model spins once, lands front-facing, and the
  home UI settles back in around it.
- **Details hub**: Overview (stimulus score, weekly volume, GitHub-style
  training grid, history), Splits (steady-state per-muscle analysis with
  frequency selector), Progress (Brzycki e1RM best-vs-last per exercise).
- **Workouts**: builder used for both create and edit.

## Engine

`app/src/analysis/stimulus.ts` is a TypeScript port of `backend/core`:
Schoenfeld/Pelland marginal curves, tier betas (incl. quaternary), the
exponential CNS curve with axial set-equivalents, unilateral bonus, leverage
redistribution, per-muscle recovery windows, recovery penalty, atrophy +
weekly steady-state (`analyzeTemplate`), the canonical 0–7 scale, and Brzycki
e1RM. `npm test` runs 23 parity/behavior checks.

## Data

`app/scripts/generate-data.js` generated `app/src/data/*.gen.ts` directly from
this repo's engine data: all 29 muscle regions (with leverage / recovery
modifiers / damage tiers), all 38 movement patterns (tiered targets, axial
load, resistance profiles), and the full 307-exercise catalog. Exercise names
round-trip cleanly to the backend matcher.

## Backend integration

`app/src/api/algosplit.ts` speaks the backend contract
(`POST /api/analyze-split`, `SplitRequest` → `AnalysisResponse`). Set
`EXPO_PUBLIC_ALGOSPLIT_API` (see `app/.env.example`) and the Splits analysis
runs on the server engine; unset, it falls back to the local TS port. The
legacy frontend's env template is preserved as `app/.env.legacy.example`.

Not yet wired to the server: auth, split/workout persistence (the refreshed
app persists locally via AsyncStorage), imports, comparisons, programs.

## Running

```bash
# refreshed frontend (this branch)
cd app && npm install && npx expo start

# backend (unchanged)
cd backend && pip install -r requirements.txt && uvicorn main:app --port 8000

# legacy frontend (from main)
git worktree add ../algosplit-legacy main && cd ../algosplit-legacy/app && npm ci && npx expo start
```

Note: the refreshed app targets Expo SDK 54 (current App Store Expo Go);
legacy `main` targets SDK 55.

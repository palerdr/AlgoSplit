# Frontend (Vite Web UI) - DEPRECATED

This directory contains the **original web-based dashboard UI** built with Vite + React + TypeScript + Tailwind CSS.

## Status: Superseded by `app/` (React Native / Expo)

The primary client is now the React Native mobile app in `app/`. This Vite frontend was the initial prototype web dashboard and shares ~80% of its logic with the mobile app (API clients, types, stores).

## Key Differences from `app/`

| Concern | `frontend/` (this) | `app/` (active) |
|---------|---------------------|-----------------|
| Platform | Web (Vite + React) | Mobile (Expo + React Native) |
| Styling | Tailwind CSS | React Native StyleSheet |
| Routing | react-router-dom | Expo Router |
| Charts | Recharts | react-native-svg-charts |
| State | Zustand + React Query | Zustand + React Query |

## Duplicated Code (should be unified if web UI is revived)

- `src/api/*.api.ts` - Identical API clients
- `src/types/api.types.ts` - Nearly identical type definitions (slight drift)
- `src/stores/` - Duplicate state management
- `src/data/exercises.ts` - Duplicate exercise database

## If Reviving This UI

Consider extracting shared code (API clients, types, stores) into a shared package to prevent further drift between `frontend/` and `app/`.

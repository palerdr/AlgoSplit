# fitapp — barebones draft

React Native (Expo) draft of the heatmap-first fitness app. Deliberately minimal — no navigation library, no persistence, no backend.

## Run it

```
npm install
npx expo start
```

Open in Expo Go or a dev build (the 3D body needs a real GL context — use a device or simulator, not web).

## What's here

- **Home** — full-screen 3D body heatmap (model from [AlgoSplit](https://github.com/palerdr/AlgoSplit), drag to rotate) colored by recently-worked muscles, plus exactly three controls: a drag-up/tap **Start Workout** pill, **Details**, and **Workouts**.
- **Start Workout** — pick a split (Push / Pull / Legs) or "Add as you go".
- **Session** — swipe the card to complete a set → full-screen rest timer (3 min fixed for now; a pool of light drains as the rest elapses, hold to skip) → next exercise auto-picked in order (algorithm slot for later).
- **Complete** — pulse-ring + check animation, then the body showing only this session's stimulus.
- **Details** — history list, analytics placeholder.
- **Workouts** — read-only split viewer, editing placeholder.

## Structure

```
App.tsx               state-machine "navigation" (swap for expo-router later)
src/3d/               GLB loading + segmented body heatmap (expo-gl + three)
src/data/             exercise catalog w/ per-muscle stimulus, split templates
src/state/AppState.tsx  session logic, history, stimulus decay (in-memory, seeded with demo data)
src/screens/          one file per screen + RestTimer overlay
```

## Known placeholders

- Rest fixed at 180s (`REST_SECONDS`), exercise order is template order — both slots for the future algorithm.
- Per-exercise stimulus numbers are eyeballed, not the real engine.
- History is in-memory only (seeded with two demo workouts so the heatmap isn't blank) — resets on reload.

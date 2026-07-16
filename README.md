# AlgoSplit

AlgoSplit is a training split planner, workout tracker, and analysis app. It combines a React Native/Expo client with a FastAPI backend that models muscle stimulus, fatigue, recovery, and training history against user-created splits.

The project is no longer an API-only prototype. It now includes authentication, Supabase-backed persistence, split editing/importing, logged workout history, progress charts, custom exercise overrides, comparisons, bodyweight tracking, and program/session-template workflows.

## What It Does

- Build and edit weekly or custom-cycle training splits.
- Analyze splits across 29 muscle regions using research-backed stimulus and fatigue curves.
- Parse exercise names into movement patterns, target muscles, resistance profiles, bilateral/unilateral status, and axial fatigue contributions.
- Start workouts from saved split sessions or from a blank quick workout.
- Log sets, reps, load, RIR, notes, unilateral work, and workout duration.
- Reuse previous workout data as entry-field shadow values.
- Track workout history, recent stimulus, progress trends, and bodyweight.
- Manage custom exercises and user-specific exercise overrides.
- Save split comparisons and work with programs, microcycles, session templates, and scheduled sessions.

## Tech Stack

| Area | Stack |
| --- | --- |
| App | Expo Router, React Native 0.83, React 19, TypeScript |
| State/data | Zustand, TanStack Query, AsyncStorage, SecureStore |
| API | FastAPI, Pydantic v2, Uvicorn |
| Database/auth | Supabase Postgres, Supabase Auth/JWT, RLS |
| Analysis | Python engine under `backend/core` |
| Tests | Jest/Jest Expo, pytest |
| Deployment | Expo/Vercel-style web export for app, Render/Fly/Railway for API, Supabase for data |

## Repository Layout

```text
algosplit/
|-- app/                    # Expo app: native + web client
|   |-- app/                # Expo Router screens
|   |-- src/                # API clients, hooks, stores, components, utils
|   |-- tests/              # Jest tests for app logic/components
|   `-- package.json
|-- backend/
|   |-- api/                # FastAPI routes, dependencies, security
|   |-- core/               # Analysis engine and movement matching
|   |-- db/migrations/      # Supabase SQL migrations
|   |-- schemas/            # Pydantic request/response models
|   `-- main.py
|-- legacy/                 # Older prototype code retained for reference
|-- sync/                   # Supporting sync utilities
|-- DATA_FLOW.md            # Analysis/session flow notes
|-- DEPLOYMENT.md           # Older deployment notes, still partly useful
|-- requirements.txt        # Backend Python dependencies
`-- README.md
```

## Local Development

### Prerequisites

- Node.js and npm
- Python 3.10+
- A Supabase project with the migrations in `backend/db/migrations` applied
- Expo tooling through `npx expo`

### 1. Install Dependencies

```bash
# App
cd app
npm ci

# Backend
cd ..
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

On macOS/Linux, activate the virtualenv with:

```bash
source .venv/bin/activate
```

### 2. Configure Environment

For the app, create `app/.env` when overriding the default API URL:

```env
EXPO_PUBLIC_ALGOSPLIT_API=http://localhost:8000
```

For the backend, configure these environment variables in your shell or hosting platform:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_JWT_SECRET=...
FRONTEND_URL=http://localhost:8081

# Optional security/rate-limit controls
APP_ENV=development
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REDIS_URL=
TRUST_PROXY=false
AUTH_COOKIE_SECURE=false
AUTH_EXPOSE_ACCESS_TOKEN=true
```

The backend also supports cookie/CSRF overrides such as `AUTH_COOKIE_NAME`, `AUTH_REFRESH_COOKIE_NAME`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SAMESITE`, and `CSRF_HEADER_NAME`.

### 3. Run the Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Useful API URLs:

- API root: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Health: `http://localhost:8000/health`

### 4. Run the App

```bash
cd app
npm start
```

Common targets:

```bash
npm run web
npm run ios
npm run android
```

Production web uses same-origin Vercel rewrites. The EAS production profile supplies the native API URL; use `EXPO_PUBLIC_ALGOSPLIT_API` locally when pointing at a different backend.

## Scripts and Checks

### App

```bash
cd app
npm test -- --runInBand
npx tsc --noEmit
npm run build:web
```

Current caveat: the full Jest suite may hang in the older hook tests under `app/__tests__/hooks`. The actively maintained app tests under `app/tests`, plus targeted hook/route tests, should be run directly when validating focused changes.

### Backend

```bash
pytest
```

## API Surface

The root endpoint exposes a live endpoint map. Major route groups include:

- `POST /auth/signup`, `POST /auth/login`, `GET /auth/user`, `POST /auth/logout`
- `GET/POST /api/splits`
- `GET/PUT/DELETE /api/splits/{id}`
- `POST /api/splits/{id}/analyze`
- `POST /api/analyze-split`
- `POST /api/analyze-workouts`
- `POST /api/parse-exercise`
- `GET /api/movement-patterns`
- `GET/POST /api/workouts`
- `GET/DELETE /api/workouts/{id}`
- `GET /api/workouts/summaries`
- `GET /api/workouts/dates`
- `GET /api/workouts/stats/summary`
- `GET/POST /api/custom-exercises`
- `GET/POST /api/exercise-overrides`
- `GET/POST /api/comparisons`
- `GET/POST /api/programs`
- `GET/POST /api/session-templates`
- `GET/POST /api/bodyweight`

## Data Model

Supabase migrations currently cover:

- `splits`, `sessions`, `exercises`
- `workout_logs`, `workout_exercises`
- `exercise_overrides`
- RLS policies and triggers
- `comparisons`
- `custom_exercises`
- `programs`, mesocycles, microcycles, program sessions, templates
- `bodyweight`
- RIR support on logged workout exercises

Apply migrations in order from `backend/db/migrations` when bootstrapping a new Supabase project.

## Analysis Model

The analysis engine models:

- Set-by-set stimulus with diminishing returns.
- Recovery penalties when a muscle is retrained inside the stimulus window.
- CNS/global fatigue and axial fatigue.
- Consecutive-day penalties.
- Bilateral/unilateral modifiers.
- Region-level muscle contribution tiers.
- Atrophy after the configured stimulus duration.
- Group summaries, optimization suggestions, and optional session breakdowns.

Default analysis settings can be adjusted per split:

- `stimulus_duration`: 24-96 hours
- `maintenance_volume`: 1-9 sets
- `dataset`: `schoenfeld`, `pelland`, or `average`

## Deployment Notes

Typical production layout:

```text
Expo web/native app -> FastAPI API -> Supabase Auth/Postgres
```

Backend hosting options used by the project:

- Render
- Fly.io
- Railway

Backend start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

App web export:

```bash
cd app
npm run build:web
```

For production, set:

- backend Supabase credentials
- `APP_ENV=production`, `FRONTEND_URL=https://your-web-app.example` and `ALLOWED_HOSTS=your-api.example` (comma-separated values are accepted). The service refuses to boot without explicit production origins and hosts.
- `AUTH_EXPOSE_ACCESS_TOKEN=true` when the same deployment serves native clients. Tokens are returned only when the explicit native header is present, while browser responses remain cookie-only. Native credentials are stored with SecureStore.
- Apply `backend/db/migrations/011_workout_idempotency.sql` before distributing the mobile build so persisted workout retries cannot create duplicates.
- `AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS` when the default 30-day browser session lifetime is unsuitable.
- `MAX_REQUEST_BODY_BYTES` to adjust the default 1 MiB API request limit.
- `TRUST_PROXY=true` only behind a trusted reverse proxy
- optional Redis URL for distributed rate limiting

## Development Notes

- Prefer the app API hooks in `app/src/hooks` over direct component-level API calls.
- Workout state lives in `app/src/stores/workoutStore.ts`.
- API clients live in `app/src/api`.
- Shared TypeScript response/request shapes live in `app/src/types/api.types.ts`.
- Backend route schemas should mirror those TypeScript types.
- Performance-sensitive backend routes emit `Server-Timing` and perf logs.

## License

No license file is currently present in this repository.

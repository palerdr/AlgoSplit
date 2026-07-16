# AlgoSplit

AlgoSplit is a training split planner, workout tracker, and analysis app. It combines a React Native/Expo client with a FastAPI (Python + Rust) backend that models muscle stimulus, fatigue, recovery, and training history against user-created splits.

The project is no longer an API-only prototype. It now includes authentication, Supabase-backed persistence, split editing/importing, logged workout history, progress charts, custom exercise overrides, comparisons, bodyweight tracking, and program/session-template workflows.

## Production

- Web app: [algo-split.vercel.app](https://algo-split.vercel.app)
- API health: [algosplit-api-staging.vercel.app/health](https://algosplit-api-staging.vercel.app/health)

Google and Apple sign-in setup, fixed callback URLs, and provider-secret handling are documented in [SOCIAL_AUTH_SETUP.md](SOCIAL_AUTH_SETUP.md).

The frontend and backend are separate Vercel projects deployed from `main`,
with Supabase providing authentication and persistent account data.

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
| API | FastAPI, Pydantic v2, Uvicorn, uv |
| Database/auth | Supabase Postgres, Supabase Auth/JWT, RLS |
| Analysis | Rust kernel with parity-gated Python fallback under `backend/core` |
| Tests | Jest/Jest Expo, pytest |
| Deployment | Vercel web export and FastAPI functions, EAS for native builds, Supabase for data |

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
|   |-- rust/               # Maturin/PyO3 analysis extension
|   |-- schemas/            # Pydantic request/response models
|   |-- pyproject.toml      # Backend project and uv workspace
|   |-- uv.lock             # Locked Python and local-package dependencies
|   `-- main.py
|-- legacy/                 # Older prototype code retained for reference
|-- sync/                   # Supporting sync utilities
|-- DATA_FLOW.md            # Analysis/session flow notes
|-- DEPLOYMENT.md           # Older deployment notes, still partly useful
`-- README.md
```

## Local Development

### Prerequisites

- Node.js and npm
- Python 3.12 and uv
- Rust toolchain (Cargo, rustc, rustfmt, and Clippy)
- A Supabase project with the migrations in `backend/db/migrations` applied
- Expo tooling through `npx expo`

### 1. Install Dependencies

```bash
# App
cd app
npm ci

# Backend (from the repository root)
cd ..
uv sync --project backend --frozen --all-groups
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
uv run --project backend uvicorn main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
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

### Running on a Phone

Account features need a backend the phone can reach. In development the app
defaults `EXPO_PUBLIC_ALGOSPLIT_API` to `http://localhost:8000`, which on a
physical device is the phone itself — every `/auth/*` request fails and the app
shows "Account connection failed / Account service is temporarily unavailable.
Please try again later."

Point the dev bundle at the deployed API instead:

1. Create `app/.env.local` (gitignored, and it overrides any existing
   `app/.env` so a `localhost` value for web work can stay in place):

   ```env
   EXPO_PUBLIC_ALGOSPLIT_API=https://algosplit-api-staging.vercel.app
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-public-key
   EXPO_PUBLIC_ALGOSPLIT_OAUTH_NATIVE_CALLBACK_URL=algosplit://oauth/callback
   EXPO_PUBLIC_ALGOSPLIT_IDENTITY_NATIVE_CALLBACK_URL=algosplit://identity/callback
   ```

2. Make sure the backend Vercel Production environment sets
   `AUTH_EXPOSE_ACCESS_TOKEN=true` and has been redeployed since (see
   DEPLOYMENT.md). Without it, login on the phone fails with "The backend did
   not return native session credentials": native clients authenticate with
   Bearer tokens, which the backend only includes in the JSON body when this
   flag is enabled. Browser authentication is unaffected — requests carrying an
   `Origin` header always stay cookie-only.

3. Restart the dev server with a clean cache (`EXPO_PUBLIC_*` values are
   inlined at bundle time, so a plain reload is not enough):

   ```bash
   cd app
   npx expo start -c
   ```

4. Scan the QR code with Expo Go (phone and dev machine on the same network)
   to test email/password auth and the rest of the app. The phone talks to the
   production API and data.

Google browser OAuth cannot be accepted in Expo Go because Expo Go does not own
AlgoSplit's `algosplit://` callback scheme. Install the AlgoSplit development
client for social auth:

```bash
cd app
npm install --global eas-cli
eas login
eas build --platform android --profile development
# A physical iPhone build requires Apple Developer enrollment:
eas build --platform ios --profile development
npm run start:dev-client -- -c
```

Use `--profile development-simulator` only for an iOS Simulator. Configure the
five public values above in the Expo project's `development`, `preview`, and
`production` environments before building. See [SOCIAL_AUTH_SETUP.md](SOCIAL_AUTH_SETUP.md)
for provider and callback registration.

Pointing a phone at a *local* backend does not currently work: in
non-production the backend's `TrustedHostMiddleware` (`backend/main.py`) only
accepts `localhost`/`127.0.0.1` hosts, so requests to a LAN address such as
`http://192.168.x.x:8000` are rejected with `400 Invalid host header` before
any route runs. Use the deployed API for on-device work, or extend the dev
`allowed_hosts` list locally.

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
uv lock --check --project backend
uv sync --project backend --frozen --all-groups
uv run --project backend python -c "import analysis_engine_rs"
uv run --project backend pytest backend/tests --cov=backend --cov-report=term-missing
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

The analyzer is a deterministic programming model, not a physiological digital
twin. It estimates relative stimulus across a schedule so two splits can be
compared consistently. Its output should not be read as measured hypertrophy,
muscle protein synthesis, tissue loss, or medical advice.

### Inputs and normalization

1. Python resolves each exercise name to one of 38 canonical movement patterns
   or an account-specific custom/override mapping.
2. A pattern distributes a nominal stimulus budget across 29 muscle regions in
   `prime`, `secondary`, `tertiary`, and `quaternary` tiers.
3. The resistance profile (`ascending`, `mid`, or `descending`) reweights those
   regions according to their short-, mid-, or long-length leverage classification.
   The result is normalized, so resistance profile changes *where* the pattern's
   stimulus goes without creating or destroying its total nominal budget:

   `adjusted_weight_i = weight_i * leverage_multiplier_i * sum(weight) / sum(weight * leverage_multiplier)`

   A perfect leverage/profile match uses `1.00`, an adjacent match `0.85`, and
   the strongest mismatch `0.70`.
4. Sessions named `Rest`, and sessions with no exercises, do not execute. Cycle
   lengths that do not divide seven are simulated over
   `lcm(cycle_length, 7) / 7` weeks and averaged into weekly output.

### Per-set stimulus

For every target region on every set, the kernel applies this modifier chain:

`set_stimulus = target_weight * recovery * unilateral * local_return * global_capacity * consecutive_day_capacity`

- **Recovery:** retraining a prime-targeted region in a later session before the
  configured hypertrophy window ends uses
  `clamp(hours_since_prime_training / stimulus_duration, 0, 1)`. Otherwise the
  multiplier is `1`. The public backend field remains `stimulus_duration`, with
  a validated range of 24-96 hours.
- **Unilateral:** explicitly unilateral work receives a `1.05` multiplier.
  Bilateral work receives no direct within-set penalty, but bilateral compound
  sets contribute to consecutive-day fatigue.
- **Local diminishing returns:** prime sets use the selected dataset's marginal
  return directly. Non-prime targets use
  `1 - beta * (1 - marginal_return)`, where beta is `0.55` for secondary,
  `0.35` for tertiary, and `0.15` for quaternary stimulus. After set nine, the
  last marginal value decays by `0.97` for each additional set.
- **Global capacity:** set order matters. Capacity is
  `0.85 + 0.15 * exp(-0.06 * effective_sets)`, where
  `effective_sets = session_set_number + 2.5 * accumulated_axial_fatigue`.
  A pattern contributes `axial_load * sets * 0.15` axial fatigue before its sets
  are evaluated.
- **Consecutive days:** the first training day is unpenalized. Later consecutive
  days combine a day-count term, prior axial fatigue, and prior bilateral sets:
  `max(0.25, 1 - base - axial - bilateral)`, where
  `base = min(0.40, 0.08*d*(1 - 0.06*d))`,
  `axial = min(0.30, cumulative_axial*0.12)`,
  `bilateral = min(0.15, cumulative_bilateral_sets*0.005)`, and
  `d = consecutive_days - 1`.

### Dataset curves and net stimulus

The dataset selector changes the cumulative and marginal returns assigned to
sets one through nine:

| Dataset | Cumulative values for sets 1-9 |
| --- | --- |
| `schoenfeld` | `1.00, 1.39, 1.61, 1.77, 1.90, 2.00, 2.09, 2.16, 2.23` |
| `pelland` | `1.00, 1.89, 2.50, 3.07, 3.56, 4.00, 4.40, 4.78, 5.16` |
| `average` | Element-wise arithmetic mean of the two curves |

The names identify the calibrations used by the project; they do not imply that
the application reproduces every inclusion criterion or conclusion of the
underlying literature. Marginal returns are adjacent differences in the chosen
cumulative curve.

After a region's hypertrophy window ends, the engine accrues an accounting debit:

`atrophy_rate = cumulative_curve[maintenance_volume - 1] / (168 - stimulus_duration)`

`atrophy_debit = atrophy_rate * hours_beyond_window`

`net_stimulus = accumulated_stimulus - accumulated_atrophy_debit`

Here, `maintenance_volume` is a model calibration from 1-9 and “atrophy” means
loss of modeled weekly stimulus, not a prediction of literal tissue loss.
Recovery readiness is separately reported as
`clamp(hours_since_any_stimulus / stimulus_duration, 0, 1)` at the end of the
analysis window.

### Important interpretation limits

- Split analysis is driven by exercise identity, set count, order, schedule,
  unilateral status, and resistance profile. Logged weight, reps, and RIR are
  retained for workout history and progress calculations, but they do not
  currently scale the stimulus kernel.
- Frequency counts sessions in which a region is a **prime** target. Secondary
  exposure still adds stimulus and affects readiness but does not increase that
  frequency value.
- `primary_sets`, group set totals, and the summary's total sets are region-level
  prime-set exposures. They are not necessarily the literal number of sets the
  athlete performed because one exercise can have multiple prime regions.
- `damage_tier` is recommendation metadata. `recovery_modifier` is carried in
  the region contract for future tuning. Neither currently multiplies Rust
  stimulus.
- The optimization suggestions are threshold rules over model output, not an
  individualized prescription.

The authoritative implementation is
`backend/rust/analysis_engine/src/engine.rs`; the parity reference is
`backend/core/MainClasses.py`.

## Backend Runtime Boundaries

The backend is not Rust-only. FastAPI still owns the application process and
calls Rust through a Maturin/PyO3 extension for normalized split simulation.

| Responsibility | Current implementation |
| --- | --- |
| Numeric split simulation, fatigue curves, recovery, atrophy debit, summaries | Rust (`backend/rust/analysis_engine`) when `ANALYSIS_ENGINE=rust` |
| HTTP routing, middleware, CORS, compression, security headers, error mapping | Python/FastAPI (`backend/main.py`, `backend/api`) |
| Cookie and native authentication bridge, JWT/JWKS validation, CSRF, session refresh/revocation | Python |
| Request/response validation and OpenAPI schemas | Python/Pydantic |
| Supabase Auth, PostgREST calls, RPC orchestration, pagination, and caches | Python |
| Exercise-name matching, canonical patterns, custom exercises, and user overrides | Python |
| Adapting database/request objects into normalized Rust engine input | Python (`backend/core/rust_analysis.py`) |
| Split/workout imports and workout-history transforms | Python |
| Reference engine, Rust fallback, shadow comparisons, and parity diagnostics | Python |

Authentication includes Supabase email/password signup, confirmation, login,
refresh, password recovery, logout, account deletion, Google and Apple sign-in,
and connected-identity linking. The provider exchange and identity APIs remain
Python/FastAPI work; see [the social-auth setup guide](SOCIAL_AUTH_SETUP.md).

`ANALYSIS_ENGINE=python` is the code default. Production configuration in this
repository selects `rust` with fallback disabled; `shadow` mode can retain
Python as authority while sampling Rust parity. The current local 100-iteration
heavy-split benchmark measured a Rust p95 of about 4 ms versus Python's 36 ms,
but that only measures uncached engine execution—not authentication, database,
network, or serverless startup time.

## Full Rust API Migration

If the API is migrated, **Axum** is the best fit for this codebase. It is a thin
Tokio/Hyper routing layer, uses Tower middleware, and maps naturally to the
existing Serde engine types. Actix Web is also fast, but Axum would require less
conceptual translation from FastAPI dependencies and middleware while keeping
the service modular. See the [Axum documentation](https://docs.rs/axum/latest/axum/).

This would not be a framework-name swap. The difficult work is reproducing the
95-endpoint contract, Supabase Auth behavior, rotating browser/native sessions,
CSRF and rate limiting, Pydantic validation semantics, PostgREST/RPC behavior,
OpenAPI output, and failure mapping. Supabase does not list an officially
supported Rust client, so the least disruptive first version should use `reqwest`
against Auth/PostgREST rather than changing database architecture at the same
time. Direct `sqlx` access can be considered later, with an explicit replacement
for RLS and token-scoped behavior.

A migration that avoids a flag day would be:

1. Split the current Rust package into a pure reusable engine crate plus the
   existing PyO3 wrapper.
2. Create one Axum service with shared Serde contracts, Tower security middleware,
   JWKS caching, and `reqwest` clients for Supabase Auth/PostgREST.
3. Port read-only health and compact workout routes first, then split/workout
   mutations, and authentication last.
4. Run both implementations against the same golden requests and compare status,
   headers, JSON, database effects, and security behavior before moving each route.
5. Preserve the FastAPI deployment as rollback until a full JWT lifetime and
   production traffic window pass without parity failures.

Vercel now has a first-party Rust Functions runtime, but it is currently
[documented as Beta](https://vercel.com/docs/functions/runtimes/rust). Vercel also
maps direct `api/*.rs` handlers to functions, so the deployment shape and plan's
function limits need to be tested before committing to it. A containerized Axum
service is the lower-risk production target if runtime maturity or serverless
function layout becomes friction. Either way, colocating compute with the
Supabase region will usually save more request time than replacing FastAPI's
routing overhead alone.

## Deployment Notes

Typical production layout:

```text
Expo web/native app -> FastAPI API -> Supabase Auth/Postgres
```

The production web client and FastAPI backend are separate Vercel projects from
this repository, rooted at `app/` and `backend/` respectively. See
`DEPLOYMENT.md` for the current project settings and release sequence.

Backend start command:

```bash
uv run --project backend uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT
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

# AlgoSplit Deployment Guide

AlgoSplit is deployed as two Vercel projects backed by Supabase:

```text
Expo web/native client -> FastAPI + Rust analysis -> Supabase Auth/Postgres
```

| Component | Repository root | Production URL |
| --- | --- | --- |
| Web client | `app` | `https://algo-split.vercel.app` |
| API | `backend` | `https://algosplit-api-staging.vercel.app` |

The current API alias retains `staging` in its name, but both projects track
`main` as their production branch. Custom domains can be attached later without
changing the repository layout.

## Prerequisites

- Apply the Supabase migrations in `backend/db/migrations` through migration
  `018_split_shares.sql`.
- Keep `backend/uv.lock` committed and synchronized with
  `backend/pyproject.toml`.
- Never upload either local `.env` file to GitHub. Enter production secrets in
  the backend Vercel project's Environment Variables settings.

## Backend Vercel project

Configure the project as follows:

```text
Root Directory: backend
Framework: FastAPI
Production Branch: main
```

Vercel reads `backend/vercel.json`, `backend/app.py`, `backend/.python-version`,
and `backend/uv.lock`. The uv workspace builds the PyO3 Rust analysis extension
as a required backend dependency.

Set these Production environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_JWT_SECRET=...
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWT_ISSUER=https://your-project.supabase.co/auth/v1

APP_ENV=production
FRONTEND_URL=https://algo-split.vercel.app
ALLOWED_HOSTS=algosplit-api-staging.vercel.app
TRUST_PROXY=true
RATE_LIMIT_ENABLED=true

ANALYSIS_ENGINE=rust
ANALYSIS_ENGINE_FALLBACK=false
ANALYSIS_SHADOW_SAMPLE_RATE=0

AUTH_EXPOSE_ACCESS_TOKEN=false
AUTH_COOKIE_PATH=/
AUTH_COOKIE_SAMESITE=lax
AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS=2592000
```

Do not set `AUTH_COOKIE_DOMAIN` in production. Cookies are host-only and the
production web client reaches the API through same-origin Vercel rewrites.

Set `AUTH_EXPOSE_ACCESS_TOKEN=true` before distributing a native build. Native
tokens are returned only for requests carrying the explicit native-client
header without a browser `Origin`; browser authentication remains cookie based.

After deployment, verify:

```text
GET https://algosplit-api-staging.vercel.app/health
GET https://algosplit-api-staging.vercel.app/keepalive
GET https://algosplit-api-staging.vercel.app/api/splits
```

The first two requests should return `200`. The signed-out splits request should
return a JSON `401`, proving the API route and authentication boundary are live.

## Frontend Vercel project

Configure the project as follows:

```text
Root Directory: app
Framework Preset: Other
Install Command: npm install
Build Command: npm run build:web
Output Directory: dist
Production Branch: main
```

`app/vercel.json` owns the build settings, single-page-app fallback, static asset
headers, and same-origin rewrites to the Vercel API. Do not set
`EXPO_PUBLIC_ALGOSPLIT_API` for the production web deployment; web requests use
the same-origin `/api` and `/auth` paths.

After deployment, verify the frontend's rewritten health endpoint:

```text
GET https://algo-split.vercel.app/health
```

It should return the same backend health JSON.

## Supabase Auth URLs

In Supabase Authentication URL Configuration:

1. Set the Site URL to the production frontend URL.
2. Add `https://algo-split.vercel.app/**` to Redirect URLs.
3. Add any custom production domain before moving traffic to it.
4. Remove retired frontend domains only after the rollback window closes.

In Supabase Authentication, Sessions, configure:

```text
Single session per user: disabled
Inactivity timeout: 30 days
Time-box user sessions: 180 days
JWT expiry: 3600 seconds
Refresh token rotation: enabled
Refresh token reuse interval: 10 seconds
```

The inactivity and time-box controls require a Supabase plan that supports
advanced session settings. Do not lengthen JWT expiry to achieve persistent
login; browser and native clients rotate the short-lived token instead.

## Release sequence

1. Apply the additive Supabase migrations through `018_split_shares.sql`.
2. Open a pull request from the release branch to `main`.
3. Wait for CI and both Vercel preview deployments.
4. Merge the pull request.
5. In each Vercel project, open Settings, Environments, Production, then Branch
   Tracking and select `main`.
6. Promote or redeploy the merged `main` commit in both projects.
7. Confirm both production deployments show the same Git commit.
8. Run the production smoke tests below before removing old infrastructure.

## Production smoke tests

- Load the web client and sign in from the dedicated authentication screen.
- Confirm saved splits, overview stimulus, workout templates, history, and
  progress use account data.
- Analyze and edit a split, including an empty Rest session.
- Start, save, and reopen a workout.
- Confirm split and workout mutations survive a hard reload.
- Close and reopen the browser after the access token expires and confirm the
  refresh cookie restores the account without another login.
- Confirm ordinary logout affects only the current browser/device, then confirm
  “Sign out all devices” prevents every session from refreshing.
- Test login, request retry, provider-outage, and signed-out behavior.
- Inspect backend logs for failed imports, authentication errors, analysis
  fallback, and database migration errors.

## Native iOS build

The EAS production profile uses
`https://algosplit-api-staging.vercel.app` directly. Before building:

1. Set `AUTH_EXPOSE_ACCESS_TOKEN=true` in the backend Vercel Production
   environment and redeploy it.
2. Confirm `app/app.json` contains the correct EAS project ID and iOS bundle ID.
3. Confirm a native login creates one versioned SecureStore session envelope,
   survives app termination, and rotates before expiry on foreground resume.
4. Run the app checks and TestFlight smoke test.

```bash
cd app
eas build --platform ios --profile production
eas submit --platform ios
```

Existing native binaries embed their API URL at build time. Do not retire an API
host while a distributed build still references it.

## Rollback and retirement

- Keep the release branch until the `main` deployments have been stable through
  the rollback window.
- Pause old Vercel projects before deleting them. Move custom domains first.
- Suspend an old backend before deletion and monitor for unexpected traffic.
- Delete retired projects only after web and native clients no longer reference
  them.
- Vercel deployment rollback remains available independently for the frontend
  and backend projects.

## Local release checks

```bash
uv lock --check --project backend
uv sync --project backend --frozen --all-groups
uv run --project backend python -c "import analysis_engine_rs"
uv run --project backend pytest backend/tests

cd backend/rust/analysis_engine
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test

cd ../../../app
npm test -- --runInBand
npx tsc --noEmit
npm run build:web
```

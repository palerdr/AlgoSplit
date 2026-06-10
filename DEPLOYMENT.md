# Split.AI Production Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vercel        │────▶│   Render/Fly    │────▶│   Supabase      │
│   (Frontend)    │     │   (Backend)     │     │   (Database)    │
│   React SPA     │     │   FastAPI       │     │   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 1. Supabase (Database) - Already Configured

Your Supabase project should already be set up with:
- Tables: users, splits, sessions, exercises, workout_logs, workout_exercises, exercise_overrides
- Row-Level Security (RLS) policies
- Authentication enabled

**Environment Variables Needed:**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_JWT_SECRET=your-jwt-secret
```

---

## 2. Backend Deployment (Render.com - Recommended)

### Option A: Render.com (Easiest)

1. **Create a Render Account** at https://render.com

2. **Connect GitHub Repository**
   - Go to Dashboard → New → Web Service
   - Connect your GitHub repo
   - Select the repository

3. **Configure Service**
   ```
   Name: split-ai-api
   Region: Oregon (US West) or closest to users
   Branch: main
   Root Directory: backend
   Runtime: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

4. **Add Environment Variables**
   In Render dashboard → Environment:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGci...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   SUPABASE_JWT_SECRET=your-jwt-secret
   ```

5. **Deploy**
   - Click "Create Web Service"
   - Wait for build to complete
   - Note the URL: `https://split-ai-api.onrender.com`

### Option B: Fly.io (More Control)

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create fly.toml in backend/**
   ```toml
   app = "split-ai-api"
   primary_region = "sjc"

   [build]
     builder = "paketobuildpacks/builder:base"

   [env]
     PORT = "8080"

   [http_service]
     internal_port = 8080
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0

   [[vm]]
     cpu_kind = "shared"
     cpus = 1
     memory_mb = 256
   ```

3. **Deploy**
   ```bash
   cd backend
   fly launch
   fly secrets set SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx ...
   fly deploy
   ```

### Option C: Railway.app

1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Select repo, set root directory to `backend`
4. Add environment variables
5. Deploy

---

## 3. Frontend Deployment (Vercel)

### Step-by-Step Vercel Deployment

1. **Install Vercel CLI** (optional but helpful)
   ```bash
   npm i -g vercel
   ```

2. **Create Vercel Account**
   - Go to https://vercel.com
   - Sign up with GitHub

3. **Import Project**
   - Click "Add New Project"
   - Import your GitHub repository
   - Configure:
     ```
     Framework Preset: Vite
     Root Directory: frontend
     Build Command: npm run build
     Output Directory: dist
     Install Command: npm install
     ```

4. **Add Environment Variables**
   In Vercel dashboard → Settings → Environment Variables:
   ```
   VITE_API_URL=https://split-ai-api.onrender.com
   ```
   (Use your actual backend URL from step 2)

5. **Deploy**
   - Click "Deploy"
   - Wait for build
   - Your app is live at: `https://split-ai.vercel.app`

### Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your domain: `split.ai` or `app.split.ai`
3. Add DNS records as instructed:
   ```
   Type: CNAME
   Name: app (or @)
   Value: cname.vercel-dns.com
   ```

### vercel.json (Already Created)
The `frontend/vercel.json` handles SPA routing so all routes redirect to index.html.

---

## 4. CORS Configuration

Update your backend `main.py` to allow your Vercel domain:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://split-ai.vercel.app",      # Your Vercel URL
        "https://your-custom-domain.com",   # Custom domain if any
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 5. Environment Variables Summary

### Backend (Render/Fly/Railway)
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_JWT_SECRET=your-jwt-secret
```

### Frontend (Vercel)
```env
VITE_API_URL=https://split-ai-api.onrender.com
```

---

## 6. Post-Deployment Checklist

- [ ] Backend health check: `curl https://your-api.com/health`
- [ ] Frontend loads at Vercel URL
- [ ] Sign up works
- [ ] Login works
- [ ] Create a split
- [ ] Analyze split (29-region analysis)
- [ ] Log a workout
- [ ] Check workout history

---

## 7. CI/CD (Automatic Deployments)

Both Vercel and Render automatically deploy when you push to main:

```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

Vercel and Render will automatically:
1. Detect the push
2. Build the project
3. Deploy to production

---

## 8. Monitoring & Logs

### Vercel
- Dashboard → Project → Deployments → View Logs
- Real-time function logs available

### Render
- Dashboard → Service → Logs
- Metrics available for requests, CPU, memory

### Supabase
- Dashboard → Database → Logs
- API logs and database queries visible

---

## 9. Cost Estimates (Free Tiers)

| Service | Free Tier |
|---------|-----------|
| Vercel | 100GB bandwidth, unlimited deploys |
| Render | 750 hours/month (sleeps after 15min inactive) |
| Supabase | 500MB database, 50k monthly active users |
| Fly.io | 3 shared VMs, 160GB bandwidth |

**Total for MVP: $0/month** using free tiers

### Paid Upgrades (When Needed)
- Render Pro: $7/month (no sleep, more resources)
- Vercel Pro: $20/month (more bandwidth, analytics)
- Supabase Pro: $25/month (more storage, no pause)

---

## 10. iOS App Store Submission

The mobile app is configured for submission; the items below are the
human-only steps that must be done before / during submission.

### Pre-build (required)

1. **EAS project ID** — replace the placeholder in `app/app.json` →
   `expo.extra.eas.projectId`. Run `eas init` from `app/` to mint one.

2. **App Store Connect record** — create the app with bundle ID
   `com.algosplit.app` (matches `app/app.json` → `ios.bundleIdentifier`).

3. **Privacy policy URL** — Apple requires a hosted privacy policy. Paste
   it into App Store Connect → App Privacy and link to it from the in-app
   Settings screen.

4. **Support URL** — required by App Store Connect; a landing page or
   GitHub Issues link is fine for v1.

### App Privacy form (App Store Connect)

The privacy manifest in `app/app.json` already declares this. Mirror it:

| Data type | Linked | Tracking | Purpose |
|---|---|---|---|
| Email Address | Yes | No | App Functionality |
| Other User Content (workout data) | Yes | No | App Functionality |
| Fitness | Yes | No | App Functionality |

Answer "No" to the Tracking question — there are no tracking SDKs and
the manifest reflects that.

### Already handled in code

- **Export compliance**: `app.json` → `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`
- **Required Reason APIs**: declared in `ios.privacyManifests.NSPrivacyAccessedAPITypes`
  (UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1`, DiskSpace `E174.1`)
- **Account deletion** (Apple requires since June 2022): `app/app/(tabs)/settings.tsx`
- **Token storage in iOS Keychain**: `app/src/api/client.ts` via `expo-secure-store`
- **HTTPS-only API**: `app/src/api/client.ts` (localhost only in dev)
- **No service-role keys in the client bundle**

### Build & submit

```bash
cd app
eas build --platform ios --profile production
eas submit --platform ios
```

### Smoke-test before submitting

- [ ] Sign up → log in → log out → log back in
- [ ] Create a split, log a workout, view analysis
- [ ] Import a spreadsheet (DocumentPicker flow)
- [ ] Delete account — confirm full data removal
- [ ] Pull-to-refresh on dashboard while on cellular (ATS check)
- [ ] Background the app for >30s, return — auth survives via Keychain

---

## 11. Troubleshooting

### "CORS Error"
- Check backend CORS origins include your Vercel URL
- Ensure trailing slashes match

### "401 Unauthorized"
- Check SUPABASE_JWT_SECRET matches between Supabase and backend
- Verify token is being sent in Authorization header

### "502 Bad Gateway" on Render
- Check build logs for errors
- Ensure start command is correct
- Verify environment variables are set

### Frontend shows blank page
- Check browser console for errors
- Verify VITE_API_URL is set correctly
- Check network tab for failed API requests

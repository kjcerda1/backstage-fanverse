# Backstage V16 — Deployment Guide
**Version:** 1.6.0 | **Target:** Vercel (frontend-only, prototype mode)

---

## What gets deployed

A fully functional React SPA. All features work in **mock/localStorage mode** with
no backend required. Real Supabase auth and AI features are opt-in via environment
variables added later.

---

## Prerequisites

- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)
- Vercel CLI: `npm install -g vercel`
- A [Vercel account](https://vercel.com) (free tier is fine)

---

## Step 1 — Install dependencies

```bash
cd 02_BACKSTAGE_V16
npm install
```

---

## Step 2 — Test the production build locally

```bash
npm run build
npm run preview
```

Open `http://localhost:4173` — this is the exact production bundle. Verify it
looks correct, the onboarding tour works, and mock mode is stable before pushing.

**LAN access for real-device testing (same WiFi):**
```bash
npm run preview -- --host
```
Open the IP shown (e.g. `http://192.168.x.x:4173`) on your phone.

---

## Step 3 — Deploy to Vercel

### Option A — Vercel CLI (recommended for first deploy)

```bash
# Login (one-time)
vercel login

# Deploy to preview URL
vercel

# Deploy to production URL
vercel --prod
```

During the first `vercel` run you'll be asked:
- **Set up and deploy?** → Y
- **Which scope?** → your account
- **Link to existing project?** → N
- **Project name?** → `backstage-app` (or your choice)
- **In which directory is your code?** → `.` (current)
- **Want to override settings?** → N (vercel.json handles this)

### Option B — GitHub integration (automatic deploys)

1. Push repo to GitHub (create `.gitignore` first — already done)
2. Go to vercel.com → New Project → Import your GitHub repo
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Click Deploy

Every push to `main` will auto-deploy.

---

## Step 4 — Add environment variables (optional)

On Vercel Dashboard → your project → Settings → Environment Variables:

| Variable | Required for | Example |
|---|---|---|
| `VITE_APP_ENV` | App mode display | `production` |
| `VITE_APP_VERSION` | Version badge | `1.6.0` |
| `VITE_API_URL` | Real backend proxy | `https://api.backstageapp.co` |
| `VITE_SUPABASE_URL` | Real auth | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Real auth | `eyJhbG...` |
| `VITE_MAPBOX_TOKEN` | Geographic map | `pk.eyJ1...` |

> **Leave all blank for prototype/user testing.** The app runs fully in mock mode.

---

## Step 5 — Share with testers

After `vercel --prod`, you get a URL like:
```
https://backstage-app.vercel.app
```

Share this with testers. It's PWA-installable on mobile:
- iOS Safari: Share → Add to Home Screen
- Android Chrome: three dots → Add to Home Screen

---

## Useful Vercel commands

```bash
vercel ls                    # List all deployments
vercel --prod                # Deploy to production
vercel env pull .env.local   # Pull env vars to local (if set in Vercel)
vercel logs [deployment-url] # View server logs
vercel rollback              # Roll back to previous deployment
```

---

## Known risks before public testing

| Risk | Severity | Notes |
|---|---|---|
| All data is localStorage | Medium | Data lost if user clears browser/switches device. Acceptable for user testing. |
| Image uploads are text-only | Low | Concert Capsule + Passes show gradient placeholders, not real photos. |
| ~~Fanverse Map is an SVG stub~~ | — | **Outdated as of 2026-06.** Real Mapbox GL integration now ships in `src/MapboxMap.jsx`. City-level only, no exact GPS. |
| ~~No real push notifications~~ | — | **Outdated as of 2026-06.** Real FCM `getToken()` + `public/firebase-messaging-sw.js` now ship. Needs a live smoke test with real Firebase credentials, but the code path is real, not mocked. |
| Bundle is 766KB (181KB gzipped) | Low | Larger than ideal. Fine for prototype. Acceptable TTI on modern phones. |
| No rate limiting on feedback email | Low | mailto: link — can't be abused server-side. |
| Supabase CDN import is dynamic | Low | Line 54 dynamically imports Supabase from CDN. Only loads if env vars present. |

---

## After user testing — next steps

1. Connect Supabase (auth + database)
2. Deploy `api_server_v16.js` to Railway/Render/Fly.io (separate Node service)
3. Set `VITE_API_URL` to the backend URL
4. Add Mapbox integration (flagged in code — search `TODO: MAPBOX`)
5. Enable real image uploads via Supabase Storage
6. Wire up push notifications via backend

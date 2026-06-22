# Backstage Fanverse — Project Overview

*Reference doc for Claude Project knowledge. Describes the durable architecture — things that rarely change. For "what's built / what's left," see `CURRENT_STATE.md` instead, which is the doc that needs re-uploading most often.*

**Last generated:** 2026-06-22, against `main` @ `360fe2b`.

---

## 1. What this app is

**Backstage by Fanverse** — "One Universe. Endless Connections." A social PWA for K-pop fans: concert discovery, fan-to-fan social (Circle/DM), photocard collecting + trading, fandom identity/profile customization ("My Stage"), shared concert memories ("Concert Capsule"), and AI-assisted fan tools (outfits, itineraries, chants). VIP subscription tier via Stripe.

Tagline in `manifest.json`: *"One Universe. Endless Connections. The ultimate app for K-Pop fans."*

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 6, single-page client-rendered app, no router library (custom `go()`/modal-stack navigation) |
| Backend | Express 5 (`api_server_v16.js`), single file, ~5,000 lines, 110+ REST routes |
| Database / Auth | Supabase (Postgres + Auth). App runs in **MOCK_MODE** automatically when `SUPABASE_URL` is unset — no separate dev/prod code paths to maintain |
| Payments | Stripe (web Checkout + webhooks). VIP tiers: monthly / annual / founder |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) — outfit suggestions, itinerary builder, chant helper, fan-day planner, general assistant |
| Push notifications | Firebase Cloud Messaging (FCM), HTTP v1 API via `firebase-admin` on the backend, real `getToken()` + dedicated service worker on the frontend |
| Maps | Mapbox GL JS (`MapboxMap.jsx`, ~660 lines) for the Fanverse Map; city-level aggregation only, no exact GPS |
| Music | Spotify OAuth + Apple Music (MusicKit) routes for "Now Playing" |
| GIFs/Stickers | Tenor/Giphy provider (`GIF_PROVIDER` env-switchable) |
| Email | Resend (transactional/backup notification delivery) |
| Hosting (current docs assume) | Frontend → Vercel; backend → Render (or similar Node host) |
| Future packaging | Capacitor wrap planned for iOS/Android app stores (not started) |

## 3. Repo structure

```
src/
  App.jsx          ← THE app. ~24,000 lines, ~150 components, all UI screens/pages/modals.
  MapboxMap.jsx     ← Fanverse Map (Mapbox GL integration), ~660 lines.
  main.jsx          ← React root mount, 8 lines.
api_server_v16.js   ← Express backend, ~5,000 lines, 110+ routes, all integrations.
public/
  manifest.json, firebase-messaging-sw.js, logo/icon assets
*.sql                ← Hand-written Supabase migrations (NOT exhaustive — see §5)
.env.example         ← Documents some but not all env vars actually read by the backend (see §6)
vercel.json          ← SPA rewrite + security headers for frontend hosting
vite.config.js       ← Standard Vite/React config, esnext target
PROJECT_OVERVIEW.md  ← this file
CURRENT_STATE.md     ← living feature/status inventory, update every session
APP_STORE_READINESS.md ← iOS/Android/PWA store submission checklist
DEPLOYMENT.md        ← Vercel deploy steps (frontend-only quick-start)
```

**There is no `components/` directory and no client router.** `App.jsx` is a monolith: every screen is a top-level function component, and navigation is done through local state (`go()`, `modal` stack, tab state) inside `AppInner()` near the bottom of the file. This is a known scale risk (see `CURRENT_STATE.md` → Known Issues) but is the actual current architecture — don't assume a typical multi-file React app structure when reasoning about where to add code.

## 4. Backend operating model — feature flags, not environments

`api_server_v16.js` does not have separate "dev" and "prod" code. Instead it checks which env vars are present at boot and flips capability flags:

```
MOCK_MODE        = !SUPABASE_URL          → no DB, in-memory/mock responses
HAS_STRIPE       = !!STRIPE_SECRET_KEY
HAS_AI           = !!ANTHROPIC_API_KEY
HAS_FIREBASE     = !!FIREBASE_PROJECT_ID (or FIREBASE_SERVICE_ACCOUNT_JSON)
HAS_SPOTIFY      = !!SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET
HAS_MAPBOX       = !!MAPBOX_ACCESS_TOKEN
HAS_TICKETMASTER = !!TICKETMASTER_API_KEY
HAS_EMAIL        = !!RESEND_API_KEY
```

This means **the app is always runnable with zero secrets** (full mock mode), and each integration switches on independently as its credentials are added. When debugging "why doesn't X work," check which flag gates it before assuming a code bug.

## 5. Data model — what's actually schema'd

Committed migration files cover only a subset of tables:

| File | Tables |
|---|---|
| `supabase-friend-requests-migration.sql` | `friend_requests`, `friends`, `notifications` |
| `supabase-capsule-entries-migration.sql` | `capsule_entries` |
| `supabase-social-referrals-messages-migration.sql` | `referral_codes`, `referrals`, `user_rewards`, `message_threads`, `message_thread_members`, `messages` |
| `supabase-messages-gif-migration.sql` / `supabase-notifications-gif-migration.sql` | `gif` column additions to messages/notifications |
| `supabase-storage-migration.sql` | Supabase Storage buckets/policies |

**Tables referenced heavily by the API but with no migration file in this repo:** `users`, `cards`, `binders`, `trade_listings`, `listing_offers`, `card_templates`, `moderation_reports`, `user_blocks`. These were almost certainly created directly in the Supabase SQL editor/dashboard rather than checked in. The `moderation_reports`/`user_blocks` schema is documented inline in `APP_STORE_READINESS.md` §6 — treat that as the source of truth until someone exports the real schema. **If you need the full live schema, pull it from Supabase directly (`list_tables` / `execute_sql`) rather than trusting the repo's `.sql` files to be complete.**

## 6. Environment variables — full inventory

`.env.example` documents the frontend-facing and headline backend vars, but the backend code reads more than it lists. Full set actually consumed by `api_server_v16.js`:

```
PORT, MOCK_MODE
SUPABASE_URL, SUPABASE_SERVICE_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, STRIPE_PRICE_FOUNDER
ANTHROPIC_API_KEY
FIREBASE_SERVICE_ACCOUNT_JSON  (or) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY, APPLE_MUSIC_DEVELOPER_TOKEN
MAPBOX_ACCESS_TOKEN
TICKETMASTER_API_KEY, SYNC_ADMIN_SECRET
RESEND_API_KEY, EMAIL_FROM
GIF_PROVIDER, TENOR_API_KEY, GIPHY_API_KEY
PINTEREST_ACCESS_TOKEN
ADMIN_EMAILS              (gates the moderation admin queue)
FRONTEND_URL, BACKEND_URL, RENDER_EXTERNAL_URL
RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS, AI_RATE_LIMIT_MAX
NODE_ENV
```

Frontend (`VITE_`-prefixed, safe to bundle): `VITE_APP_ENV`, `VITE_APP_VERSION`, `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPBOX_TOKEN`, `VITE_FIREBASE_*` (6 keys) + `VITE_FIREBASE_VAPID_KEY`.

**Rule that's been enforced consistently across the codebase's history:** real `.env` is gitignored; secrets never get a `VITE_` prefix; Firebase private key/service account only ever lives server-side.

## 7. Conventions worth knowing before editing

- **Routing pattern in the backend:** Express routes that take a path param (`/api/capsule/:concertId/entries`, `/api/trader-stats/:userId`, etc.) must be registered **before** the catch-all 404 handler or they become unreachable — this has caused at least 3 separate bugfix commits (`e13e672`, `436b152`, `22e9897`-adjacent). When adding a new parameterized route, register it near the other specific routes, not at the bottom of the file.
- **Status labeling convention:** anything using sample/seed data in the UI is labeled `PREVIEW` in-product (chips, badges) rather than presented as live data. Keep this convention — it's a deliberate trust/honesty decision, not an oversight, documented across `CURRENT_STATE.md`.
- **VIP gating pattern:** `VipGate` wraps premium UI; `isVip` + `onUpgrade` are threaded as props through most page components rather than read from context.
- **Auth:** `requireAuth` / `optionalAuth` / `requireAdmin` (admin = email in `ADMIN_EMAILS`) middleware on the backend; `AuthProvider` context on the frontend with explicit `TOKEN_REFRESH_FAILED` handling and `clearAuthStorage()` for forced logout cleanup.
- **Component scale:** single-file monolith means duplicate small UI primitives (`Pill`, `Btn`, `Input`, `Card`, etc.) are defined once near the top of `App.jsx` and reused — don't recreate them.

## 8. How to run locally

```bash
npm install
npm run dev        # Vite dev server, port 5173, full mock mode if no .env
npm run build       # production bundle → dist/
npm run preview     # serve the production bundle, port 4173
npm start            # node api_server_v16.js (backend, port 3001 default)
```

No `.env` is required to run and click through the entire app — that's an explicit design goal (see `DEPLOYMENT.md`).

## 9. Where to look next

- For **current feature status** (shipped / mock / not built / known bugs / next priorities): `CURRENT_STATE.md`.
- For **store-submission compliance** (iOS/Android/PWA checklists): `APP_STORE_READINESS.md`.
- For **deploy mechanics**: `DEPLOYMENT.md`.

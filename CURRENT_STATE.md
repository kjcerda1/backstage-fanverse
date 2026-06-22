# Backstage Fanverse — Current State

*This is the doc to re-upload to the Claude Project most often — it reflects the actual shipped state of the app, not a single session's diff. For stable architecture background, see `PROJECT_OVERVIEW.md` instead.*

**Snapshot date:** 2026-06-22
**Branch:** `main` @ `360fe2b` (also mirrored on `claude/backstage-project-handover-249n56`)
**Version:** `package.json` → `1.6.0`
**Build:** Vite production build (last verified clean per `NEXT_PHASE_HANDOFF.md` history; re-run `npm run build` to confirm before trusting this on a stale clone)

> **Why this doc exists:** prior handoff docs in this repo (`NEXT_PHASE_HANDOFF.md`) were written as single-session diffs, not cumulative inventories. Re-uploading only the latest one to a Claude Project causes the project's knowledge to drift backward to whatever session last got written up, even though dozens of earlier commits already shipped real features. This doc is a full survey of the live codebase (component list + API routes + migrations + commit history), not just "since last time."

---

## 1. Product surfaces — shipped and real

Status legend: **Real** = wired to live backend/DB (works fully once env vars are set, degrades to mock gracefully when not). **Built/Local** = fully functional UI, persists via localStorage rather than Supabase. **Preview** = intentionally-labeled sample data, not meant to look live.

### Auth & onboarding
- Supabase auth via `AuthProvider`, with `TOKEN_REFRESH_FAILED` handling, `clearAuthStorage()`, StrictMode-safe boundary placement.
- Reserved-username + impersonation-pattern blocking, enforced both onboarding (frontend) and `PATCH`/`POST` (backend).
- Resumable onboarding (returning users with incomplete profiles resume where they left off).

### Home
- `HomeHero`, `HomeIdentity`, `HomeLiveStats`, `HomeQuickActions`, `HomeSocialFeed`, `HomeShelfPreview`, `HomeFanversePreview`, `HomeNextSteps`, `HomeOutfitShop`, `HomeAfterglow`, `HomeFounderCard`, `HomeFeed`, `ViralTicker`, `InstallPromptCard` (PWA install prompt), `NotificationBell`.
- Header order: Search | Messages (DM badge) | Backstage Buzz (notif badge). No duplicate avatar bubble.

### Concerts & events
- `ConcertsPage` merges hand-curated confirmed shows (`MOCK_CONCERTS`, e.g. Vegas BTS WORLD TOUR 'ARIRANG' — Allegiant Stadium, CONFIRMED chip) with **live Ticketmaster results** (`apiConcerts`, fetched from `GET /api/events`) — **Real**, not just a stub anymore. Sample/placeholder cards still say "View Sample →" instead of "I'm Going" to keep the trust labeling honest.
- `ShowDetail`, `ConcertDayMode`, `ConcertDayBanner`/`ConcertDayBannerActive`, `EventDiscovery`, `VenueCrowdTips`, `EventTimeline`, `TicketWallet`, `AiItinerary` (Anthropic-backed).
- Concert days computed dynamically via `computeDaysLeft()` — past dates show TBD, nothing hardcoded.

### Concert Capsule (shared fan memories)
- `ConcertCapsule`, `CapsuleLandingPage`. **Upgraded to real backend persistence**: `GET`/`POST /api/capsule/:concertId/entries` (added this phase; route-ordering bug that made it unreachable was fixed in a follow-up commit). This was mock-only as of the last handoff doc — it is not anymore.

### Photocards, collection & trading
- `LibraryTab`, `PhotocardGrid`, `PhotocardSetsView` (set-based catalog browser), `CollectTab`, `InventoryTab`.
- Binders: `BinderCreate`, `CustomBinderForm`, `AddCardForm`, `BinderDetail` — **Real**, backed by `/api/binders`, `/api/cards`, `/api/card-templates`, `/api/binders/from-template`.
- Trading: `TradeHub`, `TradeListingForm`/`TradeListingDetail`, `MakeOfferForm`, `OfferThread`, `TradePassportCard`, `ValueTracker`, trader stats route. Backed by `/api/trade-listings`, `/api/listing-offers`, `/api/trade-reviews`.
- Wired to real `user_cards`/collection data — "7 mock/broken gaps" fixed (Photocards overview stat, Top5 crash, bias catalog/search).

### My World (collection hub) & Era Boards
- Museum-grid layout with custom tiles and an Era Board hero; `ERA_MEMBERS` catalog expanded to **17 groups**.
- `EraRoom`, `EraBoard`, Member Binders — Era Boards are now bridged to the real binder data (not a separate mock layer), with reactive tile counts and live timestamps.
- Dead tiles wired up, VIP wishlist fixed, duplicate empty states removed.

### Scrapbook
- `ScrapbookTab`, `ScrapbookDetail`, Add Card sheet, stable collaborator join codes for shared scrapbooks. Backed by `/api/scrapbooks/memories`, `/api/scrapbooks/memory`.

### My Stage / fan identity / profile customization
- `ProfileStudio`, `SkinThemeTab` (Stage Worlds, Stage Deco, background upload), `IdentityCard`, `FounderBadge`/`FounderPrestigeCard` (founder number is now **DB-backed**, not derived client-side), `PublicProfilePreview`/`PublicProfileFull`, `PublicFanPassport`.
- Public Stage view has real social actions (message, view profile) wired from the Fanverse discovery flow; owner view has a cleaned-up banner with status editing moved out of the hero.

### Backstage Passes
- `BackstagePasses` — shipped. (This was originally scoped in `5-18.txt` as a "what should we call Instagram Instants for fandom" brainstorm; it shipped as **Backstage Passes** — quick disappearing POV moments — Fit Check / Merch Line / Seat View / Freebies / Lightstick Ocean / Soundcheck POV / Afterglow / Food Run / Pull Reveal.)

### Fanverse (social discovery) & Map
- `FanverseTab`, `FanverseMap` — **real Mapbox GL integration** (`MapboxMap.jsx`, ~660 lines), not an SVG stub. Privacy-first: city-level aggregation only, no exact GPS, no individual user pins (confirmed in both code and `APP_STORE_READINESS.md`).
- `FanverseHeatMap`, `FanverseLeaders`, `FanversePulse`, `FanDiscoverySection`, `FansVibeStrip`, `CityHubDetail`. Backed by `GET /api/users/discover`, `GET /api/hubs/cities`, `GET /api/map/activity`.
- Fanverse Feed: renamed from "Fan Feed," "+ Moment" instead of "+ Post," filters (Fit Check / Trade / Freebies / Capsule Moment / Meetup / Afterglow / Comeback Buzz), Faniversaries widget, story rail = personal/social bubbles (not duplicate pass categories).
- Artist/Fandom Directory: 100+ artists, dynamic watchlist, Eras Explorer discovery surface.

### Social: Circle, Messages, GIFs/Stickers, Reactions
- `FriendsPage`/`MyCircleSection` (My Circle), real friend-request flow (`friend_requests`, `friends` tables), "Find Fans" search, Requests badge.
- `DirectMessages` — Circle-gated DM threads, `message_threads`/`messages` tables, `Backstage Kit` attachment tray (replaced paperclip, 6 options), Charms (premium glassy reaction items sent as messages).
- **GIF/sticker system** (most recently active area — 5 commits this phase): `GifPicker` with GIFs|Stickers mode toggle, fandom-curated default queries + mood chips per chip with a fallback query chain, sticker DM bubble rendering, full DM persistence (`gif` column added to messages/notifications, fixed a response-shape bug on thread open).
- Direct-message reactions: tap any message → emoji picker → reaction pill attached (Instagram/iMessage-style).
- `QRPage` (QR-based add-friend), `ChatHub`/`ChatRoom`.
- Backstage Buzz (renamed from Notifications): `NotificationCenter`/`StandaloneNotifCenter`, "Updates" tab, all notification types deep-link to the correct modal/tab via a route map, bell badge polls unread count reactively.

### Trust & safety
- `ReportSheet`, `SafetyCenter`, `ModerationReportCard`, `ModerationQueue` (admin) — **Real**: `moderation_reports` + `user_blocks` tables with RLS (own-row insert/select/delete policies), admin queue gated by `ADMIN_EMAILS`, block/unblock synced frontend + backend.
- All mock/sample activity explicitly labeled `PREVIEW`, never presented as live.

### Monetization (VIP)
- `VipGate`, `UpgradeModal`, `VipCelebrationScreen`, `VipTutorialModal`. Stripe Checkout (web) + webhook handling for `invoice.paid`/`invoice.failed`/`checkout.session.completed`, `is_vip`/`vip_source` written to Supabase, comp-VIP admin grant path. **Web-only** — no native IAP yet (intentional; see `APP_STORE_READINESS.md` §4, required before any native wrap).

### AI features (Anthropic-backed, rate-limited via `aiLimiter`)
- `AIAssistant`, `ContentGenerator`, `OutfitGenerator`/`OutfitTryOn`, `ChantVault` (chant-helper), `BuildMyDay` (fan-day planner), `AiItinerary`, `TripPlanner`. Routes: `/api/ai/outfit`, `/api/ai/chant-helper`, `/api/ai/trip-planner`, `/api/ai/fan-day`, `/api/ai/assistant`, `/api/ai/itinerary`.
- Itinerary generation is currently auto-generated without asking the user for preferences first — flagged as a product gap below, not a bug.

### Push notifications (FCM)
- **This is further along than the last handoff doc claims.** `public/firebase-messaging-sw.js` exists and is real: receives Firebase config via `postMessage` from the main thread (avoids hardcoding env vars in the SW), handles `onBackgroundMessage`, shows notifications, and deep-links on click via a `NOTIF_CLICK` postMessage back to the app.
- Frontend `requestNotificationPermission()` calls the real `getToken({ vapidKey, serviceWorkerRegistration })` from `firebase/messaging` — not a mock token.
- Backend has Firebase Admin SDK initialized (HTTP v1, via service account or discrete `FIREBASE_*` vars) and `/api/send-notification`.
- **What's not verified:** an actual end-to-end push test with a populated `.env` (real `VITE_FIREBASE_*` + service account). Treat as "code complete, needs a live smoke test," not "needs to be built."

### Music
- `MusicConnect`, `NowPlayingCard`. Spotify OAuth connect/callback routes and Apple Music (MusicKit/developer token) routes exist with real logic, gated by `HAS_SPOTIFY` flag. Needs live credentials + a manual test pass to confirm the OAuth round-trip works end-to-end — code is present, not confirmed working live.

---

## 2. Intentionally mock/preview (by design, not oversight)

| Area | Status |
|---|---|
| Fanverse activity counts, city/hub fan counts | `PREVIEW` labeled |
| Concert attendee counts on sample cards | Sample stats, labeled |
| Fanverse story rail user bubbles | Mock fan accounts (armyjoon, vegasarmy, etc.) |
| Backstage Buzz notification examples | `MOCK_NOTIF_EXAMPLES` |
| HomeHero carousel | Sample concert promotions |
| Trade matches (some) | Mock data mixed with real listings |

---

## 3. Not built yet / explicitly deferred

| Feature | Status |
|---|---|
| Nightly Ticketmaster sync job | Manual `sync-ticketmaster` admin route exists (`SYNC_ADMIN_SECRET`-gated); no scheduled job |
| Supabase real-time DMs | Threads/messages persist to Supabase now, but delivery is poll-based, not realtime subscriptions |
| **Backstage Spot** | Backlog only — concert-day venue-zone gathering hub (check in by Gate 4 / merch line / food court, activity tags, no precise GPS) |
| **Ult Ladder** | Backlog only — K-pop "who would you rather" elimination game, shareable to Fanverse Feed, group voting in DMs |
| **VIP Venue Heatmap** | **DO NOT BUILD YET** per explicit prior product decision — concert-day crowd intelligence layered on fan reports, needs an honesty/positioning pass before any UI exists. Spec'd in `NEXT_PHASE_HANDOFF.md` §8 if resurrected. |
| Formal My World collection schema | Group → Era → Album → Album Version → Photocard Set → Photocard relational schema doesn't exist; current implementation bridges Era Boards to binders informally via the `ERA_MEMBERS` constant, not a normalized DB schema |
| Event detail pages | Meetup/after-party detail pages still flat RSVP cards — no location/organizer/capacity/age/cost/safety-notes/share/report detail view |
| RSVP propagation | RSVP state is local-only; doesn't propagate across Meetups tab / Show Detail / Home "You're going" |
| AI itinerary preferences | Auto-generates without asking arrival time/transport/budget/vibe/food/solo-or-group first |
| Capacitor / native wrap | Not started. Native IAP (StoreKit 2 / Google Play Billing) required before any native submission — see `APP_STORE_READINESS.md` |

---

## 4. Known issues to revisit

| Issue | Notes |
|---|---|
| `App.jsx` is a 24,000-line, ~150-component monolith | No router, no `components/` split. Works, but any cross-cutting refactor (routing library, code-splitting, lazy loading) is a real undertaking, not a quick win. Bundle size should be re-measured (`npm run build`) before assuming it's still in the few-hundred-KB range from earlier docs. |
| Express route-order footguns | Parameterized routes registered after the 404 catch-all become silently unreachable — has bitten capsule routes, trader-stats route, and at least one other in this codebase's history. Audit new routes against this before shipping. |
| Core DB schema not version-controlled | `users`, `cards`, `binders`, `trade_listings`, `listing_offers`, `card_templates`, `moderation_reports`, `user_blocks` have no migration file in-repo — likely created ad hoc in the Supabase dashboard. Risk: no reproducible schema if the Supabase project is ever recreated. Worth exporting a full schema dump into the repo. |
| BTS ARIRANG show detail page | Low-contrast text on dark purple background; some sections empty; Meetups & Events header with no populated cards; VIP itinerary card visually disconnected from the rest of the page. |
| `.env.example` is incomplete | Doesn't list `STRIPE_PRICE_*`, `RESEND_API_KEY`/`EMAIL_FROM`, `GIF_PROVIDER`/`TENOR_API_KEY`/`GIPHY_API_KEY`, `PINTEREST_ACCESS_TOKEN`, `APPLE_MUSIC_*`, `ADMIN_EMAILS`, `SYNC_ADMIN_SECRET` — all of which the backend actually reads. See `PROJECT_OVERVIEW.md` §6 for the full list. |

---

## 5. Recommended next priorities

Given FCM push and Ticketmaster's basic merge are further along than previously documented, the priority order shifts from "build" to "verify and harden":

1. **Live smoke-test push notifications** end-to-end with real Firebase credentials — code looks complete but is unverified live.
2. **Verify Spotify/Apple Music OAuth round-trip** with real credentials.
3. **Export and commit the real Supabase schema** (or at least the tables with no migration file) so the repo isn't the weakest link in disaster recovery.
4. **Event/RSVP detail pages** + cross-surface RSVP propagation (Meetups tab, Show Detail, Home).
5. **AI itinerary preference step** before generation.
6. **Nightly Ticketmaster sync** (currently manual-trigger only).
7. **Formal My World collection schema** if the product wants binders/eras to be a first-class relational model instead of a constants-bridge.
8. Backlog when there's appetite: Backstage Spot, Ult Ladder. Venue Heatmap stays parked pending an explicit go-ahead on positioning.

---

## 6. Source material for this doc

Built from: full `git log` (50 commits on `main`), the full component inventory in `src/App.jsx` (~150 top-level functions), the full route inventory in `api_server_v16.js` (110+ `app.get/post/patch/delete/put` calls), all `.sql` migration files, `.env.example` vs. actual `process.env.*` reads, `public/firebase-messaging-sw.js`, and cross-checking claims in the pre-existing `NEXT_PHASE_HANDOFF.md`, `APP_STORE_READINESS.md`, and `DEPLOYMENT.md` against the current code (several were stale — e.g. push notifications and the Fanverse Map were both further along than those docs claimed).

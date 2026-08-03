# Backstage Fanverse — Current State

*This is the doc to re-upload to the Claude Project most often — it reflects the actual shipped state of the app, not a single session's diff. For stable architecture background, see `PROJECT_OVERVIEW.md` instead.*

**Snapshot date:** 2026-07-23 (partial refresh 2026-08-02 — see note below; full regen still pending)
**Branch:** `main` @ `ac0c08d`

> **⚠️ 2026-08-02 partial refresh:** `main` has since advanced to `5db8fb2` (2026-08-01
> DM Phase 2 merge). The rest of this snapshot below is still as of `ac0c08d` /
> 2026-07-23 and has **not** been fully regenerated — only the "Social: Circle,
> Messages..." and "Scrapbook" bullets in §1 were corrected to match current
> production. Treat every other section as possibly one merge behind until a full
> regen happens. See `docs/FOUNDER_LAUNCH_READINESS_2026-08-02.md` for what was
> verified live on 2026-08-02.
>
> **⚠️ 2026-08-02 launch-blocker fixes (branch `fix/launch-blockers-signup-account-isolation`):**
> a live user-POV audit (`docs/USER_POV_PRODUCT_AUDIT_2026-08-02.md`) found and this
> branch fixed two real defects the founder readiness doc above didn't catch:
> (1) self-serve email/password signup silently did nothing on genuine success
> whenever Supabase required email confirmation — a supabase-js response-shape
> quirk, not a missing UI branch — now shows a real "check your email" state;
> (2) switching accounts in the same browser tab could show the previous
> account's My World/collection data until a hard reload — `useUserCards`,
> `useBinders`, `ScrapbookTab`, and `SavedPostsSection` now reset on user-id
> change, not just on the `tokenReady` boolean. Also fixed: a "Prototype" label
> in the footer, fabricated Smart Matching trader data (replaced with an honest
> "coming later" preview, not real matching yet), and a Trade Hub header/body
> copy contradiction. See the audit doc's Resolution Status section for full
> root causes and verification evidence.
>
> **⚠️ 2026-08-02 Smart Matching V1 (branch `feat/production-smart-matching-v1`):**
> the "coming later" preview above was replaced with real, production-backed
> matching over `user_cards` — no invented users/percentages/matches. Two new
> authenticated routes (`GET /api/smart-matches`, `GET /api/smart-matches/:userId`),
> no SQL/schema/RLS changes. Full design doc: `docs/SMART_MATCHING_V1_2026-08-02.md`.
**Version:** `package.json` → `1.16.0` (normalized 2026-07-24 from a stale `1.6.0` that had sat unbumped across 113 commits; UI badges + `DEPLOYMENT.md` synced to match)
**Supabase project:** `wshqjxsbwqijodlskrbx` (us-east-1, Postgres 17)
**Live DB snapshot (queried 2026-07-23):** 17 registered users · 11 VIP · 6 friends rows · 24 DMs · 11 FCM tokens · 132 synced events · 1 post · 3 post comments · 0 meetups · 0 meetup RSVPs · 0 moderation reports · 0 blocks. The zeros on meetups/posts mean those features are wired to real tables but barely exercised in this dev DB — not that they're unbuilt.
**Build:** `npm run build` last confirmed clean 2026-07-23 (444 modules, main bundle ~1.76 MB / ~415 KB gzipped).

> **Why this doc exists:** prior handoff docs (`NEXT_PHASE_HANDOFF.md`) were single-session diffs, not cumulative inventories. Re-uploading only the latest to a Claude Project drifts the project's knowledge backward to whatever session last got written up. This doc is a full survey of the live codebase (component list + API routes + migrations + live DB) as of the snapshot above.
>
> **Regenerated 2026-07-23** against `main @ ac0c08d`, 113 commits past the previous `360fe2b` snapshot. Every section was re-derived from current code, not carried forward. The previous version had drifted badly: it documented a Home tab that no longer exists, listed Outfit AI / Trip Planner as shipped after they were removed, and predated the entire Meetups surface, the persistence wave, the Fanverse-feed backend, and PostHog/Sentry.

---

## 0. Navigation shape (read this first — the tab ids are misleading)

Bottom nav is **5 tabs**, but the internal `tab` ids do **not** match their labels. This trips up every reading of the code:

| Label (what the user sees) | `tab` id (what the code checks) | Component |
|---|---|---|
| Fanverse | `community` | `FanverseTab` |
| Explore | `explore` | `ExploreTab` |
| My World | `collect` | `LibraryTab` |
| Tools | `fanverse` | `ToolsTab` |
| My Stage | `profile` | `ProfileTab` |

- **`concerts` is a real, rendered tab** (`ConcertsPage`) but is **not** in the bottom nav. It's reached only via deep-link `dest`s (`concerts_meetups`, `concerts_create_meetup`, etc.) that call `setTab("concerts")`. Meetups & After Parties live inside it.
- The floating **Ask-AI/Messages dock** renders on every tab **except My World** (which has its own `+` action orb). Messages + Notifications float top-right on every tab except My Stage.

---

## 1. Product surfaces — shipped and real

Status legend: **Real** = wired to live backend/DB (works fully with env vars set, degrades to mock gracefully). **Built/Local** = functional UI, persists via localStorage. **Preview** = intentionally-labeled sample data.

### Auth & onboarding — Real
- Supabase auth via `AuthProvider` (`TOKEN_REFRESH_FAILED` handling, `clearAuthStorage()`, StrictMode-safe).
- Reserved-username + impersonation-pattern blocking, enforced onboarding (frontend) and `PATCH`/`POST` (backend).
- Resumable onboarding; demo-fan path for signed-out entry.
- **Fan identity persists to Supabase** (`users` columns / jsonb): ULT, bias wrecker, fan DNA, concert count, discovery prefs (2026-07-02).

### Explore (primary discovery tab — replaced the old Home tab 2026-07-05) — Real/Preview
- `ExploreTab` — content-discovery feed: multi-show mixing, honest source badges, "On Sale Soon", trend-filter pills.
- **Near You** location-aware module (2026-07-06).
- ⚠️ The old `Home*` component family (`HomeFeed` + `HomeHero`, `HomeIdentity`, `HomeQuickActions`, etc., ~14 functions) still exists in `App.jsx` but **`HomeFeed` is never mounted** — it's orphaned dead code since the Home tab was cut. See §4.

### Concerts & events — Real (not in bottom nav; see §0)
- `ConcertsPage` merges curated confirmed shows with **live Ticketmaster results** (`GET /api/events`, 132 events synced). Sample cards say "View Sample →" to keep trust labeling honest.
- `ShowDetail`, `ConcertDayMode`, `EventDiscovery`, `VenueCrowdTips`, `EventTimeline`, `TicketWallet`, `AiItinerary`.
- Views inside the page: **Shows | Meetups | After Parties | Find Fans**.

### Meetups & After Parties — Real (NEW since last snapshot, shipped 2026-06-28)
- Wired to real Supabase (`meetups`, `meetup_rsvps`, `events`, `event_rsvps` tables). Routes: `/api/meetups`, `/api/meetups/create`, `/api/meetups/mine`, `/api/meetups/:id/rsvp`, `/api/meetups/:id/attendees`, `/api/meetups/:id/friends-going`, `/api/meetups/:id/invite`.
- **VIP-gated hosting** with upgrade CTA. **Organizer dashboard** (Phase 2). **Friends-going privacy layer**: public sees count only, friends-overlap shown, full attendee list host-only.
- Interactive: group chat (persisted to `room_messages`), attendees, working create-meetup CTA, glassmorphic location tagging.
- Circle meetup invites + Message Requests + live push/email delivery (2026-07-01).

### Concert Capsule (shared fan memories) — Real
- `ConcertCapsule`, `CapsuleLandingPage`. `GET`/`POST /api/capsule/:concertId/entries`. Phase 2 (2026-07-02): persisted likes, new-moment notifications, search. Cross-concert Capsule Memories album surfaced in My World.

### Photocards, collection & trading — Real
- `LibraryTab`, `PhotocardGrid`, `PhotocardSetsView`, binders (`/api/binders`, `/api/cards`, `/api/card-templates`, `/api/binders/from-template`).
- Trading: `TradeHub`, `TradeListingForm`, `MakeOfferForm`, `OfferThread`, `ValueTracker`, trader stats. `/api/trade-listings`, `/api/listing-offers`, `/api/trade-reviews`.
- **My World Phase 3** (2026-07-07/08): shared `useUserCards()` cache; `PhotocardSetsView` and Era Room member wishlist **write through to real `user_cards`**.
- Card photos persist to **Supabase Storage** (2026-07-02).
- **Smart Matching V1** (2026-08-02): real collector matching — ISO/Wishlist (`status='iso'`) against Tradeable (`status IN ('for_trade','duplicate')`) on real `user_cards`, exact identity match on group+member+album+version. `GET /api/smart-matches`, `GET /api/smart-matches/:userId`. Mutual/one-way distinct states, honest empty/incomplete states, free-gate shows real ISO count only. See `docs/SMART_MATCHING_V1_2026-08-02.md`.

### My World (collection hub) & Era Boards — Real
- Museum-grid layout, Era Board hero, `ERA_MEMBERS` catalog (17 groups). `EraRoom`, `EraBoard`, Member Binders bridged to real binder/`user_cards` data with reactive counts.
- **Collection + Era Boards persist to Supabase** as `users.my_world` / `users.era_boards` jsonb (2026-07-02).
- Own `+` action orb (Add Photocard / Start Binder / Wishlist / Templates / Memory / Ask AI / Decorate).

### Scrapbook — Real
- `ScrapbookTab`, `ScrapbookDetail`. `/api/scrapbooks/memories`, `/api/scrapbooks/memory`.
- **Collaboration rebuilt on real backend (2026-08-01, `5db8fb2`):** the "book" entity and its collaborator invites previously lived only in `localStorage` with a fake, never-validated "collab code." Now backed by real `scrapbooks` + `scrapbook_collaborators` tables with RLS (accept/decline persists server-side); invite is sent as a real DM message card. Not yet reflected in the rest of this doc's snapshot date — see the DM Phase 2 note under "Social" above.

### My Stage / fan identity — Real
- `ProfileStudio`, `SkinThemeTab` (Stage Worlds, Stage Deco, background upload), `IdentityCard`, `FounderBadge`/`FounderPrestigeCard` (founder number **DB-backed**, auto-assigned sequentially on Founder Pass purchase), `PublicProfileFull`, `PublicFanPassport`.
- **VIP Exclusive category + 8 new Stage World backgrounds** (2026-07-18). Stage Studio persistence fixed; preview header collapses on scroll.

### Backstage Passes — Real
- `BackstagePasses` — disappearing POV moments (Fit Check / Merch Line / Seat View / Freebies / Lightstick Ocean / Soundcheck / Afterglow / Food Run / Pull Reveal).
- **Pass Studio creative tools** (2026-07-06): live text preview, mentions, real Giphy stickers, location. Circle-only visibility + tag-approval consent. Real analytics: view counts, who-reacted, working comments.
- ⚠️ The standalone Passes **browsing page was removed** 2026-07-18 (redundant); passes now interlace into the Fanverse feed + Explore.

### Fanverse (social discovery) & Map — Real
- `FanverseTab`, `FanverseMap` — **real Mapbox GL** (`MapboxMap.jsx`). Privacy-first: city-level aggregation only, no exact GPS, no individual pins.
- `FanverseHeatMap`, `FanverseLeaders`, `FanDiscoverySection`, `CityHubDetail`. `GET /api/users/discover`, `/api/hubs/cities`, `/api/map/activity`.
- **Fanverse Feed wired to the real API** (2026-07-20): real comments (`post_comments`), reposts (`post_reposts`), saves (`post_saves`), reactions (`post_reactions`), likes (`post_likes`). Routes: `/api/feed`, `/api/feed/post`, `/api/feed/like`, `/api/posts/:postId/comments`, `/api/posts/:postId/react`, `/api/posts/:postId/repost`, `/api/posts/:postId/save`.
- Header: Messages shortcut replaced the Fan Pulse label. Story rail = users only.

### Social: Circle, Messages, GIFs/Stickers, Reactions — Real
- `FriendsPage`/`MyCircleSection`, real friend-request flow (`friend_requests`, `friends`), "Find Fans" search. Unique-constraint re-request bug fixed (2026-07-05).
- `DirectMessages` — Circle-gated threads (`message_threads`/`messages`), GIF/sticker system (`GifPicker`, `gif` column). **Delivery is poll-based, not realtime** (see §3).
- **DM Phase 2 (2026-08-01, `5db8fb2`, NOT yet reflected elsewhere in this doc):** the old 6-tile "Backstage Kit"/Charms tray was replaced with a compact composer (`+`/GIF/text/mic⇄send). Photo/video and voice notes are now real (`messages.media` jsonb, private `dm-media` Supabase Storage bucket, signed URLs), not local-only. Message reactions are real and persisted (`message_reactions` table, stable message-id identity, `POST`/`DELETE /api/messages/:id/reactions`). All three verified live in production 2026-08-02 (real thread rendered photo + voice-note + reaction history with no console errors) — see `docs/FOUNDER_LAUNCH_READINESS_2026-08-02.md`. Video send/receive was **not** confirmed on real phone hardware as part of that check (browser-only verification) — see that doc's §E for the outstanding physical-device checks.
- `QRPage` (QR add-friend), `ChatHub`/`ChatRoom`.
- Backstage Buzz notifications: `NotificationCenter`, route-map deep-links, reactive bell badge. **Per-type push gating** (Phase 1, 2026-07-19) via `users.notification_settings` jsonb; consolidated into one dedicated settings screen.

### Trust & safety — Real
- `ReportSheet`, `SafetyCenter`, `ModerationQueue` (admin). `moderation_reports` + `user_blocks` with RLS. Admin queue gated by `ADMIN_EMAILS`. (Live DB: 0 reports, 0 blocks — clean, not unwired.)

### Monetization (VIP) — Real, web-only
- `VipGate`, `UpgradeModal`, `VipCelebrationScreen`. Stripe Checkout + webhooks (`invoice.paid`/`failed`, `checkout.session.completed`), `is_vip`/`vip_source` to Supabase, comp-VIP grant path. **No native IAP** (required before any native wrap — see `APP_STORE_READINESS.md`).

### AI features (Anthropic-backed, rate-limited via `aiLimiter`) — Real
- **Active:** `AIAssistant` (Ask Backstage — made functional free + VIP, 2026-07-12), `ChantVault` (deterministic chant finder + speed presets), `BuildMyDay` (fan-day planner), `AiItinerary`. Routes: `/api/ai/assistant`, `/api/ai/chant-helper`, `/api/ai/fan-day`, `/api/ai/itinerary`.
- ⚠️ **Outfit AI / Trip Planner were removed from the frontend** 2026-07-02 (planned re-add post-launch at a higher AI tier). **But the backend routes `/api/ai/outfit` and `/api/ai/trip-planner` still exist and have no frontend caller — orphaned.** See §4.
- Itinerary still auto-generates without asking preferences first (product gap, §3).

### Push notifications (FCM) — Real, needs live smoke test
- `public/firebase-messaging-sw.js` real (config via `postMessage`, `onBackgroundMessage`, deep-link on click). Frontend `getToken({ vapidKey, serviceWorkerRegistration })`. Backend Firebase Admin SDK + `/api/send-notification`. Dead-token pruning on send; disable-toggle actually deletes the token. Live DB: 11 FCM tokens.
- **Not verified:** true end-to-end device delivery with fully-populated `.env`. "Code complete, needs a live smoke test."

### Music — Real code, unconfirmed live
- `MusicConnect`, `NowPlayingCard`. Spotify OAuth + Apple Music (MusicKit) routes exist, gated by `HAS_SPOTIFY`. Needs live credentials + a manual round-trip test.

### Analytics & monitoring — Real (NEW 2026-07-20)
- **PostHog** (product analytics) + **Sentry** (error monitoring) wired in `src/lib/telemetry.js` (frontend) and `api_server_v16.js` (`@sentry/node`). Sentry `sendDefaultPii=false`, bodies/headers scrubbed. Env: `VITE_POSTHOG_*`, `VITE_SENTRY_*`, `SENTRY_DSN`.

---

## 2. Intentionally mock/preview (by design)

| Area | Status |
|---|---|
| Fanverse activity / city-hub fan counts | `PREVIEW` labeled |
| Concert attendee counts on sample cards | Sample stats, labeled |
| Fanverse story-rail user bubbles | Mock fan accounts |
| Backstage Buzz notification examples | `MOCK_NOTIF_EXAMPLES` |
| Some trade matches | Mock mixed with real listings |

---

## 3. Not built yet / explicitly deferred

| Feature | Status |
|---|---|
| Supabase real-time DMs | Persist to DB, but delivery is poll-based, not realtime subscriptions |
| Nightly Ticketmaster sync | Manual `sync-ticketmaster` admin route only (`SYNC_ADMIN_SECRET`-gated); no scheduled job |
| AI itinerary preference step | Auto-generates without asking arrival/transport/budget/vibe first |
| Outfit AI / Trip Planner re-add | Removed from frontend 2026-07-02; planned to return post-launch at a higher AI tier (backend routes still present) |
| Formal My World relational schema | Group→Era→Album→Version→Set→Card schema doesn't exist; bridged informally via `ERA_MEMBERS` + `users.my_world` jsonb |
| **Backstage Spot** | Backlog — concert-day venue-zone gathering hub |
| **Ult Ladder** | Backlog — elimination game, shareable to feed |
| **VIP Venue Heatmap** | **DO NOT BUILD YET** per prior product decision — needs a positioning pass first |
| Capacitor / native wrap | Not started. Native IAP required before submission |

---

## 4. Known issues to revisit

| Issue | Notes |
|---|---|
| ~~Orphaned `Home*` dead code~~ | **Resolved 2026-07-24.** All 14 `Home*` components + the `MOCK_OUTFITS` constant removed (−1142 lines from `App.jsx`). `InstallPromptCard` (the PWA install prompt) was preserved through that cleanup and **re-mounted app-level 2026-07-24** as a flex-shrink:0 top banner in `AppInner`'s main render — it now shows above every tab, pushes tab content down (no overlap with the top-right bell/messages or bottom-right dock, via a 52px top offset), and self-dismisses via `ls`, collapsing to zero height. Minor: on My Stage (no floating controls) the 52px clearance band reads as empty space. |
| **Orphaned AI backend routes** | `/api/ai/outfit` and `/api/ai/trip-planner` have no frontend caller since the 2026-07-02 removal. Either gate/remove them or note them as intentionally-parked for the planned re-add. |
| **`App.jsx` remains a large single-file monolith** | Modularization *started* (Phases 1–4 extracted `src/lib/` theme, storage, telemetry, visualSystem, date/profile helpers; `src/data/` 6 mock files; `src/components/primitives.jsx`; `MapboxMap.jsx`) plus the 2026-07-24 Home removal (−1142 lines) — but the bulk still lives in one file. No router; still a monolith in practice. Exact size drifts every session; see `docs/AGENT_CONTEXT_EFFICIENCY_AUDIT.md` for a dated snapshot instead of trusting a number here. Navigation: use `PROJECT_MAP.md`'s anchor table, not a sequential read. |
| ~~Version string stale~~ | **Resolved 2026-07-24** — normalized to `1.16.0` across `package.json`, UI badges, and `DEPLOYMENT.md`. |
| **Pre-existing unused imports** | 7 imports in `App.jsx` were already unused before the Home cleanup (`DARK_THEME`, `LIGHT_THEME`, `BS_TONE`, `bsToneColor`, `getBadgeStyle`, `getGlassCardStyle`, `parseConcertShowTime`). Left in place — not caused by, or in scope for, the Home removal. Trivially removable in a future tidy pass. |
| Express route-order footguns | Parameterized routes after the 404 catch-all become silently unreachable — has bitten capsule + trader-stats routes. Audit new routes. |
| Core DB schema partly un-versioned | 11 migration `.sql` files in-repo, but core tables (`users`, `cards`, `binders`, `trade_listings`, `card_templates`, `moderation_reports`, `user_blocks`, `posts`, `events`) have no migration file — likely created in the dashboard. Export a full schema dump for disaster recovery. |
| `.env.example` completeness | Now includes PostHog/Sentry. Still verify it lists `STRIPE_PRICE_*`, `RESEND_API_KEY`/`EMAIL_FROM`, GIF provider keys, `APPLE_MUSIC_*`, `ADMIN_EMAILS`, `SYNC_ADMIN_SECRET`. See `PROJECT_OVERVIEW.md` §6. |

---

## 5. Recommended next priorities

*(Judgment call — draft for Kacy to confirm, not a locked roadmap.)*

1. **Live smoke-test push notifications** end-to-end with real Firebase credentials — code complete, unverified on device.
2. **Verify Spotify / Apple Music OAuth round-trip** with real credentials.
3. **Housekeeping (done 2026-07-24):** removed orphaned Home dead code; normalized the version to 1.16.0; marked the two dormant AI backend routes (`/api/ai/outfit`, `/api/ai/trip-planner`) as intentionally kept. Remaining: decide whether to re-mount or drop `InstallPromptCard`, and clear the 7 pre-existing unused imports.
4. **Export and commit the real Supabase schema** for the un-versioned core tables.
5. **AI itinerary preference step** before generation.
6. **Real-time DMs** (replace polling) and **nightly Ticketmaster sync** when there's appetite.
7. **Formal My World relational schema** if binders/eras should be first-class relational instead of jsonb-bridged.
8. Backlog when wanted: Backstage Spot, Ult Ladder. Venue Heatmap stays parked.

---

## 6. Source material for this doc

Regenerated 2026-07-23 from: full `git log` (276 commits on `main`; 113 since the prior `360fe2b` snapshot), the component inventory in `src/App.jsx` (146 top-level functions) plus the extracted `src/lib/`, `src/data/`, `src/components/` modules, the route inventory in `api_server_v16.js` (145 `app.get/post/patch/delete/put` calls), the 11 `supabase-*.sql` migration files, `public/firebase-messaging-sw.js`, `src/lib/telemetry.js`, and a **live Supabase query** (project `wshqjxsbwqijodlskrbx`) for the DB counts in the header. Claims in `NEXT_PHASE_HANDOFF.md` / `APP_STORE_READINESS.md` / `DEPLOYMENT.md` were cross-checked against current code rather than trusted.

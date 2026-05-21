# Backstage Fanverse — Next Phase Handoff

**Session close date:** 2026-05-21  
**Final commit:** `81e5c17` (Add direct message reactions)  
**Branch:** `main` / `origin/main` — all aligned at `81e5c17`  
**Build:** ✅ Clean — `892.93 kB / gzip 212.61 kB`

---

## 1. What is completed (shipped to main)

### Social MVP
- ✅ Bring Your Crew / Find Fans — username search, Add to Circle, send requests
- ✅ My Circle — accepted user constellation, circle persistence
- ✅ Backstage Buzz — renamed from Notifications, "Updates" tab, subtitle
- ✅ Notification deep links — all types route to correct modal/tab
- ✅ Messages / DM MVP — Circle-only guard, conversation list, thread view
- ✅ Backstage Kit — replaces paperclip, 6 option tray
- ✅ Charms — premium glassy reaction items sent as messages (not giant stickers)
- ✅ Direct message reactions — tap any message → emoji picker → reaction pill attached to message (Instagram/iMessage style)

### Trust + Data Honesty
- ✅ All mock activity labeled PREVIEW (not fake LIVE)
- ✅ Fanverse Feed story rail = personal/social bubbles (not duplicate pass categories)
- ✅ Backstage Passes = pass categories (unchanged)
- ✅ Reserved username protection — frontend (onboarding) + backend (PATCH + POST)
- ✅ Concert data trust: CONFIRMED chip for Vegas BTS, PREVIEW for sample cards
- ✅ Concert days computed dynamically (not hardcoded)
- ✅ `computeDaysLeft()` — past dates show TBD

### Fanverse Feed
- ✅ Renamed "Fan Feed" → "Fanverse Feed"
- ✅ "+ Post" → "+ Moment"
- ✅ Filter: Fit Check / Trade / Freebies / Capsule Moment / Meetup / Afterglow / Comeback Buzz
- ✅ Faniversaries (renamed from Fan Anniversaries)

### Concert Data
- ✅ Vegas BTS WORLD TOUR 'ARIRANG' — Allegiant Stadium — CONFIRMED
- ✅ May 23, 24, 27 & 28 dates displayed
- ✅ Preview cards use "View Sample →" not "I'm Going"

### Home Header
- ✅ Order: Search | Messages | Backstage Buzz
- ✅ No duplicate avatar bubble (Profile in bottom nav)
- ✅ Messages icon with DM unread badge
- ✅ Buzz bell with Backstage Buzz badge

### Group/Fandom Persistence
- ✅ `user.fandoms` = canonical selected-groups field
- ✅ `PATCH /api/users/me` backend route added (was missing)
- ✅ "My Groups" section in Profile

### Security
- ✅ `.env` not tracked, all patterns in `.gitignore`
- ✅ No private keys or API keys in source or bundle
- ✅ `TICKETMASTER_API_KEY` placeholder in `.env.example` only (server-side only)
- ✅ `VITE_FIREBASE_*` placeholders safe (public config)
- ✅ `FIREBASE_PRIVATE_KEY` backend-only, never VITE_ prefixed

---

## 2. What is intentionally mock/preview

| Area | Status |
|---|---|
| Fanverse activity counts | PREVIEW label — not real user data |
| City/hub fan counts | PREVIEW label — mock data |
| Concert attendee counts on preview cards | Sample stats — labeled |
| Fanverse story rail user bubbles | Mock fan accounts (armyjoon, vegasarmy etc.) |
| Backstage Buzz notifications | Mock/demo examples from MOCK_NOTIF_EXAMPLES |
| Concert Capsule memories | 422 mock memories |
| HomeHero carousel | Sample concert promotions, no real live feed |
| Trade matches | Mock data |

---

## 3. What is NOT built yet

| Feature | Status |
|---|---|
| **Ticketmaster** | `.env.example` placeholder only. Backend route `GET /api/events` exists but ConcertsPage still uses `MOCK_CONCERTS`. No nightly sync. |
| **FCM push notifications** | Permission request works (mock token). `firebase-messaging-sw.js` does not exist. No real getToken(). Backend `/api/send-notification` is a stub. |
| **Supabase real-time DMs** | Messages use localStorage. Phase 2 TODOs in code. |
| **Backstage Spot** | Backlog only — concert-day venue-zone gathering hub. |
| **Ult Ladder / Fan Game** | Backlog only — K-pop who-would-you-rather ladder game. |
| **My World collection database** | MOCK_CARDS only. No group/era/album/binder schema. |
| **Event detail pages** | Meetup/after-party detail pages not built. |
| **RSVP count propagation** | RSVP state is local-only. |
| **AI itinerary customization** | Auto-generates without user preferences. |
| **Spotify/Apple Music** | Connect routes exist in backend, not wired to real tokens. |
| **Trip Planner / Outfit AI** | Both marked Coming Soon. |

---

## 4. Credentials / environment status

| Credential | Status |
|---|---|
| Supabase URL + Anon Key | Placeholder in `.env.example`. App runs in full mock mode without. |
| Mapbox Token | Placeholder in `.env.example`. Cosmic fallback map shows without. |
| Ticketmaster API Key | Placeholder in `.env.example` (server-side only, no VITE_ prefix). |
| Firebase VITE_ config | Placeholders in `.env.example`. Safe for frontend bundle. |
| Firebase VAPID Key | Placeholder in `.env.example`. |
| Firebase Service Account | Placeholder in `.env.example`. Never commit actual JSON. |
| Stripe Secret Key | In backend but not tested in this session. |
| Anthropic API Key | In backend for AI features. |

**Rule:** Real `.env` is in `.gitignore`. Never commit it.

---

## 5. Next recommended implementation order

### Phase 2 (immediate priorities)
1. **FCM client registration + backend sending**
   - Create `public/firebase-messaging-sw.js`
   - Import Firebase SDK, call `getToken({ vapidKey: VITE_FIREBASE_VAPID_KEY })`
   - Wire backend `/api/send-notification` to Firebase Admin SDK (HTTP v1)
   - Test device push with a local notification

2. **Ticketmaster backend route**
   - Uncomment commented code in `GET /api/events`
   - Add `TICKETMASTER_API_KEY` to real `.env`
   - Wire `ConcertsPage` to call `GET /api/events?groups=${user.fandoms.join(',')}`
   - Merge results with manually confirmed cards (Vegas BTS)

### Phase 3 (product depth)
3. **Event/RSVP/show detail polish**
   - Event detail pages for meetups and after parties
   - RSVP propagates across: Meetups tab, Show Detail, Home "You're going"
   - External payment link only (not in-app payments for MVP)

4. **AI itinerary customization**
   - Preference step before generation (arrival time, transport, budget, vibe, food, solo/group)
   - City/venue/vicinity-aware output

5. **Fanverse Pulse**
   - Real newsfeed data pipeline

6. **My World collection database architecture**
   - Group → Era → Album → Album Version → Photocard Set → Photocard
   - User binder schema
   - Supabase tables and migration

7. **Spotify/Apple Music profile integration**
   - Wire existing OAuth routes
   - Now Playing from real API

8. **PWA / App store polish**
   - Splash screen, icons, offline behavior

---

## 6. Known product issues to revisit

| Issue | Notes |
|---|---|
| **Upcoming Fan Events vs My RSVPs** | Currently mixed. Needs: discoverable events / My RSVPs / show-specific events as separate concepts. |
| **RSVP counts across surfaces** | RSVP is local-only. Should propagate to Meetups tab, Show Detail, and Fanverse Hubs. |
| **Meetup/after-party detail pages** | Only flat RSVP cards today. Need: location, organizer, capacity, age, cost, safety notes, share/report. |
| **Payments** | Do not process in-app yet. External link + "Payment handled by organizer/venue." |
| **BTS ARIRANG show detail page** | Low-contrast text on dark purple. Empty sections. Meetups & Events header with no populated cards. VIP itinerary card disconnected. |
| **AI itinerary auto-generates** | Should ask for preferences before generating. City/venue/vicinity-aware. |
| **Backstage Spot** | Backlog: concert-day venue-zone gathering hub. Spec in code comments. |
| **Ult Ladder** | Backlog: K-pop who-would-you-rather fan game for concerts, road trips, meetups. |

---

## 7. Exact next Claude prompt recommendation

```
Act as a Senior Full-Stack Engineer for Backstage Fanverse.

Current baseline:
- main is clean at [INSERT FINAL HASH].
- Do not touch Messages, Backstage Buzz, or Fanverse Feed.
- Do not touch Ticketmaster yet.

Goal: Wire FCM client push notifications (Phase 2).

Required:
1. Create public/firebase-messaging-sw.js for background push handling.
2. Import firebase/messaging in the frontend.
3. Replace mock token in requestNotificationPermission() with real getToken({ vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY }).
4. Add VITE_FIREBASE_* real values to local .env (not committed).
5. Wire backend /api/send-notification to Firebase Admin SDK using FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
6. Use FCM HTTP v1 API (not deprecated legacy server key).
7. Test with a local push. Notification click should deep-link using the existing NOTIF_ROUTES map in NotificationCenter.
8. Build passes. No secrets in source.

Do NOT implement Ticketmaster in this pass.
Do NOT implement Supabase realtime in this pass.
```

---

## 8. Product backlog items (not yet implemented)

### Backstage Spot
Concert-day venue-zone gathering hub activated inside Concert Capsule. Fans check in by venue zone (Gate 4, merch line, food court) with activity tags (Trading, Freebies, Solo Fan, Group Photo). No precise GPS. Safety copy included.

### Ult Ladder (Fan Game)
"Who would you rather?" ladder-style elimination game. Two options, pick one winner, keep challenging until one final #1 "ult" remains. Works with K-pop idols, K-drama actors, songs, snacks, stage outfits, and more. Shareable results to Fanverse Feed. Group voting mode for My Circle DMs.

---

*Generated at session close. All hashes and states reflect the actual live codebase.*

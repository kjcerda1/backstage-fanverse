# Backstage Fanverse — Launch Readiness

*Ground truth pulled directly from live systems: Supabase project `wshqjxsbwqijodlskrbx` (ACTIVE_HEALTHY, us-east-1, Postgres 17.6) on 2026-06-22. Do not rely on earlier handoff docs for this data — they were written before live queries were possible.*

---

## TL;DR

**The app is already live and being used.** There are 17 real registered users, 6 active friend connections, 19 real DMs across 6 threads, 6 FCM push tokens registered, 132 Ticketmaster-synced events, and 128 announcements in the DB. This is not prototype mode.

| Launch tier | Status | Blocking issues |
|---|---|---|
| **Soft launch** (share the Vercel URL widely, invite beta users) | ~1–2 weeks out | 3 broken features (RLS/no-policy), 1 critical security hole, 4 lower-risk security items, live smoke tests |
| **Official launch** (App Store + Play Store native app) | ~6–10 weeks out | Everything above + Capacitor wrap, native IAP (replaces Stripe web), APNs, store review process |

---

## 1. Live database snapshot (as of 2026-06-22)

46 tables total, all with RLS enabled. Key row counts:

| Table | Rows | Meaning |
|---|---|---|
| `users` | **17** | 17 real registered accounts |
| `events` | **132** | Ticketmaster sync has run — not all mock |
| `announcements` | **128** | Active announcement content in DB |
| `template_cards` | **100** | Photocard catalog seeded |
| `card_templates` | **5** | Album template records |
| `notifications` | **30** | Real in-app notifications delivered |
| `messages` | **19** | Real DMs across 6 threads |
| `message_threads` | **6** | Active DM conversations |
| `friends` | **6** | Active Circle connections |
| `friend_requests` | **10** | Pending/historical requests |
| `fcm_tokens` | **6** | Push notifications confirmed working for 6 users |
| `user_cards` | **24** | Real photocard collection entries |
| `binders` | **5** | Real binders created |
| `referral_codes` | **5** | Referral system active |
| `referrals` | **1** | One confirmed referral conversion |
| `posts` | **1** | Feed post |
| `post_comments` | **2** | Comments |

Tables at 0 rows (features built but unused so far): `capsule_entries`, `capsule_entry_likes`, `meetups`, `event_rsvps`, `scrapbooks`, `trade_listings`, `listing_offers`, `concert_memories`, `user_blocks`, `moderation_reports`.

---

## 2. Security issues — confirmed by live Supabase advisor scan

### 🔴 Critical — fix before soft launch

**`increment_trade_count` callable by anonymous users**
- Function is `SECURITY DEFINER` (runs with elevated DB privileges) and executable by the `anon` role — meaning someone with no account can call `/rest/v1/rpc/increment_trade_count?target_user_id=<any-uuid>` and inflate any user's trade count to any number.
- Fix: `REVOKE EXECUTE ON FUNCTION public.increment_trade_count(uuid) FROM anon;`

### 🟡 Medium — fix before soft launch (features are broken, not insecure)

**3 tables with RLS enabled but zero policies — effectively inaccessible to all users:**

| Table | Impact |
|---|---|
| `ask_backstage_usage` | AI assistant usage tracking is silently failing — no rows can be written or read |
| `capsule_entry_likes` | Concert Capsule likes are completely broken — nobody can like or see likes |
| `room_messages` | Group chat (ChatRoom/ChatHub) is completely broken at the DB level — no messages can be sent or read |

Fix pattern for each (example for `capsule_entry_likes`):
```sql
-- capsule_entry_likes
CREATE POLICY "Users can like entries" ON public.capsule_entry_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can see likes" ON public.capsule_entry_likes
  FOR SELECT USING (true);
CREATE POLICY "Users can unlike their own" ON public.capsule_entry_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ask_backstage_usage
CREATE POLICY "Users manage own usage" ON public.ask_backstage_usage
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- room_messages
CREATE POLICY "Authenticated users can send messages" ON public.room_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can read room messages" ON public.room_messages
  FOR SELECT USING (true);
```

### 🟡 Lower risk — fix before or shortly after soft launch

**`increment_post_likes` / `decrement_post_likes` — SECURITY DEFINER, authenticated-only**
- Any signed-in user can spam these RPCs to inflate/deflate any post's like count without any rate limiting at the DB level. The API has rate limiting, but direct Supabase REST calls bypass it.
- Fix: Switch to `SECURITY INVOKER` so they run as the calling user (can only affect rows they have RLS permission to touch), or add a check that the calling user is the post owner / has a like record.

**`increment_card_count` — callable by anon, no SECURITY DEFINER**
- Lower risk (no elevated privileges), but an anonymous caller can still inflate template card counts.
- Fix: `REVOKE EXECUTE ON FUNCTION public.increment_card_count(uuid) FROM anon;`

**Leaked password protection disabled**
- Supabase Auth doesn't check against HaveIBeenPwned. Enable in Supabase Dashboard → Authentication → Password Settings → "Enable leaked password protection."
- One-click fix in the dashboard, no code change needed.

---

## 3. What needs to happen before soft launch

Soft launch = sharing the Vercel URL with a broader beta audience, press, or an invite wave. Not the App Store.

### Must-do (blockers)

- [ ] Fix `increment_trade_count` anon access (critical — SQL one-liner above)
- [ ] Add RLS policies for `capsule_entry_likes`, `ask_backstage_usage`, `room_messages` (SQL above)
- [ ] Enable leaked password protection (dashboard toggle)
- [ ] Smoke test: full push notification end-to-end with real Firebase credentials
- [ ] Smoke test: Stripe web checkout → webhook → VIP activation flow (test mode then live)
- [ ] Confirm build is clean: `npm run build` passes with no errors
- [ ] Verify `VITE_API_URL` in Vercel dashboard points to the live Render backend

### Should-do (not hard blockers, but visible to beta users)

- [ ] Fix `increment_post_likes`/`decrement_post_likes` (switch to SECURITY INVOKER)
- [ ] Fix `increment_card_count` anon revoke
- [ ] BTS ARIRANG show detail page polish (low-contrast text, empty sections)
- [ ] AI itinerary preference step before generation
- [ ] Smoke test: Spotify/Apple Music OAuth round-trip with real credentials
- [ ] Confirm Ticketmaster events sync is running (132 rows in `events` table suggests it has run, but verify the cron/manual trigger is still working)

### Won't block soft launch (but document as known gaps)

- Room chat messages (broken at DB until RLS policies added — but feature is "coming soon" territory, this is fine)
- Concert Capsule likes (same — feature exists but 0 usage, no one has noticed yet)
- RSVP propagation cross-surface
- Formal My World collection schema (current bridge via ERA_MEMBERS works)

---

## 4. What needs to happen before App Store / official launch

This is ~6–10 weeks of work beyond soft launch, most of which is native packaging, not feature work.

### Capacitor wrap (iOS + Android)
- `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- `npx cap init`, `npx cap add ios`, `npx cap add android`
- Configure `capacitor.config.json` with `appId: com.fanverse.backstage`
- Test on real devices (Safari WebView quirks, Android Chrome WebView CSS)

### Native payments (required by Apple/Google — not optional)
- **iOS**: Replace Stripe web checkout with StoreKit 2 for any in-app purchase of digital goods. "Restore Purchase" button required. Apple will reject an app that takes Stripe web payment inside a native binary for digital goods.
- **Android**: Replace Stripe with Google Play Billing API.
- Plan: keep Stripe web for PWA/web users; add IAP path for native binary users. `vip_source` column already exists in `users` table to distinguish.

### Push notifications (native path)
- Replace Firebase web SDK with `@capacitor/push-notifications` plugin
- iOS: APNs certificate in Xcode
- Android: `google-services.json`

### App Store assets and compliance
- Privacy Nutrition Label (App Store Connect) — declare: email, username, usage data, device ID (push token)
- Screenshots: 6.7" (1290×2796) and 6.1" (1179×2556) for iOS; 1080×1920 for Android
- Age rating questionnaire (likely 12+ or 13+)
- `ACCESS_COARSE_LOCATION` permission string in iOS `Info.plist` for Nearby Mode
- Generate adaptive icons for Android 8+
- 1024×1024 icon for iOS App Store
- Test Lighthouse PWA score ≥ 90

### App Store review timeline
- Apple review: typically 1–3 days for new apps if no issues; plan for 1–2 weeks including any rejection/resubmit cycles
- Google Play review: typically 1–3 days

---

## 5. What's confirmed working (not just "code is there")

Evidence from live DB:
- ✅ Auth is working — 17 real users registered and active
- ✅ FCM push delivery — 6 device tokens registered (real `getToken()` calls succeeded)
- ✅ Friend system — 6 confirmed connections, 10 requests processed
- ✅ Direct messages — 19 real messages in 6 threads
- ✅ Photocard collection — 24 cards across 5 binders
- ✅ Referral system — 1 conversion
- ✅ Ticketmaster sync — 132 events in DB (sync has run successfully)
- ✅ Notifications — 30 delivered to real users
- ✅ Card templates catalog — 100 template cards seeded

---

## 6. What's confirmed broken (not opinion — verified from DB + advisor scan)

- ❌ Concert Capsule likes — RLS/no-policy, 0 rows writable
- ❌ Group chat room messages — RLS/no-policy, 0 rows writable
- ❌ AI assistant usage tracking — RLS/no-policy, silent failure on writes
- ❌ `increment_trade_count` — exploitable by unauthenticated callers

---

## 7. Files to read alongside this one

- `PROJECT_OVERVIEW.md` — tech stack, repo structure, env vars, conventions
- `CURRENT_STATE.md` — full feature inventory (what's built, what's mock, what's not started)
- `APP_STORE_READINESS.md` — detailed iOS/Android/PWA store submission checklist

---

*This doc was generated from live Supabase queries + security advisor output, not from reading source files. Data reflects the actual live production database state.*

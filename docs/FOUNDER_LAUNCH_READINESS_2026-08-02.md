# Backstage — Founder Launch Readiness Assessment

**Date:** 2026-08-02 (corrected 2026-08-02)
**origin/main:** `5db8fb2` (Phase 2 DM/media/scrapbook merge — this IS the current production baseline)
**Prepared by:** live production verification + code/doc/security audit, ~75 min timebox

> **Correction note:** this revision corrects classification errors in the original
> same-day assessment. Three items (physical-device notification test, leaked-password
> protection, absence of load testing) were originally labeled P1 in a way that
> overstated their severity for a monitored beta. They are corrected below to their
> proper risk tier — UNVERIFIED/P2 and PARTIAL/P2 — with the reasoning shown inline.
> No new testing was performed for this correction pass; no application code,
> database configuration, or deployment was touched.

---

## A. Executive verdict

| Readiness | % |
|---|---|
| Web/PWA monitored beta | **90%** |
| Small-budget paid promotion | **75%** (after a clean beta run — see verdicts below) |
| Native App Store / Google Play submission | **10%** (feature-complete, packaging not started) |

**One paragraph:** Backstage is a real, working product today — not a demo. Auth, DMs (including the new photo/voice-note/scrapbook/reactions work), My World, VIP/Stripe, and the legal/compliance pages all verified live in production this session with no errors. **There are zero confirmed P0 issues and zero confirmed P1 issues.** What remains open is a short list of P2/PARTIAL/UNVERIFIED items: two physical-device smoke tests that haven't been run yet (not failed — simply not yet attempted), a Supabase Free-plan feature gap (leaked-password protection — a plan limitation, not an application defect), and the fact this stack has never been load-tested under concurrent traffic. None of that blocks starting a monitored beta today. It does mean the two device smoke tests should happen before you point organic or paid traffic at the app commercially, and load testing should happen before broad paid spend — not before beta.

---

## B. Launch recommendations

| Stage | Verdict |
|---|---|
| Invite-only monitored beta | **GO** |
| Public early-access web/PWA launch | **CONDITIONAL GO** — pending the two physical-phone smoke tests (§E, §H) |
| Organic commercial | **CONDITIONAL GO** — pending those same two tests |
| Small paid advertising | **CONDITIONAL GO** — after several monitored beta days with no P0/P1 regression |
| Broad paid advertising | **NO-GO** — until basic load/capacity and support-readiness checks are done |
| Apple App Store | **NO-GO** — native wrapper doesn't exist yet |
| Google Play | **NO-GO** — native wrapper doesn't exist yet |

---

## C. Confirmed ready (verified live this session, not just "code exists")

- **Auth/session** — signed-in session persisted correctly on reload; production `mock_mode: false`.
- **5-tab nav** — Fanverse, Explore, My World, Tools, My Stage all load cleanly at 1280px and 390px viewports, zero console errors, no blank screens.
- **Messaging (the newest work)** — DM inbox loads; a real thread rendered full mixed history: text, a photo attachment, a voice note (playable duration shown), a Shared Scrapbook invite card, and a persisted ❤️ reaction — all real data from prior sessions, not mocked. Composer has working photo/video, GIF, and voice-note controls. (Note: this confirms the UI and data path render correctly in a browser — it does not substitute for the two real-device tests in §E/§H, which check camera/mic/OS-level behavior a browser session can't exercise.)
- **My World** — loads real data (22 owned cards, 6 wanted, 2 binders, Trade Hub, per-group folders) at both viewport sizes.
- **Fanverse Map** — loads without errors; honestly labeled `PREVIEW` (no live Mapbox credential in this environment — this is the documented, intentional mock fallback, not a bug).
- **Legal/compliance pages** — `/privacy`, `/terms`, `/support`, `/delete-account` all return 200 on production.
- **Backend health** — `/api/health` → 200, Stripe/Firebase/AI/Email/Spotify all reporting active.
- **Build** — `npm run build` clean, 448 modules, no errors — confirms the Phase 2 merge didn't break the build.
- **Security — all previously-known criticals are RESOLVED and reverified live today:**
  - `increment_trade_count` anon-exploit — fixed, reverified (service_role only).
  - `capsule_entry_likes`, `ask_backstage_usage`, `room_messages` RLS-lockout — fixed, reverified (real least-privilege policies in place).
  - `increment_post_likes`/`decrement_post_likes`/`increment_card_count` anon/authenticated RPC exposure — fixed, reverified (service_role only).
  - **Live Supabase security scan (run this session) shows only 4 findings total, down from 7+ in earlier audits** — see §E.

---

## D. Confirmed blockers (P0/P1)

**0 confirmed P0 issues. 0 confirmed P1 issues.**

No active security exploit, data-loss path, payment defect, or app-breaking bug is currently open. Everything remaining is tracked below as P2, PARTIAL, or UNVERIFIED — real items worth closing out, but none of them are launch blockers for a monitored beta, and none of them are confirmed application defects.

A P1 is possible in the future only if one of the UNVERIFIED items in §E is actually run and fails (e.g., the notification-tap test comes back FAIL rather than untested). Until run, "untested" is not the same claim as "broken."

---

## E. Important, non-blocking (P2 / PARTIAL / UNVERIFIED)

| # | Item | Classification | Why | When to close it out |
|---|---|---|---|---|
| 1 | **Push-notification tap → does it open the exact intended DM thread?** | **UNVERIFIED / P2 for monitored beta** | Code is complete and confirmed live (the deep-link marker is present in the production bundle), but the real end-to-end test — Account B DMs Account A, tap the notification on A's closed/backgrounded phone — has never been run on physical hardware. This is a coverage gap, not a known failure. **Becomes P1 only if the test is run and fails.** | Before public/organic/paid push — see §H |
| 2 | **Real physical-phone video send/receive/playback** | **UNVERIFIED / P2** | The DM media composer and playback UI were verified live in a browser this session (photo + voice note rendered correctly), but video specifically has not been round-tripped on real phone hardware (camera capture, upload, playback, codec compatibility). | Before public/organic/paid push — see §H |
| 3 | **Leaked-password protection is off** | **PARTIAL / P2, accepted beta risk** | This is **plan-gated, not an application defect** — Supabase Auth's HaveIBeenPwned check is a Pro-plan-only feature (confirmed via `get_organization`, current plan: Free). The application code has no bug here; there is nothing to fix without a subscription change. Acceptable residual risk at small monitored-beta scale. | Revisit before broad paid growth: either upgrade to Supabase Pro, or make an explicit documented risk-acceptance for scale |
| 4 | **No load/concurrency testing has ever been run** | **P2 before meaningful paid growth — NOT a blocker for a small invite-only monitored beta** | Nothing is currently failing under load; this is an untested-capacity risk that scales with traffic, not a present defect. A handful of invited beta users will not approach any limit worth pre-testing for. | Before broad paid spend, run basic load/concurrency checks against the Express backend and Supabase connection pool |
| 5 | 3 new RPC helper functions (`is_thread_member`, `user_owns_scrapbook`, `user_is_accepted_scrapbook_collaborator`) directly callable via REST | P2 | Each is hard-scoped to `auth.uid()` internally, so calling them directly only tells a user "am I a member of thread/scrapbook X" — information they already have. Not exploitable, not a data leak. | Convenient cleanup before a security audit for App Store; not urgent |
| 6 | `room_messages` has no attendee/RSVP gating | P2 | Any signed-in user who knows/guesses a room_id can read/post. Documented, pre-existing, 0 real usage last snapshot. | Before meetup chat sees real traffic |
| 7 | DMs are poll-based, not realtime | P2 | Feels slightly less "live" than a native chat app; cost/latency scales with concurrent users. | Before broad scale, not before beta |
| 8 | Docs drift: `CURRENT_STATE.md`/`PROJECT_MAP.md` had not been updated for the 2026-08-01 DM Phase 2 merge at the time of the original assessment | P2 (process, not product) | Confuses future planning sessions, not users. **Refreshed as part of this correction pass** — see the two files listed at the end of this document. | Done this pass |
| 9 | ~105 `auth_rls_initplan` + 72 `multiple_permissive_policies` + unindexed-FK/unused-index performance lints across most tables | P2 | Non-issue at current scale; adds query overhead that compounds under real concurrent load. | Before broad paid campaign |
| 10 | Core schema (`users`, `cards`, `binders`, `trade_listings`, etc.) has no committed migration file | P2 | Disaster-recovery gap, not a live risk — created directly in the Supabase dashboard. | Export and commit before scale, low urgency |
| 11 | Spotify/Apple Music OAuth round-trip unconfirmed with live credentials | P2 | Feature-level polish gap, not core. | Post-launch |
| 12 | AI itinerary generates without asking preferences first | P2 | UX polish. | Post-launch |

---

## F. Native-store gap

Nothing has changed here since `APP_STORE_READINESS.md` was last written — verified: no `ios/`/`android/` directories, no Capacitor in `package.json`.

**Missing for both platforms:**
- Capacitor wrap (not started) — `@capacitor/core`/`ios`/`android`, `cap init`, `cap add ios/android`
- Native IAP: StoreKit 2 (iOS) / Google Play Billing (Android) — **Apple/Google will reject Stripe web checkout inside a native binary**, this is mandatory, not optional
- Native push: APNs cert + `@capacitor/push-notifications`, `google-services.json` for Android
- Store assets: screenshots (multiple sizes), app icons (1024×1024 iOS, adaptive Android), Privacy Nutrition Label (iOS), Data Safety section (Android), age rating questionnaire
- Physical-device testing on both platforms (Safari/Android WebView quirks)

**Realistic effort:** ~6-8 engineering days for the Capacitor wrap + native IAP + native push, plus ~2-3 days for store assets/compliance forms, plus review turnaround (Apple 1-3 days typical, Google similar) once submitted. Call it **8-11 engineering days**, not counting any reject/resubmit cycles.

---

## G. First-week launch risks

**Likely complaints, beta/organic scale:**
- "Messages feel a beat slow" — polling-based DMs, not realtime. Expected, not a bug report you need to chase.
- Occasional push notification that doesn't land or mis-routes — device/OS-specific; this is exactly the risk surface the UNVERIFIED notification-tap test in §E covers.
- A user finding the Fanverse Map's city-activity numbers labeled `PREVIEW` and asking why — it's honest labeling, but be ready to explain it's aggregate/sample data, not a bug.
- Support requests you'll have to handle personally — there's no team yet; budget for it.

**Operational response:** Sentry (backend + frontend) and PostHog are both wired and confirmed active in production — you have real error visibility, not silence. Use the moderation queue (`ADMIN_EMAILS`-gated) for reports; it's live with 0 rows so far, meaning genuinely untested at volume.

---

## H. Launch plan

**Today, no further work needed:**
- Invite a small trusted beta group. Everything they'll touch (auth, DMs incl. media/reactions/scrapbook, My World, VIP) has been verified live this session.

**Before public early-access launch, organic commercial, or small paid ads — run these two explicit pre-commercial checks:**
1. **Real physical-phone video send/receive/playback** in a DM thread, on real hardware.
2. **Real push-notification tap** — Account B sends a DM to Account A, Account A's phone has the app closed/backgrounded, tap the notification, confirm it opens the exact intended DM thread (not just the app, not the wrong thread).

Both are quick (well under an hour combined) and both need you plus a second phone, not more engineering.

**After several monitored beta days with no P0/P1 regression, before small paid ads:**
- Confirm the two tests above came back PASS (or fix-and-retest if either fails).
- Decide, explicitly, whether you're comfortable running without leaked-password protection at small scale (reasonable: yes) or want to upgrade to Supabase Pro now.

**Before broad paid ads:**
- Run a basic load/concurrency test against a staging copy of the Express backend + Supabase pool.
- Either upgrade to Supabase Pro (leaked-password protection) or document the accepted risk.
- Clean up the `auth_rls_initplan`/multiple-permissive-policy performance lints on your highest-traffic tables (messages, posts, user_cards).

**Before App Store/Google Play submission:**
- Capacitor wrap + native IAP (StoreKit 2 / Google Play Billing) — mandatory, not optional.
- Native push (APNs/FCM-native), store assets, Privacy Nutrition Label / Data Safety declarations.
- Full device testing pass on real iOS and Android hardware.

---

## I. Top 5 next actions (by founder value)

1. **Start the invite-only beta now.** Zero confirmed P0/P1 issues stand in the way; the technical footing is solid.
2. **Run the two physical-phone smoke tests (video round-trip, notification-tap-to-thread)** before your first organic or paid commercial push — cheap, fast, and they're the only things standing between "beta" and "public early-access."
3. **Make the explicit call on leaked-password protection** (accept the risk at small scale, or upgrade to Pro) so it stops showing up as an open question in every future audit — it is a plan choice, not a bug to fix.
4. ~~Refresh `CURRENT_STATE.md`/`PROJECT_MAP.md`~~ — **done as part of this correction pass** (see the two files updated alongside this one).
5. **Schedule the Capacitor/native-store work as its own project**, not a side quest — it's 8-11 real engineering days, and starting it now (in parallel with beta feedback) is how you shorten the gap to App Store without blocking anything you can do today.

---

*This document does not claim the app is "fully secure" or "bug-free." It records what was verified live, what remains genuinely open (correctly weighted by severity), and what's optional. As of this correction pass: 0 confirmed P0, 0 confirmed P1, remainder is P2/PARTIAL/UNVERIFIED.*

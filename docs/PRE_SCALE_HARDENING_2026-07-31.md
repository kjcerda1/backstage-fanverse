# Pre-Scale Security & Launch Hardening — 2026-07-31

Baseline: `origin/main @ de40ace` (notification deep-link fix already merged and confirmed live in production before this sprint started).

Supabase project: `wshqjxsbwqijodlskrbx` (ACTIVE_HEALTHY, us-east-1, Postgres 17.6). Org plan: **Free**.

Migration file: [`supabase-pre-scale-security-hardening-migration.sql`](../supabase-pre-scale-security-hardening-migration.sql) — applied directly to production via the Supabase MCP `apply_migration` tool (name `pre_scale_security_hardening_2026_07_31`), and committed to the repo for reproducibility.

---

## 1. Security findings — before → after

| # | Finding | Before | After | Verified live |
|---|---|---|---|---|
| 1 | `increment_trade_count` anon execution | Already fixed in a prior session (anon/authenticated blocked, service_role only) | Restated idempotently in the new migration file for disaster-recovery; no live change made | ✅ `has_function_privilege` — anon:false, authenticated:false, service_role:true |
| 2 | `ask_backstage_usage` — RLS enabled, zero policies | Advisor: `rls_enabled_no_policy` | Added owner-only `SELECT` policy for `authenticated`. Table has **no** `anon`/`authenticated` table-level grants at all (pre-existing, not added by us) — all reads/writes stay backend/`service_role`-only, which prevents a user from forging their own AI-usage-quota row | ✅ anon SELECT denied, authenticated SELECT denied (no table grant — stricter than the policy alone would allow), advisor finding gone |
| 3 | `capsule_entry_likes` — RLS enabled, zero policies | Advisor: `rls_enabled_no_policy`; feature silently broken for any direct (non-backend) client | Mirrors the existing `post_likes` policy shape: public `SELECT`, owner-only `INSERT`/`DELETE` | ✅ authenticated SELECT ok, impersonated INSERT denied, non-owner DELETE affects 0 rows, own INSERT/DELETE work, advisor finding gone |
| 4 | `room_messages` — RLS enabled, zero policies | Advisor: `rls_enabled_no_policy`. Backend code comment explicitly documents current behavior: "any signed-in fan who can open the meetup can read/post... RSVP-gating is a future hardening" | `SELECT`/`INSERT` for `authenticated` only (no `anon`), `INSERT` requires `auth.uid() = user_id`. Matches the documented current backend behavior exactly — does not invent a membership model that doesn't exist | ✅ anon SELECT denied, authenticated SELECT works (any room), impersonated INSERT denied, own INSERT works, advisor finding gone |
| 5 | `increment_post_likes` / `decrement_post_likes` — SECURITY DEFINER callable by any `authenticated` user | Advisor: `authenticated_security_definer_function_executable` ×2. Any signed-in user could call the RPC directly via PostgREST and inflate/deflate any post's like count with no `post_likes` row ever created (bypassing the backend's one-like-per-user check) | Revoked `EXECUTE` from `PUBLIC`/`anon`/`authenticated`; granted only to `service_role` (the only real caller — `api_server_v16.js` `/api/feed/like`). Function bodies unchanged (already `search_path=""` and already schema-qualified) | ✅ anon/authenticated: false, service_role: true; advisor findings gone |
| 6 | `increment_card_count` — anon-executable, mutable search_path | Advisor: `function_search_path_mutable`. Callable by anon/authenticated with no auth check at all | Revoked `EXECUTE` from `PUBLIC`/`anon`/`authenticated`; granted only to `service_role`. Pinned `search_path=''` (body already schema-qualifies its one reference, `public.card_templates`) | ✅ anon/authenticated: false, service_role: true; advisor finding gone |
| 7 | Leaked password protection disabled | Advisor: `auth_leaked_password_protection` (WARN) | **Not changed — plan-gated.** Supabase docs confirm: *"Leaked password protection is available on the Pro Plan and above."* Org plan is confirmed **Free**. No spend authorized this sprint, so left as-is | Confirmed via `get_organization` (plan: free) + Supabase docs search |

**Advisor rescan (security), before this sprint's changes:** 7 findings (3 RLS, 2 function-privilege, 1 search-path, 1 leaked-password).
**Advisor rescan, after:** 1 finding — leaked password protection (plan-gated, cannot be resolved without upgrading).

---

## 2. Exact SQL applied to production

See [`supabase-pre-scale-security-hardening-migration.sql`](../supabase-pre-scale-security-hardening-migration.sql) in the repo root (follows the existing `supabase-*-migration.sql` convention used throughout the repo). Idempotent — safe to re-run. Applied live via Supabase MCP `apply_migration` (migration name: `pre_scale_security_hardening_2026_07_31`) after presenting the exact SQL for approval.

Four sections: (1) restated `increment_trade_count` fix, (2) RLS policies for the three tables, (3) RPC grants for the two post-like functions, (4) RPC grant + search_path fix for `increment_card_count`.

---

## 3. Live verification method

All RLS tests ran inside `BEGIN ... ROLLBACK` transactions using disposable rows (QA account IDs `pip_qa`/`pip_qa2`, a throwaway `capsule_entries`/`room_messages` row) and Postgres role/JWT simulation (`SET LOCAL ROLE`, `SET LOCAL request.jwt.claim.sub`). Confirmed post-rollback that zero rows persisted in `capsule_entries`, `capsule_entry_likes`, or `room_messages`. No real user data was read, modified, or created.

Test matrix (12 sub-tests, all passed):
- anon SELECT on all three tables → denied
- authenticated owner SELECT → allowed where a policy+grant exists; denied by pre-existing (unmodified) grant absence on `ask_backstage_usage`
- authenticated non-owner SELECT → allowed only where product semantics call for shared visibility (`capsule_entry_likes` counts, `room_messages` per documented current behavior)
- authenticated impersonation INSERT (writing another user's `user_id`) → denied on both `capsule_entry_likes` and `room_messages`
- authenticated non-owner DELETE → 0 rows affected
- authenticated owner INSERT/DELETE → succeeds

RPC grants verified directly via `has_function_privilege('anon'|'authenticated'|'service_role', ..., 'EXECUTE')` for all four functions, both before and after.

---

## 4. Device push / notification deep-link checkpoint

`de40ace` (the notification deep-link fix) was already merged to `main` before this sprint began. Verified it is **live in production** by fetching the deployed bundle at `https://backstagefanverse.com` (served via `www.backstagefanverse.com/assets/index-D71tAFZP.js`) and confirming it contains the `backstage_notif_target` one-shot localStorage key introduced by that commit — this string only exists in the post-fix code, so its presence in the live bundle proves the fix is deployed, not just merged.

**The one physical-device test from the mission brief (Account B → DM → Account A's closed/backgrounded iPhone → tap notification → confirm exact thread opens) was not run in this session** — it requires two real devices and Kacy's participation, which this automated session cannot perform. This is the one item **deferred back to Kacy**, per the mission's explicit "pause only once" rule for this checkpoint.

**Kacy — when ready, run this:**
1. From Account B, send Account A a real DM.
2. Make sure Account A's iPhone has Backstage closed or backgrounded.
3. Tap the resulting notification.
4. Report back:
   - **PASS** — exact thread opened
   - **PARTIAL** — Messages opened but not the exact thread
   - **FAIL** — wrong screen, crash, loop, or nothing opened

---

## 5. Build, test, and functional verification results

| Check | Result |
|---|---|
| `npm run build` | ✅ Clean, 448 modules, ~6.7s, no errors |
| Backend syntax (`node --check api_server_v16.js`) | ✅ OK |
| `tests/binder-card-ownership.test.js` | ✅ 19/19 passed |
| `tests/my-world-qa-correction.test.js` | ✅ 7/7 passed |
| `localStorage.clear()` audit | ✅ Zero occurrences in `src/` or `api_server_v16.js` |
| API client boundary (single `apiClient.js`, network errors return `{error}` not throw) | ✅ Confirmed, no regression from prior audit |
| Storage boundary audit | ✅ No changes made in this sprint that touch storage; prior audit still holds |
| Production Supabase security advisor | ✅ Rescanned — 6 of 7 findings resolved, 1 plan-gated (see §1) |
| Live sign-in + session restoration (`pip.qa@backstage.test`) | ✅ |
| 5-tab bottom nav (Fanverse / Explore / My World / Tools / My Stage) | ✅ All present and navigable |
| DM inbox + send flow | ✅ Sent a disposable test message to `pip_qa2`, confirmed delivery, deleted the test row afterward |
| My World load | ✅ Real data (22 owned, 2 binders, live binder progress) |
| VIP modal (Replay VIP Tour) | ✅ Opens and dismisses cleanly |
| Explicit sign-out | ✅ Returns cleanly to the signed-out welcome screen |
| Backend-unavailable handling | ✅ Verified by code inspection (not a live outage): every `apiClient.js` verb catches network failures and returns `{error: 'Network error'}` rather than throwing |

No destructive or high-volume testing was performed. All live-data touches (one DM, disposable capsule/room-message rows) were rolled back or cleaned up immediately.

---

## 6. Remaining known risks

- **Leaked password protection** — cannot be enabled without a Supabase Pro plan upgrade. Does not block monitored beta (small trusted user set); worth prioritizing before a broad/paid campaign where account-takeover exposure from credential-stuffing scales with user count.
- **`room_messages` has no attendee/RSVP gating** — this was a pre-existing, explicitly-documented product decision (see `api_server_v16.js` comment above `/api/rooms/:roomId/messages`), not something introduced or newly discovered this sprint. Any signed-in user who knows/guesses a `room_id` can read and post to that room's chat. Low real-world risk today (`room_messages` had 0 rows as of the last DB snapshot), but worth a product decision before meetup chat sees real usage at scale.
- **Real-time DMs are still poll-based**, not Supabase Realtime — unchanged, pre-existing, not in scope for this sprint.
- **Core schema partly un-versioned** — `users`, `cards`, `binders`, `trade_listings`, `card_templates`, `moderation_reports`, `user_blocks`, `posts`, `events` still have no migration file in-repo (pre-existing gap, unrelated to this sprint).

## 7. Deliberately deferred (not blocking, not touched this sprint)

- Physical-device notification tap test (§4 — needs Kacy).
- Spotify/Apple Music OAuth live round-trip.
- AI itinerary preference step.
- Any Avatar/GIF/VIP/API-client/storage-isolation/notification-architecture rework — all previously completed, no regression found, intentionally not reopened per mission scope.

---

## 8. Founder launch recommendation

- **Monitored beta (small, trusted user set): GO.** All 3 previously-broken-by-RLS features (Ask Backstage usage tracking, Concert Capsule likes, room group chat) now have real least-privilege policies instead of silent zero-policy lockout, the anon-privilege-escalation bug is fixed and verified, and the two like-counter RPCs and the card-count RPC are locked to `service_role` only. Build is clean, structural tests pass, and core flows (sign-in, DMs, My World, VIP, sign-out) were smoke-tested live against production with no failures.
- **Organic commercial-ad launch: CONDITIONAL GO.** Same technical footing as monitored beta. Condition: get the physical-device notification-tap PASS from Kacy first (§4) before pointing broader organic traffic at push notifications specifically — everything else is verified.
- **Small-budget paid campaign: CONDITIONAL GO.** Same condition as above, plus: leaked-password protection stays off (Free plan). For a small, capped budget this is an acceptable residual risk (credential-stuffing exposure scales with account count, and a small paid test keeps that count small).
- **Broad paid campaign: NO-GO until three things happen** (see below). The current setup was never load-tested, real-time DMs are polling-based (cost/latency scales with concurrent users), and leaked-password protection is off — all of these matter more as user count grows, not at small scale.

**Confirmed P0 security/data-loss issues still open:** None. The one previously-open P0 (`increment_trade_count` anon execution) was already fixed and re-verified live this session; no new P0 was found.

**P1 issues remaining:**
1. Leaked password protection off (plan-gated, not a code fix).
2. `room_messages` has no attendee/RSVP scoping (pre-existing product gap, documented, zero real usage so far).
3. Physical-device notification tap test not yet run by a human.

**Are DMs, collections, auth, and payments sufficiently reliable for beta?** Yes, based on this session's live smoke tests (DM send/receive, My World load, VIP status/modal, sign-in/session-restore/sign-out) plus the existing structural test suite for binder/card ownership. Payments (Stripe) were not re-tested this sprint — no changes were made to that path and it was out of scope per the mission's "do not reopen completed VIP work" instruction.

**Increased-traffic risk:** Poll-based DM delivery and the single-file `api_server_v16.js` monolith are the two things most likely to show strain first under real concurrent load — neither was stress-tested this sprint (explicitly out of scope: "no destructive or high-volume load testing").

**Should Kacy publish the commercial now?** Yes for organic reach, once the one physical-device notification test comes back PASS. Hold broad paid spend until the three items below are done.

**Maximum sensible paid budget stage right now:** Small/capped test budget only (enough to validate creative + funnel, not enough to meaningfully stress the backend or amplify the leaked-password-protection gap).

**Three items before substantially scaling ads:**
1. Physical-device notification-tap PASS from Kacy (or a fix-and-retest cycle if it fails).
2. A real (even lightweight) load/concurrency check on the Express backend and Supabase connection pool — this sprint deliberately avoided that per scope.
3. Either upgrade to Supabase Pro for leaked-password protection, or make an explicit, documented risk-acceptance decision to launch broad paid without it.

**Can safely wait until after launch:** Real-time DM delivery, `room_messages` attendee/RSVP gating (given 0 current usage), full core-schema migration export, AI itinerary preference step, Spotify/Apple Music live-credential verification.

---

*This document does not claim the app is "fully secure." It records what was found, what was fixed, what was verified live, and what remains open or uncertain, as of 2026-07-31.*

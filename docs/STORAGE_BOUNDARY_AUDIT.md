# Storage Boundary Audit

**Audit-only.** No storage behavior changed. Baseline `origin/main` = `97de2d8`. Branch `claude/backstage-storage-audit-578550`.

Line numbers cite `src/App.jsx` unless noted. Grep the anchor (key string or `_KEY =` const) to reconfirm — this file is 26k+ lines and shifts.

---

## 1. The `ls` helper (`src/lib/storage.js`)

```js
export const ls = {
  get: (k, fb=null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)   => { try { localStorage.removeItem(k); } catch {} },
};
```

- **Methods:** `get(key, fallback)`, `set(key, value)`, `del(key)`. No `clear`, no bulk ops.
- **Parsing:** always JSON — `get` parses, `set` stringifies. Safe fallback on parse failure (try/catch → returns `fb`). Good baseline; no malformed-JSON crash risk through `ls`.
- **User scoping:** none built in — every call site that needs a per-user key builds the string itself (`` `backstage_x_${userId}` ``). No `getUserScopedKey`/`clearUserScopedStorage` exists.
- **Removal:** `del` exists but is rarely used (~9 call sites) relative to ~85 unique keys — most "removal" is really "never removed."
- **Suitability as future boundary:** the primitive is fine (safe get/set/del, consistent JSON handling). It is not a boundary today because there's no key registry, no scoping helper, and ~30 call sites bypass it entirely with raw `localStorage.*`.

### Direct `localStorage.*` calls that bypass `ls` (App.jsx only; nothing elsewhere bypasses it)

| Lines | What | Notes |
|---|---|---|
| 554 | `syncMyWorldToServer` reads all `MY_WORLD_KEYS` | wrapped in outer try/catch |
| 588–592 | `clearAuthStorage()` | removes 5 literal keys + legacy Supabase key + all `sb-*` prefix keys |
| 5783, 11965, 11984, 11988, 11996, 12000, 12006, 12017, 12021, 12032, 12035, 12050, 12113, 12115 | Era Room / wishlist read-modify-write | each individually try/catched |
| 25863–25890 | Login hydration: era boards, My World, notif settings "fresh device only" merge | wrapped in per-block try/catch, "never overwrite local" semantics |

Total direct bypass call sites: **~26**. Total `ls.get/set/del` call sites: **~340+** across `src/App.jsx`, `src/lib/profileHelpers.js`, `src/lib/theme.js`, `src/components/VipSystem.jsx`, `src/components/GifSystem.jsx`. Combined localStorage touch points: **~370+**. `sessionStorage`: **0 uses anywhere in `src/`**.

Unique literal/dynamic key **patterns**: **~90** (counted by distinct key string or template).

---

## 2. Keys by domain

Format: `key` — owner file(s) — shape — user-scoped? — sensitive? — category — backend SoT? — survives sign-out? — risk.

### Auth / mock auth
- `backstage_session` — App.jsx — `{user}` obj — no (holds whichever user last signed in) — **yes, PII (email/name/id)** — cache — Supabase session is SoT — **survives sign-out only if `clearAuthStorage` runs; it does clear this key** — risk: **high** (see §3.1)
- `backstage_pending_uid`, `backstage_mock_user` — App.jsx (mock-auth / MOCK_AUTH path only) — cleared on sign-out — low risk, dev/no-Supabase-config fallback only
- `backstage_profile_${userId}` — App.jsx — per-user profile cache — **yes, PII** — **NOT cleared on sign-out** — risk: **high**
- `backstage_pending_patch_${userId}` — App.jsx — retry queue for a failed onboarding PATCH — user-scoped, not cleared, low blast radius (just a patch body)
- `backstage_supabase_auth`, `supabase.auth.token` — only appear inside `clearAuthStorage`'s removal list — **no write/read site found anywhere** — dead/legacy keys kept defensively
- `sb-wshqjxsbwqijodlskrbx-auth-token`, `sb-*` — Supabase SDK-owned, not app keys — correctly wiped on sign-out

### VIP / Founder
- `backstage_is_vip` (global) + `backstage_is_vip_${userId}` (`vipCacheKey`, profileHelpers.js) — dual cache, single writer (`setCachedVip`) — backend (`is_vip`/`vip_source`) is SoT, cache only gates UI before a fetch resolves — global key cleared on sign-out, **per-user key is not**
- `backstage_founder_profile` — VipSystem.jsx — founder message draft — durable-ish user content with no backend column found in this audit — medium risk (possible silent data loss if never synced)
- `backstage_has_binder` — App.jsx — bool flag, set on first binder create — not user-scoped, not cleared — low-medium (cross-account leak of "has a binder" boolean only)

### Theme / appearance
- `backstage_light_mode` — src/lib/theme.js:161 — bool — global, not user-scoped — fine to stay global (device preference, not account data) — low risk

### Onboarding / tutorials / one-time flags
- `backstage_onboarding_complete` (global) + `backstage_onboarding_complete_${userId}` (`onboardingCompleteKey`) — profileHelpers.js — dual-key pattern identical to VIP cache
- `backstage_tour_shown`, `backstage_first_action_done`, `backstage_open_studio`, `backstage_install_prompt_dismissed`, `backstage_my_binders_notice_dismissed`, `backstage_notif_prompt_dismissed`, `backstage_open_create_meetup`, `backstage_open_pass_id`, `backstage_open_pass_composer`, `backstage_concerts_view` (read-once-then-deleted nav flag), `backstage_capsule_context` — all App.jsx, all global (not user-scoped), all low-risk UI state — **not cleared on sign-out**, meaning a second account on the same device silently skips onboarding/tour/first-action prompts it never saw. Low severity but real.

### Profile / My Stage
- `backstage_top5`, `backstage_top_biases`, `backstage_top_group_details`, `backstage_profile_style`, `backstage_privacy_settings`, `backstage_section_styles` — App.jsx (ProfileTab/ProfileStudio) — user-editable durable data, no `_${userId}` suffix on most of these — **cross-account leak risk: high** (account B sees account A's top5/bio styling until it overwrites)
- `backstage_city_${userId|'anon'}`, `backstage_city_meta_${userId}`, `backstage_now_playing_${userId|'anon'}` — correctly user-scoped

### My World / collections / photocards
- `MY_WORLD_KEYS` (App.jsx:535, synced as a blob to `/api/profile/update` → `my_world` jsonb column, backend **is** SoT for these): `backstage_photocard_sets`, `backstage_tracked_photocard_sets`, `backstage_custom_photocard_sets`, `backstage_era_saves`, `backstage_card_wishlist`, `backstage_my_world_theme`, `backstage_featured_shelf`, `backstage_saved_capsules`, `backstage_saved_shop_outfits`, `backstage_card_photos`
  - **`backstage_saved_shop_outfits` has no read/write call site anywhere in `src/`** — Outfit AI/Trip Planner was removed from the frontend per prior session (2026-07-02); this key is dead weight still round-tripped through every My World sync. Orphaned, low risk, easy cleanup candidate (not touched this session).
  - None of these are user-scoped by key name — the *sync* is per-session (`api.post` uses the auth token), but the **local cache is shared across whatever account is currently in the browser** — same account-leak pattern as Profile keys.
- `backstage_era_boards_v2` (current) vs `backstage_era_boards` (legacy v1, App.jsx:12000/12050 — **still has a live write site**) — Era Room is marked decommissioned in product memory but the v1 key is still written. Duplicate/stale-naming risk: medium.
- `backstage_binders` (`LOCAL_BINDERS_KEY`), `backstage_folder_meta` (`FOLDER_META_KEY`) — local binder list metadata, not user-scoped
- `backstage_capsules_count` — **read in 4 places (App.jsx:5695, 5882, 6212, 6820) with no matching write site found** — always falls back to its default (0 or 2); orphaned/dead read.
- `backstage_saved_capsule_${concertId}` — per-concert bool, correctly scoped by concert not user
- `backstage_concert_capsules`, `backstage_scrapbook_items`, `backstage_afterglow_entries`, `backstage_afterglow_recovery` — durable user content, not user-scoped, not cleared on sign-out

### Wishlist / trades
- `backstage_active_trades`, `backstage_trade_passport`, `backstage_trade_history`, `backstage_inventory_items` — App.jsx (TradeHub/InventoryTab) — durable, high-value user data (trade history, inventory), **not user-scoped, not cleared on sign-out** — risk: **high**

### Concerts / capsules / memories / shows
- `backstage_going`, `backstage_rsvped`, `backstage_custom_meetups`, `backstage_concert_resume`, `backstage_myshows`, `backstage_scrapbooks`, `backstage_scrapbook_memories_${bookId}`, `backstage_venue_tips_${concertId}`, `backstage_cdm_timeline_${concertId}`, `backstage_cdm_arrived_${concertId}`, `backstage_setlist_moment_${concertId}`, `backstage_concertday_active`, `backstage_capsule_count_${concertId}`, `backstage_fan_projects`, `backstage_prep_list`, `backstage_kdramas`, `backstage_tickets`, `backstage_passes`, `backstage_pending_tags_${username}` — all App.jsx, mix of global and concert-scoped, none user-scoped. `backstage_tickets` and `backstage_passes` ship a **hardcoded mock default** (a real-looking sample ticket) baked into the `useState` initializer — cosmetic but worth knowing before trusting "empty" states in QA.

### Friends / social
- `backstage_friends`, `backstage_friend_requests`, `backstage_circle`, `backstage_circle_statuses`, `backstage_circle_requests`, `backstage_fan_circles`, `backstage_joined_circles`, `backstage_buddy_requests`, `backstage_discovery_on`, `backstage_discovery_preferences`, `backstage_proximity_sharing`, `backstage_blocked_users`, `backstage_reports` — App.jsx — durable social graph, **not user-scoped, not cleared on sign-out** — risk: **high** (account B on the same device inherits account A's friend list / blocked list until each key is individually overwritten)

### Messages / DMs
- `backstage_dms`, `backstage_dm_target`, `backstage_groups` (`GROUP_KEY`) — App.jsx — DM thread cache, **not user-scoped** — risk: **high** (message content is the most sensitive category here and it's global-keyed)
- `backstage_message_gifs` (`GIF_LS_MESSAGE_GIFS`, App.jsx:1023) — sent-GIF history for DM threads, capped at 40, global-keyed

### GIFs / reactions
- `backstage_gif_recent_searches`, `backstage_gif_recent_reactions`, `backstage_reaction_media_type` — src/components/GifSystem.jsx — low-sensitivity UI prefs, global-keyed, fine as-is
- `backstage_story_reaction_${storyId}_${emoji}` — App.jsx:14475 — per-story-per-emoji bool, unusual double-interpolated key shape but low risk

### Feed / posts / drafts
- `backstage_stories`, `backstage_memes`, `backstage_saved_chants`, `backstage_chant_practice_history` — App.jsx — durable content, global-keyed

### Music
- `backstage_music_connected`, `backstage_apple_recent` — App.jsx — connection state + cached track list, global-keyed

### Notifications
- `backstage_notif_inbox` — capped at 50, global-keyed, mixed with mock notif filtering (`isMockNotifId`)
- `backstage_notification_settings_${userKey}`, `backstage_push_enabled_${userKey}`, `backstage_push_token_${userKey}`, `backstage_push_prompted_${userKey}`, `backstage_push_test_${userKey}` — correctly user-scoped (`userKey = user?.id || user?.email || "anon"` — falls back to email, not always `id`, which is a minor inconsistency vs. the `_${user?.id||'anon'}` pattern used elsewhere)
- `backstage_notif_prompt_dismissed` — global, one-time flag

### Misc / fan identity
- `backstage_fan_identity`, `backstage_fan_anniversaries` — App.jsx — durable, global-keyed
- `backstage_concert_budget` — App.jsx:10216 (`KEY`) — global-keyed

### Feature flags / debug
- `MOCK_AUTH` (App.jsx:315) is a **module-level const derived from env**, not a storage key — no localStorage-backed feature flags exist beyond the one-time UI flags listed under Onboarding above.

---

## 3. Key safety findings

### 3.1 Sign-out does not clear ~85 of ~90 keys (highest risk)
`clearAuthStorage()` (App.jsx:586–594, called from `signOut()` at 453–458 and one recovery path at 3366) removes exactly: `backstage_session`, `backstage_is_vip`, `backstage_pending_uid`, `backstage_supabase_auth`, `supabase.auth.token`, the known `sb-<ref>-auth-token`, and any `sb-*` key. Every other domain — friends, circle, DMs, trades, inventory, top5, profile style, privacy settings, My World, all onboarding flags — **persists untouched**. On a shared device, signing out of account A and into account B shows account B a mix of B's fresh backend data merged with A's stale local cache wherever "fresh device only" hydration logic (§25852–25892) decides local already has data and skips the remote merge. This is the audit's top finding — it's a real account-leakage vector, not hypothetical.

### 3.2 Duplicate global+per-user cache pattern (VIP, onboarding)
Both VIP and onboarding-complete use a global fallback key (`backstage_is_vip`, `backstage_onboarding_complete`) *and* a per-user key. The global one is what §3.1 leaves stale between accounts; `hasCompletedOnboarding`/`getCachedVip` both guard the global fallback with `cachedUserId === user.id` (reads `backstage_session`), so misattribution is defended against **as long as `backstage_session` itself is correctly refreshed** — which it is, since it's one of the 5 keys `clearAuthStorage` does clear. This pattern is safer than it looks at first glance.

### 3.3 Dead/orphaned keys
`backstage_saved_shop_outfits` (write/read site removed with Outfit AI), `backstage_capsules_count` (read-only, no writer), `backstage_supabase_auth`/`supabase.auth.token` (removal-only, no writer found). Not harmful, just noise.

### 3.4 Legacy duplicate: `backstage_era_boards` vs `backstage_era_boards_v2`
v1 still has a live write path despite Era Room being product-decommissioned. Confirm before any consolidation whether the v1 writes are themselves dead code or an active fallback.

### 3.5 No malformed-JSON crash risk observed
Every direct `localStorage.*` bypass site is wrapped in try/catch with a safe fallback; `ls.get` does the same. No unguarded `JSON.parse` found.

### 3.6 Large/unbounded values
`backstage_card_photos` is explicitly guarded against unbounded growth (App.jsx:557–562 strips local blob-URL previews before sync, keeps only uploaded HTTPS URLs). No other key showed an obvious unbounded-growth pattern; several are capped (`notif_inbox` 50, `gif_recent_reactions` 16, `message_gifs` 40).

---

## 4. Proposed architecture

**Recommendation: E — staged combination, starting with A+B (constants registry on top of the existing `ls` helper), deferring C/D.**

The current usage is ~90 flat string keys with ad-hoc template interpolation for user/entity scoping, all funneled through a working (if under-used) `get/set/del` primitive. A big-bang typed adapter layer (C) or single global service (D) would touch all ~370 call sites at once — exactly the rewrite this audit is meant to avoid. A `STORAGE_KEYS` constants file plus `getUserScopedKey`/`clearUserScopedStorage` helpers layered onto the *existing* `ls` object lets call sites migrate one at a time with zero behavior change, and directly fixes §3.1 (sign-out leakage) without a rewrite.

## 5. Migration plan (design only, not implemented)

1. **Lowest-risk first:** theme (`backstage_light_mode`) and the one-time UI flags (tour/first-action/dismissed-banners) — global, low-sensitivity, easy to move into a `STORAGE_KEYS` constants file with zero behavior change.
2. **Leave untouched initially:** My World blob (synced by literal key names the backend jsonb round-trips against), trade/collection data, auth keys inside `clearAuthStorage` — any consolidation here risks the server-sync contract, not just local reads.
3. **Dedicated passes needed:** (a) friends/social — highest leak surface, needs `getUserScopedKey` retrofitted; (b) DMs — same, plus message content is the most sensitive category; (c) My World — key names are a backend contract, needs a versioned approach if touched.
4. **Key names:** must stay byte-identical during any registry introduction — the registry should export the existing literal strings, not rename them.
5. **Versioned migrations:** only needed if a key's *value shape* changes, or if user-scoping is retrofitted onto a currently-global key (old global value needs a one-time migrate-into-scoped-key step so existing users don't lose data).
6. **Preserving existing data:** no key renames, no shape changes, in any first pass.
7. **Logout/account switching:** the real fix is extending `clearAuthStorage()` (or a new `clearUserScopedStorage()`) to sweep all `backstage_*` keys except device-level prefs (theme) on sign-out — this is the single highest-value change identified, but is a *behavior* change and out of scope for this audit.
8. **Smallest safe first implementation:** create `src/lib/storage.js` additions — `STORAGE_KEYS` object enumerating the ~90 literal/template keys (documentation value only, no call-site changes yet) — touching zero other files. That alone gives future sessions a single place to see every key without grepping, and is prerequisite reading for any of the passes above.

## 6. Validation plan (for whenever migration work starts)

`npm run build`; sign in/out (confirm `clearAuthStorage` scope decision made explicitly); account switch on one device (the current known-gap, §3.1); reload persistence; theme persistence in both Pearl and Concert mode; onboarding/tour flags; GIF recent searches; draft preservation (chant/story drafts); collection/binder persistence; VIP state (both cache keys); malformed-JSON recovery (already safe via `ls`, confirm it stays that way); backend-unavailable fallback (My World sync silently no-ops when `!API_URL`); old-key-name compatibility (no renames planned, but verify if any pass introduces one).

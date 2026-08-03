# Smart Matching V1 — Production-Backed Collector Matching

**Date:** 2026-08-02
**Branch:** `feat/production-smart-matching-v1`
**Base:** `origin/main` @ `14740de`

Replaces the fabricated-data "Smart Matching Preview" (hardcoded `@trademaster`/`@kpopswap`
with fixed 94%/87%, flagged as F08 in `docs/USER_POV_PRODUCT_AUDIT_2026-08-02.md` and
already softened to an honest "coming later" placeholder on `main`) with a real,
authenticated, production-backed matcher over `user_cards`. No invented users,
percentages, cards, inventory, availability, activity, or location anywhere in this pass.

---

## 1. Architecture

**No SQL, schema, RLS, index, trigger, or RPC changes were made or are required for V1.**

Two new authenticated GET routes were added to `api_server_v16.js`, reusing the exact
backend pattern already used by `/api/users/discover`, `/api/friends`, and
`/api/messages/thread`: the service-role `supabase` client (bypasses RLS by design in
this backend), with authorization enforced explicitly in application code — the
requesting user's id always comes from `req.userId` (set by `requireAuth` from the
verified Supabase JWT), never from the client.

Query shape: two indexed-by-filter queries, no full pairwise scan of all users × cards:

1. `SELECT * FROM user_cards WHERE user_id = req.userId` — the caller's own cards.
2. `SELECT * FROM user_cards WHERE user_id != req.userId AND status IN ('iso','for_trade','duplicate')` — every other user's *candidate* rows only (rows that could possibly participate in a match; `owned`/`missing` rows are never fetched).

The join (which candidate cards satisfy which identity, mutual vs. one-way) happens in
memory in Node. At monitored-beta scale (dozens of users, tens of `user_cards` rows —
30 rows / 17 users in production as of this writing) this is the right-sized approach:
simpler and more auditable than a SQL/RPC function, with no meaningful performance cost
(see §8). **Revisit with a dedicated SQL function (e.g. a `SECURITY INVOKER` RPC doing
the join in Postgres) if `user_cards` grows into the thousands of rows** — the two-query
shape stops being the cheapest option well before that, but isn't there yet.

Both routes live in `api_server_v16.js` directly above the 404 catch-all (search anchor:
`SMART MATCHING (V1)`).

---

## 2. Data sources

| Data | Source | Notes |
|---|---|---|
| Card ownership/status | `user_cards` (real rows, `status` column) | No `catalog_card_id`/`group_id` columns exist in production — `supabase-catalog-provenance-migration.sql` is an unrun draft (confirmed live: `information_schema.columns` has no such columns on `user_cards`). Identity is therefore free-text, normalized (§3). |
| Profile identity | `users` (`username`, `display_name`, `avatar_url`, `is_vip`, `discoverable`) | Same public-field subset the rest of the app already returns via `toPublicCard` — no email, no other private fields. |
| Blocking | `user_blocks` via the existing `getBlockedUserIdSet()` helper | Same helper already used by DMs/friend requests. |
| Discovery opt-out | `users.discoverable` (boolean, default `true`) | Same flag `/api/users/discover` already honors — reused, not a new preference (see §5). |

---

## 3. Card identity rules (V1 — exact-only)

A card is **matchable** only when all four of `group_name`, `member`, `album`, and
`version` are present (non-empty after `trim()`). Two cards match iff all four fields
are equal after `lower(trim())` normalization.

```
key = lower(trim(group_name)) + "|||" + lower(trim(member)) + "|||" + lower(trim(album)) + "|||" + lower(trim(version))
```

**Why exact-only, no partial tier:** real production data has heavy free-text drift —
the same user has both `"ateez"` and `"ATEEZ"` as `group_name` on different rows;
`version`/`era` are sometimes `""` and sometimes `NULL` for what should be the same
field; `card_type` values seen live include `"album"`, `"Album PC"`, `"unit"`,
`"fansign"`, and `null`, with no controlled vocabulary. Rather than guess a partial-match
tier that could produce false positives (e.g. matching two cards that share a group and
member but are actually different versions), V1 requires all four identity fields to
agree exactly. This directly follows the mission instruction not to match on broad
values like group/member alone, and not to silently guess missing fields.

**Excluded from identity:**
- `era` — redundant with or inconsistent against `album` in real rows (often identical,
  sometimes empty when `album` isn't).
- `card_type` — free text with no enforced vocabulary; excluding it means a `duplicate`
  card entered as `"album"` still matches the same physical card entered as `"Album PC"`
  elsewhere, which is closer to fan intent than treating them as different cards.

**Excluded from matching (incomplete records):** any ISO/Tradeable card missing
`group_name`, `member`, `album`, or `version` is never guessed into a match. It's counted
(`incomplete_count` in the API response) and surfaced honestly in the UI so the user
knows what to fill in — never silently dropped without explanation.

---

## 4. Status semantics (confirmed, not assumed)

Confirmed against the app's own **already-shipped, documented "single source of truth"**
selectors in `src/App.jsx` (`cardTradeableCount`, `isWishlistIdentity`, used by
`computeMyWorldSummary`, `GroupBinderHome`, and every My World stat surface):

- **ISO / Wishlist (want)** = `status === 'iso'`
- **Tradeable (give)** = `status === 'for_trade' OR status === 'duplicate'`

**`duplicate` already counts as tradeable in this product today** — this is not a new
assumption introduced for matching; it's the existing, shipped definition. (A
lower-level RLS policy, `user_cards_trade_public`, happens to only expose `for_trade`
rows to direct anon/authenticated Postgres reads — but that policy is irrelevant here
since the backend uses the service-role client and enforces authorization itself, the
same way every other cross-user route in this file already does.)

`owned` and `missing` never participate in matching.

Quantities (`quantity`, or the newer `owned_quantity`/`for_trade_quantity`/
`wanted_quantity` columns from the mid-migration dual-read model) are **not** used for
match eligibility — a card counts if it exists with an eligible status, not by how many
copies. 29 of 30 production `user_cards` rows are on the legacy single-status-per-row
model as of this writing; only 1 uses the new quantity columns. Matching therefore reads
`status` directly rather than the dual-read quantity selectors, since that's what's
actually populated.

---

## 5. Match eligibility

A collector appears in another user's results only when **all** of:

- They're a real authenticated account (a row in `users` reachable via a real `user_cards` row).
- They are not the requesting user (`user_id != req.userId` in the candidate query).
- They have `discoverable = true` — reusing the same opt-out `/api/users/discover`
  already honors. **No dedicated Smart Matching privacy preference exists yet** — this
  is the smallest responsible V1 rule (documented here per the mission's instruction to
  flag this explicitly rather than invent a new preference unilaterally).
- Neither user has blocked the other (`getBlockedUserIdSet`, both directions).
- They have a real card whose identity key intersects the requester's ISO/Tradeable
  keys (§3).
- Deleted cards are structurally excluded — `DELETE /api/cards/:id` hard-deletes the
  row; there's no soft-delete flag to also filter on.

---

## 6. Mutual vs. one-way

For requester **A** and candidate **B**:

- `they_give_i_want` = B's Tradeable cards whose identity key is in A's ISO keys.
- `i_give_they_want` = B's ISO cards whose identity key is in A's Tradeable keys.

| Condition | Result |
|---|---|
| `they_give_i_want` empty | B is not returned to A at all |
| `they_give_i_want` non-empty, `i_give_they_want` empty | **`one_way`** |
| both non-empty | **`mutual`** |

A one-way match is **never** upgraded or implied to be an agreement — the UI explicitly
states "No reciprocal match yet ... this isn't an agreement to trade." Nothing implies a
card is reserved, a user is online, a trade is guaranteed, or a location is known.

---

## 7. API contracts

### `GET /api/smart-matches`
Auth required. Query params: `limit` (1–50, default 20), `cursor` (opaque base64 offset).

```jsonc
{
  "matches": [
    {
      "user": { "id": "...", "handle": "pip_qa2", "display_name": "Pip QA Two", "avatar_url": null, "is_vip": false },
      "match_type": "mutual", // or "one_way"
      "their_cards_you_want": [{ "id":"...", "group_name":"aespa", "member":"Winter", "album":"Drama", "version":"Giant Ver.", "card_type":"Album PC", "image_url":null }],
      "your_cards_they_want": [ /* same shape */ ],
      "explanation": ["They have 1 card from your ISO list.", "You have 1 card from their ISO list.", "Mutual trade opportunity."]
    }
  ],
  "next_cursor": null,          // base64 offset, or null when no more pages
  "total_count": 1,
  "my_iso_count": 2,
  "my_tradeable_count": 1,
  "incomplete_count": 0
}
```
Sort order (deterministic, documented, internal only — never shown as a score or
percentage): mutual before one-way, then by number of compatible cards, then by most
recent real `updated_at` on the matching cards. No location, no randomness.

### `GET /api/smart-matches/:matchedUserId`
Auth required. Detail for one matched collector. The param is named `matchedUserId`,
never `userId`, so it can never be confused with the requester — the requester is
always `req.userId` from the verified JWT and is never accepted from the URL, body, or
query (grepped and unit-tested).

`matchedUserId` is validated against a UUID shape first (400 on malformed input, before
any query runs). Every other outcome — self, a nonexistent UUID, a real-but-unrelated
account, a blocked account, a non-discoverable account, or a genuinely stale match
(status changed since the list was fetched) — resolves to the **identical** `404 {
"error": "No match found for this collector" }`. There is no 403 path and no
distinguishing message: the route cannot be used to probe "does this UUID belong to a
real account" or "why was I denied," because every denial reason looks the same from
the outside. This was verified live (see §11 #14–17) with a syntactically valid UUID
for a real, unrelated, non-blocked, discoverable production account — same 404, same
message, as a nonexistent UUID and as the caller's own id.

The route recomputes `computeSmartMatches()` from current data on every call — it never
trusts a client-cached match — so a since-invalidated relationship can't leak stale
"you have a match" data. Live-verified: flipping the matched user's card status away
from Tradeable made the detail route 404 immediately on the next call, with no reload
and no delay (§11 #10).

### Next actions (no new endpoints — reuse what exists)
- **View profile** → `onViewProfile({ id, username, display_name, fandoms:[] })`, same
  shape used by every other profile-tap surface in the app.
- **Message** → `ls.set("backstage_dm_target", fan); go("chats")`, the exact entry point
  `FanverseFloatingDock.openThread` already uses.
- **Add friend** → `POST /api/friends/request` (existing route, unchanged).

---

## 8. Authorization & privacy

- Requester id is always `req.userId` from the verified JWT — grepped and unit-tested
  (`tests/smart-matching.test.js`), and live-verified: an unauthenticated call to
  `GET /api/smart-matches` returned `401 { "error": "Missing auth token" }` (§11 #13).
- `GET /api/smart-matches/:matchedUserId` cannot be used to enumerate arbitrary users
  into a full profile — it only returns a payload if a real match already exists for
  the caller right now; otherwise 404, indistinguishable from self/blocked/nonexistent
  (§7). It does not return "their whole inventory," only the specific cards that
  satisfy the identity match — live-verified payloads never carry more than
  `their_cards_you_want`/`your_cards_they_want` (§11 #6, #7).
- Response fields are the same minimal public subset the rest of the app already
  returns for a matched user (`id`, `handle`, `display_name`, `avatar_url`, `is_vip`) —
  no email, no auth internals beyond the same `users.id` UUID already used app-wide as
  the routing key for DMs/friend-requests/profile views (not a new exposure boundary).
  Card fields exclude `notes` and `description` (private free-text) — unit-tested.
- Blocked users are excluded before their profile is ever fetched (`getBlockedUserIdSet`
  runs before the `users` query, not as an after-the-fact filter) — live-verified: a
  real temporary block made the blocked user disappear from a real HTTP response
  immediately (§11 #11).
- Malformed `matchedUserId` fails with 400 before touching the database — live-verified
  with a literal non-UUID string (§11 #14).

---

## 9. Account isolation (frontend)

`useSmartMatches()` (in `src/App.jsx`, next to `useUserCards`) follows the identical
pattern already shipped and live-verified for the F14 cross-account-bleed fix
(`docs/USER_POV_PRODUCT_AUDIT_2026-08-02.md`): a reset effect keyed to
`useAuth().user?.id`, not the `tokenReady` boolean. The moment the signed-in id changes —
sign-out, sign-in, or switching accounts in the same tab — `matches`/`meta`/`nextCursor`
clear to empty/idle *before* any fetch for the new identity can resolve. A request-token
ref additionally guards against a slow response for an already-abandoned user id landing
after a newer request resolved. The fetch itself is lazy (only on sheet-open), not
on every My World mount.

---

## 10. UI states

All eight required states are implemented in the Smart Match sheet
(`LibraryTab`, search anchor `Smart Match sheet`):
loading (skeleton, no placeholder names), mutual match, one-way opportunity, no
matches (honest, with concrete next steps), incomplete records (counted + explained
inline, never silently dropped), error (retry, no fallback fake data), free-user gate
(real ISO count only, no fake blurred users/percentages), VIP access (real results or
a real empty state). Tapping the entry button now opens the same sheet for both free
and VIP users (previously free users skipped straight to the upgrade modal and never
saw the feature described) — the free-gate state was added inside the sheet itself per
the mission's UI-states requirement.

---

## 11. QA matrix — real HTTP + live browser round trip

**Method:** the local dev servers were run against the real production Supabase project
(confirmed `[Backstage API v1.16.0] Starting in PRODUCTION mode` in the backend boot
log, not mock mode), using a copy of the root `.env` placed only in this worktree for
the duration of QA, deleted immediately afterward (never read, printed, staged, or
committed — see §15). Three real, persistent QA accounts (`pip_qa`, `pip_qa2`, and a new
`pip_qa3` created for this pass — see the `qa-test-accounts` memory) were used with
minimal fixture `user_cards` rows tagged `notes='SMART_MATCH_QA_FIXTURE'`, driven through
the actual browser UI (Claude Browser pane) and, for authorization edge cases, direct
`fetch()` calls executed in-page using the real signed-in session's own token (never
logged or printed). All fixtures, temporary blocks, and account-setting changes made for
testing were reverted afterward (§15).

| # | Case | Result |
|---|---|---|
| 1 | Scenario A — mutual exact match, browser as `pip_qa` | ✅ `GET /api/smart-matches` → 200, `pip_qa2` shown as **Mutual Match** with the correct 1+1 compatible cards and real explanation text, no percentage |
| 2 | Scenario A reciprocal, browser as `pip_qa2` | ✅ isolated real data (`2 Owned/1 Wanted/1 Tradeable`, not `pip_qa`'s numbers) confirmed on My World before opening the sheet |
| 3 | Scenario B — one-way, browser as `pip_qa` | ✅ `pip_qa3` shown as **One-Way** with the real "no reciprocal match... isn't an agreement to trade" copy |
| 4 | Scenario B, `pip_qa3` receives no false reciprocal | ✅ confirmed via direct HTTP as `pip_qa3` (`total_count: 0`) and via the live VIP empty state (below) |
| 5 | Scenario C — no match / honest empty state, browser as `pip_qa3` (temporarily flipped to VIP to reach the true empty state, then reverted) | ✅ "No matches yet — No other collector currently has a tradeable card matching your 1 ISO card. Try: ... 1 of your cards are missing identity details..." — real counts, real tips, no fabricated match |
| 6 | Detail route re-verification, `GET /api/smart-matches/:matchedUserId` | ✅ tapping "See matching cards" on the mutual match issued a real `GET /api/smart-matches/1f90c443-...` → 200, payload matched the list exactly |
| 7 | Detail route only returns compatible cards, not full inventory | ✅ confirmed — response contains only `their_cards_you_want`/`your_cards_they_want`, never all of the matched user's cards |
| 8 | View Profile next action | ✅ real navigation to `@pip_qa2`'s actual public profile via the existing `onViewProfile` flow (real bio/groups/card counts rendered) |
| 9 | Message next action | ✅ opened the **existing real DM thread** with `pip_qa2` (no duplicate thread created) via the same `backstage_dm_target` + `go("chats")` entry point every other Message button uses |
| 10 | Add Friend next action | ✅ real `POST /api/friends/request` → 200, button changed to "Requested"; verified against `pip_qa3` (not already friends, unlike `pip_qa`/`pip_qa2`) |
| 11 | Blocked-user exclusion, real HTTP | ✅ inserted a real temporary block `pip_qa → pip_qa2`; a same-session authenticated `fetch()` to `/api/smart-matches` returned only `pip_qa3` (1 match, not 2); removed the block; `pip_qa2` reappeared |
| 12 | Status invalidation, real HTTP, both routes at once | ✅ flipped the matched `for_trade` card to `owned`; **the same session's** next `GET /api/smart-matches` dropped `pip_qa2` entirely, and `GET /api/smart-matches/1f90c443-...` returned `404 { "error": "No match found for this collector" }` immediately — no reload, no delay; restored the status, both returned to 200/mutual |
| 13 | Unauthenticated request denied | ✅ `GET /api/smart-matches` with no `Authorization` header → `401 { "error": "Missing auth token" }` |
| 14 | Malformed `matchedUserId` denied safely | ✅ `GET /api/smart-matches/not-a-uuid-at-all` → `400 { "error": "Invalid user id" }`, before any query |
| 15 | Valid **unrelated real account** id | ✅ `GET /api/smart-matches/0911b6d3-...` (a real, unrelated, non-blocked, discoverable production account) → `404`, byte-identical body to the nonexistent-UUID case — cannot be used to probe account existence |
| 16 | Self id supplied as `matchedUserId` | ✅ `GET /api/smart-matches/4c0de4bc-...` (caller's own id) → same `404`, same message as #15 and the nonexistent-UUID case — no distinguishing signal |
| 17 | Nonexistent (but syntactically valid) UUID | ✅ `GET /api/smart-matches/00000000-...-000099` → same `404`, same message |
| 18 | Requester id cannot be overridden by the client | ✅ structural — `req.userId` is the only source used for the "my cards" query in every test above; there is no code path that reads a requester id from the request; unit-tested via source audit |
| 19 | Account-switch isolation, sign-out → sign-in, no reload | ✅ A→B: signed out of `pip_qa`, signed into `pip_qa2` with no page reload — My World immediately showed `pip_qa2`'s own real numbers, free-gate showed only `pip_qa2`'s real ISO count (1), no `pip_qa` identities ever rendered. B→A: reverse direction repeated, `pip_qa`'s own real numbers (`25/8/2`) and real matches returned correctly, no `pip_qa2`/`pip_qa3` bleed |
| 20 | Reload returns the correct account's results | ✅ reloading mid-session (forced when flipping `pip_qa3` to VIP) preserved the session and re-fetched the correct account's own data |
| 21 | 375px viewport | ✅ live screenshot, no overflow, sheet and My World render cleanly |
| 22 | 390px viewport | ✅ live screenshot (used for the majority of this pass) |
| 23 | Pearl mode (light theme) | ✅ live screenshot — sheet background/text/close control all legible, correct light-theme colors |
| 24 | Concert mode (dark theme) | ✅ live screenshot — default theme throughout the rest of the pass |
| 25 | Visible close control | ✅ `✕` present top-right of the sheet in every state, live-verified in both themes |
| 26 | Loading, empty, error states | ✅ error state specifically forced live by monkey-patching `window.fetch` to reject only `/api/smart-matches` calls, confirming "Couldn't load Smart Matches" + "Try again" with **no fallback fake data**; unpatched, "Try again" recovered to the correct real empty state |
| 27 | Free-user gate reveals no private match details | ✅ code-reviewed and live-observed: the gate renders from the client's already-known ISO count with **no network call to `/api/smart-matches`** for a free account (verified both by code — the fetch is gated on `isVip` — and by the rendered DOM showing zero match identities) |
| 28 | VIP users with no matches get an honest empty state | ✅ #5 above, live |
| 29 | Duplicate compatible records don't duplicate users/cards | ✅ unit-tested + live payloads showed exactly one entry per real distinct card row |
| 30 | Response field names / no email / no private notes | ✅ live payloads (§7) contain only `id, handle, display_name, avatar_url, is_vip` for the user and `id, group_name, member, album, version, card_type, image_url` per card — no email, no `notes`, no `description` |

**Bonus organic confirmation:** `pip_qa2`'s fixture ISO card for BLACKPINK/Rosé/Born
Pink/Standard Ver. organically matched a *real, pre-existing* production user's real
inventory (unrelated to any fixture, over real HTTP) with the identical card —
independent evidence the matching logic generalizes correctly against genuine
production data, not just the constructed fixtures.

---

## 12. Query performance (measured live)

**Database (`EXPLAIN ANALYZE` against production):**

| Query | Plan | Rows | Execution time |
|---|---|---|---|
| My own cards (`user_id = $1`) | Seq Scan | 22 of 30 | 0.118 ms |
| Other users' candidate cards (`user_id != $1 AND status IN (...)`) | Seq Scan | 4 of 30 | 0.088 ms |

Both sub-millisecond; the planner correctly chooses a sequential scan over an index at
this table size (~30 rows) — adding an index now would add write overhead for zero
read benefit. **No index was added.** Revisit if `user_cards` grows large enough that
`EXPLAIN ANALYZE` on these two shapes stops showing a trivial cost — a straightforward
follow-up (e.g. `CREATE INDEX ON user_cards (status) WHERE status IN ('iso','for_trade','duplicate')`)
when that day comes, not before.

**HTTP (measured live via the browser's network panel, local Express → real Supabase):**

| Route | Response | Payload size | Notes |
|---|---|---|---|
| `GET /api/smart-matches` (2 matches) | 200 | ~1.0 KB uncompressed | single GET, no duplicate calls observed for a single sheet-open |
| `GET /api/smart-matches/:matchedUserId` | 200 | ~0.4 KB uncompressed | fired once per card expand ("See matching cards"), not prefetched for every card in the list |
| `GET /api/smart-matches/:matchedUserId` (404 cases) | 404 | ~0.06 KB | uniform tiny error body |
| `GET /api/smart-matches` (401/400 cases) | 401 / 400 | ~0.04 KB | uniform tiny error body |

No duplicate/redundant calls were observed for a single user action (one list fetch per
sheet-open, one detail fetch per card expand, each exactly once). Response payload size
at V1 scale is negligible for any realistic beta-scale result set.

---

## 13. Known limitations / what wasn't done

- **Load/concurrency testing was not performed** — out of scope per the mission brief
  ("do not perform destructive or excessive load testing"), and not meaningful at
  current production scale (30 `user_cards` rows, 17 users).
- **Push-notification and native-device behavior** are unrelated to this feature and
  were not touched or tested.
- Video/audio, Stripe checkout, and other unrelated subsystems were not exercised —
  out of scope for this change.
- The three QA accounts' persistent settings (`pip_qa3.is_vip`, Pearl Mode) were
  temporarily changed mid-session to reach otherwise VIP-gated/light-theme states and
  were explicitly reverted afterward (§15) — confirmed via SQL and via the app's own
  Settings screen, not just assumed.

## 14. V2 ideas (explicitly out of scope for V1)

- Partial identity matching (e.g. group+member+album without version) with a clearly
  lower-confidence label, once there's real usage data to judge the false-positive rate.
- A dedicated `smart_match_preferences` opt-in/out separate from the general
  `discoverable` flag.
- A SQL/RPC-based join once `user_cards` volume makes the in-memory join meaningfully
  slower than a database-side query.
- Requiring an active `trade_listings` row (proof photo, description) as an additional
  trust signal before a `for_trade`/`duplicate` card counts as matchable.
- Surfacing match freshness/recency more visibly in the UI (currently used only for
  internal sort order).
- City/location-aware ranking, once there's an explicit, user-granted permission model
  for it (out of scope per the mission brief's explicit prohibition on using location
  without permission).

---

## 15. Local QA environment & fixture cleanup

A copy of the root `.env` was placed in this worktree only, for the duration of the live
HTTP/browser QA pass in §11:

- Copied via a raw file copy (`cp`) — contents were never opened, read, printed, or
  logged at any point.
- Confirmed gitignored **before** starting (`git check-ignore -v .env` → matched
  `.gitignore:11`).
- Never staged or committed — confirmed via `git status` throughout, and via
  `git log --all --diff-filter=A --name-only -- .env` (empty — `.env` was never added in
  any commit on this branch's history).
- The original root `.env` was not modified.
- Deleted immediately after QA completed; confirmed absent (`ls .env` → no such file).

Database fixtures created for §11, all confirmed removed after testing:

| Item | Cleanup confirmation |
|---|---|
| 8 `user_cards` rows tagged `notes='SMART_MATCH_QA_FIXTURE'` | `SELECT count(*) ... = 0` |
| Temporary block `pip_qa → pip_qa2` | Removed mid-test to prove restoration; final count `= 0` |
| `pip_qa3.is_vip` (temporarily `true` to reach the VIP empty state) | Reverted to `false` (its designed persistent free-tier role); `vip_source` cleared |
| `pip_qa3` Pearl Mode (temporarily enabled to screenshot light theme) | Reverted to off (Concert Mode default) via the app's own Settings screen |
| Friend request `pip_qa → pip_qa3` (created by the live Add Friend test) | Deleted — confirmed `0` rows |
| `discoverable` on all three QA accounts | Confirmed `true` (untouched net of the temporary toggle tested in the SQL-simulation pass, which was also reverted) |

No other users' data was read, altered, or touched. The two local dev servers
(`backstage-v16-api`, `backstage-v16`) were stopped after QA.

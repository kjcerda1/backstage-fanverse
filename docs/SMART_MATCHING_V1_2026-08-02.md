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

### `GET /api/smart-matches/:userId`
Auth required. Detail for one matched collector — recomputes and re-authorizes from
scratch (never trusts a client-cached match), so a since-blocked relationship can't leak
stale data. `:userId` is validated against a UUID shape (400 on malformed input, before
any query runs) and rejects `userId === req.userId` (400). 404 if that user isn't
actually a match for the caller right now.

### Next actions (no new endpoints — reuse what exists)
- **View profile** → `onViewProfile({ id, username, display_name, fandoms:[] })`, same
  shape used by every other profile-tap surface in the app.
- **Message** → `ls.set("backstage_dm_target", fan); go("chats")`, the exact entry point
  `FanverseFloatingDock.openThread` already uses.
- **Add friend** → `POST /api/friends/request` (existing route, unchanged).

---

## 8. Authorization & privacy

- Requester id is always `req.userId` from the verified JWT — grepped and unit-tested
  (`tests/smart-matching.test.js`) that neither route ever reads a requester id from
  `req.body`/`req.query`/`req.params`.
- `GET /api/smart-matches/:userId` cannot be used to enumerate arbitrary users into a
  full profile — it only returns a payload if a real match already exists for the
  caller; otherwise 404. It does not return "their whole inventory," only the specific
  cards that satisfy the identity match.
- Response fields are the same minimal public subset the rest of the app already
  returns for a matched user (`id`, `handle`, `display_name`, `avatar_url`, `is_vip`) —
  no email, no auth internals beyond the same `users.id` UUID already used app-wide as
  the routing key for DMs/friend-requests/profile views (not a new exposure boundary).
  Card fields exclude `notes` and `description` (private free-text) — unit-tested.
- Blocked users are excluded before their profile is ever fetched (`getBlockedUserIdSet`
  runs before the `users` query, not as an after-the-fact filter).
- Malformed `:userId` fails with 400 before touching the database.

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

## 11. QA matrix

Three real, persistent QA accounts (`pip_qa`, `pip_qa2`, and a new `pip_qa3` created for
this pass — see the `qa-test-accounts` memory) were used with minimal fixture
`user_cards` rows, tagged `notes='SMART_MATCH_QA_FIXTURE'` for clean removal, verified
against **live production data** via direct SQL simulation of the exact query/join shape
`computeSmartMatches()` runs, then fully cleaned up afterward (fixture rows deleted,
temporary block removed, `discoverable` restored). See §13 for why this was SQL-level
rather than an HTTP round-trip.

| # | Case | Result |
|---|---|---|
| 1 | Scenario A — mutual exact match (`pip_qa` ⇄ `pip_qa2`) | ✅ both directions return `mutual`, 1 compatible card each way |
| 2 | Scenario B — one-way (`pip_qa` ISO satisfied by `pip_qa3`, no reciprocal) | ✅ `pip_qa` sees `pip_qa3` as `one_way`; `pip_qa3` sees **zero** matches (no false reciprocal) |
| 3 | Scenario C — no match (unrelated identity) | ✅ `pip_qa3`'s unrelated ISO card matches nobody |
| 4 | Current user never matches themselves | ✅ structural (`user_id != req.userId` in the candidate query) + unit-tested |
| 5 | Duplicate result suppression | ✅ unit-tested — real distinct rows show as distinct cards, never inflated or deduped incorrectly |
| 6 | Exact vs. partial identity / incomplete records excluded | ✅ a `for_trade` card with `version = NULL` (real fixture) never matched anything, live |
| 7 | Status removed → match disappears | ✅ unit-tested |
| 8 | Status added → match appears | ✅ unit-tested |
| 9 | Tradeable removed → match disappears | ✅ unit-tested |
| 10 | ISO removed → match disappears | ✅ unit-tested |
| 11 | Account switching / reload isolation | ✅ code-reviewed against the live-verified F14 pattern (§9) — not independently re-run in a live browser this session (see §13) |
| 12 | Blocked-user exclusion | ✅ live: inserted a real temporary block `pip_qa → pip_qa2`, confirmed `pip_qa2` disappeared from `pip_qa`'s results, removed the block, confirmed it reappeared |
| 13 | `discoverable = false` exclusion | ✅ live: flipped `pip_qa3.discoverable` false, confirmed exclusion, restored true |
| 14 | Malformed `:userId` | ✅ unit-tested (400 before query) |
| 15 | Another user's id supplied as requester | ✅ structural — requester id is never read from client input (unit-tested via source audit) |
| 16 | Pagination/limit behavior | ✅ code-reviewed (`limit` clamp 1–50, base64 offset cursor, `next_cursor: null` at end) — trivial to exercise at 30 total rows, not separately load-tested |
| 17 | Empty state | ✅ implemented, code-reviewed |
| 18 | Error state | ✅ implemented, code-reviewed |
| 19 | 375px / 390px, Pearl/Concert modes | ⚠️ **not independently re-verified in a live browser this session** — see §13 |
| 20 | Profile/DM next action | ✅ code-reviewed — reuses the exact existing `onViewProfile`/`backstage_dm_target` entry points used elsewhere in the app |
| 21 | No fabricated result under any condition | ✅ — every UI string is either a static description of the feature or built from real API fields; no percentages, no placeholder names, no fallback fake matches on error |

**Bonus organic confirmation:** while testing, `pip_qa2`'s fixture ISO card for
BLACKPINK/Rosé/Born Pink/Standard Ver. organically matched a *real, pre-existing*
production user's real inventory (unrelated to any fixture) with the identical card —
independent evidence the matching logic generalizes correctly against genuine
production data, not just the constructed fixtures.

---

## 12. Query performance (measured live, `EXPLAIN ANALYZE` against production)

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

Response payload size at V1 scale: a handful of matches × a handful of cards each —
negligible (well under 10 KB uncompressed for any realistic beta-scale result set).

---

## 13. Known limitations / what wasn't done

- **No live HTTP round-trip through the running Express server against production** was
  performed in this session. `api_server_v16.js` requires `SUPABASE_SERVICE_KEY` to run
  in non-mock mode, which only exists in `.env` — a file this repo's `CLAUDE.md` lists
  under "never touch" (never read/copy/print). Verification was instead done via (a) 26
  unit tests mirroring the exact backend logic byte-for-byte
  (`tests/smart-matching.test.js`), and (b) direct SQL simulation of the identical
  query/join shape against real production data and real (cleaned-up) fixture rows
  (§11). This is a real gap relative to a true end-to-end proof and should be closed
  with a live authenticated browser pass (using the `pip_qa`/`pip_qa2`/`pip_qa3`
  credentials) the next time this branch is reviewed in an environment with the real
  `.env` available.
- 375px/390px and Pearl/Concert visual verification was **not** independently re-run in
  a live browser this session (same `.env` constraint prevented a real authenticated
  session) — the new sheet states reuse the same layout primitives (`VS.glowCard`,
  `VS.activePill`, the existing bottom-sheet shell) as the rest of My World, which are
  already proven in both themes/viewports, but this is a code-review inference, not a
  fresh visual confirmation for this specific sheet.
- Full-app regression (signup, sign-out, all 5 tabs, VIP modal, etc.) was verified by
  code review only — this change is additive and isolated to two new backend routes and
  one sheet's internals, with no edits to auth, navigation, or any other tab's code.
  `npm run build` is clean and both pre-existing test suites still pass unmodified.

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

# My World — Product Efficacy Audit

**Date:** 2026-07-26
**Base:** branch `claude/my-world-collection-hierarchy-66ecc4` @ `b732e04`; local `main` == `origin/main` (clean).
**Method:** read-only code recon + live mobile walkthrough (375–390px) run locally in **MOCK_MODE** via the Demo Fan path — no auth, no `.env`, no production data touched. No SQL run.

---

## The verdict

My World is not one collection with many views. It is several parallel storage systems wearing one skin, and their numbers already disagree on screen. The code says so itself — `LibraryTab` (`src/App.jsx:6526`):

> *"stats stay labeled a 'snapshot' since they still sum three separate sources (user_cards, pcSetData, era boards) — see Phase 3 data-model plan before calling this a single source of truth."*

The same demo collection reports **100%** on the hero ring and **6–14% per group** in the Binder Progress modal, one tap apart.

**Good news:** the correct foundation already exists in the database and is being bypassed by the frontend:
- `user_cards` already has a **`quantity`** column (POST + PATCH both accept it); the Add Card UI just never exposes it.
- A real **`card_templates` / `template_cards`** catalog exists with honest trust labels (`source_label`, `status:'fan_submitted'`, `completeness`).
- **`/api/binders/from-template`** already does the right "add from catalog → seed `user_cards` (status `missing`)" flow.
- The frontend renders a hardcoded 12-item `PC_CATALOG_SETS` array + a localStorage blob **instead of** using any of the above.

So this is primarily an **information-architecture + frontend consolidation** job — fix in place, not a rebuild.

---

## 1. Current user journey

1. Enter **My World** (bottom nav). Hero ring shows a "snapshot" %, then a VIP upsell, then a dismissible "My Binders" notice.
2. **Four stacked horizontal nav tiers** appear before a single card is visible:
   - Tier 1 — section pills: Binders · Saved · Wishlist · Trades · Scrapbooks · Memories · Capsule Memories · Era Rooms · Achievements (9)
   - Tier 2 — My Binders | All Cards
   - Tier 3 — My Cards | Templates (only under All Cards)
   - Tier 4 — group filter: All Groups | Stray Kids | BTS | …
3. Primary "start collecting" CTAs are **Use Template / Custom**, plus the floating **`+`**, plus **Browse Templates** inside the `+` sheet — several doors to overlapping outcomes.
4. Tapping the hero ring opens a **Binder Progress** modal whose numbers contradict the ring.
5. Adding a card = a single mutually-exclusive **status** radio + free-text Group/Album/Version/Member + **no quantity field**.

## 2. Preview evidence

| # | Screen | Observation |
|---|---|---|
| E1 | My World landing | Hero ring **100% · 6 Owned · 0 Wanted · 3 Tradeable**. `completion = owned/(owned+wanted)`; with 0 wanted it's always 100%. Wishing for a card *lowers* completion. |
| E2 | Binder Progress modal (same data) | Stray Kids 6% · BTS 7% · NewJeans 9% · aespa 14%. Contradicts E1. |
| E3 | All Cards vs Templates | All Cards shows an owned BTS Jimin; "BTS Proof" set shows 0/7 owned. Same collection, two numbers. |
| E4 | Add Card form | Status is a single radio; "×2 Duplicate" is a status not a count; no quantity field; Group/Album/Version/Member are free text. |
| E5 | `+` sheet | Four add paths writing to three stores. "Browse Templates → official templates" mislabels a hardcoded frontend array as official (operating rule #12). |
| E6 | Catalog coverage | ATEEZ absent from onboarding quick chips, `PC_CATALOG_SETS`, and group filter — the test group can't use "Use Template." |
| E7 | Nav depth | Four stacked nav tiers before content; bottom nav + `+` overlay modals and overlap tiles. |
| E8 | Robustness | No-backend "Loading binders…" hangs; tapping a set reset sub-tab + jumped scroll to top; "Open My World" from welcome hub routed to Feed. |

## 3. Current system map

| Surface | Fan believes | Reads | Writes | Canonical? |
|---|---|---|---|---|
| Binder Progress ring / snapshot (`LibraryTab`) | Overall completion | sums `user_cards` + `pcSetData` + era boards | — | ❌ derived, contradictory |
| All Cards → My Cards (`PhotocardGrid`) | My cards | `user_cards` via `useUserCards` | `/api/cards` | ✅ real store |
| All Cards → Templates (`PhotocardSetsView`) | Set checklists | `PC_CATALOG_SETS` (hardcoded) + `pcSetData` (localStorage) | localStorage; Phase-3b write-through to `user_cards` | ⚠️ parallel/legacy |
| My Binders (`useBinders`/`BinderDetail`) | My collection | `binders` table | `/api/binders`, cards via `/api/cards` | ⚠️ container |
| Binder Progress modal | Dashboard | same 3 sources, different math | — | ❌ 2nd derived view |
| Wishlist / ISO | Wanted list | `user_cards` `status='iso'` + `pcSetData 'wishlist'` | card patch | ⚠️ split |
| Trades / Trade Hub | For-trade | `user_cards` `for_trade`/`duplicate` + `pcSetData` + `trade_listings` | `/api/trade-listings` | ⚠️ blended |
| Era Rooms (`EraRoom`) | Era shrine | `ERA_MEMBERS` + `backstage_era_*`; member-wishlist → `user_cards` | localStorage + jsonb + some `user_cards` | ⚠️ repeats album/member/wishlist/POB/dupe |
| Backend, bypassed | — | `card_templates`+`template_cards` (trust-labeled), `/api/binders/from-template`, `collections` jsonb | — | 🟢 the right foundation, unused |

**Overlapping stores (up to 8):** `user_cards` · `binders` · `pcSetData` (localStorage) · `PC_CATALOG_SETS` (hardcoded) · `card_templates`/`template_cards` (DB, unused) · `collections` (DB jsonb, orphaned) · `users.my_world` jsonb · `backstage_era_boards_v2`/`users.era_boards`.

## 4. Duplication matrix

| A ↔ B | Why confusable | Same data or view? | Recommendation |
|---|---|---|---|
| Binder ↔ Photocard Set | Both "a place my cards live" | different stores, same cards | Binder = optional view; Set = catalog inclusion in a release; `user_cards` is truth |
| Photocard Set ↔ Template | tab "Templates," header "Photocard Sets" | same (`PC_CATALOG_SETS`) | Templates = setup action, not a tab |
| PC_CATALOG_SETS ↔ card_templates | both "the catalog" | two catalogs; UI ignores the DB one | DB `card_templates` = single catalog |
| All Cards ↔ Binder Progress | both claim completeness | same data, contradictory math | merge into one Overview |
| Binder Progress ↔ hero ring | two completion numbers | same data, two formulas | one completion service |
| Wishlist ↔ ISO | interchangeable | same concept, 2 stores | one derived filter (`wanted_quantity>0`) |
| Duplicate ↔ Tradeable | dupe auto-treated as tradeable (`:6343`) | conflated statuses | derive both from quantities |
| Era Room ↔ Group/Album/Wishlist | Era Room re-lists checklist/members/wishlist/POB/dupes | overlapping views | auto-generate; hold no collection state |
| `collections` table ↔ `user_cards` | both "collection" | `collections` orphaned | confirm unused; deprecate |

**Proposed IA — adopt, with two additions:** (a) "Saved" is feed-saves, not collection — move it out; (b) Albums and Photocards need **separate completion meters**.

## 5. Severity-ranked findings

**BLOCKER — data integrity**
- **B1.** Totals summed from ≥3 stores and contradict on screen (E1 vs E2; E3). No single source of truth.
- **B2.** Status is one mutually-exclusive field, so "own 2, keep 1, trade 1" is unrepresentable — yet `user_cards.quantity` already exists and the UI discards it.

**HIGH**
- **H1.** Catalog identity is free-text; matching is exact-string ("Standard Ver." ≠ "Standard") → fragmented totals + unmatchable trades.
- **H2.** `completion = owned/(owned+wanted)` is incoherent as collection completion; wishing lowers it.
- **H3.** Smart Match is a hardcoded fake feed (`@trademaster` 94%, `@kpopswap` 87%) — the thing explicitly not to build.
- **H4.** Frontend bypasses the real DB catalog + `/api/binders/from-template` for a hardcoded array + localStorage.
- **H5.** Four stacked nav tiers; Templates/Custom presented as a primary destination.

**MEDIUM**
- **M1.** "Browse Templates → official templates" mislabels unverified data as official (rule #12).
- **M2.** Album vs photocard completion conflated ("Standard Ver. 0/24" counts photocards, not albums).
- **M3.** Bottom nav + `+` overlay collection modals; not focused workflows.
- **M4.** ATEEZ (and any group beyond the 6 hardcoded) has no catalog path.
- **M5.** "Custom Era 0/0" and empty states are dead ends.

**LOW**
- **L1.** "Loading binders…" hangs with no backend. **L2.** Sub-tab/scroll resets on interaction. **L3.** "Open My World" routes to Feed. **L4.** `section==="museum"` is dead code with hardcoded fake tile counts.

## 6. Recommended My World IA (mobile)

```
My World
├── Collection            ← default
│    ├── Overview   (promoted Binder Progress: one ring + album/PC/POB meters)
│    ├── Groups     (ATEEZ, BTS, aespa, … → group page)
│    ├── Albums     (releases & versions owned/wanted)
│    └── Photocards (every card; search + filter)
├── Wishlist   (filtered view: wanted_quantity > 0)
├── Trades     (filtered view: for_trade_quantity > 0  ⇄  listings)
└── Scrapbooks

Group page (ATEEZ):   Overview · Albums · Photocards · ISO · Trade
Release page (Golden Hour: Part.1):  versions come from the CATALOG (never assume 6)
   → Album completion:   4 of 6 versions
   → Photocard completion: 18 of 48 cards      (tracked SEPARATELY)

The one +  →  Search Catalog · Scan/Import · Add Custom
   (Templates live *behind* Search Catalog — the fan never sees the word "template")
```

**Dispositions:** Binder Progress → Collection Overview. Templates → setup flow behind Search Catalog (DB `card_templates`). Era Rooms → auto-generated, no own state. Binders → optional custom view (removing a card from a binder must not delete it). Photocard Sets → inside a release. All Cards → Photocards view.

## 7. Canonical data model

Hierarchy: **Group → Era/Series → Release → Album Version → Photocard Set/Inclusion → Photocard → User item state.**

Most tables already exist. Change: (a) make `card_templates`/`template_cards` the catalog spine; (b) give `user_cards` quantity-aware state + a catalog FK; (c) derive the rest.

Per-item user state (replaces single `status`):
| Field | Source | Notes |
|---|---|---|
| `catalog_card_id` (nullable) | FK → `template_cards` | null ⇒ custom/unlisted (POB not in catalog) |
| `owned_quantity` | stored | already exists as `quantity` |
| `for_trade_quantity` | stored | ≤ owned_quantity (validate) |
| `wanted_quantity` / `iso` | stored | drives Wishlist |
| `condition`, `source/store`, `purchase_date`, `notes` | stored | partly present |
| `is_duplicate` | derived = `owned_quantity > keep_quantity` | never manual |
| `missing` | derived = in catalog set ∧ `owned_quantity=0` | never stored as empty rows |

Album vs photocard completion = separate rollups over `template_cards.card_type` (`album` vs `photocard`/`pob`). Migration: keep existing rows working (`status`→quantities: owned→own1, duplicate→own2, for_trade→own1/trade1, iso→wanted1), backfill `catalog_card_id` by exact-string match, dedupe promoted `pcSetData` (the `getSanitizedSetData` logic exists), preserve RLS. **Not run in this phase.**

## 8. Smart Match design (deterministic first)

Replace the fake feed with a backend engine matching on **structured identity, not AI**:
- **Exact catalog match:** my `wanted_quantity>0` on `catalog_card_id` ↔ another user's `for_trade_quantity>0` on same id → *Exact*.
- **Custom-item match:** both `catalog_card_id IS NULL`, group+member+version+store agree → *Possible, needs confirmation*.
- Match on **available quantity** (never total owned); honor blocks, privacy/discovery, shipping range, active-trade locks, stale-listing filters. Reciprocal and one-way ("someone has your ISO") are separate result types.
- AI's only role: normalize messy free-text listings into a candidate `catalog_card_id` the user confirms — never auto-"exact," never inventing variants/rarity/value.
- Backend: `/api/matches`, `/api/matches/refresh`, dismiss/save-preference; notifications reuse `deliverNotification()`. Delete the hardcoded modal.

## 9. Collector Assistant design

Add a dedicated, narrowly-scoped **`/api/ai/collector-assistant`** (reuse the existing `/api/ai/assistant` VIP/free limiter + grounding rules + `[[ACTION:collect]]` pattern; that route's context carries no collection data today).
- **Grounding:** a server-side context builder runs deterministic queries (completion, dupes, ISO, safe-to-trade = `owned - for_trade > keep`) and passes only counts/ids to the model. The model interprets language and explains; it never computes totals from free text.
- **Actions:** read actions answer ("what am I missing from this set?", "why 3/7?"); proposed writes ("log these 4 pulls") return a preview diff the fan confirms before any write. Answers link back to real items. Unverified catalog data labeled. No frontend AI calls; minimal context; graceful failure; collection works fully without AI.

## 10. Consolidation map

| Surface | Disposition |
|---|---|
| All Cards / My Cards (`user_cards`) | Keep as canonical → Photocards view |
| Binder Progress (ring + modal) | Merge → single Collection Overview |
| Wishlist / ISO, Trades | Convert to filtered views of quantity state |
| Templates / Photocard Sets / `PC_CATALOG_SETS` / `pcSetData` | Convert to setup flow (Search Catalog) via DB `card_templates`; migrate then deprecate |
| Binders | Keep as optional view (not source of truth) |
| Era Rooms | Generate automatically; strip collection state |
| `collections` jsonb table | Deprecate after confirming unused |
| Smart Match modal | Deprecate → deterministic engine |
| `section==="museum"` dead code | Remove |
| Saved (feed) | Move out of collection nav |

## 11. Phased implementation plan

| Phase | Scope | SQL? | Acceptance | Rollback |
|---|---|---|---|---|
| A — Source-of-truth & analytics integrity | One `computeMyWorldSummary()` selector; Overview + views + tracker read from it; fix completion math; separate album vs PC meters | No | Every screen shows identical totals; % is catalog-based | Frontend; revert commit |
| B — Simplified Collection nav | Collapse 4 tiers → Overview·Groups·Albums·Photocards; move Saved out; full-screen focused sheets | No | ≤2 nav tiers; no nav overlay on modals | Revert commit |
| C — Album/version tracking | Release page driven by catalog versions; album completion separate from PC | Maybe (catalog seed) | "4 of 6 versions" independent of "18/48 cards"; never assumes 6 | Flag |
| D — Quantity-aware photocards | Expose owned/for_trade/wanted; derive dupe/missing; migrate `status`→quantities; backfill `catalog_card_id`; retire `pcSetData` | Yes | Own-2-keep-1-trade-1 representable; no double counts; legacy rows intact | Additive cols; keep `status` in transition |
| E — Deterministic Smart Match | `/api/matches` on quantities + catalog ids; delete fake modal | Maybe (indexes) | Real reciprocal/one-way matches; zero hardcoded users | Flag |
| F — Grounded Collector Assistant | `/api/ai/collector-assistant` + context builder + confirm-diff writes | No | Answers cite real items; writes previewed; works w/o AI | Flag |
| G — Legacy cleanup | Deprecate `collections`, `PC_CATALOG_SETS`, museum dead code, era-room state | Maybe | No orphaned stores; one catalog | Staged after D |

Each phase: small, reviewable, `npm run build` green, verified in both Pearl and Dark modes before "done."

## 12. First safe implementation slice

**Phase A, step 1 — a read-only `computeMyWorldSummary()` selector (frontend only, no schema, no data change).**

One pure function computes owned / wanted / tradeable / album-completion / photocard-completion / overall-completion once, from a defined precedence (`user_cards` is truth; `pcSetData` counts only for slots not yet promoted — the `getSanitizedSetData` logic already exists). The hero ring, the Binder Progress modal, and every section read from it, and the completion formula becomes catalog-based (so wishing no longer inflates it).

Why first: it makes the contradictory numbers agree — the blocker you actually see — with zero migration risk, fully revertible, establishing the single-source-of-truth contract Phases B–G build on. Nothing is deleted; behavior is preserved except the numbers stop lying.

---

## 13. User-confirmed Preview findings (2026-07-26) — required product behavior

These were confirmed by Kacy in a live Preview review and are treated as required behavior, implemented across Phase B commits.

1. **Group cards must deep-open the selected group.** In Binder Progress → Groups (and Overview group cards, and any "See all"), tapping a group (e.g. Stray Kids) must open that group's collection directly — header names the group, shows its real canonical collection (from `user_cards` + catalog, not a separate localStorage profile), with a clear back path. Never send the fan to a generic group selector or make them pick the group twice. Eventual group destination: Overview · Albums · Album Versions (under releases) · Photocards · ISO · Trade · completion summaries. For the B1 slice, reuse the existing tracker group-focus surface — do not build a competing group system.

2. **No global "Versions" tab.** The contextless global Versions tab/section (Standard 0/24, Compact 0/7, …) is removed. Binder Progress nav = **Overview · Groups · ISO · Trade**. Album versions appear only inside their hierarchy: Group → Release/Album → Album Version (e.g. ATEEZ → Golden Hour: Part.1 → Ver. A / B / C / Digipack / Platform, from real catalog data). Never globally assume six versions. Underlying version data is retained, not deleted — only its presentation changes.

3. **"Templates" is not a user-facing concept.** Collector-facing vocabulary is **"Folders"** (or "Start from Catalog" for catalog-assisted setup). No visible "Templates" tab, no "Photocard Sets" heading, no "Use Template" button. Internal template/catalog tables, API routes, and `PC_CATALOG_SETS` stay named as-is (implementation detail). Long-term, evaluate folding Folders into Groups/Albums rather than keeping a standalone tab.

4. **Founding Fan Pass modal.** All three pricing cards (Monthly, Annual, Founding Fan Pass) belong to one translucent/glass family — no heavy dark-purple block for Founder (restrained gold/pink accents only). Close **X** is ≥44×44, high-contrast in both Pearl and dark, fixed in the modal header, never covered by floating nav. Availability copy is accurate and singular: real checkout CTA when checkout is enabled (`API_URL` set); one concise preview notice when preview-only. No duplicated "opening soon"; no enabled-looking plan selection followed by a contradictory disabled message.

5. **Custom "Create Binder" must work end-to-end.** Enter name → optional group → optional cover → Create → inline loading → persist through the canonical binder API/hook → return to My Binders, show (and preferably open) the new binder + success confirmation. On failure: keep form data, show inline error, never silently fail. Survives reload. Prevent duplicate creation from repeated taps. Works in both authenticated Supabase mode and Demo/mock mode (localStorage fallback — the established `MOCK_MODE` pattern, not a second storage system). Root cause of the dead button: `CustomBinderForm.save()` treated a `{binder:null, mock:true}` / non-JSON response as failure and silently reset `saving` with no fallback and no error.

6. **Binder cover photo** replaces the emoji/icon selector as primary binder identity (upload / preview / replace / remove / graceful default; color kept as subtle fallback). Must reuse the existing Supabase Storage helper (`/api/cards/upload-url` + `resizeImageForUpload`), store a URL reference (not base64 in a DB column), display consistently across My Binders / binder detail / group views / edit. **Requires an additive `binders.cover_url` column + wired POST/PATCH** — SQL needed, so this is gated on approval (Commit 4).

7. **Photocard image upload** already exists end-to-end for adds (`user_cards.image_url` + `/api/cards/upload-url` + `resizeImageForUpload` in `AddCardForm`). Verify + complete edit/replace/remove and grid/detail render. Preserve the distinction between a user-uploaded photo of the fan's real card, an external catalog image, and a placeholder gradient.

**Sequencing:** Smart Match and Collector Assistant stay later in the plan and must not be wired to the currently-duplicated collection data during this UI pass. The current hardcoded Smart Match preview (fake `@trademaster`/`@kpopswap`) is left untouched in this pass; in the later Smart Match phase it should be replaced by the deterministic engine (or, if it must remain visible before then, clearly labeled as a non-functional preview). No fake AI matching carousel or hardcoded fans.

## 14. Collection catalog research rule (standing)

The My World collector catalog must be built from verified, cross-referenced sources — not generic web summaries or AI guesses. For every group, release, album version, photocard set, POB, member version, platform edition, Japanese release, limited edition, and legacy/grandfathered collectible: verify metadata against **at least two credible sources** (prioritize official artist/label stores, official discographies, retailer listings, album packaging, and established collector databases/fan archives with strong community trust). Record source links, verification status, release region, edition type, and whether the item is active / out of print / discontinued / legacy / promotional / fan-submitted. Never label uncertain information as official. When sources conflict, do not silently pick one — flag the record for review and keep it out of the verified catalog until resolved.

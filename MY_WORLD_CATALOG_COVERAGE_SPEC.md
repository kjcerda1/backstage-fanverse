# My World Catalog Coverage Specification

**Status of this document: planning only.** No SQL, no import, no production mutation. Defines what a future research/ingestion pass must produce before any surface in the app is allowed to claim a numeric completion percentage or "N cards away" figure derived from catalog data.

Related: [[my-world-collection-audit]] / repo `MY_WORLD_AUDIT.md` (why the current 5-seed `card_templates` catalog can't support this yet), [[my-world-catalog-rework]] (schema history), `MY_WORLD_CATALOG_RESEARCH.md` (prior ATEEZ source-map draft, unpromoted from `draft`), `supabase-catalog-provenance-migration.sql` (draft schema, not run).

---

## 1. Why this exists

"So Close! N cards away" (removed from My World in this pass — see the QA-correction summary) failed because it derived a completion claim from a raw cross-collection count with no catalog behind it. To ever bring a completion/gap claim back honestly, the app needs real catalog coverage with disclosed verification state per record — never inferred from "the fan owns some cards" or "one album exists in the seed table."

## 2. Entity schema to research and classify

For **every group**, produce:

### Group
- Canonical ID (stable slug) and canonical name
- Aliases (romanization variants, stylized casing, disbandment-era names)
- Activity status: active / hiatus / disbanded / soloist-only
- Members and former members (with join/departure dates where known)
- Sub-units (e.g. a 3-member sub-unit within a 7-member group) — tracked as their own group records with a parent link, not flattened into the parent

### Release
- Canonical release ID
- Title
- Release date
- Release type: single / EP / full album / repackage / compilation / OST contribution
- Market / territory: Korean / Japanese / other regional line
- Era / comeback name (kept as a distinct optional field from the release title — this is the exact conflation the Add Card form used to make)
- Ownership scope: full-group release vs. a member's solo/unit release

### Edition / version
- Standard
- Limited
- Member version (photocard-per-member variants of the same release)
- Digipack
- Platform-exclusive (e.g. a specific retailer or streaming-platform bundle)
- POCA / lightstick-bundle exclusive
- Jewel case
- Deluxe / repackage
- Regional edition (JP-only, etc.)

### Collectible set (the actual thing a fan is trying to complete)
- Album-inclusion photocards (the set that ships inside a given edition)
- Other inclusions (posters, stickers, postcards — tracked for completeness context, not photocard-slot math)
- POB (pre-order benefit)
- Store-exclusive (per-retailer variant)
- Lucky draw
- Fansign-event exclusive
- Broadcast-appearance exclusive
- Tour / concert-exclusive
- Promotional (non-retail giveaway)

### Verification record (attached to every release/edition/set row)
- Source URL(s) — minimum 2 independent sources before a row can leave `draft`
- Source tier (official label/artist channel > major retailer > established fan-database > unverified fan post)
- Verification status: see status language below
- Completeness status: whether the full card list for that set is known, partially known, or unknown
- Reviewer (who verified it)
- Last-verified date
- Conflict notes (where sources disagree — e.g. member-version count discrepancies)
- Print status: in-print / out-of-print (OOP) / legacy-and-unobtainable — affects whether "missing" should ever read as achievable

## 3. Status language (use exactly these terms, nothing improvised)

| Status | Meaning |
|---|---|
| **Not started** | No research has begun on this group/release. |
| **Researching** | Sourcing in progress; nothing in this record is usable for a completion claim yet. |
| **Partial** | Some editions/sets verified, others still open; a completion claim may only cover the verified subset, and the UI must disclose that it's partial. |
| **Audited** | Internally reviewed against ≥2 sources but not yet signed off by a second reviewer. |
| **Verified** | ≥2 independent sources agree, reviewed, dated, and safe to drive a real completion number. |

A group is never described as "complete" because one album exists in the table — completeness is scoped to the **specific release/edition/set**, never inferred upward to the group level.

## 4. What a UI is allowed to claim, and when

- A numeric "N cards away" or completion % may only render when the enclosing scope (a specific release+edition+set, or an explicit user-created checklist) is **Verified** (or **Partial**, with the partial scope disclosed in the copy).
- **Researching** / **Not started** / unsourced legacy seed rows (`card_templates` rows with `status:'fan_submitted'`, `may_include_gaps`) must never back a completion claim — they can still power browse/search UI, just not a numeric promise.
- A Trade-related CTA next to a completion claim must filter to that same verified scope's actual missing cards, or be hidden — never route to a generic, unfiltered page.

## 5. Recommended phased order

1. **ATEEZ — full pilot.** Exercises every entity type (has sub-unit history is minimal but has heavy JP-regional and POB/lucky-draw activity, and multiple member-version release patterns) — good stress test for the schema before scaling out.
2. **Currently-exposed / high-use groups next**, in order of live collector activity already observed in `user_cards` (per the most recent audit: aespa, BTS, Stray Kids, NewJeans, BLACKPINK — BLACKPINK notably has zero catalog rows today despite real user collection activity).
3. **Remaining onboarding-quick-chip groups** (17 groups currently listed in `ERA_MEMBERS`), lowest-activity last.
4. Re-verify the one known misclassification before trusting anything downstream of it: the live `card_templates` row `group_name:'BTS', album_name:'FACE'` is **Jimin's** solo album, not group BTS — flagged in `MY_WORLD_CATALOG_RESEARCH.md`, not yet corrected against the ≥2-source rule.

## 6. Explicitly out of scope for this document

- No SQL against any Supabase project (sandbox or production).
- No bulk import or fabricated/estimated card counts "to fill gaps."
- No changes to `card_templates` / `template_cards` or the draft `catalog_*` tables in `supabase-catalog-provenance-migration.sql`.
- No changes to any UI completion-claim logic beyond what's already covered by the "So Close" removal in this pass.

Research and classification against this spec is a separate, future, explicitly-approved task.

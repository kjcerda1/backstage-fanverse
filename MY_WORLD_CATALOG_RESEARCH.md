# My World — Catalog Research (Phase 1)

**Status: RESEARCH ONLY. Nothing here is written to Supabase.** This document is
the working record for the verified-catalog program. It maps to the schema in
`supabase-catalog-provenance-migration.sql`. No records are ingested until they
pass the workflow below.

> ⚠️ **The release/card lists in this file are a PRELIMINARY DRAFT compiled from
> general knowledge to give the next session a starting skeleton. They are
> `unverified` until confirmed against ≥2 credible sources from the source map.
> Do NOT ingest any row still marked `unverified`/`draft`. Do NOT treat this
> document as catalog truth.** Exact release dates, edition lists, and photocard/
> POB counts are deliberately left as "to verify" where they cannot be asserted.

---

## 1. Methodology & source tiers

Every catalog record needs **≥2 credible sources**, at least one Tier 1–2.
Findings are labeled: `verified` (≥2 credible sources agree) · `conflicting`
(sources disagree — hold out of verified, keep both notes) · `incomplete` (some
fields known) · `unverified`/`draft` (single/no source — this document's default).

| Tier | Source type | Examples |
|---|---|---|
| 1 | Official artist/label discography | KQ Entertainment, HYBE/label sites, official artist site/Wiki-of-record |
| 2 | Official store | Weverse Shop, official artist store, official JP store |
| 3 | Retailer/distributor packaging listings | Ktown4u, Withmuu, Music Korea, Makestar, YesAsia, CDJapan (JP) |
| 4 | Established collector DBs / checklists | reputable photocard checklist DBs, trusted community archives |
| 5 | Community submissions | fan posts — labeled, review-gated, never sole truth |

**Banned as sole truth:** AI summaries, resale/marketplace listings, isolated
fan posts. Do not claim a group/release "complete" without a release-by-release
audit against Tier 1–2.

---

## 2. ATEEZ — pilot (group_id → canonical "ATEEZ", slug `ateez`, agency KQ Ent.)

### 2a. Source map (consult in this order)
1. **KQ Entertainment official** discography + official ATEEZ site — Tier 1.
2. **Weverse Shop / official ATEEZ store** (KR + Global) — Tier 2, for editions.
3. **Official Japanese** (ATEEZ JP site / label JP) + **CDJapan** — Tier 1–3, JP releases.
4. **Ktown4u / Withmuu / Music Korea** product pages — Tier 3, packaging + POB inclusions.
5. **Established collector checklist DBs** — Tier 4, photocard set enumeration.
6. Cross-check discography spine on a wiki-of-record, then confirm each row on 1–4.

### 2b. Preliminary Korean release spine — **DRAFT / unverified, verify every row**
> Confirm exact `release_date`, `release_type`, and all `editions` per row on Tier 1–2.

| Era | Release (title) | ~Year | release_type | Status label |
|---|---|---|---|---|
| Treasure | Treasure EP.1: All to Zero | 2018 | mini_album | draft |
| Treasure | Treasure EP.2: Zero to One | 2019 | mini_album | draft |
| Treasure | Treasure EP.3: One to All | 2019 | mini_album | draft |
| Treasure | Treasure EP.Fin: All to Action | 2019 | album | draft |
| Treasure | Treasure Epilogue: Action to Answer | 2019 | special | draft |
| Fever | Zero: Fever Part.1 | 2020 | mini_album | draft |
| Fever | Zero: Fever Part.2 | 2021 | mini_album | draft |
| Fever | Zero: Fever Part.3 | 2021 | mini_album | draft |
| Fever | Zero: Fever Epilogue | 2021 | special | draft |
| The World | The World EP.1: Movement | 2022 | mini_album | draft |
| The World | The World EP.2: Outlaw | 2023 | mini_album | draft |
| The World | **The World EP.Fin: Will** | 2023 | album | ⭐ in catalog today (seed template, `may_include_gaps`) |
| Golden Hour | Golden Hour: Part.1 | 2024 | mini_album | draft |
| Golden Hour | Golden Hour: Part.2 | 2024 | mini_album | draft |
| Golden Hour | Golden Hour: Part.3 | 2025 | mini_album | draft — verify existence/date |

### 2c. Japanese / regional — **DRAFT / unverified**
> ATEEZ has a distinct JP discography (JP singles + JP albums) that MUST stay
> `region = 'JP'` and separate from KR. Known-of, all `draft`: *Treasure Ep.
> Extra: Shift the Map*, *Into the A to Z*, *Beyond: Zero*, *The World EP.Paradigm*,
> plus JP singles (*Limitless*, *NOT OKAY*, etc.). **Confirm the full JP list +
> dates on ATEEZ JP official / CDJapan before ingesting.**

### 2d. Editions / versions — **NOT yet audited**
Each KR release typically ships multiple versions (e.g. A/Z/Diary-type covers,
member versions, POCA, Digipack, platform, Weverse editions). **Not enumerated
here** — must be pulled per release from Tier 2–3 store pages. Never merge into
one generic "version."

### 2e. Photocards / POBs — **NOT yet audited**
Album inclusions + per-store POBs (Ktown4u, Withmuu, Weverse, Soundwave,
Makestar, etc.), plus lucky-draw / fansign / broadcast / event / tour cards.
**No counts asserted.** These are the hardest to verify and require Tier 3–4
per-store/per-checklist confirmation. Do not invent counts.

### 2f. ATEEZ preliminary coverage estimate
- Catalog today: **1 release** (The World EP.Fin) of an estimated **~15 KR
  releases + a separate JP line** → **rough KR coverage ≈ 1/15 (~7%)**, JP ≈ 0%,
  editions ≈ 0%, photocards/POBs ≈ 0% verified.
- Verified releases: **0** (the one seed row is `status=backstage`,
  `completeness=may_include_gaps`, not `verified`).

---

## 3. Other Phase-1 groups — coverage gaps (from live catalog vs known discography)

All five below have exactly **1 seed template, `may_include_gaps`, 0 verified**.
"Est. releases" is an order-of-magnitude reference to size the gap — **verify per
group during ingestion; do not treat these numbers as authoritative.**

| Group | In catalog | Est. KR releases | JP line? | Coverage flag |
|---|---|---|---|---|
| **aespa** | 1 (MY WORLD) | ~8–10 EPs/albums | yes (JP) | ~1/9 KR; JP 0%; strong user demand (21 user_cards) |
| **BTS** | 1 (FACE — misclassified as BTS group data; corrected 2026-07-28 to Jimin's first solo album, pending official-source re-verification) | large (group + many solo works) | yes | **Flag: FACE is Jimin's solo debut album — must be `is_solo=true`, `soloist_member_id` → Jimin, and NOT mixed into the BTS group catalog unless opted in.** This was previously misattributed to j-hope in this document; corrected on read-only DB audit, not yet confirmed against the ≥2-source workflow in §1. Group vs solo separation critical. |
| **Stray Kids** | 1 (5-STAR) | ~12–15 incl. repackages | yes (JP) | ~1/13 KR; JP 0% |
| **NewJeans** | 1 (Get Up) | ~4–6 | yes (JP) | newer group, smaller but active catalog |
| **BLACKPINK** | **0 (MISSING)** | ~6–8 (group) + heavy soloist work | yes | **Not in catalog at all despite 4 user_cards. Add canonical group in Phase-1 ingestion. Keep member soloist releases (Lisa/Rosé/Jennie/Jisoo) `is_solo=true`, separate.** |

### Data-quality flags found live
- `user_cards` casing drift: `"ateez"` (lowercase) vs catalog `"ATEEZ"`. The
  migration's alias/backfill (B1–B4) resolves this to a canonical `group_id`;
  frontend already matches case-insensitively.
- Groups exposed in-app but absent from catalog: **BLACKPINK, SEVENTEEN, TWICE**
  (onboarding/trending), plus all universal-list groups (ENHYPEN, TXT, NCT +
  units, EXO, SHINee, Red Velvet, ITZY, IVE, LE SSERAFIM, (G)I-DLE, BABYMONSTER,
  RIIZE, BOYNEXTDOOR, ZEROBASEONE …).

---

## 4. Recommended ingestion / reviewer workflow
1. **Research** (this doc) → fill release/edition/card rows with ≥2 sources each,
   attach `catalog_sources` (url + type + tier).
2. **Draft** rows land as `verification='in_progress'` (or `fan_submitted`).
3. **Review** — a reviewer confirms ≥2 credible (tier ≤4) sources agree, sets
   `verification='verified'`, `verified_by`, `verified_at`. Conflicts →
   `conflicting`, both source notes kept, held out of `verified`.
4. **Ingest** only `verified` rows to Supabase (never bulk-scrape). Run the
   migration's duplicate-detection SELECTs before each batch.
5. **Never** invent releases, versions, member sets, counts, POBs, or print
   status. Newly-debuted groups may be `incomplete` and labeled as such.

## 5. Recommended research order
- **Phase 1 (now):** aespa · ATEEZ (full pilot) · BTS (group vs Jimin solo split) ·
  Stray Kids · NewJeans · **BLACKPINK (add group)** — groups already in Backstage
  and/or collected by users.
- **Phase 2:** SEVENTEEN, TWICE, ENHYPEN, TXT, IVE, LE SSERAFIM, (G)I-DLE, ITZY,
  RIIZE, ZEROBASEONE, BABYMONSTER.
- **Phase 3:** legacy/inactive/disbanded, soloists, sub-units (NCT units, EXO,
  SHINee, Red Velvet …).
- **Phase 4:** long-tail community requests.

---

## 6. Handoff to next session
- Verify ATEEZ §2b/2c/2d/2e against the §2a source map (≥2 sources/row); promote
  confirmed rows out of `draft`.
- Confirm the **BTS FACE = Jimin solo** finding against ≥2 official-tier sources
  (this document previously and incorrectly said j-hope — corrected 2026-07-28
  during a read-only DB audit, not yet run through the §1 verification
  workflow) and set the group/solo split rule.
- Build the same source map + preliminary spine for aespa, Stray Kids, NewJeans,
  BLACKPINK.
- Still gated: no schema run, no ingestion, no write SQL, no push (see
  `[[my-world-catalog-rework]]`).

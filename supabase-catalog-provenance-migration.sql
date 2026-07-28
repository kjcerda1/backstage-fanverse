-- ═══════════════════════════════════════════════════════════════════════════
-- BACKSTAGE / FANVERSE — Universal Catalog + Provenance Migration (v1)
-- File: supabase-catalog-provenance-migration.sql
--
-- ⚠️  DRAFT FOR REVIEW — DO NOT RUN YET. ⚠️
--
-- Purpose: add a canonical, verifiable K-pop catalog that powers the universal
-- GroupCatalog page and gives Smart Match stable IDs instead of free-text names.
--
-- Design rules honored:
--   • ADDITIVE ONLY. Every statement is idempotent (IF NOT EXISTS / ON CONFLICT
--     DO NOTHING / ADD COLUMN IF NOT EXISTS). Running it changes no existing
--     row's data — it only adds new tables/columns and (in the optional backfill
--     block) seeds new tables from data already present.
--   • Existing card_templates / template_cards / user_cards / binders keep
--     working unchanged; new canonical FKs are all NULLABLE.
--   • Backend uses the Supabase service-role key, which bypasses RLS. RLS is
--     ENABLED on every new table with NO anon policies (read paths go through
--     api_server_v16.js). Add SELECT policies only if a direct anon client ever
--     reads the catalog.
--   • CHECK constraints (not native ENUM types) model controlled vocabularies so
--     values can evolve with a one-line ALTER instead of ENUM surgery.
--
-- Rollout order = top → bottom (Steps 1–9). A ROLLBACK block is at the bottom.
-- Verification-workflow context lives in MY_WORLD_CATALOG_RESEARCH.md.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── STEP 1 · GROUPS (canonical entity) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,                       -- display name, e.g. "ATEEZ"
  slug           text NOT NULL,                       -- lowercased key, e.g. "ateez"
  fandom_name    text,                                -- e.g. "ATINY"
  agency         text,                                -- e.g. "KQ Entertainment"
  debut_date     date,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','inactive','hiatus','disbanded','pre_debut')),
  logo_url       text,                                -- approved logo / cover only
  cover_url      text,
  parent_group_id uuid REFERENCES catalog_groups(id) ON DELETE SET NULL, -- for sub-unit acts
  is_soloist     boolean NOT NULL DEFAULT false,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_updated   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_groups_slug_key UNIQUE (slug)    -- one canonical slug per group
);

-- ─── STEP 2 · GROUP ALIASES (casing / romanization / typo normalization) ─────
-- Every spelling that should resolve to a canonical group. This is how "ateez",
-- "Ateez", "ATEEZ (에이티즈)" all map to one canonical_id — the fix for the
-- free-text casing drift found in user_cards.
CREATE TABLE IF NOT EXISTS catalog_group_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  alias       text NOT NULL,                          -- as-seen spelling
  alias_norm  text NOT NULL,                          -- lower(trim(unaccent(alias)))
  source      text DEFAULT 'seed'                     -- seed | user_data | manual
                CHECK (source IN ('seed','user_data','manual')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_group_aliases_norm_key UNIQUE (alias_norm)
);

-- ─── STEP 3 · MEMBERS (incl. former members + historical dates) ───────────────
CREATE TABLE IF NOT EXISTS catalog_group_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  stage_name   text NOT NULL,
  full_name    text,
  position     text,                                  -- e.g. "Leader, Main Rapper"
  joined_on    date,
  left_on      date,                                  -- NULL = current member
  is_current   boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_group_members_uq UNIQUE (group_id, stage_name)
);

-- ─── STEP 4 · SUB-UNITS (unit ↔ parent, e.g. NCT / NCT 127 / NCT DREAM) ───────
-- Sub-units that are themselves acts get a row in catalog_groups (parent_group_id
-- set). This table additionally records unit *membership* (which members belong
-- to which unit), which parent_group_id alone can't express.
CREATE TABLE IF NOT EXISTS catalog_group_unit_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     uuid NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,   -- the sub-unit act
  member_id   uuid NOT NULL REFERENCES catalog_group_members(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_group_unit_members_uq UNIQUE (unit_id, member_id)
);

-- ─── STEP 5 · RELEASES (albums / singles / JP / regional, full provenance) ────
CREATE TABLE IF NOT EXISTS catalog_releases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  title          text NOT NULL,                       -- e.g. "THE WORLD EP.FIN : WILL"
  era            text,                                 -- comeback / era label
  release_date   date,
  release_year   int,                                 -- kept for partial-date records
  region         text NOT NULL DEFAULT 'KR'
                   CHECK (region IN ('KR','JP','EN','CN','other')),
  release_type   text NOT NULL DEFAULT 'album'
                   CHECK (release_type IN ('album','mini_album','single','single_album',
                          'repackage','ost','special','compilation','other')),
  is_solo        boolean NOT NULL DEFAULT false,       -- member solo work, kept out of group unless opted in
  soloist_member_id uuid REFERENCES catalog_group_members(id) ON DELETE SET NULL,
  print_status   text NOT NULL DEFAULT 'unknown'
                   CHECK (print_status IN ('in_print','out_of_print','discontinued',
                          'legacy','promotional','unknown')),
  verification   text NOT NULL DEFAULT 'unverified'
                   CHECK (verification IN ('unverified','in_progress','fan_submitted',
                          'verified','conflicted','archived')),
  verified_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at    timestamptz,
  review_notes   text,                                 -- reviewer notes / conflict explanation
  has_conflict   boolean NOT NULL DEFAULT false,
  cover_url      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_updated   timestamptz NOT NULL DEFAULT now()
);

-- ─── STEP 6 · EDITIONS (album versions / platform / digipack / poca / limited) ─
-- Versions are NEVER merged into one generic "version" — each is its own row.
CREATE TABLE IF NOT EXISTS catalog_release_editions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id    uuid NOT NULL REFERENCES catalog_releases(id) ON DELETE CASCADE,
  edition_name  text NOT NULL,                         -- e.g. "Diary Ver.", "Digipack", "POCA", "Weverse Albums"
  edition_type  text NOT NULL DEFAULT 'standard'
                  CHECK (edition_type IN ('standard','limited','platform','digipack',
                         'poca','jewel','kit','weverse','box_set','special','other')),
  member_version text,                                 -- member-specific cover version, if any
  print_status  text NOT NULL DEFAULT 'unknown'
                  CHECK (print_status IN ('in_print','out_of_print','discontinued',
                         'legacy','promotional','unknown')),
  verification  text NOT NULL DEFAULT 'unverified'
                  CHECK (verification IN ('unverified','in_progress','fan_submitted',
                         'verified','conflicted','archived')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_release_editions_uq UNIQUE (release_id, edition_name)
);

-- ─── STEP 7 · CATALOG CARDS (canonical photocards / inclusions) ───────────────
-- The canonical photocard record. user_cards.catalog_card_id points here so
-- Smart Match compares stable IDs, never free-text.
CREATE TABLE IF NOT EXISTS catalog_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  release_id    uuid REFERENCES catalog_releases(id) ON DELETE SET NULL,
  edition_id    uuid REFERENCES catalog_release_editions(id) ON DELETE SET NULL,
  member_id     uuid REFERENCES catalog_group_members(id) ON DELETE SET NULL,
  member_name   text,                                  -- denormalized for display / partial records
  card_name     text,
  card_type     text NOT NULL DEFAULT 'album_inclusion'
                  CHECK (card_type IN ('album_inclusion','pob','store_exclusive','lucky_draw',
                         'fansign','broadcast','event','tour','promotional','other')),
  store_source  text,                                  -- e.g. "Ktown4u", "Weverse", "Withmuu"
  region        text DEFAULT 'KR'
                  CHECK (region IN ('KR','JP','EN','CN','other')),
  rarity        text,
  print_status  text NOT NULL DEFAULT 'unknown'
                  CHECK (print_status IN ('in_print','out_of_print','discontinued',
                         'legacy','promotional','unknown')),
  verification  text NOT NULL DEFAULT 'unverified'
                  CHECK (verification IN ('unverified','in_progress','fan_submitted',
                         'verified','conflicted','archived')),
  image_url     text,
  sort_order    int NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_updated  timestamptz NOT NULL DEFAULT now()
);

-- ─── STEP 8 · SOURCES (multiple credible sources per record; ≥2-source rule) ──
-- Polymorphic: exactly one of group_id / release_id / edition_id / card_id is set.
-- source_tier drives the "at least two credible sources" verification gate.
CREATE TABLE IF NOT EXISTS catalog_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid REFERENCES catalog_groups(id) ON DELETE CASCADE,
  release_id   uuid REFERENCES catalog_releases(id) ON DELETE CASCADE,
  edition_id   uuid REFERENCES catalog_release_editions(id) ON DELETE CASCADE,
  card_id      uuid REFERENCES catalog_cards(id) ON DELETE CASCADE,
  source_url   text NOT NULL,
  source_type  text NOT NULL
                 CHECK (source_type IN ('official_discography','official_store','official_jp',
                        'retailer','collector_db','community')),
  source_tier  int NOT NULL DEFAULT 3
                 CHECK (source_tier BETWEEN 1 AND 5),  -- 1 official artist/label … 5 community
  captured_at  timestamptz NOT NULL DEFAULT now(),
  verified_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at  timestamptz,
  note         text,
  -- exactly one target entity
  CONSTRAINT catalog_sources_one_target CHECK (
    (group_id  IS NOT NULL)::int + (release_id IS NOT NULL)::int +
    (edition_id IS NOT NULL)::int + (card_id   IS NOT NULL)::int = 1
  )
);

-- ─── STEP 9 · ADDITIVE LINKS ON EXISTING TABLES (all NULLABLE, no data change) ─
ALTER TABLE public.card_templates
  ADD COLUMN IF NOT EXISTS group_id   uuid REFERENCES catalog_groups(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_id uuid REFERENCES catalog_releases(id) ON DELETE SET NULL;

ALTER TABLE public.template_cards
  ADD COLUMN IF NOT EXISTS catalog_card_id uuid REFERENCES catalog_cards(id) ON DELETE SET NULL;

ALTER TABLE public.user_cards
  ADD COLUMN IF NOT EXISTS group_id        uuid REFERENCES catalog_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_card_id uuid REFERENCES catalog_cards(id)  ON DELETE SET NULL;

-- binders: link a binder to a canonical group (best-effort; NULL allowed).
ALTER TABLE public.binders
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES catalog_groups(id) ON DELETE SET NULL;


-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_catalog_group_aliases_norm  ON catalog_group_aliases (alias_norm);
CREATE INDEX IF NOT EXISTS idx_catalog_members_group       ON catalog_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_catalog_releases_group      ON catalog_releases (group_id);
CREATE INDEX IF NOT EXISTS idx_catalog_releases_region     ON catalog_releases (group_id, region);
CREATE INDEX IF NOT EXISTS idx_catalog_releases_verif      ON catalog_releases (verification);
CREATE INDEX IF NOT EXISTS idx_catalog_editions_release    ON catalog_release_editions (release_id);
CREATE INDEX IF NOT EXISTS idx_catalog_cards_group         ON catalog_cards (group_id);
CREATE INDEX IF NOT EXISTS idx_catalog_cards_release       ON catalog_cards (release_id);
CREATE INDEX IF NOT EXISTS idx_catalog_cards_member        ON catalog_cards (member_id);
CREATE INDEX IF NOT EXISTS idx_catalog_cards_type          ON catalog_cards (card_type);
CREATE INDEX IF NOT EXISTS idx_catalog_sources_release     ON catalog_sources (release_id);
CREATE INDEX IF NOT EXISTS idx_catalog_sources_card        ON catalog_sources (card_id);
CREATE INDEX IF NOT EXISTS idx_card_templates_group        ON card_templates (group_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_group            ON user_cards (group_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_catalog_card     ON user_cards (catalog_card_id);


-- ─── ROW LEVEL SECURITY (service-role model — no anon policies) ───────────────
ALTER TABLE catalog_groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_group_aliases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_group_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_group_unit_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_releases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_release_editions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_cards              ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_sources            ENABLE ROW LEVEL SECURITY;
-- The Express backend uses the service-role key (RLS-exempt). If the app ever
-- reads the catalog directly with the anon key, add read-only policies, e.g.:
--   CREATE POLICY catalog_groups_public_read ON catalog_groups FOR SELECT USING (true);
-- (verified rows only:)  USING (verification = 'verified')  -- on releases/cards


-- ═══════════════════════════════════════════════════════════════════════════
-- OPTIONAL BACKFILL  (run AFTER reviewing Steps 1–9; still additive & idempotent)
-- Seeds catalog_groups + aliases from the 5 existing card_templates group_names,
-- normalizes user_cards casing to those aliases, and links card_templates.group_id.
-- No existing row's business data is modified — only the new group_id / alias
-- rows are added, and user_cards keeps its original group_name text.
-- ═══════════════════════════════════════════════════════════════════════════

-- B1 · seed groups from every distinct group name currently in the catalog
INSERT INTO catalog_groups (canonical_name, slug)
SELECT DISTINCT ct.group_name, lower(trim(ct.group_name))
FROM card_templates ct
WHERE ct.group_name IS NOT NULL AND ct.group_name <> ''
ON CONFLICT (slug) DO NOTHING;

-- B2 · self-alias each canonical name (canonical spelling resolves to itself)
INSERT INTO catalog_group_aliases (group_id, alias, alias_norm, source)
SELECT g.id, g.canonical_name, g.slug, 'seed'
FROM catalog_groups g
ON CONFLICT (alias_norm) DO NOTHING;

-- B3 · alias every distinct user_cards spelling to its group by normalized match
--      (this is what makes "ateez" resolve to canonical "ATEEZ")
INSERT INTO catalog_group_aliases (group_id, alias, alias_norm, source)
SELECT g.id, uc.group_name, lower(trim(uc.group_name)), 'user_data'
FROM (SELECT DISTINCT group_name FROM user_cards WHERE group_name IS NOT NULL AND group_name <> '') uc
JOIN catalog_groups g ON g.slug = lower(trim(uc.group_name))
ON CONFLICT (alias_norm) DO NOTHING;

-- B4 · link existing card_templates + user_cards to their canonical group_id
--      via the alias table (leaves group_name text untouched)
UPDATE card_templates ct
SET group_id = a.group_id
FROM catalog_group_aliases a
WHERE ct.group_id IS NULL
  AND a.alias_norm = lower(trim(ct.group_name));

UPDATE user_cards uc
SET group_id = a.group_id
FROM catalog_group_aliases a
WHERE uc.group_id IS NULL
  AND a.alias_norm = lower(trim(uc.group_name));

-- NOTE: groups that exist in user_cards but NOT in card_templates (e.g.
-- BLACKPINK) will have NO catalog_groups row after B1, so B3/B4 skip them.
-- Add those canonical groups explicitly during Phase-1 research ingestion.


-- ═══════════════════════════════════════════════════════════════════════════
-- DUPLICATE-DETECTION (run as SELECTs during review — not enforced destructively)
-- ═══════════════════════════════════════════════════════════════════════════
-- Near-duplicate groups (same normalized name, different rows) — should be zero
-- given the slug UNIQUE constraint, but catch romanization variants here:
--   SELECT slug, count(*) FROM catalog_groups GROUP BY slug HAVING count(*) > 1;
-- Duplicate releases within a group (same normalized title + region):
--   SELECT group_id, lower(trim(title)) t, region, count(*)
--   FROM catalog_releases GROUP BY 1,2,3 HAVING count(*) > 1;
-- Duplicate editions within a release:
--   SELECT release_id, lower(trim(edition_name)), count(*)
--   FROM catalog_release_editions GROUP BY 1,2 HAVING count(*) > 1;
-- Releases claiming 'verified' with fewer than two credible (tier ≤ 4) sources
-- (violates the ≥2-source rule — should be held out of verified):
--   SELECT r.id, r.title
--   FROM catalog_releases r
--   WHERE r.verification = 'verified'
--     AND (SELECT count(*) FROM catalog_sources s
--          WHERE s.release_id = r.id AND s.source_tier <= 4) < 2;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (reverse order; drops only what this migration added)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.binders        DROP COLUMN IF EXISTS group_id;
-- ALTER TABLE public.user_cards     DROP COLUMN IF EXISTS catalog_card_id, DROP COLUMN IF EXISTS group_id;
-- ALTER TABLE public.template_cards DROP COLUMN IF EXISTS catalog_card_id;
-- ALTER TABLE public.card_templates DROP COLUMN IF EXISTS release_id, DROP COLUMN IF EXISTS group_id;
-- DROP TABLE IF EXISTS catalog_sources;
-- DROP TABLE IF EXISTS catalog_cards;
-- DROP TABLE IF EXISTS catalog_release_editions;
-- DROP TABLE IF EXISTS catalog_releases;
-- DROP TABLE IF EXISTS catalog_group_unit_members;
-- DROP TABLE IF EXISTS catalog_group_members;
-- DROP TABLE IF EXISTS catalog_group_aliases;
-- DROP TABLE IF EXISTS catalog_groups;
-- ═══════════════════════════════════════════════════════════════════════════

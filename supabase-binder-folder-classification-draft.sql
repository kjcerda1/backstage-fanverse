-- ═══════════════════════════════════════════════════════════════════════════
-- BACKSTAGE / FANVERSE — Binder Folder Classification Migration (draft, REV 2)
-- File: supabase-binder-folder-classification-draft.sql
--
-- ⚠️  DRAFT FOR REVIEW — DO NOT RUN.
--
-- REV 2 changes (2026-07-28), per review:
--   - folder_type NULL is documented as "unclassified", never described or
--     rendered as if it were "Custom" — those are different states.
--   - source_type renamed to scope_origin and narrowed to describe HOW the
--     folder was created (verified pick vs custom/manual), not its contents.
--   - Removed the standalone `era` / `region` columns entirely. They
--     duplicated data already reachable through release_id/template_id once
--     linked, and the KR/JP/EN/CN/other CHECK conflated release region with
--     language and was too narrow. Era/region for a folder with no
--     release_id/template_id link live in `metadata` as free-form hints only
--     (informational, never authoritative, never queried against a fixed
--     vocabulary) until/unless a real need promotes one to a column.
--   - All FK targets schema-qualified (public.card_templates(id) etc).
--   - Explicit precedence rule for release_id vs template_id (see PART A2).
--
-- Confirmed current `binders` schema (read from live Supabase, 2026-07-28):
--   id, user_id, name, group_name, cover_color, emoji, is_public, cover_url,
--   created_at, updated_at
-- None of the columns below exist yet — every ADD COLUMN here is genuinely new.
--
-- Split into two independently-approvable parts:
--   PART A1 — no dependency on any other migration. Safe to run on its own.
--   PART A2 — depends on supabase-catalog-provenance-migration.sql having
--             already been run (needs catalog_releases + catalog_group_members
--             to exist for the FKs to resolve). Do not run before that.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- PART A1 · SAFE NOW — NO DEPENDENCY
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.binders
  ADD COLUMN IF NOT EXISTS folder_type text
    CHECK (folder_type IN ('album','photocard','pob','custom')),
    -- NULL = UNCLASSIFIED. This is a distinct state from 'custom' — every
    -- binder created before this migration lands here, and the app must
    -- render it safely (no error, fully usable) WITHOUT describing it to the
    -- fan as "Custom." Treat NULL as "not yet classified — allow the fan (or
    -- a later pass) to classify it," not as a silent default value. UI text
    -- for a NULL-folder_type binder should say something neutral like
    -- "Folder" rather than asserting a type it doesn't have.
  ADD COLUMN IF NOT EXISTS template_id  uuid REFERENCES public.card_templates(id) ON DELETE SET NULL,
    -- Interim catalog-scope link, usable TODAY (card_templates already
    -- exists live, 5 seed rows confirmed). When a binder is created via
    -- POST /api/binders/from-template, this is how it keeps knowing which
    -- template (and therefore which template_cards scope) it represents,
    -- without storing a `missing` user_cards row per card.
  ADD COLUMN IF NOT EXISTS scope_origin text CHECK (scope_origin IN ('verified','custom')),
    -- Describes ONLY how this folder was CREATED — did the fan pick it from
    -- Browse Verified (backed by a real template_id/release_id whose OWN
    -- status is 'verified' at creation time), or author it manually/custom?
    -- This is a point-in-time creation fact, NOT a live property of the
    -- folder's current contents — a folder created from a verified release
    -- can still contain fan-added custom cards alongside catalog ones, and
    -- this column does not change when that happens. Never set to 'verified'
    -- by client code alone — always copied from the linked catalog record's
    -- own status at the moment of creation.
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb;
    -- Overflow ONLY for genuinely flexible, folder-type-specific fields that
    -- don't warrant a column (e.g. a POB folder's free-text "store/source"
    -- note, or — for a folder with NO template_id/release_id link — informal
    -- era/region hints the fan typed in). The moment two+ folder types need
    -- to query/filter on a metadata key, promote it to a real column instead
    -- of growing this into a second schema. Never treated as authoritative
    -- when a canonical FK (template_id/release_id) is present — the FK wins.

CREATE INDEX IF NOT EXISTS idx_binders_folder_type ON binders (folder_type);
CREATE INDEX IF NOT EXISTS idx_binders_template_id  ON binders (template_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- PART A2 · DEPENDS ON supabase-catalog-provenance-migration.sql (Steps 1–9)
-- having already been run — creates catalog_releases, catalog_group_members,
-- and binders.group_id (also added there; not duplicated here).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.binders
  ADD COLUMN IF NOT EXISTS release_id uuid REFERENCES public.catalog_releases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_id  uuid REFERENCES public.catalog_group_members(id) ON DELETE SET NULL;

-- ─── PRECEDENCE RULE (documentation — no SQL enforces this; it's an
-- application-layer invariant because enforcing it in the DB would require
-- cross-referencing card_templates.release_id, which only exists once
-- catalog-provenance's own Step 9 has run and a template has been matched) ──
-- Once release_id is populated for a binder, it is THE canonical scope
-- reference for every purpose: missing-count derivation, region/era display,
-- verification status. template_id is retained permanently as a stable
-- historical/origin reference (so "which template did this start from" is
-- never lost even after a release match), but MUST NOT be read for
-- scope/region/era once release_id is set — the two are never allowed to
-- become two disagreeing sources of truth for the same folder. If a future
-- process ever needs to change which release a binder is matched to, it
-- updates release_id; it never leaves template_id as a silent fallback that
-- a stale code path might read instead.


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reverse order; each Part rolls back independently)
-- ═══════════════════════════════════════════════════════════════════════════
-- Part A2:
--   ALTER TABLE public.binders DROP COLUMN IF EXISTS member_id, DROP COLUMN IF EXISTS release_id;
-- Part A1:
--   DROP INDEX IF EXISTS idx_binders_template_id;
--   DROP INDEX IF EXISTS idx_binders_folder_type;
--   ALTER TABLE public.binders
--     DROP COLUMN IF EXISTS metadata, DROP COLUMN IF EXISTS scope_origin,
--     DROP COLUMN IF EXISTS template_id, DROP COLUMN IF EXISTS folder_type;
-- ═══════════════════════════════════════════════════════════════════════════

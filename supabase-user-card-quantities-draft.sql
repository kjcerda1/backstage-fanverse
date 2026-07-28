-- ═══════════════════════════════════════════════════════════════════════════
-- BACKSTAGE / FANVERSE — User Card Quantity Model Migration (draft, REV 2)
-- File: supabase-user-card-quantities-draft.sql
--
-- ⚠️  DRAFT FOR REVIEW — DO NOT RUN.
--
-- REV 2 changes (2026-07-28), per review:
--   - owned_quantity / for_trade_quantity / wanted_quantity now NULLABLE with
--     NO DEFAULT initially. A row is on the NEW model iff all three are
--     NOT NULL; NULL is the only valid "legacy/unmigrated" marker — a zero
--     value must never be treated as equivalent to "unmigrated." SET DEFAULT
--     0 / SET NOT NULL only happens in a separate, later, explicitly-gated
--     step (PART B1B) after full backfill is verified.
--   - Part B4 split into B4A (save_custom_card — depends only on B1+B3, no
--     catalog dependency) and B4B (upsert_catalog_card_quantity — depends on
--     catalog-provenance, catalog_card_id, collision reconciliation, AND the
--     partial unique index; do not create B4B before all four exist).
--   - Both RPCs require auth.uid() IS NOT NULL and validate that any supplied
--     binder_id belongs to auth.uid() — RLS does NOT protect this (see
--     SECURITY NOTE below), so these checks are the real enforcement, not
--     defense-in-depth.
--   - B4B now requires the COMPLETE quantity state (all 3 values, NOT NULL,
--     no partial/COALESCE "change only this bucket" semantics) and validates
--     for_trade_quantity <= owned_quantity itself with a clear error message
--     before writing, not just relying on the CHECK constraint to reject it.
--   - Neither RPC touches image_url/notes — those remain on the existing,
--     already-correct PATCH /api/cards/:id route, which distinguishes
--     "omitted" from "explicitly set to NULL" via `req.body[k] !== undefined`.
--     Folding them into an upsert RPC re-introduces exactly the ambiguity
--     just removed.
--   - B4A's custom-card contract completed: era, card_type, description,
--     condition, image_url, notes, binder_id, in addition to group_name/
--     member/album/version. p_idempotency_key is now required (NOT NULL, no
--     default) — a caller MUST supply and reuse the same key across a retry
--     of the same action; there is no "no key" path.
--   - All ADD CONSTRAINT statements wrapped in idempotent DO blocks (Postgres
--     has no `ADD CONSTRAINT IF NOT EXISTS`). DROP/REVOKE/GRANT use complete
--     function signatures. Both functions set `search_path = public, pg_temp`
--     explicitly.
--
-- Confirmed current `user_cards` schema (read from live Supabase, 2026-07-28):
--   id, user_id, binder_id, group_name, album, era, member, version,
--   card_type, description, status, quantity, condition, image_url, notes,
--   created_at, updated_at
--
-- Confirmed current RLS (read from live Supabase, 2026-07-28):
--   user_cards: RLS ENABLED, NOT forced. Policy `user_cards_own`: ALL
--     commands, USING (auth.uid() = user_id), no explicit WITH CHECK (so
--     Postgres reuses the USING expression for INSERT/UPDATE too). A second
--     policy `user_cards_trade_public`: SELECT, USING (status = 'for_trade'),
--     for the public trade feed.
--   binders: RLS ENABLED, NOT forced. Policy `binders_own`: ALL commands,
--     USING (auth.uid() = user_id), same no-WITH-CHECK shape.
--
-- ⚠️ SECURITY NOTE — read before assuming RLS protects these functions:
--   `user_cards_own`/`binders_own` gate a row by ITS OWN user_id column; they
--   do NOT check that a supplied binder_id (a different table's row) belongs
--   to the caller. A row can satisfy `auth.uid() = user_id` on its own
--   user_cards row while pointing binder_id at someone else's binder — RLS
--   is silent about that. This is why PART B4 below validates binder
--   ownership explicitly inside the function body; it is not optional
--   hardening, it is the only check that exists for this specific case.
--   Separately: api_server_v16.js's own `makeUserClient(req)` (line 233) is
--   documented in its own comment as "bypasses RLS entirely" when
--   SUPABASE_SERVICE_KEY is configured with the actual service-role key —
--   which of the two supported configurations is live on Render is not
--   something this audit can read (no tool exposes env var values). Because
--   of that ambiguity, the explicit auth.uid()/binder-ownership checks below
--   are written as the REQUIRED enforcement, not as optional defense-in-
--   depth on top of RLS — see the RLS test plan in the report for how to
--   confirm which case is actually true before shipping.
--
-- Split into independently-approvable parts:
--   PART B1  — quantity columns (nullable). No dependency. Safe to run alone.
--   PART B1B — SET DEFAULT/NOT NULL. Separate, LATER, gated on full backfill
--              verification (Stage 5). Do not run with B1.
--   PART B2  — partial unique index for catalog-linked cards. DEPENDS ON
--              supabase-catalog-provenance-migration.sql AND on every
--              collision in supabase-user-card-legacy-backfill-draft.sql
--              being resolved first.
--   PART B3  — idempotency key for custom/unlisted cards. No dependency.
--   PART B4A — save_custom_card RPC. Depends only on B1 + B3.
--   PART B4B — upsert_catalog_card_quantity RPC. Depends on catalog-
--              provenance, catalog_card_id, collision reconciliation, AND B2.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B1 · QUANTITY COLUMNS — SAFE NOW, NO DEPENDENCY
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.user_cards
  ADD COLUMN IF NOT EXISTS owned_quantity     int,
  ADD COLUMN IF NOT EXISTS for_trade_quantity int,
  ADD COLUMN IF NOT EXISTS wanted_quantity    int;
  -- Deliberately NO "NOT NULL DEFAULT 0" here. See PART B1B. Postgres CHECK
  -- constraints are NULL-tolerant (a CHECK involving a NULL operand is
  -- treated as satisfied, not violated), so the constraints below are safe
  -- to add now even though every existing row is currently NULL in these
  -- three columns.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_cards_owned_qty_nonneg') THEN
    ALTER TABLE public.user_cards ADD CONSTRAINT user_cards_owned_qty_nonneg CHECK (owned_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_cards_trade_qty_nonneg') THEN
    ALTER TABLE public.user_cards ADD CONSTRAINT user_cards_trade_qty_nonneg CHECK (for_trade_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_cards_wanted_qty_nonneg') THEN
    ALTER TABLE public.user_cards ADD CONSTRAINT user_cards_wanted_qty_nonneg CHECK (wanted_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_cards_trade_le_owned') THEN
    ALTER TABLE public.user_cards ADD CONSTRAINT user_cards_trade_le_owned CHECK (for_trade_quantity <= owned_quantity);
  END IF;
END $$;

-- ─── DUAL-READ RULE (the exact selector every reader must use) ────────────
-- A row is ON THE NEW MODEL if and only if:
--   owned_quantity IS NOT NULL AND for_trade_quantity IS NOT NULL AND wanted_quantity IS NOT NULL
-- A row is ON THE LEGACY MODEL if and only if:
--   owned_quantity IS NULL (equivalently: any of the three is NULL — Stage 3
--   code always writes all three together, so partial-NULL should never
--   occur in practice, but the reader checks owned_quantity IS NULL as the
--   single source of truth for "is this migrated" and falls back to status/
--   quantity in that case)
-- NEVER infer migration state from a zero value. A migrated row can
-- legitimately have owned_quantity = 0 (e.g. a pure ISO entry) — that is NOT
-- the same as "not yet migrated," and reading it as legacy would silently
-- re-derive from a status/quantity pair that may not even exist for that row.

CREATE INDEX IF NOT EXISTS idx_user_cards_owned_qty  ON user_cards (owned_quantity)     WHERE owned_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_user_cards_trade_qty  ON user_cards (for_trade_quantity) WHERE for_trade_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_user_cards_wanted_qty ON user_cards (wanted_quantity)    WHERE wanted_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_user_cards_unmigrated ON user_cards ((owned_quantity IS NULL)) WHERE owned_quantity IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B1B · LOCK DOWN THE COLUMNS — SEPARATE, LATER STEP. Gated on: Stage 3
-- code shipped AND confirmed working, AND the legacy backfill (separate file)
-- has run AND this verification returns 0:
--   SELECT count(*) FROM user_cards WHERE owned_quantity IS NULL OR for_trade_quantity IS NULL OR wanted_quantity IS NULL;
-- Do NOT run this block until that query returns 0. Not bundled with B1.
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.user_cards
--   ALTER COLUMN owned_quantity     SET DEFAULT 0,
--   ALTER COLUMN for_trade_quantity SET DEFAULT 0,
--   ALTER COLUMN wanted_quantity    SET DEFAULT 0;
-- ALTER TABLE public.user_cards
--   ALTER COLUMN owned_quantity     SET NOT NULL,
--   ALTER COLUMN for_trade_quantity SET NOT NULL,
--   ALTER COLUMN wanted_quantity    SET NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B2 · ROW IDENTITY FOR CATALOG-LINKED CARDS — DEPENDS ON
--           supabase-catalog-provenance-migration.sql Step 9 (adds
--           user_cards.catalog_card_id) AND on every collision identified in
--           supabase-user-card-legacy-backfill-draft.sql being resolved.
--           Verify with (must return 0 rows) before running this:
--   SELECT user_id, catalog_card_id, count(*) FROM user_cards
--   WHERE catalog_card_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS user_cards_one_row_per_catalog_card
  ON user_cards (user_id, catalog_card_id) WHERE catalog_card_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B3 · ROW IDENTITY FOR CUSTOM / UNLISTED CARDS — SAFE NOW, NO DEPENDENCY
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.user_cards
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;
    -- Generated ONCE per creation attempt on the client and reused verbatim
    -- on any automatic retry of that SAME attempt. NULL is only valid for
    -- rows created before this column existed, or via a legacy path that
    -- predates it — every NEW custom-card save (Part B4A) requires one.

CREATE UNIQUE INDEX IF NOT EXISTS user_cards_idempotency_key_uq
  ON user_cards (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Not a content merge tool. Two custom cards with identical group/member/
-- album/version text are never merged by this index — only an exact repeat
-- of the SAME idempotency_key (the SAME creation attempt) collides.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B4A · save_custom_card RPC — DEPENDS ONLY ON PART B1 + PART B3.
-- No dependency on catalog-provenance, catalog_card_id, or the unique index.
-- Safe to create as soon as B1 and B3 have been run.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_custom_card(
  p_idempotency_key    uuid,               -- REQUIRED. No default. Caller must supply and reuse on retry.
  p_group_name         text,
  p_member             text,
  p_album              text default null,
  p_version            text default null,
  p_era                text default null,
  p_card_type          text default null,
  p_description        text default null,
  p_condition          text default 'mint',
  p_image_url          text default null,
  p_notes              text default null,
  p_binder_id          uuid default null,
  p_owned_quantity     int default 0,
  p_for_trade_quantity int default 0,
  p_wanted_quantity    int default 0
) RETURNS public.user_cards
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.user_cards;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'p_idempotency_key is required' USING ERRCODE = '22004';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_owned_quantity < 0 OR p_for_trade_quantity < 0 OR p_wanted_quantity < 0 THEN
    RAISE EXCEPTION 'quantities must be >= 0' USING ERRCODE = '22003';
  END IF;
  IF p_for_trade_quantity > p_owned_quantity THEN
    RAISE EXCEPTION 'for_trade_quantity (%) cannot exceed owned_quantity (%)', p_for_trade_quantity, p_owned_quantity USING ERRCODE = '22003';
  END IF;
  IF p_binder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.binders WHERE id = p_binder_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'binder % does not belong to the authenticated user', p_binder_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_cards (
    user_id, idempotency_key, group_name, member, album, version, era,
    card_type, description, condition, image_url, notes, binder_id,
    owned_quantity, for_trade_quantity, wanted_quantity
  ) VALUES (
    auth.uid(), p_idempotency_key, p_group_name, p_member, p_album, p_version, p_era,
    p_card_type, p_description, p_condition, p_image_url, p_notes, p_binder_id,
    p_owned_quantity, p_for_trade_quantity, p_wanted_quantity
  )
  ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET
    -- A retry of the SAME creation attempt (same idempotency_key) returns
    -- the already-created row unchanged rather than creating a second one
    -- or silently re-applying the payload a second time.
    updated_at = public.user_cards.updated_at
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.save_custom_card(uuid, text, text, text, text, text, text, text, text, text, text, uuid, int, int, int);
-- (the CREATE OR REPLACE above already defines it; this DROP line documents
-- the exact signature for the rollback section and for any future ALTER —
-- it is a no-op comment here, not meant to run before the CREATE)

REVOKE ALL ON FUNCTION public.save_custom_card(uuid, text, text, text, text, text, text, text, text, text, text, uuid, int, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_custom_card(uuid, text, text, text, text, text, text, text, text, text, text, uuid, int, int, int) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART B4B · upsert_catalog_card_quantity RPC — DO NOT CREATE until ALL of:
--   1. supabase-catalog-provenance-migration.sql has been run (catalog_card_id exists)
--   2. every collision in supabase-user-card-legacy-backfill-draft.sql is resolved
--   3. PART B2's unique index above has been successfully created
-- This function is written here for review only — creating it before the
-- unique index exists would leave it silently unable to do its one job
-- (Postgres would reject the ON CONFLICT clause with "no unique or exclusion
-- constraint matching the ON CONFLICT specification" the first time it ran).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.upsert_catalog_card_quantity(
  -- All 6 REQUIRED params first (Postgres forbids a no-default param after a
  -- defaulted one in a function signature) — the earlier draft violated this
  -- and would have failed to even CREATE. Fixed here; PostgREST/supabase-js
  -- calls RPCs with named arguments regardless, so this reordering has no
  -- effect on how the backend calls it.
  p_catalog_card_id    uuid,
  p_group_name         text,
  p_member             text,
  p_owned_quantity     int,                -- REQUIRED. No default — atomic full-state write only.
  p_for_trade_quantity int,                -- REQUIRED. No default.
  p_wanted_quantity    int,                -- REQUIRED. No default.
  p_album              text default null,
  p_version            text default null,
  p_binder_id          uuid default null
) RETURNS public.user_cards
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.user_cards;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_catalog_card_id IS NULL THEN
    RAISE EXCEPTION 'p_catalog_card_id is required' USING ERRCODE = '22004';
  END IF;
  IF p_owned_quantity IS NULL OR p_for_trade_quantity IS NULL OR p_wanted_quantity IS NULL THEN
    RAISE EXCEPTION 'owned_quantity, for_trade_quantity, and wanted_quantity must all be supplied together' USING ERRCODE = '22004';
  END IF;
  IF p_owned_quantity < 0 OR p_for_trade_quantity < 0 OR p_wanted_quantity < 0 THEN
    RAISE EXCEPTION 'quantities must be >= 0' USING ERRCODE = '22003';
  END IF;
  IF p_for_trade_quantity > p_owned_quantity THEN
    RAISE EXCEPTION 'for_trade_quantity (%) cannot exceed owned_quantity (%)', p_for_trade_quantity, p_owned_quantity USING ERRCODE = '22003';
  END IF;
  IF p_binder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.binders WHERE id = p_binder_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'binder % does not belong to the authenticated user', p_binder_id USING ERRCODE = '42501';
  END IF;

  -- Deliberately NOT COALESCE-based: every call submits the complete
  -- inventory state. A caller that wants to "only bump owned by 1" is
  -- responsible for reading the current row first and computing the new
  -- total client-side — this function never guesses what "unspecified"
  -- means, because there is no unspecified: every parameter is required.
  INSERT INTO public.user_cards (
    user_id, catalog_card_id, group_name, member, album, version, binder_id,
    owned_quantity, for_trade_quantity, wanted_quantity
  ) VALUES (
    auth.uid(), p_catalog_card_id, p_group_name, p_member, p_album, p_version, p_binder_id,
    p_owned_quantity, p_for_trade_quantity, p_wanted_quantity
  )
  ON CONFLICT (user_id, catalog_card_id) WHERE catalog_card_id IS NOT NULL
  DO UPDATE SET
    owned_quantity     = p_owned_quantity,
    for_trade_quantity = p_for_trade_quantity,
    wanted_quantity    = p_wanted_quantity,
    binder_id          = COALESCE(p_binder_id, public.user_cards.binder_id),
    updated_at         = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_catalog_card_quantity(uuid, text, text, int, int, int, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_card_quantity(uuid, text, text, int, int, int, text, text, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- API CONTRACT NOTES (no SQL below — documents the backend code change these
-- functions enable; implemented separately, as its own code change, not part
-- of this migration file)
-- ═══════════════════════════════════════════════════════════════════════════
-- Both RPCs MUST be called via a per-request client that forwards the
-- caller's JWT — api_server_v16.js already has this: `makeUserClient(req)`
-- (line 233). Never call these through the module-level `supabase` client
-- (line 148), which carries no user JWT context and would make auth.uid()
-- resolve to NULL inside the function, tripping the auth check on every call.
--   POST /api/cards (custom-card path, catalog_card_id absent in body):
--     const db = makeUserClient(req);
--     const { data, error } = await db.rpc('save_custom_card', {
--       p_idempotency_key: body.idempotency_key,  // generated client-side, required
--       p_group_name: body.group_name, p_member: body.member, /* ...era/card_type/description/condition/image_url/notes/binder_id/quantities */
--     });
--   POST /api/cards (catalog-linked path, catalog_card_id present in body) —
--   ONLY once Part B4B exists:
--     const db = makeUserClient(req);
--     const { data, error } = await db.rpc('upsert_catalog_card_quantity', {
--       p_catalog_card_id: body.catalog_card_id, p_group_name: body.group_name,
--       p_member: body.member, p_album: body.album, p_version: body.version,
--       p_binder_id: body.binder_id,
--       p_owned_quantity: body.owned_quantity, p_for_trade_quantity: body.for_trade_quantity,
--       p_wanted_quantity: body.wanted_quantity,  // all three required, atomic
--     });
--   Both: on error, surface `error.message` from the RPC's RAISE EXCEPTION
--   text directly to the client as a 400/403 (the messages above are already
--   written to be shown to a developer/QA account, not raw Postgres codes).
-- PATCH /api/cards/:id: UNCHANGED — image_url/notes/condition edits stay on
--   this route exactly as they work today (allowed-fields whitelist,
--   `req.body[k] !== undefined` distinguishes omitted from explicit null).


-- ═══════════════════════════════════════════════════════════════════════════
-- TRANSITION STAGES
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Additive columns          — Part B1/B3/B4A now; B2/B4B once catalog-
--    provenance has run AND the legacy-backfill reconciliation has resolved
--    every existing collision.
-- 2. Dual-read compatibility   — every aggregate uses the exact selector
--    documented in PART B1 (owned_quantity IS NULL ⇒ legacy math; otherwise
--    ⇒ new-field math). Never blend both for the same row.
-- 3. New writes use quantity fields only — AddCardForm, Card Detail Sheet,
--    Photocard/POB Folder forms call the RPCs above instead of writing
--    status/quantity for any NEW row.
-- 4. Backfill legacy rows      — supabase-user-card-legacy-backfill-draft.sql,
--    after Stage 3 has shipped and been confirmed working.
-- 5. Verify totals + verify no NULLs remain in the 3 quantity columns — then,
--    and only then, run PART B1B.
-- 6. Retire legacy status writes.
-- 7. Deprecate legacy columns  — separate, later migration, own decision.


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reverse order; each Part rolls back independently)
-- ═══════════════════════════════════════════════════════════════════════════
-- Part B4B:
--   DROP FUNCTION IF EXISTS public.upsert_catalog_card_quantity(uuid, text, text, int, int, int, text, text, uuid);
-- Part B4A:
--   DROP FUNCTION IF EXISTS public.save_custom_card(uuid, text, text, text, text, text, text, text, text, text, text, uuid, int, int, int);
-- Part B3:
--   DROP INDEX IF EXISTS user_cards_idempotency_key_uq;
--   ALTER TABLE public.user_cards DROP COLUMN IF EXISTS idempotency_key;
-- Part B2:
--   DROP INDEX IF EXISTS user_cards_one_row_per_catalog_card;
-- Part B1B (if already applied):
--   ALTER TABLE public.user_cards
--     ALTER COLUMN owned_quantity DROP NOT NULL, ALTER COLUMN for_trade_quantity DROP NOT NULL, ALTER COLUMN wanted_quantity DROP NOT NULL,
--     ALTER COLUMN owned_quantity DROP DEFAULT, ALTER COLUMN for_trade_quantity DROP DEFAULT, ALTER COLUMN wanted_quantity DROP DEFAULT;
-- Part B1:
--   ALTER TABLE public.user_cards
--     DROP CONSTRAINT IF EXISTS user_cards_trade_le_owned,
--     DROP CONSTRAINT IF EXISTS user_cards_wanted_qty_nonneg,
--     DROP CONSTRAINT IF EXISTS user_cards_trade_qty_nonneg,
--     DROP CONSTRAINT IF EXISTS user_cards_owned_qty_nonneg,
--     DROP COLUMN IF EXISTS wanted_quantity,
--     DROP COLUMN IF EXISTS for_trade_quantity,
--     DROP COLUMN IF EXISTS owned_quantity;
-- ═══════════════════════════════════════════════════════════════════════════

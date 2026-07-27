-- Binder cover photo support
-- =============================
-- Adds an optional cover_url to public.binders to store a Supabase Storage URL
-- (or path) for a binder's cover image. The existing cover_color (accent) and
-- emoji are kept as the fallback when no photo is uploaded.
--
-- Target project: wshqjxsbwqijodlskrbx  (kjcerda1@outlook.com's Project, us-east-1)
--
-- Safety:
--   * Additive + idempotent (ADD COLUMN IF NOT EXISTS) — safe to re-run.
--   * Nullable, no default — existing binders keep cover_url = NULL and continue
--     rendering with their color/emoji fallback.
--   * RLS is NOT touched. public.binders already has RLS enabled; adding a
--     column does not create, drop, or weaken any policy — existing per-user
--     policies continue to apply to every column including cover_url.
--   * No data is modified.
--
-- Rollback:
--   Leave the nullable column unused. Do NOT drop it (dropping is unnecessary and
--   would touch the table); an unused nullable column has no effect.

alter table public.binders
  add column if not exists cover_url text;

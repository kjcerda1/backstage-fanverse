-- Apple Music integration — safe idempotent migration
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- All columns added with IF NOT EXISTS — safe to run multiple times

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS apple_music_user_token    text,
  ADD COLUMN IF NOT EXISTS apple_music_storefront    text,
  ADD COLUMN IF NOT EXISTS apple_music_connected_at  timestamptz,
  ADD COLUMN IF NOT EXISTS music_provider            text,
  ADD COLUMN IF NOT EXISTS now_playing               jsonb DEFAULT '{}'::jsonb;

-- Existing spotify columns — listed here for reference, do NOT add again:
-- spotify_access_token  text
-- spotify_refresh_token text
-- spotify_token_expires timestamptz

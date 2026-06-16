-- Adds optional GIF/reaction metadata to notifications (Backstage GIF picker system).
-- Nullable jsonb — backend only sets it when a user attaches a reaction (e.g. friend
-- request accept). Existing notifications are unaffected.
-- Shape stored: { id, title, previewUrl, fullUrl, source, width?, height? }

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS gif jsonb;

-- Adds optional GIF/reaction metadata to messages (Backstage GIF picker system).
-- Nullable jsonb — backend only sets it when sender attaches a GIF reaction.
-- Existing messages are unaffected. body becomes nullable to allow GIF-only sends.
-- Shape stored: { id, title, previewUrl, fullUrl, source, width?, height? }

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS gif jsonb;
ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;

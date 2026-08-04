-- Adds an optional exact-message pointer to notifications (2026-08-04), so a
-- dm_received notification can carry the real message id it's about instead
-- of only the thread id — lets the client scroll to and highlight the exact
-- message instead of always landing on "newest" (see
-- docs/DM_NOTIFICATION_NAVIGATION_WEB_VIDEO_2026-08-03.md §2 for the full
-- data-path this feeds).
--
-- Type/FK verified against the live schema before writing this file:
--   - public.messages.id is the actual primary key, type uuid.
--   - notifications.actor_id already uses REFERENCES ... ON DELETE SET NULL
--     against auth.users for the same reason: a soft pointer that shouldn't
--     destroy the notification row if the referenced thing goes away. This
--     column follows that same established convention.
-- Nullable, no default — every existing notification (and every non-DM
-- notification type going forward) is unaffected and stays valid with NULL.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_message_id uuid
  REFERENCES public.messages(id) ON DELETE SET NULL;

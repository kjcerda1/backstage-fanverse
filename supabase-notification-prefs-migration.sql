-- Notification preferences — one row per user, JSONB blob mirroring the client's
-- notification settings object. Opt-out model: no row = deliver everything.
--
-- Read/written by:
--   GET  /api/notifications/settings
--   POST /api/notifications/settings
-- Enforced in the backend deliverNotification() helper (category + push toggles).
--
-- prefs shape (example):
-- {
--   "push_enabled": true,
--   "categories": {
--     "friend_requests": true,
--     "messages": true,
--     "meetups": true,
--     "trades": true
--   }
-- }

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

-- Users manage only their own preferences. The backend uses the service-role key
-- (which bypasses RLS) for delivery-time reads, so these policies just cover any
-- direct client access.
DROP POLICY IF EXISTS "own notif prefs select" ON notification_prefs;
CREATE POLICY "own notif prefs select" ON notification_prefs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own notif prefs upsert" ON notification_prefs;
CREATE POLICY "own notif prefs upsert" ON notification_prefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own notif prefs update" ON notification_prefs;
CREATE POLICY "own notif prefs update" ON notification_prefs
  FOR UPDATE USING (auth.uid() = user_id);

-- ─── FRIEND REQUESTS TABLE ───────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor or via the CLI before using the
-- friend-request endpoints in api_server_v16.js.
--
-- The `friends` table (user_id / friend_id) already exists and is used to store
-- accepted, bidirectional connections. This table stores the pending / declined /
-- cancelled states BEFORE a connection is accepted.

CREATE TABLE IF NOT EXISTS friend_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  -- One open request per pair in each direction
  UNIQUE (sender_id, receiver_id)
);

-- Indexes for the two query patterns used by the API
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
  ON friend_requests (receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
  ON friend_requests (sender_id, status);

-- Enable RLS (access controlled via the Express backend using the service role key)
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no policy needed for backend calls.
-- If you ever add a direct Supabase client in the app (anon key), add policies here.


-- ─── PHONE NORMALIZED COLUMN ──────────────────────────────────────────────────
-- Stores a digits-only normalized phone number for private phone-based search.
-- Populated by the client during profile setup (optional — never required).
-- The API searches this field when the query input looks like a phone number
-- (all digits, 7–15 chars after stripping formatting).

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

CREATE INDEX IF NOT EXISTS idx_users_phone_normalized
  ON users (phone_normalized)
  WHERE phone_normalized IS NOT NULL;


-- ─── FRIENDS TABLE (reference) ────────────────────────────────────────────────
-- This table should already exist. Creating it here only as documentation /
-- safety net — the IF NOT EXISTS guard prevents double-execution issues.

CREATE TABLE IF NOT EXISTS friends (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user_id   ON friends (user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends (friend_id);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Clean up any stale friend_requests rows when a friend_requests record
-- is accepted (accepted status in friend_requests is a snapshot — the
-- canonical "are they friends?" truth is the friends table).
-- This trigger is optional but keeps the requests table tidy.
CREATE OR REPLACE FUNCTION cleanup_accepted_request()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    -- Mark the reverse-direction request (if any) as accepted too
    UPDATE friend_requests
       SET status = 'accepted'
     WHERE sender_id   = NEW.receiver_id
       AND receiver_id = NEW.sender_id
       AND status      = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_accepted_request ON friend_requests;
CREATE TRIGGER trg_cleanup_accepted_request
  AFTER UPDATE OF status ON friend_requests
  FOR EACH ROW EXECUTE FUNCTION cleanup_accepted_request();

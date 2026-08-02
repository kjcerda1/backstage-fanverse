-- ─── DM message reactions — real persistence ───────────────────────────────
-- Reactions on DM messages (photo/video/voice/GIF/scrapbook-invite/text) were
-- previously client-side-only React state (`convos`/`activeConvo` in-memory),
-- never sent to the backend — lost on reload. (A separate, unrelated frontend
-- bug where `convos` and `activeConvo` held independently-diverging copies of
-- a thread's messages — which made reacting visibly collapse the thread — is
-- fixed in the same commit as this migration, in src/App.jsx.)
--
-- Verified live against production (read-only, 2026-08-01) before writing
-- this: no `message_reactions` table exists; the only existing `*reaction*`
-- table is `post_reactions` (Fanverse feed posts — unrelated, one row per
-- user per POST, not per DM message).
--
-- RECURSION-SAFETY CHECK (done before writing a single policy below, given
-- the earlier scrapbooks<->scrapbook_collaborators mutual-recursion bug this
-- branch already hit once): read the ACTUAL live policies on messages and
-- message_thread_members via pg_policy.
--   - "messages participant select/insert" reference message_thread_members
--     ONLY (one direction).
--   - "thread members participant select" / "thread members self insert" on
--     message_thread_members reference message_thread_members itself (a
--     self-join) and a plain auth.uid() check — never messages.
--   Neither table references message_reactions anywhere (it doesn't exist
--   yet, and this migration does not modify their existing policies). This
--   new table's policies point outward to messages/message_thread_members;
--   nothing points back into message_reactions. One-way dependency graph —
--   the bidirectional shape that caused the earlier 42P17 recursion cannot
--   occur here.
--
-- GRANTS: this project's default ACL already grants `authenticated` full
-- CRUD and `anon` no SELECT/INSERT/UPDATE on any new public table (verified
-- via has_table_privilege against the existing scrapbook_collaborators
-- table). Explicit GRANT/REVOKE below anyway, so this migration is
-- self-documenting rather than depending on an inherited default.
--
-- AUTHORIZATION SPLIT: api_server_v16.js talks to Supabase via the SERVICE
-- ROLE key (bypasses RLS entirely) — same as every other table this branch
-- touched. The real authorization boundary (thread membership, "only your
-- own reaction") is enforced in application code (see the new
-- /api/messages/:id/reactions routes); RLS below is the defense-in-depth
-- backstop for any future direct-client access.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji        text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- One reaction per user per message — "change" is an UPDATE of this row's
  -- emoji, never a second row. Structurally impossible to duplicate.
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx ON public.message_reactions(user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Explicit grants (redundant with this project's default ACL, included for
-- self-documentation): authenticated gets exactly the 4 verbs the RLS
-- policies below actually gate; anon gets nothing; PUBLIC gets nothing.
REVOKE ALL ON public.message_reactions FROM PUBLIC;
REVOKE ALL ON public.message_reactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;

-- Any accepted, non-removed member of the message's thread can see every
-- reaction on it (not just their own) — both sender and recipient need this.
DROP POLICY IF EXISTS "message_reactions: thread member select" ON public.message_reactions;
CREATE POLICY "message_reactions: thread member select"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.message_thread_members mtm ON mtm.thread_id = m.thread_id
    WHERE m.id = message_reactions.message_id
      AND mtm.user_id = auth.uid()
      AND mtm.deleted_at IS NULL
  )
);

-- Caller may only insert a reaction row for THEMSELVES (user_id = auth.uid(),
-- never a client-suppliable other id), and only on a message in a thread they
-- actually belong to — closes off reacting to a message in an unrelated
-- thread by guessing/knowing its id.
DROP POLICY IF EXISTS "message_reactions: self insert" ON public.message_reactions;
CREATE POLICY "message_reactions: self insert"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.message_thread_members mtm ON mtm.thread_id = m.thread_id
    WHERE m.id = message_reactions.message_id
      AND mtm.user_id = auth.uid()
      AND mtm.deleted_at IS NULL
  )
);

-- Only the reacting user can change their own reaction's emoji.
DROP POLICY IF EXISTS "message_reactions: self update" ON public.message_reactions;
CREATE POLICY "message_reactions: self update"
ON public.message_reactions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Only the reacting user can remove their own reaction.
DROP POLICY IF EXISTS "message_reactions: self delete" ON public.message_reactions;
CREATE POLICY "message_reactions: self delete"
ON public.message_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reference only — NOT executed as part of this migration; run
-- manually if this feature ever needs to be fully reverted). Safe/additive:
-- only removes what this file created, touches nothing else.
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "message_reactions: self delete" ON public.message_reactions;
-- DROP POLICY IF EXISTS "message_reactions: self update" ON public.message_reactions;
-- DROP POLICY IF EXISTS "message_reactions: self insert" ON public.message_reactions;
-- DROP POLICY IF EXISTS "message_reactions: thread member select" ON public.message_reactions;
-- DROP TABLE IF EXISTS public.message_reactions;
-- COMMIT;

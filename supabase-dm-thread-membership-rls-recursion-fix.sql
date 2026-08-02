-- ─── FIX: pre-existing RLS recursion in message_threads / messages / message_thread_members ──
-- Discovered live during message_reactions RLS verification (2026-08-01), but
-- this bug is NOT caused by the reactions feature or any migration in this
-- branch — it has been latent in the original (pre-Phase-2) DM schema the
-- whole time. It was never hit before because api_server_v16.js talks to
-- Supabase via the SERVICE ROLE key for every DM route, which bypasses RLS
-- entirely; nothing in this codebase has ever queried these three tables
-- directly as the `authenticated` role until this reaction-persistence work
-- needed to (message_reactions' RLS policies check thread membership, which
-- transitively touches these tables' own RLS).
--
-- Root cause: `message_thread_members`'s own "thread members participant
-- select" policy does a correlated EXISTS against message_thread_members
-- ITSELF. A self-referential RLS policy like this requires Postgres to
-- re-apply the same table's RLS quals to the inner reference, which
-- re-applies the same policy again, forever — ERROR 42P17: infinite
-- recursion detected in policy for relation "message_thread_members".
-- `messages` and `message_threads` each have a policy that does a correlated
-- EXISTS against message_thread_members too, so evaluating THEIR policies
-- transitively hits the same self-recursion inside message_thread_members.
--
-- Confirmed via direct testing: a bare `SELECT * FROM message_thread_members`
-- (or `messages`, or `message_threads`) as the authenticated role — with
-- message_reactions not involved at all — throws the identical error.
--
-- Fix: one SECURITY DEFINER helper function that checks "is auth.uid() a
-- member of this thread" without re-triggering message_thread_members' own
-- RLS (a SECURITY DEFINER function runs as its owner, which bypasses RLS on
-- tables it owns — same mechanism as the earlier scrapbooks<->
-- scrapbook_collaborators fix in this branch). All 4 pre-existing policies
-- that do their own correlated EXISTS against message_thread_members are
-- rewritten to call this function instead. Same authorization intent, zero
-- behavior change — just restructured so Postgres's planner can't loop.
-- The 2 message_reactions policies from the prior migration are also
-- rewritten to use the same helper (cleaner than their own inline join, and
-- consistent with the rest of this fix).
--
-- No caller-suppliable user id parameter (same security lesson already
-- learned earlier this session): the helper takes ONLY p_thread_id and reads
-- auth.uid() internally, so it can only ever answer "am I a member of this
-- thread," never "is user X a member."
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.is_thread_member(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_thread_members
    WHERE thread_id = p_thread_id AND user_id = auth.uid() AND deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_thread_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_thread_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_thread_member(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_thread_member(uuid) TO authenticated;

-- message_thread_members: break the self-recursion
DROP POLICY IF EXISTS "thread members participant select" ON public.message_thread_members;
CREATE POLICY "thread members participant select"
ON public.message_thread_members FOR SELECT TO authenticated
USING ( public.is_thread_member(thread_id) );

-- message_threads: same helper
DROP POLICY IF EXISTS "thread member select" ON public.message_threads;
CREATE POLICY "thread member select"
ON public.message_threads FOR SELECT TO authenticated
USING ( public.is_thread_member(id) );

-- messages: same helper (select + insert)
DROP POLICY IF EXISTS "messages participant select" ON public.messages;
CREATE POLICY "messages participant select"
ON public.messages FOR SELECT TO authenticated
USING ( public.is_thread_member(thread_id) );

DROP POLICY IF EXISTS "messages participant insert" ON public.messages;
CREATE POLICY "messages participant insert"
ON public.messages FOR INSERT TO authenticated
WITH CHECK ( auth.uid() = sender_user_id AND public.is_thread_member(thread_id) );

-- message_reactions (from the prior migration): use the same helper instead
-- of their own inline messages+message_thread_members join.
DROP POLICY IF EXISTS "message_reactions: thread member select" ON public.message_reactions;
CREATE POLICY "message_reactions: thread member select"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND public.is_thread_member(m.thread_id)
  )
);

DROP POLICY IF EXISTS "message_reactions: self insert" ON public.message_reactions;
CREATE POLICY "message_reactions: self insert"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND public.is_thread_member(m.thread_id)
  )
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reference only — NOT executed). Restores the exact prior policy
-- text (still recursive/latent-broken, but byte-identical to what was live
-- before this fix) and drops the helper function.
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "message_reactions: self insert" ON public.message_reactions;
-- CREATE POLICY "message_reactions: self insert" ON public.message_reactions FOR INSERT TO authenticated
--   WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.messages m JOIN public.message_thread_members mtm ON mtm.thread_id = m.thread_id WHERE m.id = message_reactions.message_id AND mtm.user_id = auth.uid() AND mtm.deleted_at IS NULL));
-- DROP POLICY IF EXISTS "message_reactions: thread member select" ON public.message_reactions;
-- CREATE POLICY "message_reactions: thread member select" ON public.message_reactions FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.messages m JOIN public.message_thread_members mtm ON mtm.thread_id = m.thread_id WHERE m.id = message_reactions.message_id AND mtm.user_id = auth.uid() AND mtm.deleted_at IS NULL));
-- DROP POLICY IF EXISTS "messages participant insert" ON public.messages;
-- CREATE POLICY "messages participant insert" ON public.messages FOR INSERT TO authenticated
--   WITH CHECK ((auth.uid() = sender_user_id) AND (EXISTS (SELECT 1 FROM message_thread_members mtm WHERE ((mtm.thread_id = messages.thread_id) AND (mtm.user_id = auth.uid())))));
-- DROP POLICY IF EXISTS "messages participant select" ON public.messages;
-- CREATE POLICY "messages participant select" ON public.messages FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM message_thread_members mtm WHERE ((mtm.thread_id = messages.thread_id) AND (mtm.user_id = auth.uid()))));
-- DROP POLICY IF EXISTS "thread member select" ON public.message_threads;
-- CREATE POLICY "thread member select" ON public.message_threads FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM message_thread_members mtm WHERE ((mtm.thread_id = message_threads.id) AND (mtm.user_id = auth.uid()))));
-- DROP POLICY IF EXISTS "thread members participant select" ON public.message_thread_members;
-- CREATE POLICY "thread members participant select" ON public.message_thread_members FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM message_thread_members mtm WHERE ((mtm.thread_id = message_thread_members.thread_id) AND (mtm.user_id = auth.uid()))));
-- DROP FUNCTION IF EXISTS public.is_thread_member(uuid);
-- COMMIT;

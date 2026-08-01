-- ─── FIX: break RLS mutual-recursion between scrapbooks <-> scrapbook_collaborators ──
-- Discovered live, post-migration, during production RLS verification
-- (2026-08-01): any authenticated-role query that references EITHER
-- public.scrapbooks or public.scrapbook_collaborators throws
--   ERROR 42P17: infinite recursion detected in policy for relation "scrapbooks"
-- Root cause: "scrapbooks: collaborator select" does a correlated EXISTS against
-- scrapbook_collaborators, while "collab: owner select/insert/delete" each do a
-- correlated EXISTS against scrapbooks. Postgres must expand each table's own
-- RLS quals when planning a query that references it, even from inside another
-- table's policy subquery — so evaluating either table's policy pulls in the
-- other's, which pulls the first back in, forever.
--
-- Confirmed live impact: this also broke a plain, unrelated Concert Capsule
-- insert into concert_memories (event_id/scrapbook_id both NULL) under the
-- authenticated role, because concert_memories' new SELECT/INSERT policies
-- also reference scrapbooks/scrapbook_collaborators, pulling the same cycle
-- in for ANY query on concert_memories. This is exactly the code path
-- ScrapbookDetail.saveMemory() (existing, unmodified, direct-client insert)
-- depends on, so it was failing for every real user until this fix.
--
-- Fix: two SECURITY DEFINER helper functions evaluate ownership/acceptance
-- without re-triggering RLS on the table they query (a SECURITY DEFINER
-- function runs as its owner — the tables' owner in this project, `postgres`,
-- which bypasses RLS on its own tables — so calling it from a policy does NOT
-- re-expand that table's RLS quals). Every cross-table policy is then
-- rewritten to call the appropriate function instead of an inline correlated
-- EXISTS. Same authorization intent, restructured so Postgres's planner can't
-- loop.
--
-- SECURITY REVIEW CORRECTION (before this was ever applied to prod): the first
-- draft of these helpers took (p_scrapbook_id, p_user_id) and was callable by
-- any authenticated user — that shape lets a signed-in user pass an arbitrary
-- OTHER user's uuid and probe whether THAT user owns/collaborates on a given
-- scrapbook (ownership/collaboration enumeration across unrelated accounts),
-- since EXECUTE must be granted broadly enough for the RLS policies below to
-- call it. Fixed: each helper now takes ONLY p_scrapbook_id and reads auth.uid()
-- internally — it can only ever answer "does the CALLING user own/collaborate
-- on this scrapbook," never "does user X." SET search_path = '' (not `public`)
-- since every referenced object below is already schema-qualified, closing off
-- search-path hijacking entirely rather than just narrowing it.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Does the CURRENT authenticated user (auth.uid()) own this scrapbook?
CREATE OR REPLACE FUNCTION public.user_owns_scrapbook(p_scrapbook_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scrapbooks
    WHERE id = p_scrapbook_id AND user_id = auth.uid()
  );
$$;

-- Is the CURRENT authenticated user (auth.uid()) an ACCEPTED collaborator on this scrapbook?
CREATE OR REPLACE FUNCTION public.user_is_accepted_scrapbook_collaborator(p_scrapbook_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scrapbook_collaborators
    WHERE scrapbook_id = p_scrapbook_id AND user_id = auth.uid() AND status = 'accepted'
  );
$$;

REVOKE ALL ON FUNCTION public.user_owns_scrapbook(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_scrapbook(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_owns_scrapbook(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_scrapbook(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_is_accepted_scrapbook_collaborator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_accepted_scrapbook_collaborator(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_is_accepted_scrapbook_collaborator(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_accepted_scrapbook_collaborator(uuid) TO authenticated;

-- scrapbooks: collaborator select
DROP POLICY IF EXISTS "scrapbooks: collaborator select" ON public.scrapbooks;
CREATE POLICY "scrapbooks: collaborator select"
ON public.scrapbooks FOR SELECT TO authenticated
USING ( public.user_is_accepted_scrapbook_collaborator(id) );

-- collab: owner select / insert / delete
DROP POLICY IF EXISTS "collab: owner select" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner select"
ON public.scrapbook_collaborators FOR SELECT TO authenticated
USING ( public.user_owns_scrapbook(scrapbook_id) );

DROP POLICY IF EXISTS "collab: owner insert" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner insert"
ON public.scrapbook_collaborators FOR INSERT TO authenticated
WITH CHECK (
  public.user_owns_scrapbook(scrapbook_id)
  AND scrapbook_collaborators.user_id <> auth.uid()
);

DROP POLICY IF EXISTS "collab: owner delete" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner delete"
ON public.scrapbook_collaborators FOR DELETE TO authenticated
USING ( public.user_owns_scrapbook(scrapbook_id) );

-- concert_memories: scrapbook owner select / collaborator select / insert requires membership
DROP POLICY IF EXISTS "concert_memories: scrapbook owner select" ON public.concert_memories;
CREATE POLICY "concert_memories: scrapbook owner select"
ON public.concert_memories FOR SELECT TO authenticated
USING (
  scrapbook_id IS NOT NULL
  AND public.user_owns_scrapbook(scrapbook_id)
);

DROP POLICY IF EXISTS "concert_memories: scrapbook collaborator select" ON public.concert_memories;
CREATE POLICY "concert_memories: scrapbook collaborator select"
ON public.concert_memories FOR SELECT TO authenticated
USING (
  scrapbook_id IS NOT NULL
  AND public.user_is_accepted_scrapbook_collaborator(scrapbook_id)
);

DROP POLICY IF EXISTS "concert_memories: scrapbook insert requires membership" ON public.concert_memories;
CREATE POLICY "concert_memories: scrapbook insert requires membership"
ON public.concert_memories AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  scrapbook_id IS NULL
  OR public.user_owns_scrapbook(scrapbook_id)
  OR public.user_is_accepted_scrapbook_collaborator(scrapbook_id)
);

COMMIT;

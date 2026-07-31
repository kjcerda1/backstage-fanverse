-- Pre-scale security hardening — 2026-07-31
--
-- Idempotent. Safe to re-run. Captures the database privilege/RLS state
-- approved during the pre-scale hardening sprint (see
-- docs/PRE_SCALE_HARDENING_2026-07-31.md for full before/after + verification).
--
-- Section 1 was already applied directly to production prior to this file
-- being written (live incident-style fix). It is restated here in idempotent
-- form purely so the repo has a reproducible record / disaster-recovery path.
-- Sections 2-4 are new fixes applied by this migration.

-- ============================================================================
-- 1. increment_trade_count — already applied live, restated for the record
-- ============================================================================
-- SECURITY DEFINER function that bumps a user's trade_count. Only legitimate
-- caller is the backend (api_server_v16.js, service_role client) after a trade
-- is marked complete. Previously executable by anon (unauthenticated privilege
-- escalation: anyone could inflate any user's trade_count).
REVOKE EXECUTE ON FUNCTION public.increment_trade_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_trade_count(uuid) TO service_role;

-- ============================================================================
-- 2. RLS policies — ask_backstage_usage, capsule_entry_likes, room_messages
-- ============================================================================
-- All three tables had RLS enabled with zero policies (advisor: rls_enabled_no_policy).
-- All reads/writes for all three go exclusively through api_server_v16.js using
-- the service_role client (grep-verified — no frontend code calls these tables
-- directly via the anon/authenticated Supabase client). service_role bypasses
-- RLS entirely, so the app's existing behavior is unaffected by any of this.

-- --- ask_backstage_usage: private per-user AI quota tracking -----------------
-- Only the backend writes this (to enforce the free-tier daily AI request cap).
-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated: letting a user
-- write their own usage_date/request_count row would let them reset or forge
-- their own quota and bypass the rate limit entirely. Read-only, own-row-only.
ALTER TABLE public.ask_backstage_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ask_backstage_usage: owner select" ON public.ask_backstage_usage;
CREATE POLICY "ask_backstage_usage: owner select" ON public.ask_backstage_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- --- capsule_entry_likes: mirrors the existing post_likes policy shape --------
-- (public.post_likes already uses this exact pattern: public read, owner-only
-- insert/delete.) Preserves visible like counts while preventing one user from
-- creating or deleting another user's like row.
ALTER TABLE public.capsule_entry_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capsule_entry_likes: public read" ON public.capsule_entry_likes;
CREATE POLICY "capsule_entry_likes: public read" ON public.capsule_entry_likes
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "capsule_entry_likes: authenticated insert" ON public.capsule_entry_likes;
CREATE POLICY "capsule_entry_likes: authenticated insert" ON public.capsule_entry_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "capsule_entry_likes: owner delete" ON public.capsule_entry_likes;
CREATE POLICY "capsule_entry_likes: owner delete" ON public.capsule_entry_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- --- room_messages: matches current, documented backend behavior -------------
-- api_server_v16.js (GET/POST /api/rooms/:roomId/messages) has an explicit
-- comment: "Any signed-in fan who can open the meetup can read/post — same
-- openness as the previous mock chat. RSVP-gating is a future hardening."
-- There is no membership/participant table gating room access today, so an
-- authenticated-read / owner-write policy matches current real behavior
-- exactly rather than inventing a membership model that doesn't exist yet.
-- Attendee/RSVP-scoped room access remains an explicitly deferred follow-up
-- (tracked in docs/PRE_SCALE_HARDENING_2026-07-31.md), not a regression here.
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "room_messages: authenticated read" ON public.room_messages;
CREATE POLICY "room_messages: authenticated read" ON public.room_messages
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "room_messages: authenticated insert" ON public.room_messages;
CREATE POLICY "room_messages: authenticated insert" ON public.room_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 3. RPC least-privilege grants — post like counters
-- ============================================================================
-- increment_post_likes / decrement_post_likes are SECURITY DEFINER and already
-- validate auth.role() IN ('authenticated','service_role') and are already
-- search_path-hardened (search_path=""). But the only legitimate caller is the
-- backend's /api/feed/like route (service_role), which enforces one-like-per-
-- user via the post_likes table before calling the RPC. Leaving EXECUTE open
-- to `authenticated` lets any signed-in user call the RPC directly via
-- PostgREST and spam-inflate/deflate any post's like count with no post_likes
-- row ever created. Restrict to service_role only; app behavior is unchanged
-- since the backend already calls this with the service_role client.
REVOKE EXECUTE ON FUNCTION public.increment_post_likes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_post_likes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_likes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_post_likes(uuid) TO service_role;

-- ============================================================================
-- 4. RPC least-privilege grant + search_path fix — increment_card_count
-- ============================================================================
-- Only caller is the backend's card-template-count-bump path (service_role).
-- Was executable by anon/authenticated with no owner/auth check at all, and
-- had a mutable search_path (advisor: function_search_path_mutable). Function
-- body already schema-qualifies its one reference (public.card_templates), so
-- pinning an empty search_path is safe and doesn't require touching the body.
REVOKE EXECUTE ON FUNCTION public.increment_card_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_card_count(uuid) TO service_role;
ALTER FUNCTION public.increment_card_count(uuid) SET search_path = '';

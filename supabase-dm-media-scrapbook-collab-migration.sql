-- ─── DM Composer Phase 2 — Photo/Video, Voice Notes, Shared Scrapbook collab ──
-- Run this in the Supabase SQL editor (or via supabase db push). ADDITIVE ONLY —
-- no destructive changes, no data transforms.
--
-- REVISED after a live-schema review (2026-07-31) that read the actual
-- production database via read-only queries (information_schema, pg_policy,
-- pg_constraint — no writes). Two assumptions in the first draft of this file
-- were WRONG and have been corrected here:
--   1. `public.scrapbooks` ALREADY EXISTS in production (0 rows, unused by any
--      current app code) with columns (id, user_id, title, color, emoji,
--      entries jsonb, created_at, updated_at) — NOT (owner_id, name, concert,
--      template, cover_photo) as first assumed. A blind `CREATE TABLE IF NOT
--      EXISTS` would have silently no-opped, and every route in this branch
--      would have 500'd on "column does not exist" the moment it was applied.
--      Fixed by ALTERing the real table instead of trying to create a new one.
--   2. `concert_memories.event_id` has a live, VALIDATED foreign key to
--      `events.id` (both text). Reusing `event_id` to store a scrapbook's uuid
--      (the first draft's approach) would fail that FK on every insert for a
--      scrapbook not also a real Ticketmaster/curated event — silently, since
--      the one existing call site (ScrapbookDetail's direct Supabase insert)
--      doesn't check the insert's error. Fixed with a new, separate
--      `scrapbook_id` column + its own FK to `scrapbooks(id)`, leaving
--      `event_id`/its FK to `events` completely untouched — Concert Capsule's
--      behavior is unaffected.
--
-- NOTE: api_server_v16.js talks to Supabase with the SERVICE ROLE key, which
-- bypasses RLS entirely. Every route added in this sprint enforces authorization
-- in application code (thread-membership / scrapbook-ownership / accepted-
-- collaborator checks) — the RLS policies below are defense-in-depth, matching
-- every other table/bucket in this repo. They matter most for the one place
-- this branch does NOT go through the backend: ScrapbookDetail's memory-save
-- still inserts directly via the browser's Supabase client (existing,
-- unmodified code path) — for THAT path RLS is the only enforcement, which is
-- exactly why the RESTRICTIVE policy in §5 exists.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. messages.media — photo/video/voice-note/scrapbook-invite payload
-- ═══════════════════════════════════════════════════════════════════════════
-- Nullable jsonb, same pattern as the existing `gif` column (see
-- supabase-messages-gif-migration.sql). Verified against the live `messages`
-- table (id uuid pk, thread_id/sender_user_id not null, body/gif already
-- nullable, RLS "messages participant select/insert" already scope every row
-- to thread members) — purely additive, no existing query or constraint is
-- affected by a new nullable column.
--
-- Shapes stored:
--   Photo/video: { kind:'image'|'video', path, mimeType, width?, height?, durationSec? }
--     `path` is a storage PATH in the private `dm-media` bucket, not a URL —
--     the backend mints a short-lived signed URL at read time (see §2), and
--     ONLY after independently verifying the path is prefixed with the
--     sender's own user id + the thread id (see api_server_v16.js
--     `sanitizeDmMedia` — this is enforced in application code because a
--     storage path is an opaque string RLS can't meaningfully constrain here).
--   Voice note:  { kind:'voice', path, mimeType, durationSec }
--   Scrapbook invite: { kind:'scrapbook_invite', scrapbookId, scrapbookName, scrapbookEmoji }
--     Invite STATUS is intentionally not duplicated here — the frontend/backend
--     read live status from scrapbook_collaborators (§4) so accept/decline never
--     goes stale relative to the message row.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media jsonb;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Storage bucket `dm-media` — private, signed URLs at read time
-- ═══════════════════════════════════════════════════════════════════════════
-- Verified this bucket id does not already exist (existing buckets: avatars,
-- banners, card-images, feed-media, memories, trade-proof). Mirrors the
-- `memories` bucket pattern (private + createSignedUrl at read time) rather
-- than the public `avatars`/`card-images` pattern, because DM attachments are
-- private 1:1 conversation content, not profile-facing media.
-- Path convention: {sender_user_id}/{thread_id}/{timestamp}.{ext}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dm-media',
  'dm-media',
  false,                                      -- private: access only via signed URLs
  25165824,                                   -- 24 MB per file (covers short voice notes + video clips)
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic',
    'video/mp4','video/quicktime','video/webm',
    'audio/webm','audio/mp4','audio/m4a','audio/mpeg','audio/ogg','audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = 25165824,
  allowed_mime_types = ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic',
    'video/mp4','video/quicktime','video/webm',
    'audio/webm','audio/mp4','audio/m4a','audio/mpeg','audio/ogg','audio/wav'
  ];

-- Owner-scoped write/read policies (defense-in-depth; the backend's own signed
-- URL generation uses the service-role key and does not depend on these — see
-- api_server_v16.js POST /api/messages/upload-url, which independently checks
-- message_thread_members before minting a path under the caller's own id).
DROP POLICY IF EXISTS "dm-media: owner upload" ON storage.objects;
CREATE POLICY "dm-media: owner upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dm-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "dm-media: owner read" ON storage.objects;
CREATE POLICY "dm-media: owner read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dm-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "dm-media: owner delete" ON storage.objects;
CREATE POLICY "dm-media: owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dm-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- NOTE: no recipient-side read policy — the sender's folder-owner id is the
-- other thread member's counterpart. Recipients read media exclusively through
-- backend-minted signed URLs (service role bypasses RLS), scoped by the
-- existing message_thread_members membership check AND the new path-prefix
-- validation in sanitizeDmMedia() (application code, not SQL — a client could
-- otherwise pass an arbitrary path string in the send payload and have the
-- backend happily sign a URL for someone else's file).
--
-- KNOWN LIMITATION (documented per review, not fixed this pass): an upload
-- that completes (file lands in the bucket) but is never followed by a
-- successful POST /thread/:id/send — abandoned attachment, failed validation,
-- network drop — leaves an orphaned object in dm-media with no cleanup job.
-- Same class of limitation as every other signed-upload flow already in this
-- repo (card-images, memories). Not addressed here; flag if it becomes a
-- storage-cost concern.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. scrapbooks — ALTER the EXISTING table, do not attempt to create it
-- ═══════════════════════════════════════════════════════════════════════════
-- public.scrapbooks already exists in production: id uuid pk, user_id uuid not
-- null, title text not null, color text, emoji text, entries jsonb default
-- '[]', created_at, updated_at. 0 rows, no FK dependents, RLS already enabled
-- with one policy: "Own scrapbooks" FOR ALL USING (auth.uid() = user_id) — no
-- explicit WITH CHECK, but per Postgres semantics a FOR ALL/INSERT/UPDATE
-- policy with only USING reuses that expression as the WITH CHECK too, so this
-- is already correctly owner-scoped for every command including INSERT.
-- Verified via pg_policy directly (polwithcheck), not just the summary view.
--
-- This app's ScrapbookTab/ScrapbookDetail never used this table before this
-- branch (it used localStorage + concert_memories) — the `entries` jsonb
-- column looks like an earlier, different, abandoned design and is left
-- completely untouched here; nothing in this branch reads or writes it.
--
-- Add only the 3 columns this branch actually needs. The backend maps its
-- request/response JSON key `name` to/from this `title` column at the API
-- boundary (see api_server_v16.js) — no frontend changes were needed for this
-- rename since the frontend already only ever spoke to `name` via the API,
-- never to the raw column.
ALTER TABLE public.scrapbooks ADD COLUMN IF NOT EXISTS concert     text;
ALTER TABLE public.scrapbooks ADD COLUMN IF NOT EXISTS template    text;
ALTER TABLE public.scrapbooks ADD COLUMN IF NOT EXISTS cover_photo text;

-- The existing "Own scrapbooks" policy already grants the owner full CRUD —
-- left untouched. The only new access this branch requires is letting an
-- ACCEPTED collaborator see a scrapbook they didn't create (owner-only cannot
-- cover this — a different user_id). That policy is created at the END of
-- §4 below, once scrapbook_collaborators (which it references) actually
-- exists — CREATE POLICY on scrapbooks referencing a not-yet-created table
-- would fail if run in file order otherwise.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. scrapbook_collaborators — invite/accept/decline membership (new table,
--    verified it does not already exist)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scrapbook_collaborators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrapbook_id  uuid NOT NULL REFERENCES public.scrapbooks(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined')),
  invited_by    uuid REFERENCES auth.users(id),
  thread_id     uuid REFERENCES public.message_threads(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  UNIQUE (scrapbook_id, user_id)
);
CREATE INDEX IF NOT EXISTS scrapbook_collaborators_scrapbook_id_idx ON public.scrapbook_collaborators(scrapbook_id);
CREATE INDEX IF NOT EXISTS scrapbook_collaborators_user_id_idx ON public.scrapbook_collaborators(user_id);

ALTER TABLE public.scrapbook_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collab: self select" ON public.scrapbook_collaborators;
CREATE POLICY "collab: self select"
ON public.scrapbook_collaborators FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Recipient can only update THEIR OWN row (accept/decline) — the inviter
-- cannot accept on the recipient's behalf because this is scoped to
-- user_id = auth.uid(), which is always the authenticated caller, never
-- client-suppliable.
DROP POLICY IF EXISTS "collab: self respond" ON public.scrapbook_collaborators;
CREATE POLICY "collab: self respond"
ON public.scrapbook_collaborators FOR UPDATE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "collab: owner select" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner select"
ON public.scrapbook_collaborators FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = scrapbook_collaborators.scrapbook_id AND s.user_id = auth.uid())
);

-- Owner-only invite creation, AND an owner cannot invite themselves (both
-- enforced again in application code — see POST /api/scrapbooks/:id/invite —
-- this is the DB-level backstop).
DROP POLICY IF EXISTS "collab: owner insert" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner insert"
ON public.scrapbook_collaborators FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = scrapbook_collaborators.scrapbook_id AND s.user_id = auth.uid())
  AND scrapbook_collaborators.user_id <> auth.uid()
);

-- Owner can revoke (DELETE /api/scrapbooks/:id/collaborators/:userId) —
-- removing the row is immediate: the next read/write authorization check
-- (getScrapbookAccess) finds no accepted row and 403s right away, nothing is
-- cached server-side.
DROP POLICY IF EXISTS "collab: owner delete" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner delete"
ON public.scrapbook_collaborators FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = scrapbook_collaborators.scrapbook_id AND s.user_id = auth.uid())
);

-- Now that scrapbook_collaborators exists, an accepted collaborator can also
-- read the parent scrapbooks row itself (the existing "Own scrapbooks" policy
-- is owner-only and would otherwise 403 them).
DROP POLICY IF EXISTS "scrapbooks: collaborator select" ON public.scrapbooks;
CREATE POLICY "scrapbooks: collaborator select"
ON public.scrapbooks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.scrapbook_collaborators sc
    WHERE sc.scrapbook_id = scrapbooks.id
      AND sc.user_id = auth.uid()
      AND sc.status = 'accepted'
  )
);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. concert_memories — a NEW, separate scrapbook_id column (event_id and its
--    FK to `events` are completely untouched — Concert Capsule is unaffected)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.concert_memories
  ADD COLUMN IF NOT EXISTS scrapbook_id uuid REFERENCES public.scrapbooks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS concert_memories_scrapbook_id_idx ON public.concert_memories(scrapbook_id);

-- Existing owner policies ("concert_memories: owner select/insert/delete",
-- plus older legacy-named duplicates already in prod) are untouched — a user
-- can always see/manage memories they personally authored, scrapbook or not.
-- These two PERMISSIVE policies ADD visibility an owner/collaborator wouldn't
-- otherwise have: seeing memories a DIFFERENT collaborator authored in a
-- scrapbook they own or accepted into. Scoped strictly to scrapbook_id IS NOT
-- NULL rows — zero effect on Concert Capsule rows (scrapbook_id always null there).
DROP POLICY IF EXISTS "concert_memories: scrapbook owner select" ON public.concert_memories;
CREATE POLICY "concert_memories: scrapbook owner select"
ON public.concert_memories FOR SELECT TO authenticated
USING (
  scrapbook_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = concert_memories.scrapbook_id AND s.user_id = auth.uid())
);

DROP POLICY IF EXISTS "concert_memories: scrapbook collaborator select" ON public.concert_memories;
CREATE POLICY "concert_memories: scrapbook collaborator select"
ON public.concert_memories FOR SELECT TO authenticated
USING (
  scrapbook_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.scrapbook_collaborators sc
    WHERE sc.scrapbook_id = concert_memories.scrapbook_id AND sc.user_id = auth.uid() AND sc.status = 'accepted'
  )
);

-- ── The critical fix from this review ──────────────────────────────────────
-- The pre-existing "concert_memories: owner insert" policy is
-- `WITH CHECK (user_id = auth.uid())` ONLY — it never checked scrapbook
-- membership, because scrapbooks didn't exist when it was written. Multiple
-- PERMISSIVE policies on the same command are combined with OR, so simply
-- adding another permissive "membership" insert policy would have changed
-- NOTHING (the existing permissive owner-insert policy already lets anyone
-- insert any row tagged with their own user_id, scrapbook_id included). A
-- RESTRICTIVE policy is required to actually narrow this: it ANDs with every
-- permissive policy's result. This closes the gap where an authenticated
-- stranger — not invited, not accepted — could otherwise insert a
-- self-authored memory into someone else's private scrapbook purely by
-- guessing/knowing its uuid, via the app's existing direct-Supabase-client
-- insert in ScrapbookDetail's saveMemory() (browser calls Supabase directly
-- there, not through the backend — RLS is the ONLY gate on that call site).
DROP POLICY IF EXISTS "concert_memories: scrapbook insert requires membership" ON public.concert_memories;
CREATE POLICY "concert_memories: scrapbook insert requires membership"
ON public.concert_memories AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  scrapbook_id IS NULL
  OR EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = concert_memories.scrapbook_id AND s.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.scrapbook_collaborators sc
    WHERE sc.scrapbook_id = concert_memories.scrapbook_id AND sc.user_id = auth.uid() AND sc.status = 'accepted'
  )
);

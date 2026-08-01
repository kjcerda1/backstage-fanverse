-- ─── DM Composer Phase 2 — Photo/Video, Voice Notes, Shared Scrapbook collab ──
-- Run this in the Supabase SQL editor (or via supabase db push). ADDITIVE ONLY —
-- no destructive changes, no data transforms. Every ALTER uses IF NOT EXISTS /
-- CREATE POLICY guarded by DROP POLICY IF EXISTS, matching the style of the
-- existing supabase-*.sql migrations in this repo.
--
-- NOTE: api_server_v16.js talks to Supabase with the SERVICE ROLE key, which
-- bypasses RLS entirely. Every route added in this sprint enforces authorization
-- in application code (owner/thread-membership/accepted-collaborator checks),
-- the same pattern already used for message_thread_members. The RLS policies
-- below are defense-in-depth, matching every other bucket/table in this repo —
-- they are not the primary authorization mechanism.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. messages.media — photo/video/voice-note/scrapbook-invite payload
-- ═══════════════════════════════════════════════════════════════════════════
-- Nullable jsonb, same pattern as the existing `gif` column (see
-- supabase-messages-gif-migration.sql). Only one of body/gif/media needs to be
-- present per message (body is already nullable from that prior migration).
--
-- Shapes stored:
--   Photo/video: { kind:'image'|'video', path, mimeType, width?, height?, durationSec?, thumbPath? }
--     `path` is a storage PATH in the private `dm-media` bucket, not a URL —
--     the backend mints a short-lived signed URL at read time (see §2).
--   Voice note:  { kind:'voice', path, mimeType, durationSec }
--   Scrapbook invite: { kind:'scrapbook_invite', scrapbookId, scrapbookName, scrapbookEmoji }
--     Invite STATUS is intentionally not duplicated here — the frontend/backend
--     read live status from scrapbook_collaborators (§4) so accept/decline never
--     goes stale relative to the message row.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media jsonb;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Storage bucket `dm-media` — private, signed URLs at read time
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors the `memories` bucket pattern (private + createSignedUrl at read
-- time) rather than the public `avatars`/`card-images` pattern, because DM
-- attachments are private 1:1 conversation content, not profile-facing media.
-- Path convention: {sender_user_id}/{thread_id}/{timestamp}-{filename}
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
-- URL generation uses the service-role key and does not depend on these).
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
-- existing message_thread_members membership check.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. scrapbooks — the "book" entity does not exist server-side today.
-- ═══════════════════════════════════════════════════════════════════════════
-- ScrapbookTab currently keeps books in localStorage only (`backstage_scrapbooks`)
-- with a client-generated id and a fake "collab code" that's never validated
-- anywhere (see the `// TODO: POST /api/scrapbooks/join?code=XXXX` in App.jsx).
-- Real DM collaboration requires a real row other users can be granted access to.
CREATE TABLE IF NOT EXISTS public.scrapbooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  concert     text,
  emoji       text DEFAULT '📸',
  color       text,
  template    text,
  cover_photo text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scrapbooks_owner_id_idx ON public.scrapbooks(owner_id);

ALTER TABLE public.scrapbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scrapbooks: owner select" ON public.scrapbooks;
CREATE POLICY "scrapbooks: owner select"
ON public.scrapbooks FOR SELECT TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "scrapbooks: owner insert" ON public.scrapbooks;
CREATE POLICY "scrapbooks: owner insert"
ON public.scrapbooks FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "scrapbooks: owner update" ON public.scrapbooks;
CREATE POLICY "scrapbooks: owner update"
ON public.scrapbooks FOR UPDATE TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "scrapbooks: owner delete" ON public.scrapbooks;
CREATE POLICY "scrapbooks: owner delete"
ON public.scrapbooks FOR DELETE TO authenticated
USING (owner_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. scrapbook_collaborators — invite/accept/decline membership
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

-- Now that scrapbook_collaborators exists, collaborators can also read the
-- parent scrapbook row itself (owner-only above would otherwise 403 them).
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

DROP POLICY IF EXISTS "collab: self select" ON public.scrapbook_collaborators;
CREATE POLICY "collab: self select"
ON public.scrapbook_collaborators FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "collab: self respond" ON public.scrapbook_collaborators;
CREATE POLICY "collab: self respond"
ON public.scrapbook_collaborators FOR UPDATE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "collab: owner select" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner select"
ON public.scrapbook_collaborators FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = scrapbook_collaborators.scrapbook_id AND s.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "collab: owner insert" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner insert"
ON public.scrapbook_collaborators FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = scrapbook_collaborators.scrapbook_id AND s.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "collab: owner delete" ON public.scrapbook_collaborators;
CREATE POLICY "collab: owner delete"
ON public.scrapbook_collaborators FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.scrapbooks s WHERE s.id = scrapbook_collaborators.scrapbook_id AND s.owner_id = auth.uid())
);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. concert_memories — extend RLS so accepted collaborators can read/add
--    memories inside a shared scrapbook (event_id stores the scrapbook's uuid
--    as text once scrapbooks are created through the new backend route).
-- ═══════════════════════════════════════════════════════════════════════════
-- Existing owner-only policies from supabase-storage-migration.sql are left
-- untouched — these are additive OR-policies (Postgres RLS policies are
-- combined with OR per command), so nothing already granted is narrowed.
DROP POLICY IF EXISTS "concert_memories: collaborator select" ON public.concert_memories;
CREATE POLICY "concert_memories: collaborator select"
ON public.concert_memories FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.scrapbook_collaborators sc
    WHERE sc.scrapbook_id::text = concert_memories.event_id
      AND sc.user_id = auth.uid()
      AND sc.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "concert_memories: collaborator insert" ON public.concert_memories;
CREATE POLICY "concert_memories: collaborator insert"
ON public.concert_memories FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.scrapbook_collaborators sc
    WHERE sc.scrapbook_id::text = concert_memories.event_id
      AND sc.user_id = auth.uid()
      AND sc.status = 'accepted'
  )
);

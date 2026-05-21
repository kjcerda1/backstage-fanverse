-- ─── Phase 2A: Supabase Storage — memories bucket ────────────────────────────
-- Run this in the Supabase SQL editor (or via supabase db push).
--
-- The bucket is PRIVATE. Images are served via short-lived signed URLs
-- generated at read time. No public/anon access to the bucket.
--
-- If you created the bucket manually in the Supabase dashboard:
--   - Skip section 1 (bucket INSERT).
--   - Skip any owner policies you already added.
--   - Run sections 2–4 for the indexes and concert_memories RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the memories bucket (skip if already created in dashboard)
--    Set public = false to keep the bucket private.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memories',
  'memories',
  false,                                     -- private: access only via signed URLs
  5242880,                                   -- 5 MB per file
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public            = false,                 -- enforce private if bucket already exists
  file_size_limit   = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp'];


-- 2. RLS policies for storage.objects
--    Path convention: {user_id}/concert-memories/{scrapbook_id}/{timestamp}-{filename}
--
--    Skip any policy below if you already created it in the dashboard.

-- Allow authenticated users to INSERT into their own folder
DROP POLICY IF EXISTS "memories: owner upload" ON storage.objects;
CREATE POLICY "memories: owner upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to SELECT (read) their own files
-- Required for createSignedUrl() to succeed
DROP POLICY IF EXISTS "memories: owner read" ON storage.objects;
CREATE POLICY "memories: owner read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to DELETE their own files
DROP POLICY IF EXISTS "memories: owner delete" ON storage.objects;
CREATE POLICY "memories: owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to UPDATE their own files
DROP POLICY IF EXISTS "memories: owner update" ON storage.objects;
CREATE POLICY "memories: owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- NOTE: No public/anon read policy is added.
-- To display images, generate a signed URL server-side or client-side:
--   _supabase.storage.from('memories').createSignedUrl(path, 3600)
-- The photos column in concert_memories stores the storage PATH, not a URL.


-- 3. concert_memories schema note
--    The photos column (text[]) now stores storage PATHS, not URLs.
--    Example path: {user_id}/concert-memories/{scrapbook_id}/1712345678-photo.jpg
--
--    Existing columns (no schema change required):
--      id            uuid primary key
--      user_id       uuid references auth.users
--      event_id      text       -- used as scrapbook_id for scrapbook memories
--      photos        text[]     -- storage paths (not URLs)
--      notes         text       -- JSON: { title, text, type, date, event, venue, city, tags, linkedSong, favorite }
--      outfit        text
--      people_met    text[]
--      meetups_attended text[]
--      after_parties text[]
--      created_at    timestamptz default now()

-- Indexes for faster scrapbook queries
CREATE INDEX IF NOT EXISTS concert_memories_event_id_idx
  ON public.concert_memories (event_id);

CREATE INDEX IF NOT EXISTS concert_memories_user_id_idx
  ON public.concert_memories (user_id);


-- 4. RLS on concert_memories
ALTER TABLE public.concert_memories ENABLE ROW LEVEL SECURITY;

-- Users can only read their own memories
DROP POLICY IF EXISTS "concert_memories: owner select" ON public.concert_memories;
CREATE POLICY "concert_memories: owner select"
ON public.concert_memories FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only insert their own memories
DROP POLICY IF EXISTS "concert_memories: owner insert" ON public.concert_memories;
CREATE POLICY "concert_memories: owner insert"
ON public.concert_memories FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only delete their own memories
DROP POLICY IF EXISTS "concert_memories: owner delete" ON public.concert_memories;
CREATE POLICY "concert_memories: owner delete"
ON public.concert_memories FOR DELETE
TO authenticated
USING (user_id = auth.uid());

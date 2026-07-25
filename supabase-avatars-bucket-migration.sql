-- ─── Profile Avatars — Supabase Storage `avatars` bucket ─────────────────────
-- Run this in the Supabase SQL editor (or via supabase db push).
--
-- Backs POST /api/profile/avatar. Unlike the `memories` bucket, this one is
-- PUBLIC: users.avatar_url is persisted and shown to OTHER users (DMs, inbox,
-- friend requests, circle), so images are served via a stable public URL —
-- a short-lived signed URL would expire and break every avatar.
--
-- The backend uploads with the service-role key, which bypasses storage RLS, so
-- the WRITE policies below are only needed if you ever add direct client-side
-- uploads. Public READ is automatic for a public bucket (no policy required).
--
-- If you created the bucket manually in the dashboard, skip section 1.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the avatars bucket (public read, 5 MB, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,                                      -- public: served via stable public URL
  5242880,                                   -- 5 MB per file
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,                 -- enforce public if bucket already exists
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp'];


-- 2. (OPTIONAL) Owner-scoped write policies for direct client-side uploads.
--    NOT required for the current server-side (service-role) upload flow.
--    Path convention: {user_id}/avatar.{ext}

-- Allow authenticated users to INSERT into their own folder
DROP POLICY IF EXISTS "avatars: owner upload" ON storage.objects;
CREATE POLICY "avatars: owner upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to UPDATE (re-upload / upsert) their own avatar
DROP POLICY IF EXISTS "avatars: owner update" ON storage.objects;
CREATE POLICY "avatars: owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to DELETE their own avatar
DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;
CREATE POLICY "avatars: owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- NOTE: users.avatar_url already exists (selected across the backend). No schema
-- change to public.users is required — this migration only adds the storage bucket.

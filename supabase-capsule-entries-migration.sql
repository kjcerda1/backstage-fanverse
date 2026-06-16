-- Concert Capsule entries table
-- Apply in Supabase dashboard: SQL Editor → paste → Run
-- After applying, redeploy Render backend (no env changes needed)

CREATE TABLE capsule_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id  text        NOT NULL,
  user_id     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  category    text        NOT NULL DEFAULT 'fit',
  caption     text        NOT NULL,
  username    text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX capsule_entries_concert_id_idx ON capsule_entries(concert_id, created_at DESC);
CREATE INDEX capsule_entries_user_id_idx    ON capsule_entries(user_id);

-- Optional: RLS (lock down writes to authenticated users)
ALTER TABLE capsule_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capsule_entries_select" ON capsule_entries FOR SELECT USING (true);
CREATE POLICY "capsule_entries_insert" ON capsule_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "capsule_entries_delete" ON capsule_entries FOR DELETE USING (auth.uid() = user_id);

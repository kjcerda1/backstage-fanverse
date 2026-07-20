-- ─── FEED ENGAGEMENT: REPOSTS, SAVES, REACTIONS ──────────────────────────────
-- Makes the last three fake buttons on a feed card real. Before this, repost /
-- save / emoji-reaction were client-local toggles that reset on reload and that
-- nobody else could see.
--
-- Three different visibility models on purpose:
--   post_reposts   PUBLIC  — has a count on posts.reposts, notifies the author
--   post_saves     PRIVATE — a personal bookmark. No public count, no notification.
--                            Nobody but the saver can see it.
--   post_reactions PUBLIC  — aggregate {emoji: count}, one reaction per user per
--                            post (changing your emoji replaces it, never stacks)
--
-- Counter convention follows post_comments (triggers, not RPCs) — see
-- supabase-post-comments-migration.sql for the cascade reasoning. Reaction totals
-- are NOT denormalised: they're computed on read with one grouped query per feed
-- page, which avoids a jsonb counter trigger for data that changes shape often.

-- ── posts.reposts ────────────────────────────────────────────────────────────
alter table public.posts add column if not exists reposts integer not null default 0;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.post_reposts (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
comment on table public.post_reposts is
  'Public reposts. posts.reposts is kept in sync by post_reposts_count_trg.';
create index if not exists post_reposts_user_idx on public.post_reposts(user_id, created_at desc);

create table if not exists public.post_saves (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
comment on table public.post_saves is
  'PRIVATE bookmarks. Deliberately has no count column and no notification — a save must never be visible to the post author or anyone else.';
create index if not exists post_saves_user_idx on public.post_saves(user_id, created_at desc);

create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),          -- one reaction per user per post
  constraint post_reactions_emoji_len check (char_length(emoji) between 1 and 16)
);
comment on table public.post_reactions is
  'One emoji reaction per user per post. Changing your reaction UPDATEs this row rather than inserting a second one. Totals are computed on read, not denormalised.';
create index if not exists post_reactions_post_idx on public.post_reactions(post_id);

-- ── posts.reposts counter trigger ────────────────────────────────────────────

create or replace function public.sync_post_repost_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reposts = coalesce(reposts, 0) + 1 where id = new.post_id;
    return new;
  else
    update public.posts set reposts = greatest(0, coalesce(reposts, 0) - 1) where id = old.post_id;
    return old;
  end if;
end $$;

drop trigger if exists post_reposts_count_trg on public.post_reposts;
create trigger post_reposts_count_trg
after insert or delete on public.post_reposts
for each row execute function public.sync_post_repost_count();

-- Trigger-only function: keep it SECURITY DEFINER (it updates posts on behalf of
-- users with no direct UPDATE right) but never expose it as a PostgREST RPC.
-- See hard rule 17 / Supabase advisor lint 0028+0029.
revoke all on function public.sync_post_repost_count() from anon, authenticated, public;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Reposts and reactions are public-read like post_likes. SAVES ARE NOT: a save is
-- private to its owner, so there is no public read policy on post_saves.

alter table public.post_reposts   enable row level security;
alter table public.post_saves     enable row level security;
alter table public.post_reactions enable row level security;

drop policy if exists "post_reposts: public read"          on public.post_reposts;
drop policy if exists "post_reposts: authenticated insert" on public.post_reposts;
drop policy if exists "post_reposts: owner delete"         on public.post_reposts;
create policy "post_reposts: public read"
  on public.post_reposts for select to anon, authenticated using (true);
create policy "post_reposts: authenticated insert"
  on public.post_reposts for insert to authenticated with check (user_id = auth.uid());
create policy "post_reposts: owner delete"
  on public.post_reposts for delete to authenticated using (user_id = auth.uid());

-- Owner-only on every verb. No anon policy at all.
drop policy if exists "post_saves: owner read"   on public.post_saves;
drop policy if exists "post_saves: owner insert" on public.post_saves;
drop policy if exists "post_saves: owner delete" on public.post_saves;
create policy "post_saves: owner read"
  on public.post_saves for select to authenticated using (user_id = auth.uid());
create policy "post_saves: owner insert"
  on public.post_saves for insert to authenticated with check (user_id = auth.uid());
create policy "post_saves: owner delete"
  on public.post_saves for delete to authenticated using (user_id = auth.uid());

drop policy if exists "post_reactions: public read"          on public.post_reactions;
drop policy if exists "post_reactions: authenticated insert" on public.post_reactions;
drop policy if exists "post_reactions: owner update"         on public.post_reactions;
drop policy if exists "post_reactions: owner delete"         on public.post_reactions;
create policy "post_reactions: public read"
  on public.post_reactions for select to anon, authenticated using (true);
create policy "post_reactions: authenticated insert"
  on public.post_reactions for insert to authenticated with check (user_id = auth.uid());
create policy "post_reactions: owner update"
  on public.post_reactions for update to authenticated using (user_id = auth.uid());
create policy "post_reactions: owner delete"
  on public.post_reactions for delete to authenticated using (user_id = auth.uid());

-- ── Backfill ─────────────────────────────────────────────────────────────────
update public.posts p
set reposts = coalesce((select count(*) from public.post_reposts r where r.post_id = p.id), 0)
where coalesce(p.reposts, 0) is distinct from
      coalesce((select count(*) from public.post_reposts r where r.post_id = p.id), 0);

-- ─── FANVERSE FEED COMMENTS ──────────────────────────────────────────────────
-- Adds threaded comments (one level of replies) + comment likes to feed posts.
-- Companion to the 2026-07-20 feed wiring. `posts.comments` already existed as a
-- column but nothing ever wrote it — these triggers make it authoritative.
--
-- DESIGN NOTE — why triggers instead of increment_/decrement_ RPCs:
-- `post_likes` keeps `posts.likes` in sync via explicit RPCs called from the API.
-- That pattern does NOT survive cascades: deleting a top-level comment cascade-
-- deletes its replies, and a single decrement call would leave `posts.comments`
-- permanently too high. Row-level triggers count every affected row, including
-- cascaded ones, so the counters are self-correcting. Do not replace these with
-- RPCs without also handling the cascade.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id)         on delete cascade,
  user_id    uuid not null references public.users(id)         on delete cascade,
  parent_id  uuid          references public.post_comments(id) on delete cascade,
  body       text not null,
  likes      integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.post_comments is
  'Fanverse feed comments. One level of nesting only: parent_id points at a top-level comment and is enforced non-recursive by the post_comments_depth_trg trigger.';

create index if not exists post_comments_post_created_idx on public.post_comments(post_id, created_at);
create index if not exists post_comments_parent_idx       on public.post_comments(parent_id);
create index if not exists post_comments_user_idx         on public.post_comments(user_id);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.users(id)         on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

comment on table public.comment_likes is
  'One row per comment like. post_comments.likes is kept in sync by comment_likes_count_trg.';

create index if not exists comment_likes_user_idx on public.comment_likes(user_id);

-- ── Depth + integrity guard ──────────────────────────────────────────────────
-- Rejects replies-to-replies and cross-post parents at the DB level, so a bug in
-- any future caller can't create a tree the reader can't render.

create or replace function public.enforce_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_parent uuid;
  parent_post   uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id, post_id into parent_parent, parent_post
  from public.post_comments where id = new.parent_id;

  if not found then
    raise exception 'parent comment % does not exist', new.parent_id;
  end if;
  if parent_parent is not null then
    raise exception 'replies to replies are not supported (one level only)';
  end if;
  if parent_post is distinct from new.post_id then
    raise exception 'parent comment belongs to a different post';
  end if;

  return new;
end $$;

drop trigger if exists post_comments_depth_trg on public.post_comments;
create trigger post_comments_depth_trg
before insert or update on public.post_comments
for each row execute function public.enforce_comment_depth();

-- ── Counter triggers ─────────────────────────────────────────────────────────

create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comments = coalesce(comments, 0) + 1 where id = new.post_id;
    return new;
  else
    update public.posts set comments = greatest(0, coalesce(comments, 0) - 1) where id = old.post_id;
    return old;
  end if;
end $$;

drop trigger if exists post_comments_count_trg on public.post_comments;
create trigger post_comments_count_trg
after insert or delete on public.post_comments
for each row execute function public.sync_post_comment_count();

create or replace function public.sync_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.post_comments set likes = coalesce(likes, 0) + 1 where id = new.comment_id;
    return new;
  else
    update public.post_comments set likes = greatest(0, coalesce(likes, 0) - 1) where id = old.comment_id;
    return old;
  end if;
end $$;

drop trigger if exists comment_likes_count_trg on public.comment_likes;
create trigger comment_likes_count_trg
after insert or delete on public.comment_likes
for each row execute function public.sync_comment_like_count();

-- ── Lock the trigger functions out of the REST API ───────────────────────────
-- All three must stay SECURITY DEFINER (they update posts/post_comments on behalf
-- of users with no direct UPDATE rights), but PostgREST would otherwise expose
-- them at /rest/v1/rpc/<name>. Triggers fire regardless of EXECUTE grants, so
-- revoking is safe. Flagged by the Supabase security advisor
-- (lint 0028/0029 anon|authenticated_security_definer_function_executable).

revoke all on function public.enforce_comment_depth()    from anon, authenticated, public;
revoke all on function public.sync_post_comment_count()  from anon, authenticated, public;
revoke all on function public.sync_comment_like_count()  from anon, authenticated, public;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Mirrors the existing posts / post_likes policies. The API uses the service-role
-- client and enforces authorization in app code (same as every other route here);
-- these policies exist so direct client access can never do more than read.

alter table public.post_comments enable row level security;
alter table public.comment_likes enable row level security;

drop policy if exists "post_comments: public read"          on public.post_comments;
drop policy if exists "post_comments: authenticated insert" on public.post_comments;
drop policy if exists "post_comments: owner delete"         on public.post_comments;

create policy "post_comments: public read"
  on public.post_comments for select to anon, authenticated using (true);
create policy "post_comments: authenticated insert"
  on public.post_comments for insert to authenticated with check (user_id = auth.uid());
create policy "post_comments: owner delete"
  on public.post_comments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "comment_likes: public read"          on public.comment_likes;
drop policy if exists "comment_likes: authenticated insert" on public.comment_likes;
drop policy if exists "comment_likes: owner delete"         on public.comment_likes;

create policy "comment_likes: public read"
  on public.comment_likes for select to anon, authenticated using (true);
create policy "comment_likes: authenticated insert"
  on public.comment_likes for insert to authenticated with check (user_id = auth.uid());
create policy "comment_likes: owner delete"
  on public.comment_likes for delete to authenticated using (user_id = auth.uid());

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- posts.comments was never written before this migration; normalise any NULLs and
-- reconcile against reality in case rows already exist.
update public.posts p
set comments = coalesce((select count(*) from public.post_comments c where c.post_id = p.id), 0)
where coalesce(p.comments, 0) is distinct from
      coalesce((select count(*) from public.post_comments c where c.post_id = p.id), 0);

-- Backstage social referrals, rewards, circle, and direct messages.
-- Run in Supabase SQL editor for the production project before relying on
-- Bring Your Crew reward counts or backend message threads in production.

create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending','converted','rejected')),
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
create index if not exists referrals_referred_idx on public.referrals(referred_user_id);
create index if not exists referrals_code_idx on public.referrals(referral_code);

create table if not exists public.user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_key text not null,
  source text not null default 'referral',
  unlocked_at timestamptz not null default now(),
  unique(user_id, reward_key)
);

create index if not exists user_rewards_user_idx on public.user_rewards(user_id);

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_thread_members (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(thread_id, user_id)
);

create index if not exists message_thread_members_user_idx on public.message_thread_members(user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_thread_created_idx on public.messages(thread_id, created_at);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.user_rewards enable row level security;
alter table public.message_threads enable row level security;
alter table public.message_thread_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "referral codes own select" on public.referral_codes;
create policy "referral codes own select" on public.referral_codes
for select using (auth.uid() = user_id);

drop policy if exists "referral codes own insert" on public.referral_codes;
create policy "referral codes own insert" on public.referral_codes
for insert with check (auth.uid() = user_id);

drop policy if exists "referrals participant select" on public.referrals;
create policy "referrals participant select" on public.referrals
for select using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

drop policy if exists "referrals referred insert" on public.referrals;
create policy "referrals referred insert" on public.referrals
for insert with check (auth.uid() = referred_user_id);

drop policy if exists "rewards own select" on public.user_rewards;
create policy "rewards own select" on public.user_rewards
for select using (auth.uid() = user_id);

drop policy if exists "thread member select" on public.message_threads;
create policy "thread member select" on public.message_threads
for select using (
  exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "thread member insert" on public.message_threads;
create policy "thread member insert" on public.message_threads
for insert with check (auth.uid() is not null);

drop policy if exists "thread members participant select" on public.message_thread_members;
create policy "thread members participant select" on public.message_thread_members
for select using (
  exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = message_thread_members.thread_id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "thread members self insert" on public.message_thread_members;
create policy "thread members self insert" on public.message_thread_members
for insert with check (auth.uid() = user_id);

drop policy if exists "messages participant select" on public.messages;
create policy "messages participant select" on public.messages
for select using (
  exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = messages.thread_id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "messages participant insert" on public.messages;
create policy "messages participant insert" on public.messages
for insert with check (
  auth.uid() = sender_user_id and
  exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = messages.thread_id and mtm.user_id = auth.uid()
  )
);

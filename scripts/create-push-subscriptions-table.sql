-- Run this in the Supabase SQL Editor to create
-- the push_subscriptions table.

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_profile
  on push_subscriptions(profile_id);

-- ============================================================
-- Champ Client :: Supabase schema
-- Run this once in the Supabase SQL editor.
-- Tables: tickets (Discord bot) + licenses (website sales).
-- ============================================================

-- ---------- TICKETS (Discord bot) ----------
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  channel_id text unique not null,
  guild_id text not null,
  user_id text not null,
  type_id text not null default 'support',
  status text not null default 'open',
  claimed_by text,
  answers jsonb not null default '{}'::jsonb,
  rating smallint check (rating is null or (rating >= 1 and rating <= 5)),
  rating_comment text,
  transcript text,
  warned boolean not null default false,
  opened_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists tickets_status_idx on tickets (status);
create index if not exists tickets_user_idx on tickets (user_id);
create index if not exists tickets_type_idx on tickets (type_id);

-- ---------- LICENSES (website sales, Stripe) ----------
create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  type text not null check (type in ('lifetime', 'monthly')),
  status text not null default 'active',
  discord_id text,
  email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  hwid text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_seen_at timestamptz
);

create index if not exists licenses_key_idx on licenses (license_key);
create index if not exists licenses_discord_idx on licenses (discord_id);
create index if not exists licenses_status_idx on licenses (status);

-- ---------- Security ----------
-- Only server-side access via the SERVICE ROLE key (bot + website backend).
-- No public policies on purpose: the anon key cannot read or write anything.
alter table tickets enable row level security;
alter table licenses enable row level security;

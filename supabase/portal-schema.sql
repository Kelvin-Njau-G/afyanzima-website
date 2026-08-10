-- =====================================================================
-- AfyaNzima Partner Portal - schema
-- Run this once in the SQL editor of the "Order Platform" Supabase project.
--
-- Everything is prefixed portal_ so it never collides with Orders tables.
-- RLS is ENABLED with NO POLICIES on every table, which means the anon and
-- authenticated roles can read nothing at all. Only the service_role key
-- (used server-side by the website) can touch these rows.
-- =====================================================================

create table if not exists portal_users (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null unique,
  full_name     text,
  role          text        not null default 'partner' check (role in ('partner', 'admin')),
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Emails are always stored lowercased by the app; this enforces it in the DB too.
create unique index if not exists portal_users_email_lower_idx
  on portal_users (lower(email));

create table if not exists portal_facility_access (
  user_id       uuid not null references portal_users(id) on delete cascade,
  facility_slug text not null,
  primary key (user_id, facility_slug)
);

create table if not exists portal_otp_codes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references portal_users(id) on delete cascade,
  code_hash   text        not null,
  expires_at  timestamptz not null,
  attempts    int         not null default 0,
  consumed_at timestamptz,
  request_ip  text,
  created_at  timestamptz not null default now()
);

create index if not exists portal_otp_user_idx on portal_otp_codes (user_id, created_at desc);
create index if not exists portal_otp_ip_idx   on portal_otp_codes (request_ip, created_at desc);

alter table portal_users           enable row level security;
alter table portal_facility_access enable row level security;
alter table portal_otp_codes       enable row level security;

-- Housekeeping: drop OTP rows older than 24h. Run manually now and then, or
-- attach to a cron job. The table stays tiny either way.
create or replace function portal_purge_old_otps() returns void
language sql security definer as $$
  delete from portal_otp_codes where created_at < now() - interval '24 hours';
$$;

-- =====================================================================
-- Seed the first admin. CHANGE THE EMAIL BELOW, then run.
-- Every other account is created from /admin in the browser.
-- =====================================================================
insert into portal_users (email, full_name, role)
values (lower('kelvin@afyanzima.com'), 'Kelvin', 'admin')
on conflict (email) do update set role = 'admin', is_active = true;

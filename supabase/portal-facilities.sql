-- =====================================================================
-- AfyaNzima Partner Portal - facilities table
-- Run this in the SQL editor of the Order Platform project, after
-- portal-schema.sql.
--
-- Moves the facility list out of lib/facilities.ts and into the database so
-- new facilities can be added from /admin without a code change.
-- =====================================================================

create table if not exists portal_facilities (
  slug       text primary key,
  name       text        not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

alter table portal_facilities enable row level security;

-- Seed the six that currently live in lib/facilities.ts.
--
-- IMPORTANT: `name` is not just a label. It is the value used to filter the
-- Metabase query, so it has to match the facility name in your data exactly,
-- character for character. Getting it wrong produces an empty dashboard
-- rather than an error.
insert into portal_facilities (slug, name) values
  ('qaalane',         'Qaalane Pharmacy and Medical Centre'),
  ('city-star',       'City Star Hospital'),
  ('healmerc',        'Healmerc Pharmacy Limited'),
  ('libken',          'Libken Medical Centre Limited'),
  ('pcea-st-timothy', 'PCEA St Timothy Medical Centre Limited'),
  ('well-living',     'Well Living Medical Clinic')
on conflict (slug) do nothing;

-- =====================================================================
-- AfyaNzima - partner testimonials
-- Run this once in the SQL editor of the "Order Platform" Supabase project,
-- after portal-schema.sql and portal-facilities.sql. Safe to run twice.
--
-- One row per testimonial request. It moves through these statuses:
--   requested    admin sent the email, waiting for the director to reply
--   pending      director submitted, waiting for admin review
--   published    visible on the public website
--   unpublished  reviewed, but kept off the website
--   cancelled    admin withdrew the request before it was answered
--
-- Same lock-down as the other portal_ tables: RLS on, no policies, so only
-- the website's server (service_role key) can read or write.
-- =====================================================================

create table if not exists portal_testimonials (
  id                uuid        primary key default gen_random_uuid(),
  status            text        not null default 'requested'
                    check (status in ('requested', 'pending', 'published', 'unpublished', 'cancelled')),

  -- Who it was requested from. facility_slug / recipient are null for the
  -- testimonials that existed before this feature (seeded below).
  facility_slug     text,
  facility_name     text        not null,   -- the name shown on the website
  recipient_user_id uuid        references portal_users(id) on delete set null,
  recipient_email   text,
  requested_by      uuid        references portal_users(id) on delete set null,
  requested_at      timestamptz not null default now(),

  -- The private link in the email. Only a hash is stored, never the link itself.
  token_hash        text        unique,
  token_expires_at  timestamptz,

  -- What the director submitted.
  director_name     text,
  rating            smallint    check (rating between 1 and 5),
  original_comment  text,                   -- exactly as written, never changed
  comment           text,                   -- the version shown publicly (admin may tidy it)
  submitted_at      timestamptz,

  reviewed_at       timestamptz,
  published_at      timestamptz
);

create index if not exists portal_testimonials_status_idx
  on portal_testimonials (status, published_at desc);

alter table portal_testimonials enable row level security;

-- Once a director has submitted, their star rating and their original words
-- can never be changed, by anyone, including through the API.
create or replace function portal_testimonials_lock_submission() returns trigger
language plpgsql as $$
begin
  if old.rating is not null and new.rating is distinct from old.rating then
    raise exception 'A submitted star rating cannot be changed';
  end if;
  if old.original_comment is not null and new.original_comment is distinct from old.original_comment then
    raise exception 'The original submitted comment cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists portal_testimonials_lock_submission on portal_testimonials;
create trigger portal_testimonials_lock_submission
  before update on portal_testimonials
  for each row execute function portal_testimonials_lock_submission();

-- =====================================================================
-- Carry over the two testimonials already on the website, as published.
-- They predate star ratings, so rating is left empty. Fix the names from
-- /admin -> Testimonials if you want surnames shown.
-- =====================================================================
insert into portal_testimonials
  (status, facility_name, director_name, original_comment, comment, reviewed_at, published_at)
select * from (values
  ('published', 'Well Living Medical Clinic', 'Hellen',
   'I am happy that we have never run out of stock. Our drug preferences have been honored, no stock-outs have been experienced, and the terms of the contract have been upheld.',
   'I am happy that we have never run out of stock. Our drug preferences have been honored, no stock-outs have been experienced, and the terms of the contract have been upheld.',
   now(), now() - interval '1 minute'),
  ('published', 'Nimoli Medical Services', 'Mary',
   'Pharmacy as a service has relieved me of the hustle of finding staffing for the pharmacy, procuring drugs and managing the inventory. I would recommend it to my fellow clinic owners.',
   'Pharmacy as a service has relieved me of the hustle of finding staffing for the pharmacy, procuring drugs and managing the inventory. I would recommend it to my fellow clinic owners.',
   now(), now() - interval '2 minutes')
) as seed (status, facility_name, director_name, original_comment, comment, reviewed_at, published_at)
where not exists (select 1 from portal_testimonials where facility_slug is null);

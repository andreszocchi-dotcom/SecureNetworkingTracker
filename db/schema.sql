-- Secure Networking Tracker — contacts schema, constraints, and Row Level Security.
--
-- This file is the security boundary of the application. Every rule below is enforced by
-- Postgres itself, so it holds even when a request bypasses the Next.js backend entirely and
-- calls the public Neon Data API directly with a valid user token.
--
-- Apply with:  node db/apply.mjs      (reads DATABASE_URL from .env.local)

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),

  -- Ownership column. Defaults to the "sub" claim of the caller's JWT, so a client never
  -- supplies it and cannot choose it. NOT NULL means an unauthenticated caller (where
  -- auth.user_id() is null) cannot insert a row at all.
  user_id     text not null default (auth.user_id()),

  name        text not null,
  company     text,
  role        text,
  met_where   text,
  notes       text,
  priority    text not null default 'medium',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Trusted validation: these run inside the database, so they cannot be skipped by any client.
  constraint contacts_name_not_blank  check (char_length(btrim(name)) between 1 and 120),
  constraint contacts_priority_valid  check (priority in ('high', 'medium', 'low')),
  constraint contacts_company_len     check (company   is null or char_length(company)   <= 120),
  constraint contacts_role_len        check (role      is null or char_length(role)      <= 120),
  constraint contacts_met_where_len   check (met_where is null or char_length(met_where) <= 200),
  constraint contacts_notes_len       check (notes     is null or char_length(notes)     <= 2000)
);

-- Supports the default listing (a user's own contacts, newest first).
create index if not exists contacts_user_id_created_at_idx
  on public.contacts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- Belt and braces: never let an UPDATE move a row to a different owner. The RLS update
  -- policy's WITH CHECK already blocks this; this keeps the invariant even for privileged roles.
  new.user_id = old.user_id;
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.contacts enable row level security;

-- Separate policies per command, as required, each scoped to the authenticated role and each
-- restricted to rows the caller owns. auth.user_id() reads the "sub" claim from the verified JWT.
drop policy if exists contacts_select_own on public.contacts;
create policy contacts_select_own on public.contacts
  for select to authenticated
  using (auth.user_id() = user_id);

-- WITH CHECK on INSERT: a user may only create rows owned by themselves. Combined with the
-- column default, an attempt to insert user_id = <someone else> is rejected.
drop policy if exists contacts_insert_own on public.contacts;
create policy contacts_insert_own on public.contacts
  for insert to authenticated
  with check (auth.user_id() = user_id);

-- USING controls which rows may be targeted; WITH CHECK controls what they may become.
-- The WITH CHECK clause is what prevents a user from updating a row so it belongs to someone else.
drop policy if exists contacts_update_own on public.contacts;
create policy contacts_update_own on public.contacts
  for update to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

drop policy if exists contacts_delete_own on public.contacts;
create policy contacts_delete_own on public.contacts
  for delete to authenticated
  using (auth.user_id() = user_id);

-- ---------------------------------------------------------------------------
-- Grants for the Data API role
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;

-- The anonymous role gets nothing: an unauthenticated Data API request can read no contacts.
revoke all on public.contacts from anonymous;

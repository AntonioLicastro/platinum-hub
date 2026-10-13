-- People Hub: HR records for Platinum Home Care staff (employee profiles,
-- compliance documents with expiry tracking, leave, reviews, onboarding /
-- offboarding checklists, a timeline and an audit log).
--
-- Every table is prefixed hr_ so it can't collide with the other apps that
-- share this Supabase project, and none of them touches profiles' columns —
-- hr_employees links to profiles(id) instead. RLS is enabled with NO policies
-- (same pattern as staff_roster / fleet_*): all access goes through the
-- service-role client in server components / server actions / API routes,
-- where utils/people/access.ts decides who may see or change what. Because
-- these tables hold personal data (PPS numbers, pay, vetting, disciplinary
-- records) we additionally revoke direct table access from anon/authenticated.
--
-- Safe to re-run: every statement is idempotent.
--
-- This setup is split into 12 small parts (01 to 12) so each pastes cleanly into the
-- Supabase SQL editor. Run them in order.

-- Part 1 of 12

-- ---------------------------------------------------------------------------
-- Shared helper
-- ---------------------------------------------------------------------------
create or replace function public.hr_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Who may use People Hub (beyond the bootstrap admins in utils/admin-emails.ts)
--   hr_admin : everything, incl. settings and granting access
--   hr       : all employees, all records incl. personal & pay data
--   manager  : only employees in their areas / their direct reports;
--              directory-level data, leave approval, reviews, checklists
-- Every @platinumhomecare.ie user also gets self-service ("My space").
-- ---------------------------------------------------------------------------
create table if not exists public.hr_access (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('hr_admin', 'hr', 'manager')),
  areas text[] not null default '{}',
  note text,
  granted_by text,
  created_at timestamptz not null default now()
);

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_access enable row level security;
revoke all on public.hr_access from anon, authenticated;

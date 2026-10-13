-- People Hub setup, part 12 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Backfill: create an employee record for everyone already in the system.
--  1. The expected-staff roster (company directory export)
--  2. Anyone registered in the apps with a @platinumhomecare.ie email, which
--     also links their profile and brings in payroll number / title / area.
-- Fleet-only accounts and anyone else with a non-company email are NOT
-- imported here (they are not necessarily employees); HR can add them by hand.
-- ---------------------------------------------------------------------------
insert into public.hr_employees (email, first_name, last_name, job_title, source)
select
  lower(r.email),
  split_part(trim(r.full_name), ' ', 1),
  coalesce(nullif(trim(substr(trim(r.full_name), length(split_part(trim(r.full_name), ' ', 1)) + 1)), ''), ''),
  r.title,
  'roster_sync'
from public.staff_roster r
where r.email is not null and trim(r.full_name) <> ''
on conflict (email) do nothing;

insert into public.hr_employees (email, first_name, last_name, job_title, area, payroll_no, profile_id, source)
select
  lower(u.email),
  split_part(trim(coalesce(p.full_name, '')), ' ', 1),
  coalesce(nullif(trim(substr(trim(coalesce(p.full_name, '')), length(split_part(trim(coalesce(p.full_name, '')), ' ', 1)) + 1)), ''), ''),
  p.title, p.area, p.payroll_no, p.id, 'profiles_sync'
from public.profiles p
join auth.users u on u.id = p.id
where u.email is not null and lower(u.email) like '%@platinumhomecare.ie'
on conflict (email) do nothing;

-- Link / refresh profile details for roster-created rows whose person has since registered.
update public.hr_employees e
set profile_id = p.id,
    area = coalesce(e.area, p.area),
    payroll_no = coalesce(e.payroll_no, p.payroll_no),
    job_title = coalesce(e.job_title, p.title)
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = e.email and e.profile_id is null;

-- People Hub setup, part 2 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Core employee record — directory-level data. Visible to HR and to managers
-- of the employee's area, so nothing sensitive lives here.
-- ---------------------------------------------------------------------------
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  email text not null unique check (email = lower(email)),
  first_name text not null default '',
  last_name text not null default '',
  preferred_name text,
  employee_no text unique,
  payroll_no text,
  job_title text,
  department text,
  area text,
  employment_status text not null default 'active'
    check (employment_status in ('pre_start', 'active', 'on_leave', 'suspended', 'leaver')),
  employment_type text
    check (employment_type in ('permanent', 'fixed_term', 'part_time', 'casual', 'contract', 'agency')),
  contract_hours_per_week numeric(5, 2),
  work_pattern text,
  base_location text,
  manager_email text check (manager_email is null or manager_email = lower(manager_email)),
  work_phone text,
  start_date date,
  continuous_service_date date,
  probation_end_date date,
  end_date date,
  source text not null default 'manual'
    check (source in ('manual', 'profiles_sync', 'roster_sync', 'import')),
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_employees_area_idx on public.hr_employees (area);
create index if not exists hr_employees_status_idx on public.hr_employees (employment_status);
create index if not exists hr_employees_manager_idx on public.hr_employees (manager_email);

drop trigger if exists hr_employees_touch on public.hr_employees;
create trigger hr_employees_touch before update on public.hr_employees
  for each row execute function public.hr_touch_updated_at();

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_employees enable row level security;
revoke all on public.hr_employees from anon, authenticated;

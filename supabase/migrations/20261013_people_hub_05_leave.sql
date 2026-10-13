-- People Hub setup, part 5 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
create table if not exists public.hr_leave_types (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  category text not null default 'other'
    check (category in ('annual', 'sick', 'statutory', 'other')),
  paid boolean not null default true,
  requires_approval boolean not null default true,
  -- Whether taking it draws down an entitlement balance (annual leave, TOIL)
  -- or is simply recorded (sick leave, statutory leave).
  uses_balance boolean not null default false,
  default_entitlement_days numeric(6, 2),
  color text not null default '#323398',
  statutory_note text,
  active boolean not null default true,
  sort_order integer not null default 100
);

create table if not exists public.hr_leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type_id bigint not null references public.hr_leave_types(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  entitlement_days numeric(6, 2) not null default 0,
  carried_over_days numeric(6, 2) not null default 0,
  notes text,
  unique (employee_id, leave_type_id, year)
);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type_id bigint not null references public.hr_leave_types(id),
  start_date date not null,
  end_date date not null,
  start_half_day boolean not null default false,
  end_half_day boolean not null default false,
  days numeric(5, 2) not null check (days >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text,
  requested_by text,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  check (end_date >= start_date)
);
create index if not exists hr_leave_requests_emp_idx on public.hr_leave_requests (employee_id, start_date desc);
create index if not exists hr_leave_requests_status_idx on public.hr_leave_requests (status);
create index if not exists hr_leave_requests_dates_idx on public.hr_leave_requests (start_date, end_date);

create table if not exists public.hr_public_holidays (
  holiday_date date primary key,
  name text not null
);

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_leave_types enable row level security;
revoke all on public.hr_leave_types from anon, authenticated;
alter table public.hr_leave_entitlements enable row level security;
revoke all on public.hr_leave_entitlements from anon, authenticated;
alter table public.hr_leave_requests enable row level security;
revoke all on public.hr_leave_requests from anon, authenticated;
alter table public.hr_public_holidays enable row level security;
revoke all on public.hr_public_holidays from anon, authenticated;

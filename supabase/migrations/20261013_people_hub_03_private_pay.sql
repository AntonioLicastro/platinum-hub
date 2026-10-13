-- People Hub setup, part 3 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Personal & sensitive details — HR only. One row per employee.
-- (No bank details: payroll is run in Sage and we don't need to hold them.)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_employee_private (
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  personal_email text,
  mobile text,
  address_line1 text,
  address_line2 text,
  town text,
  county text,
  eircode text,
  date_of_birth date,
  pps_number text,
  nationality text,
  right_to_work_basis text,
  notice_given_on date,
  leaving_reason text,
  leaving_notes text,
  eligible_for_rehire boolean,
  updated_by text,
  updated_at timestamptz not null default now()
);

drop trigger if exists hr_employee_private_touch on public.hr_employee_private;
create trigger hr_employee_private_touch before update on public.hr_employee_private
  for each row execute function public.hr_touch_updated_at();

create table if not exists public.hr_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  alt_phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists hr_emergency_contacts_emp_idx on public.hr_emergency_contacts (employee_id);

-- Pay history — HR only. One row per change; the latest effective_from <= today is current.
create table if not exists public.hr_compensation (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  effective_from date not null,
  pay_basis text not null check (pay_basis in ('hourly', 'salary')),
  rate numeric(10, 2) not null check (rate >= 0),
  currency text not null default 'EUR',
  hours_per_week numeric(5, 2),
  reason text,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists hr_compensation_emp_idx on public.hr_compensation (employee_id, effective_from desc);

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_employee_private enable row level security;
revoke all on public.hr_employee_private from anon, authenticated;
alter table public.hr_emergency_contacts enable row level security;
revoke all on public.hr_emergency_contacts from anon, authenticated;
alter table public.hr_compensation enable row level security;
revoke all on public.hr_compensation from anon, authenticated;

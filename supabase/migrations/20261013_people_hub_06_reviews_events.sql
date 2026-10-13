-- People Hub setup, part 6 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Reviews: probation, annual appraisal, supervision, spot checks, ...
-- ---------------------------------------------------------------------------
create table if not exists public.hr_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  review_type text not null
    check (review_type in ('probation', 'annual_appraisal', 'supervision', 'spot_check', 'return_to_work', 'exit_interview', 'other')),
  due_on date,
  completed_on date,
  reviewer_email text,
  outcome text,
  summary text,
  next_due_on date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_reviews_emp_idx on public.hr_reviews (employee_id);
create index if not exists hr_reviews_due_idx on public.hr_reviews (due_on) where completed_on is null;

drop trigger if exists hr_reviews_touch on public.hr_reviews;
create trigger hr_reviews_touch before update on public.hr_reviews
  for each row execute function public.hr_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Timeline / case notes. visibility 'hr_only' is never shown to managers.
-- ---------------------------------------------------------------------------
create table if not exists public.hr_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  event_type text not null default 'note'
    check (event_type in ('joined', 'role_change', 'area_change', 'pay_change', 'probation', 'commendation',
                          'warning', 'disciplinary', 'grievance', 'absence', 'training', 'note', 'leaver', 'other')),
  occurred_on date not null default current_date,
  title text not null,
  details text,
  visibility text not null default 'hr_only' check (visibility in ('hr_only', 'manager')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists hr_events_emp_idx on public.hr_events (employee_id, occurred_on desc);

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_reviews enable row level security;
revoke all on public.hr_reviews from anon, authenticated;
alter table public.hr_events enable row level security;
revoke all on public.hr_events from anon, authenticated;

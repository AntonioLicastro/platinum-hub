-- People Hub setup, part 7 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Onboarding / offboarding checklists
-- ---------------------------------------------------------------------------
create table if not exists public.hr_checklist_templates (
  id bigint generated always as identity primary key,
  name text not null unique,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  description text,
  applies_to_titles text[] not null default '{}',
  active boolean not null default true
);

create table if not exists public.hr_checklist_template_items (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.hr_checklist_templates(id) on delete cascade,
  title text not null,
  description text,
  -- Days after the checklist starts (negative = before) that the task is due.
  due_offset_days integer not null default 0,
  owner_role text not null default 'hr' check (owner_role in ('hr', 'manager', 'employee', 'it', 'finance')),
  sort_order integer not null default 100
);
create index if not exists hr_checklist_template_items_tpl_idx on public.hr_checklist_template_items (template_id);

create table if not exists public.hr_checklists (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  template_id bigint references public.hr_checklist_templates(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  started_on date not null default current_date,
  completed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists hr_checklists_emp_idx on public.hr_checklists (employee_id);

create table if not exists public.hr_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.hr_checklists(id) on delete cascade,
  title text not null,
  description text,
  owner_role text not null default 'hr' check (owner_role in ('hr', 'manager', 'employee', 'it', 'finance')),
  due_on date,
  completed_at timestamptz,
  completed_by text,
  notes text,
  sort_order integer not null default 100
);
create index if not exists hr_checklist_items_list_idx on public.hr_checklist_items (checklist_id);

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_checklist_templates enable row level security;
revoke all on public.hr_checklist_templates from anon, authenticated;
alter table public.hr_checklist_template_items enable row level security;
revoke all on public.hr_checklist_template_items from anon, authenticated;
alter table public.hr_checklists enable row level security;
revoke all on public.hr_checklists from anon, authenticated;
alter table public.hr_checklist_items enable row level security;
revoke all on public.hr_checklist_items from anon, authenticated;

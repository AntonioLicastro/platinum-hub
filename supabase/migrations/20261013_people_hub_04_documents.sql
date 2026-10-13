-- People Hub setup, part 4 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Compliance documents (Garda vetting, right to work, mandatory training, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_document_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text not null default 'other'
    check (category in ('vetting', 'right_to_work', 'training', 'licence', 'contract', 'compliance', 'other')),
  description text,
  requires_expiry boolean not null default false,
  default_validity_months integer check (default_validity_months is null or default_validity_months > 0),
  reminder_days integer not null default 30 check (reminder_days >= 0),
  mandatory boolean not null default false,
  -- Empty array = applies to everyone; otherwise only to these job titles.
  applies_to_titles text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 100
);

create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  document_type_id bigint references public.hr_document_types(id) on delete set null,
  title text not null,
  -- Path within the private "hr-documents" storage bucket. Null when only the
  -- record (e.g. a vetting reference number and dates) is held, not a file.
  file_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  reference_no text,
  issued_on date,
  expires_on date,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_by text,
  verified_at timestamptz,
  notes text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_documents_emp_idx on public.hr_documents (employee_id);
create index if not exists hr_documents_type_idx on public.hr_documents (document_type_id);
create index if not exists hr_documents_expiry_idx on public.hr_documents (expires_on) where expires_on is not null;

drop trigger if exists hr_documents_touch on public.hr_documents;
create trigger hr_documents_touch before update on public.hr_documents
  for each row execute function public.hr_touch_updated_at();

-- Lock these tables down straight away: RLS on, no policies, no direct access for the
-- public API keys. Everything goes through the server with the service role.
alter table public.hr_document_types enable row level security;
revoke all on public.hr_document_types from anon, authenticated;
alter table public.hr_documents enable row level security;
revoke all on public.hr_documents from anon, authenticated;

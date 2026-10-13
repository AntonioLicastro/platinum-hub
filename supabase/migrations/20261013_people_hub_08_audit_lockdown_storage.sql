-- People Hub setup, part 8 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Audit log: who viewed / changed what. Insert-only from the app.
-- employee_id deliberately has no FK so the trail survives a deletion.
-- ---------------------------------------------------------------------------
create table if not exists public.hr_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  employee_id uuid,
  detail jsonb
);
create index if not exists hr_audit_log_at_idx on public.hr_audit_log (at desc);
create index if not exists hr_audit_log_emp_idx on public.hr_audit_log (employee_id, at desc);

-- ---------------------------------------------------------------------------
-- Lock everything down: RLS on, no policies, no direct grants.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'hr_access', 'hr_employees', 'hr_employee_private', 'hr_emergency_contacts', 'hr_compensation',
    'hr_document_types', 'hr_documents', 'hr_leave_types', 'hr_leave_entitlements', 'hr_leave_requests',
    'hr_public_holidays', 'hr_reviews', 'hr_events', 'hr_checklist_templates', 'hr_checklist_template_items',
    'hr_checklists', 'hr_checklist_items', 'hr_audit_log'
  ] loop
    -- Skip a table that does not exist yet instead of aborting the whole block.
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private storage bucket for uploaded documents. Uploads and downloads go
-- through /api/people/document with the service role, so no storage policies.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do update set public = false;

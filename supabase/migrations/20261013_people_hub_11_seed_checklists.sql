-- People Hub setup, part 11 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Seed: checklist templates
-- ---------------------------------------------------------------------------
insert into public.hr_checklist_templates (name, kind, description, applies_to_titles) values
  ('Carer onboarding',  'onboarding',  'Everything a new carer needs before their first visit.', '{Senior Carer,Contract Carer,Healthcare Assistant}'),
  ('Office staff onboarding', 'onboarding', 'Setup for new office-based staff.', '{}'),
  ('Standard offboarding', 'offboarding', 'Steps when someone leaves Platinum Home Care.', '{}')
on conflict (name) do nothing;

-- Items are only inserted when the template has none yet, so re-running this
-- migration never duplicates them or overwrites edits made in Settings.
insert into public.hr_checklist_template_items (template_id, title, description, due_offset_days, owner_role, sort_order)
select t.id, i.title, i.description, i.due_offset_days, i.owner_role, i.sort_order
from public.hr_checklist_templates t
join (values
  ('Carer onboarding', 'Garda vetting received',                'NVB disclosure received and filed before first client contact.', -7, 'hr', 10),
  ('Carer onboarding', 'Right to work / ID verified',           'Copy of passport / IRP seen and recorded.', -7, 'hr', 20),
  ('Carer onboarding', 'References obtained',                   'Two satisfactory references.', -7, 'hr', 30),
  ('Carer onboarding', 'Contract issued and signed',            null, -3, 'hr', 40),
  ('Carer onboarding', 'Mandatory training completed',          'Manual handling, safeguarding, first aid, IPC, fire safety, GDPR.', 0, 'manager', 50),
  ('Carer onboarding', 'Added to payroll (Sage)',               'Payroll number issued and recorded.', 0, 'finance', 60),
  ('Carer onboarding', 'Easy Mileage account registered',       null, 3, 'employee', 70),
  ('Carer onboarding', 'Induction and shadow shifts',           null, 7, 'manager', 80),
  ('Carer onboarding', 'Probation review booked',               null, 14, 'manager', 90),
  ('Office staff onboarding', 'Contract issued and signed',     null, -3, 'hr', 10),
  ('Office staff onboarding', 'Right to work / ID verified',    null, -3, 'hr', 20),
  ('Office staff onboarding', 'Email account and system access', 'Platinum Hub, rostering software, Sage as required.', -1, 'it', 30),
  ('Office staff onboarding', 'Added to payroll (Sage)',        null, 0, 'finance', 40),
  ('Office staff onboarding', 'Induction day',                  null, 0, 'manager', 50),
  ('Office staff onboarding', 'GDPR and data protection training', null, 7, 'employee', 60),
  ('Office staff onboarding', 'Probation review booked',        null, 14, 'manager', 70),
  ('Standard offboarding', 'Resignation / termination letter on file', null, 0, 'hr', 10),
  ('Standard offboarding', 'Confirm last working day',          'Notice period and holiday balance agreed.', 0, 'hr', 20),
  ('Standard offboarding', 'Exit interview',                    null, 7, 'hr', 30),
  ('Standard offboarding', 'Return company property',           'Phone, ID badge, keys, uniform.', 0, 'manager', 40),
  ('Standard offboarding', 'Remove system access',              'Platinum Hub, rostering software, email.', 0, 'it', 50),
  ('Standard offboarding', 'Final pay and holiday pay processed', 'Notify payroll (Sage).', 0, 'finance', 60),
  ('Standard offboarding', 'Record leaver in Retention Hub',    null, 0, 'hr', 70)
) as i(template_name, title, description, due_offset_days, owner_role, sort_order)
  on i.template_name = t.name
where not exists (
  select 1 from public.hr_checklist_template_items x where x.template_id = t.id
);

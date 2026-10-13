-- People Hub setup, part 9 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Seed: document types for a home care provider.
-- These are sensible STARTING defaults — validity periods and which roles they
-- apply to should be confirmed against Platinum's own policy and any
-- commissioning / HIQA requirements, then edited in People Hub > Settings.
-- ---------------------------------------------------------------------------
insert into public.hr_document_types
  (name, category, description, requires_expiry, default_validity_months, reminder_days, mandatory, applies_to_titles, sort_order)
values
  ('Garda vetting (NVB)',            'vetting',       'National Vetting Bureau disclosure. Re-vetting interval per company policy.', true,  36,   60, true,  '{}', 10),
  ('Right to work / ID',             'right_to_work', 'Passport, Irish Residence Permit or equivalent proof of identity and right to work.', true, null, 60, true,  '{}', 20),
  ('Employment permit',              'right_to_work', 'Only for staff who need an employment permit.', true,  null, 90, false, '{}', 25),
  ('Signed contract of employment',  'contract',      'Signed written statement of terms and conditions.', false, null, 30, true,  '{}', 30),
  ('References',                     'compliance',    'Employment references on file.', false, null, 30, true,  '{}', 40),
  ('QQI / FETAC Healthcare Support', 'training',      'Level 5 Healthcare Support (or recognised equivalent).', false, null, 30, false, '{}', 50),
  ('Manual handling',                'training',      'Patient moving & handling.', true,  36,   45, true,  '{}', 60),
  ('Safeguarding vulnerable adults', 'training',      'Safeguarding / adult protection awareness.', true,  36,   45, true,  '{}', 70),
  ('First aid / CPR',                'training',      'Occupational first aid / basic life support.', true,  24,   45, true,  '{}', 80),
  ('Infection prevention & control', 'training',      'IPC / hand hygiene.', true,  12,   30, true,  '{}', 90),
  ('Medication management',          'training',      'Safe administration / assistance with medication.', true,  24,   45, false, '{}', 100),
  ('Dementia care',                  'training',      'Dementia awareness training.', true,  36,   45, false, '{}', 110),
  ('Fire safety',                    'training',      'Fire safety awareness.', true,  12,   30, true,  '{}', 120),
  ('Data protection (GDPR)',         'training',      'GDPR / confidentiality training.', true,  12,   30, true,  '{}', 130),
  ('Driving licence',                'licence',       'Full driving licence, for staff who drive for work.', true,  null, 45, false, '{}', 140),
  ('Motor insurance (business use)', 'licence',       'Evidence of insurance covering business use.', true,  12,   30, false, '{}', 150),
  ('Medical / occupational health clearance', 'compliance', 'Fitness-to-work / occupational health clearance.', false, null, 30, false, '{}', 160),
  ('Professional registration',      'licence',       'e.g. NMBI PIN for nurses.', true,  12,   60, false, '{}', 170)
on conflict (name) do nothing;

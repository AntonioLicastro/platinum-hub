-- People Hub setup, part 10 of 12. Run the parts in order (01 to 12); safe to re-run.

-- ---------------------------------------------------------------------------
-- Seed: leave types. Statutory notes are guidance only — confirm entitlement
-- rules with HR / current legislation before relying on them.
-- ---------------------------------------------------------------------------
insert into public.hr_leave_types
  (code, name, category, paid, requires_approval, uses_balance, default_entitlement_days, color, statutory_note, sort_order)
values
  ('annual',        'Annual leave',                      'annual',    true,  true,  true,  20,   '#179048', 'Organisation of Working Time Act 1997 — minimum 4 working weeks per leave year.', 10),
  ('public_holiday','Public holiday (in lieu)',          'annual',    true,  true,  true,  null, '#0ea5e9', 'Benefit for working a public holiday, per the Organisation of Working Time Act.', 20),
  ('toil',          'Time off in lieu',                  'other',     true,  true,  true,  null, '#8b5cf6', null, 30),
  ('sick_certified','Sick leave (certified)',            'sick',      true,  false, false, null, '#ef4444', 'Statutory Sick Pay scheme — number of paid days set by legislation; confirm current figure.', 40),
  ('sick_uncertified','Sick leave (uncertified)',        'sick',      true,  false, false, null, '#f97316', null, 50),
  ('maternity',     'Maternity leave',                   'statutory', false, true,  false, null, '#ec4899', 'Statutory maternity leave and benefit.', 60),
  ('paternity',     'Paternity leave',                   'statutory', false, true,  false, 10,   '#06b6d4', 'Statutory paternity leave and benefit.', 70),
  ('parents',       'Parent''s leave',                   'statutory', false, true,  false, null, '#14b8a6', 'Statutory parent''s leave and benefit.', 80),
  ('parental',      'Parental leave',                    'statutory', false, true,  false, null, '#6366f1', 'Statutory unpaid parental leave.', 90),
  ('carers',        'Carer''s leave',                    'statutory', false, true,  false, null, '#84cc16', 'Statutory carer''s leave.', 100),
  ('force_majeure', 'Force majeure leave',               'statutory', true,  true,  false, null, '#eab308', 'Statutory — urgent family reasons; capped days per period.', 110),
  ('medical_care',  'Medical care leave',                'statutory', false, true,  false, null, '#d946ef', 'Statutory — medical care of a dependant.', 120),
  ('domestic_violence', 'Domestic violence leave',       'statutory', true,  true,  false, null, '#f43f5e', 'Statutory domestic violence leave.', 130),
  ('compassionate', 'Compassionate / bereavement leave', 'other',     true,  true,  false, null, '#64748b', 'Company policy.', 140),
  ('study',         'Study / exam leave',                'other',     true,  true,  false, null, '#0d9488', 'Company policy.', 150),
  ('unpaid',        'Unpaid leave',                      'other',     false, true,  false, null, '#94a3b8', null, 160)
on conflict (code) do nothing;

-- Irish public holidays, 2026. Add further years in People Hub > Settings.
insert into public.hr_public_holidays (holiday_date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-02', 'St Brigid''s Day'),
  ('2026-03-17', 'St Patrick''s Day'),
  ('2026-04-06', 'Easter Monday'),
  ('2026-05-04', 'May Bank Holiday'),
  ('2026-06-01', 'June Bank Holiday'),
  ('2026-08-03', 'August Bank Holiday'),
  ('2026-10-26', 'October Bank Holiday'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-26', 'St Stephen''s Day')
on conflict (holiday_date) do nothing;

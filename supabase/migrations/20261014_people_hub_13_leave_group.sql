-- People Hub setup, part 13. Run after parts 01 to 12; safe to re-run.

-- ---------------------------------------------------------------------------
-- Leave "Year" view (replaces the A/L Tracker): hr_employees.leave_group is the
-- free-text group an employee is listed under, e.g. 'RMs' or 'SLT + Support'.
-- HR edits it on the Employment tab. The backfill only fills blanks for job
-- titles that are unambiguous; everyone else stays ungrouped until HR sets it.
-- ---------------------------------------------------------------------------
alter table public.hr_employees add column if not exists leave_group text;

update public.hr_employees
set leave_group = 'RMs'
where leave_group is null and job_title = 'Regional Manager';

update public.hr_employees
set leave_group = 'SLT + Support'
where leave_group is null and job_title in ('Senior Management', 'CEO', 'General Manager');

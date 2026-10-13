import { addMonths, todayIso } from './format'
import type { Employee, EmployeePrivate } from './types'

// "How much of this person's record is filled in", used by the profile
// overview, dashboard and directory to show where information still needs to
// be gathered. Every counted field has the same weight, so the percentage is
// simply filled / counted and the missing list reads as a to-do list.

export type MissingField = {
  key: string
  label: string
  /** Profile tab where the field is edited: 'employment' | 'personal' | ... */
  tab: string
}

export type Completeness = { percent: number; missing: MissingField[]; total: number }

type Spec = MissingField & { filled: boolean }

const has = (value: string | number | null | undefined): boolean =>
  typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')

/**
 * `priv === undefined`  -> personal details were not loaded (viewer cannot see them): those fields are skipped.
 * `priv === null`       -> loaded, but no personal row exists yet: all personal fields count as missing.
 *
 * Fields that stop mattering are not counted, so nobody is nagged about them:
 *  - the probation end date only counts for people who started (or will start) within the last 12 months;
 *  - for leavers, the line manager, work phone and probation date are skipped.
 * A contracted-hours value of 0 counts as recorded (zero-hours contracts are common in home care).
 */
export function profileCompleteness(employee: Employee, priv?: EmployeePrivate | null): Completeness {
  const isLeaver = employee.employment_status === 'leaver'
  const recentStart = employee.start_date !== null && employee.start_date >= addMonths(todayIso(), -12)

  const specs: Spec[] = [
    { key: 'job_title', label: 'Job title', tab: 'employment', filled: has(employee.job_title) },
    { key: 'area', label: 'Area', tab: 'employment', filled: has(employee.area) },
    { key: 'employment_type', label: 'Employment type', tab: 'employment', filled: has(employee.employment_type) },
    { key: 'start_date', label: 'Start date', tab: 'employment', filled: has(employee.start_date) },
    { key: 'contract_hours_per_week', label: 'Contracted hours', tab: 'employment', filled: has(employee.contract_hours_per_week) },
    { key: 'payroll_no', label: 'Payroll number', tab: 'employment', filled: has(employee.payroll_no) },
  ]
  if (!isLeaver) {
    specs.push(
      { key: 'manager_email', label: 'Line manager', tab: 'employment', filled: has(employee.manager_email) },
      { key: 'work_phone', label: 'Work phone', tab: 'employment', filled: has(employee.work_phone) },
    )
    if (recentStart) {
      specs.push({ key: 'probation_end_date', label: 'Probation end date', tab: 'employment', filled: has(employee.probation_end_date) })
    }
  }

  if (priv !== undefined) {
    specs.push(
      { key: 'date_of_birth', label: 'Date of birth', tab: 'personal', filled: has(priv?.date_of_birth) },
      { key: 'mobile', label: 'Mobile number', tab: 'personal', filled: has(priv?.mobile) },
      { key: 'address_line1', label: 'Home address', tab: 'personal', filled: has(priv?.address_line1) },
      { key: 'county', label: 'County', tab: 'personal', filled: has(priv?.county) },
      { key: 'eircode', label: 'Eircode', tab: 'personal', filled: has(priv?.eircode) },
      { key: 'pps_number', label: 'PPS number', tab: 'personal', filled: has(priv?.pps_number) },
      { key: 'right_to_work_basis', label: 'Right to work', tab: 'personal', filled: has(priv?.right_to_work_basis) },
    )
  }

  const missing: MissingField[] = specs.filter(s => !s.filled).map(({ key, label, tab }) => ({ key, label, tab }))
  const total = specs.length
  return { percent: Math.round(((total - missing.length) / total) * 100), missing, total }
}

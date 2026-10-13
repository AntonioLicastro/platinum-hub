import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from './constants'
import { isEmail, isIsoDate, oneOf, optDate, optEmail, optNumber, optStr, str } from './validate'
import type { Employee, EmploymentStatus, EmploymentType } from './types'

// Validation shared by the profile server actions. Every helper returns a
// friendly message instead of throwing; values are normalised to what the
// hr_* CHECK constraints accept.

type Parsed<T> = { ok: true; values: T } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Accepts dates the database can hold and that are plausible for HR records. */
export function isPlausibleDate(value: string | null | undefined): value is string {
  if (!isIsoDate(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 1900 && year <= 2100
}

/** Irish and international numbers: 6-15 digits with the usual separators. */
export function isPhone(value: string): boolean {
  if (!/^[+()\d][\d\s()+\-./]*$/.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 6 && digits <= 15
}

/** Error message when `value` exceeds `max` characters, otherwise null. */
export function tooLong(value: string | null, max: number, label: string): string | null {
  return value && value.length > max ? `${label} is too long (maximum ${max} characters)` : null
}

/** The employee fields HR edits on the employment tab and sets when creating someone. */
type CoreFields = {
  first_name: string
  last_name: string
  preferred_name: string | null
  employee_no: string | null
  payroll_no: string | null
  job_title: string | null
  department: string | null
  area: string | null
  leave_group: string | null
  employment_status: EmploymentStatus
  employment_type: EmploymentType | null
  contract_hours_per_week: number | null
  work_pattern: string | null
  base_location: string | null
  manager_email: string | null
  work_phone: string | null
  start_date: string | null
  continuous_service_date: string | null
  probation_end_date: string | null
  end_date: string | null
}

const CORE_FIELD_KEYS: readonly (keyof CoreFields)[] = [
  'first_name', 'last_name', 'preferred_name', 'employee_no', 'payroll_no', 'job_title', 'department', 'area',
  'leave_group', 'employment_status', 'employment_type', 'contract_hours_per_week', 'work_pattern', 'base_location',
  'manager_email', 'work_phone', 'start_date', 'continuous_service_date', 'probation_end_date', 'end_date',
]

const TEXT_LIMITS: [keyof CoreFields, string, number][] = [
  ['first_name', 'First name', 80],
  ['last_name', 'Last name', 80],
  ['preferred_name', 'Preferred name', 80],
  ['employee_no', 'Employee number', 40],
  ['payroll_no', 'Payroll number', 40],
  ['job_title', 'Job title', 120],
  ['department', 'Department', 120],
  ['area', 'Area', 80],
  ['leave_group', 'Leave calendar group', 40],
  ['work_pattern', 'Work pattern', 200],
  ['base_location', 'Base location', 160],
]

const DATE_FIELDS: [keyof CoreFields, string][] = [
  ['start_date', 'Start date'],
  ['continuous_service_date', 'Continuous service date'],
  ['probation_end_date', 'Probation end date'],
  ['end_date', 'End date'],
]

/**
 * Reads and validates the core employee fields from a form. A missing
 * `employment_status` falls back to `defaultStatus` (create) or is an error (update).
 */
export function parseCoreFields(
  fd: FormData,
  opts: { requireLastName: boolean; defaultStatus?: EmploymentStatus },
): Parsed<CoreFields> {
  const first_name = str(fd, 'first_name')
  if (!first_name) return fail('Enter a first name')
  const last_name = str(fd, 'last_name')
  if (opts.requireLastName && !last_name) return fail('Enter a last name')

  const values: CoreFields = {
    first_name,
    last_name,
    preferred_name: optStr(fd, 'preferred_name'),
    employee_no: optStr(fd, 'employee_no'),
    payroll_no: optStr(fd, 'payroll_no'),
    job_title: optStr(fd, 'job_title'),
    department: optStr(fd, 'department'),
    area: optStr(fd, 'area'),
    leave_group: optStr(fd, 'leave_group'),
    employment_status: opts.defaultStatus ?? 'active',
    employment_type: null,
    contract_hours_per_week: null,
    work_pattern: optStr(fd, 'work_pattern'),
    base_location: optStr(fd, 'base_location'),
    manager_email: optEmail(fd, 'manager_email'),
    work_phone: optStr(fd, 'work_phone'),
    start_date: optDate(fd, 'start_date'),
    continuous_service_date: optDate(fd, 'continuous_service_date'),
    probation_end_date: optDate(fd, 'probation_end_date'),
    end_date: optDate(fd, 'end_date'),
  }

  for (const [key, label, max] of TEXT_LIMITS) {
    const problem = tooLong(values[key] as string | null, max, label)
    if (problem) return fail(problem)
  }

  const statusRaw = str(fd, 'employment_status')
  if (statusRaw || !opts.defaultStatus) {
    const status = oneOf(statusRaw, EMPLOYMENT_STATUSES.map(s => s.value))
    if (!status) return fail('Choose an employment status')
    values.employment_status = status
  }

  const typeRaw = str(fd, 'employment_type')
  if (typeRaw) {
    const type = oneOf(typeRaw, EMPLOYMENT_TYPES.map(t => t.value))
    if (!type) return fail('Choose a valid employment type')
    values.employment_type = type
  }

  const hours = optNumber(fd, 'contract_hours_per_week')
  if (hours !== null) {
    if (Number.isNaN(hours) || hours < 0 || hours > 168) return fail('Contracted hours must be between 0 and 168 a week')
    values.contract_hours_per_week = Math.round(hours * 100) / 100
  }

  if (values.manager_email && !isEmail(values.manager_email)) return fail('Enter a valid line manager email')
  if (values.work_phone && !isPhone(values.work_phone)) return fail('Enter a valid work phone number')

  for (const [key, label] of DATE_FIELDS) {
    const value = values[key] as string | null
    if (value && !isPlausibleDate(value)) return fail(`${label} is not a valid date`)
  }
  const { start_date, probation_end_date, end_date } = values
  if (start_date && end_date && end_date < start_date) return fail('The end date cannot be before the start date')
  if (start_date && probation_end_date && probation_end_date < start_date) {
    return fail('The probation end date cannot be before the start date')
  }

  return { ok: true, values }
}

/** The keys whose value in `next` differs from what is stored on `employee`. */
export function changedCoreFields(employee: Employee, next: CoreFields): (keyof CoreFields)[] {
  return CORE_FIELD_KEYS.filter(key => (employee[key] ?? null) !== next[key])
}

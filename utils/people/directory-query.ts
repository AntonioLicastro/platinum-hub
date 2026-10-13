import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from './constants'
import type { ComplianceSummary } from './compliance-data'
import { displayName } from './format'
import { oneOf } from './validate'
import type { Employee, EmploymentStatus, EmploymentType } from './types'

// Pure parsing, filtering, sorting and paging for the Directory page and the CSV
// export, so both always agree on what "the current filters" means. Nothing here
// touches the database: callers pass in employees that are already scope-filtered.

/** Filter value meaning "the field is empty" (so HR can find gaps to fill). */
export const DIRECTORY_NONE = '__none__'

export const DIRECTORY_VIEWS = ['cards', 'table'] as const
export type DirectoryView = (typeof DIRECTORY_VIEWS)[number]

export const DIRECTORY_SORTS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'newest', label: 'Start date, newest first' },
  { value: 'oldest', label: 'Start date, oldest first' },
  { value: 'area', label: 'Area A–Z' },
  { value: 'area_desc', label: 'Area Z–A' },
  { value: 'title', label: 'Job title A–Z' },
  { value: 'title_desc', label: 'Job title Z–A' },
] as const
export type DirectorySort = (typeof DIRECTORY_SORTS)[number]['value']

/** `current` = everyone except leavers (the default), `all` = leavers too. */
type StatusFilter = 'current' | 'all' | EmploymentStatus

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'current', label: 'Current staff' },
  { value: 'all', label: 'Everyone, including leavers' },
  ...EMPLOYMENT_STATUSES.map(s => ({ value: s.value, label: s.value === 'leaver' ? 'Leavers only' : s.label })),
]

export const PAGE_SIZES: Record<DirectoryView, number> = { cards: 24, table: 50 }

export type DirectoryFilters = {
  /** Free-text search over name, email, payroll no, employee no and job title. */
  q: string
  /** '' = any, DIRECTORY_NONE = no area recorded. */
  area: string
  title: string
  status: StatusFilter
  type: EmploymentType | typeof DIRECTORY_NONE | ''
  /** Lower-case line manager email; '' = any. */
  manager: string
  complianceIssues: boolean
  sort: DirectorySort
  view: DirectoryView
  page: number
}

/**
 * Data the pure functions cannot load themselves. The compliance filter is only
 * applied when `compliance` is supplied, so a caller that has no document data
 * never silently hides or shows people on the strength of it.
 */
type DirectoryExtras = {
  compliance?: ReadonlyMap<string, ComplianceSummary>
}

type RawParams = Record<string, string | string[] | undefined>

const SORT_VALUES = DIRECTORY_SORTS.map(s => s.value)
const STATUS_VALUES = STATUS_FILTER_OPTIONS.map(s => s.value)
const TYPE_VALUES = EMPLOYMENT_TYPES.map(t => t.value)
const MAX_PAGE = 100_000

function firstValue(params: RawParams, key: string, maxLength: number): string {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

/** Turns the URL's query string into typed filters. Anything unrecognised falls back to its default. */
export function parseDirectoryParams(params: RawParams): DirectoryFilters {
  const typeRaw = firstValue(params, 'type', 30)
  const page = Number.parseInt(firstValue(params, 'page', 7), 10)
  return {
    q: firstValue(params, 'q', 100),
    area: firstValue(params, 'area', 100),
    title: firstValue(params, 'title', 100),
    status: oneOf<StatusFilter>(firstValue(params, 'status', 20), STATUS_VALUES) ?? 'current',
    type: typeRaw === DIRECTORY_NONE ? DIRECTORY_NONE : (oneOf<EmploymentType>(typeRaw, TYPE_VALUES) ?? ''),
    manager: firstValue(params, 'manager', 254).toLowerCase(),
    complianceIssues: firstValue(params, 'compliance', 5) === '1',
    sort: oneOf<DirectorySort>(firstValue(params, 'sort', 20), SORT_VALUES) ?? 'name',
    view: oneOf<DirectoryView>(firstValue(params, 'view', 10), DIRECTORY_VIEWS) ?? 'cards',
    page: Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1,
  }
}

// ---- Filtering -------------------------------------------------------------

/** Lower-cases and strips accents so "Seán" is found by "sean". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function searchText(e: Employee): string {
  return fold([
    e.first_name, e.last_name, e.preferred_name, `${e.first_name} ${e.last_name}`, `${e.last_name} ${e.first_name}`,
    e.email, e.payroll_no, e.employee_no, e.job_title,
  ].filter(Boolean).join(' '))
}

function matchesChoice(value: string | null | undefined, wanted: string): boolean {
  if (wanted === '') return true
  const actual = (value ?? '').trim().toLowerCase()
  return wanted === DIRECTORY_NONE ? actual === '' : actual === wanted.trim().toLowerCase()
}

function matchesStatus(e: Employee, status: StatusFilter): boolean {
  if (status === 'all') return true
  if (status === 'current') return e.employment_status !== 'leaver'
  return e.employment_status === status
}

/** An issue is an expired, soon-to-expire or missing required document. Leavers have none by definition. */
function hasComplianceIssue(summary: ComplianceSummary | undefined): boolean {
  return summary !== undefined && summary.expired + summary.expiring + summary.missing > 0
}

/** Every filter except status, which the headcount chips need to ignore. */
function matchesOtherFilters(e: Employee, filters: DirectoryFilters, extras: DirectoryExtras, tokens: string[]): boolean {
  if (tokens.length > 0) {
    const text = searchText(e)
    if (!tokens.every(t => text.includes(t))) return false
  }
  if (!matchesChoice(e.area, filters.area)) return false
  if (!matchesChoice(e.job_title, filters.title)) return false
  if (!matchesChoice(e.employment_type, filters.type)) return false
  if (!matchesChoice(e.manager_email, filters.manager)) return false
  if (filters.complianceIssues && extras.compliance && !hasComplianceIssue(extras.compliance.get(e.id))) return false
  return true
}

const searchTokens = (q: string) => fold(q).split(/\s+/).filter(Boolean)

// ---- Sorting ---------------------------------------------------------------

const collator = new Intl.Collator('en-IE', { sensitivity: 'base', numeric: true })

/** Compares text with blanks always last, whichever direction is asked for. */
function compareText(a: string | null, b: string | null, desc: boolean): number {
  const x = (a ?? '').trim()
  const y = (b ?? '').trim()
  if (!x || !y) return x === y ? 0 : x ? -1 : 1
  return desc ? collator.compare(y, x) : collator.compare(x, y)
}

const byName = (a: Employee, b: Employee) =>
  collator.compare(a.last_name, b.last_name) || collator.compare(a.first_name, b.first_name) || a.id.localeCompare(b.id)

function comparator(sort: DirectorySort): (a: Employee, b: Employee) => number {
  switch (sort) {
    case 'name': return byName
    case 'name_desc': return (a, b) => byName(b, a)
    // ISO dates sort correctly as plain strings.
    case 'newest': return (a, b) => compareDates(a.start_date, b.start_date, true) || byName(a, b)
    case 'oldest': return (a, b) => compareDates(a.start_date, b.start_date, false) || byName(a, b)
    case 'area': return (a, b) => compareText(a.area, b.area, false) || byName(a, b)
    case 'area_desc': return (a, b) => compareText(a.area, b.area, true) || byName(a, b)
    case 'title': return (a, b) => compareText(a.job_title, b.job_title, false) || byName(a, b)
    case 'title_desc': return (a, b) => compareText(a.job_title, b.job_title, true) || byName(a, b)
  }
}

function compareDates(a: string | null, b: string | null, desc: boolean): number {
  if (!a || !b) return a === b ? 0 : a ? -1 : 1
  if (a === b) return 0
  return (a < b) === desc ? 1 : -1
}

/** Filters then sorts. The input array is not modified. */
export function applyDirectoryFilters(employees: Employee[], filters: DirectoryFilters, extras: DirectoryExtras = {}): Employee[] {
  const tokens = searchTokens(filters.q)
  return employees
    .filter(e => matchesStatus(e, filters.status) && matchesOtherFilters(e, filters, extras, tokens))
    .sort(comparator(filters.sort))
}

/** Headcount per status among people matching every filter except status (the chips above the results). */
export function countByStatus(employees: Employee[], filters: DirectoryFilters, extras: DirectoryExtras = {}): Record<EmploymentStatus, number> {
  const counts: Record<EmploymentStatus, number> = { pre_start: 0, active: 0, on_leave: 0, suspended: 0, leaver: 0 }
  const tokens = searchTokens(filters.q)
  for (const e of employees) {
    if (matchesOtherFilters(e, filters, extras, tokens)) counts[e.employment_status] += 1
  }
  return counts
}

// ---- Filter choices ---------------------------------------------------------

export type DirectoryOptions = {
  areas: string[]
  titles: string[]
  managers: { email: string; label: string }[]
  /** Display name for every line manager email in use, falling back to the email itself. */
  managerLabels: Map<string, string>
  anyWithoutArea: boolean
  anyWithoutTitle: boolean
  anyWithoutType: boolean
  anyWithoutManager: boolean
}

function distinctSorted(values: (string | null)[]): string[] {
  const byKey = new Map<string, string>()
  for (const v of values) {
    const trimmed = v?.trim()
    if (trimmed && !byKey.has(trimmed.toLowerCase())) byKey.set(trimmed.toLowerCase(), trimmed)
  }
  return [...byKey.values()].sort(collator.compare)
}

/**
 * Choices for the filter dropdowns, drawn from the people the viewer may see (not
 * from the filtered results) so a dropdown never shrinks to the one value picked.
 */
export function buildDirectoryOptions(employees: Employee[]): DirectoryOptions {
  const nameByEmail = new Map(employees.map(e => [e.email.toLowerCase(), displayName(e)]))
  const managerEmails = distinctSorted(employees.map(e => e.manager_email)).map(m => m.toLowerCase())
  const managerLabels = new Map(managerEmails.map(email => [email, nameByEmail.get(email) ?? email]))
  const managers = managerEmails
    .map(email => ({ email, label: managerLabels.get(email) ?? email }))
    .sort((a, b) => collator.compare(a.label, b.label))

  return {
    areas: distinctSorted(employees.map(e => e.area)),
    titles: distinctSorted(employees.map(e => e.job_title)),
    managers,
    managerLabels,
    anyWithoutArea: employees.some(e => !e.area?.trim()),
    anyWithoutTitle: employees.some(e => !e.job_title?.trim()),
    anyWithoutType: employees.some(e => !e.employment_type),
    anyWithoutManager: employees.some(e => !e.manager_email?.trim()),
  }
}

// ---- Paging ------------------------------------------------------------------

export type PageSlice<T> = {
  items: T[]
  page: number
  pageCount: number
  total: number
  /** 1-based position of the first / last item shown (0 when empty). */
  from: number
  to: number
}

/** Clamps `page` into range, so a stale link past the last page still shows something. */
export function paginate<T>(items: T[], page: number, pageSize: number): PageSlice<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * pageSize
  const slice = items.slice(start, start + pageSize)
  return { items: slice, page: current, pageCount, total, from: total === 0 ? 0 : start + 1, to: start + slice.length }
}

// ---- Links ---------------------------------------------------------------------

/** Names of the filters in use (not their values), for the audit log and the "Clear" button. */
export function activeFilterNames(filters: DirectoryFilters): string[] {
  const names: string[] = []
  if (filters.q) names.push('search')
  if (filters.area) names.push('area')
  if (filters.title) names.push('job_title')
  if (filters.status !== 'current') names.push('status')
  if (filters.type) names.push('employment_type')
  if (filters.manager) names.push('line_manager')
  if (filters.complianceIssues) names.push('compliance')
  return names
}

function toSearchParams(filters: DirectoryFilters, forExport: boolean): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.area) params.set('area', filters.area)
  if (filters.title) params.set('title', filters.title)
  if (filters.status !== 'current') params.set('status', filters.status)
  if (filters.type) params.set('type', filters.type)
  if (filters.manager) params.set('manager', filters.manager)
  if (filters.complianceIssues) params.set('compliance', '1')
  if (filters.sort !== 'name') params.set('sort', filters.sort)
  if (!forExport) {
    if (filters.view !== 'cards') params.set('view', filters.view)
    if (filters.page > 1) params.set('page', String(filters.page))
  }
  return params
}

/**
 * Link to the directory with the current filters, changing only `overrides`.
 * The page number resets to 1 unless an override sets it, so changing a filter
 * or the sort never strands someone on a page that no longer exists.
 */
export function directoryHref(filters: DirectoryFilters, overrides: Partial<DirectoryFilters> = {}): string {
  const query = toSearchParams({ ...filters, page: 1, ...overrides }, false).toString()
  return query ? `/directory?${query}` : '/directory'
}

/** Link back to the unfiltered directory, keeping only the chosen view. */
export function clearFiltersHref(filters: DirectoryFilters): string {
  return directoryHref(filters, { q: '', area: '', title: '', status: 'current', type: '', manager: '', complianceIssues: false, sort: 'name' })
}

/** Link to the CSV export for the current filters (view and page do not apply to a file). */
export function exportHref(filters: DirectoryFilters): string {
  const query = toSearchParams(filters, true).toString()
  return query ? `/api/export?${query}` : '/api/export'
}

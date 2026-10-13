import { createAdminClient, fetchByIds, withRetry } from './db'
import { emailNameMap } from './employees-data'
import { addDays } from './format'
import { AUDIT_ACTION_GROUPS } from './settings-audit-labels'
import type { AuditEntry } from './types'
import { isIsoDate } from './validate'

// Settings > Audit log: filter parsing and the paginated, read-only loader.
// Callers must already have checked audit.view (hr_admin only).

export const AUDIT_PAGE_SIZE = 50
/** An employee search is turned into ids for one .in() filter, so keep that list URL-safe. */
export const EMPLOYEE_MATCH_LIMIT = 100
const TERM_MAX = 100
const MAX_PAGE = 100_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** PostgREST: the requested page starts past the last row. */
const RANGE_NOT_SATISFIABLE = 'PGRST103'

export type AuditFilters = {
  /** Part of the actor's email address. */
  actor: string
  /** One of AUDIT_ACTION_GROUPS' prefixes, or empty for everything. */
  action: string
  /** Part of an employee's name or email address, or an employee id. */
  employee: string
  /** ISO dates, inclusive, in Irish time. */
  from: string
  to: string
}

type SearchParams = Record<string, string | string[] | undefined>

const single = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

export function parseAuditFilters(params: SearchParams): { filters: AuditFilters; page: number } {
  const action = single(params.action)
  const from = single(params.from)
  const to = single(params.to)
  const page = Number.parseInt(single(params.page), 10)
  return {
    filters: {
      actor: single(params.actor).slice(0, TERM_MAX),
      action: AUDIT_ACTION_GROUPS.some(g => g.prefix === action) ? action : '',
      employee: single(params.employee).slice(0, TERM_MAX),
      from: isIsoDate(from) ? from : '',
      to: isIsoDate(to) ? to : '',
    },
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  }
}

export function hasAuditFilters(filters: AuditFilters): boolean {
  return Object.values(filters).some(Boolean)
}

/** Link to a page of the log that keeps the current filters. */
export function auditHref(filters: AuditFilters, page: number): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
  if (page > 1) query.set('page', String(page))
  const qs = query.toString()
  return qs ? `/settings/audit?${qs}` : '/settings/audit'
}

/** Escapes LIKE wildcards so a typed "50%" or "mary_o" is matched literally. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')
const contains = (value: string) => `%${escapeLike(value)}%`

/** The instant (as an ISO string) at which an Irish calendar day starts. Dublin is UTC+1 in summer, UTC+0 in winter. */
function startOfDublinDay(iso: string): string {
  const summerStart = new Date(`${addDays(iso, -1)}T23:00:00Z`)
  const localHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Dublin', hour: '2-digit', hourCycle: 'h23' }).format(summerStart)
  return Number(localHour) === 0 ? summerStart.toISOString() : `${iso}T00:00:00.000Z`
}

async function findEmployeeIds(term: string): Promise<{ ids: string[]; capped: boolean }> {
  const admin = createAdminClient()
  const column = (name: 'email' | 'first_name' | 'last_name', pattern: string) =>
    withRetry(() => admin.from('hr_employees').select('id').ilike(name, pattern).limit(EMPLOYEE_MATCH_LIMIT + 1).returns<{ id: string }[]>())

  const words = term.split(/\s+/)
  const lookups = [column('email', contains(term)), column('first_name', contains(term)), column('last_name', contains(term))]
  // "Mary O'Brien": first name matches the first word, last name the rest.
  if (words.length > 1) {
    lookups.push(
      withRetry(() =>
        admin.from('hr_employees').select('id')
          .ilike('first_name', contains(words[0]))
          .ilike('last_name', contains(words.slice(1).join(' ')))
          .limit(EMPLOYEE_MATCH_LIMIT + 1)
          .returns<{ id: string }[]>()
      ),
    )
  }

  const ids = new Set<string>()
  for (const { data, error } of await Promise.all(lookups)) {
    if (error) console.error('audit employee lookup failed', error.message)
    for (const row of data ?? []) ids.add(row.id)
  }
  // Entries for a deleted employee can still be found by pasting their id.
  if (UUID.test(term)) ids.add(term.toLowerCase())

  const all = [...ids]
  return { ids: all.slice(0, EMPLOYEE_MATCH_LIMIT), capped: all.length > EMPLOYEE_MATCH_LIMIT }
}

export type AuditRow = {
  entry: AuditEntry
  actorName: string | null
  employeeName: string | null
  /** The entry points at an employee that no longer exists. */
  employeeDeleted: boolean
}

export type AuditPage = {
  rows: AuditRow[]
  total: number
  page: number
  pageCount: number
  /** Too many employees matched the search; only the first ones were used. */
  employeeMatchCapped: boolean
  failed: boolean
}

const EMPTY_PAGE: AuditPage = { rows: [], total: 0, page: 1, pageCount: 1, employeeMatchCapped: false, failed: false }

export async function loadAuditPage(filters: AuditFilters, requestedPage: number): Promise<AuditPage> {
  const admin = createAdminClient()

  let employeeIds: string[] | null = null
  let employeeMatchCapped = false
  if (filters.employee) {
    const found = await findEmployeeIds(filters.employee)
    if (found.ids.length === 0) return EMPTY_PAGE
    employeeIds = found.ids
    employeeMatchCapped = found.capped
  }

  const fetchPage = (page: number) => {
    let query = admin.from('hr_audit_log').select('*', { count: 'exact' })
    if (filters.actor) query = query.ilike('actor_email', contains(filters.actor))
    if (filters.action) query = query.like('action', `${escapeLike(filters.action)}%`)
    if (employeeIds) query = query.in('employee_id', employeeIds)
    if (filters.from) query = query.gte('at', startOfDublinDay(filters.from))
    if (filters.to) query = query.lt('at', startOfDublinDay(addDays(filters.to, 1)))
    const offset = (page - 1) * AUDIT_PAGE_SIZE
    return query
      .order('at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + AUDIT_PAGE_SIZE - 1)
      .returns<AuditEntry[]>()
  }

  let page = requestedPage
  let result = await withRetry(() => fetchPage(page))
  if (result.error?.code === RANGE_NOT_SATISFIABLE && page > 1) {
    page = 1
    result = await withRetry(() => fetchPage(1))
  }
  if (result.error) {
    console.error('loadAuditPage failed', result.error.message)
    return { ...EMPTY_PAGE, failed: true }
  }

  const entries = result.data ?? []
  const total = result.count ?? entries.length

  const employeeIdsOnPage = [...new Set(entries.map(e => e.employee_id).filter((id): id is string => !!id))]
  const [actorNames, employees] = await Promise.all([
    emailNameMap(entries.map(e => e.actor_email)),
    fetchByIds<{ id: string; first_name: string; last_name: string }>(employeeIdsOnPage, chunk =>
      admin.from('hr_employees').select('id, first_name, last_name').in('id', chunk).returns<{ id: string; first_name: string; last_name: string }[]>()
    ),
  ])
  if (employees.error) console.error('audit employee names failed', employees.error.message)
  const employeeNames = new Map(employees.data.map(e => [e.id, `${e.first_name} ${e.last_name}`.trim()]))

  const rows: AuditRow[] = entries.map(entry => ({
    entry,
    actorName: entry.actor_email ? actorNames.get(entry.actor_email.toLowerCase()) ?? null : null,
    employeeName: entry.employee_id ? employeeNames.get(entry.employee_id) ?? null : null,
    employeeDeleted: !!entry.employee_id && !employeeNames.has(entry.employee_id),
  }))

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)), employeeMatchCapped, failed: false }
}

import { canOnEmployee, isHr, type PeopleViewer } from './access'
import { createAdminClient, fetchAllPages, fetchByIds } from './db'
import { isCurrent } from './employees-data'
import { addDays } from './format'
import { leaveShowsOn } from './leave-calc'
import {
  employeesInScope, listLeaveTypes, listPublicHolidays, loadFailed, redactLeaveRequest,
} from './leave-data'
import {
  chipInitials, personColor, plainName, shortLabels, type PersonColor,
} from './leave-year-people'
import type { LeaveRequest, LeaveStatus } from './types'

// Loader for the Leave "Year" view (the A/L tracker): who is off on which day of
// one calendar year, plus a days-taken total per person.
//
// Scope: only people the viewer may see leave for are ever queried (managers by
// employee id), and sick / statutory types are shown as "Away" to anyone but HR
// and the person themselves, by the same redactLeaveRequest the other views use.
// Totals follow the balances code: approved days of requests that START in the
// year, so a request over New Year counts once, in the year it starts.

export const LEAVE_YEAR_MIN = 2000
export const LEAVE_YEAR_MAX = 2100

/** `?year=` as a year: junk falls back to `current`, absurd numbers clamp to the supported range. */
export function parseLeaveYear(raw: string | undefined, current: number): number {
  const text = raw?.trim() ?? ''
  if (!/^-?\d+$/.test(text)) return current
  return Math.min(LEAVE_YEAR_MAX, Math.max(LEAVE_YEAR_MIN, Number(text)))
}

export type YearPerson = {
  id: string
  /** "Aoife Murphy" */
  name: string
  /** "Aoife M" (longer only when two people would share it) */
  label: string
  initials: string
  color: PersonColor
  /** Days taken: approved requests starting in the year. Pending never counts. */
  taken: number
  /** Days waiting for approval (starting in the year); only filled when pending is shown. */
  pending: number
}

export type YearEntry = {
  person: YearPerson
  pending: boolean
  half: boolean
  /** Leave type name, or "Away" when the viewer may not see it. */
  typeName: string
}

export type LeaveYear = {
  year: number
  /** Everyone in view: current people, plus a leaver only when they have leave in the year. */
  people: YearPerson[]
  byDay: Map<string, YearEntry[]>
  /** Public holidays in the year, by date. */
  holidays: Map<string, string>
  /** False when no chip would be drawn at all (drives the empty notice). */
  anyEntries: boolean
}

type Options = { year: number; showPending: boolean; allTypes: boolean }

const REQUEST_BATCH = 100

async function loadRequests(
  employeeIds: string[] | null, typeIds: number[], statuses: LeaveStatus[], first: string, last: string,
): Promise<LeaveRequest[]> {
  const admin = createAdminClient()
  // Overlapping the year (for the chips); totals pick out the ones that start in it.
  const page = (ids: string[] | null) => (from: number, to: number) => {
    let query = admin.from('hr_leave_requests').select('*')
      .in('status', statuses).in('leave_type_id', typeIds).lte('start_date', last).gte('end_date', first)
    if (ids) query = query.in('employee_id', ids)
    return query.order('start_date').order('id').range(from, to).returns<LeaveRequest[]>()
  }
  const result = employeeIds
    ? await fetchByIds<LeaveRequest>(employeeIds, ids => fetchAllPages<LeaveRequest>(page(ids)), REQUEST_BATCH)
    : await fetchAllPages<LeaveRequest>(page(null))
  if (result.error) loadFailed('loadLeaveYear', result.error)
  return result.data
}

export async function loadLeaveYear(viewer: PeopleViewer, options: Options): Promise<LeaveYear> {
  const { year } = options
  const first = `${year}-01-01`
  const last = `${year}-12-31`

  const [scope, types, holidayRows] = await Promise.all([
    employeesInScope(viewer), listLeaveTypes(), listPublicHolidays(first, last),
  ])
  const employees = scope.filter(e => canOnEmployee(viewer, 'leave.view', e))
  const labels = shortLabels(employees)

  const people = new Map<string, YearPerson>(employees.map(e => [e.id, {
    id: e.id, name: plainName(e), label: labels.get(e.id) ?? plainName(e), initials: chipInitials(e),
    color: personColor(e.id), taken: 0, pending: 0,
  }]))

  const typeIds = types.filter(t => options.allTypes || t.category === 'annual').map(t => t.id)
  const statuses: LeaveStatus[] = options.showPending ? ['approved', 'pending'] : ['approved']
  // HR can read everyone in one go; everyone else is fetched by the ids they may see.
  const ids = employees.map(e => e.id)
  const requests = ids.length === 0 || typeIds.length === 0
    ? []
    : await loadRequests(isHr(viewer) ? null : ids, typeIds, statuses, first, last)

  const employeeById = new Map(employees.map(e => [e.id, e]))
  const typeById = new Map(types.map(t => [t.id, t]))
  const holidays = new Map(holidayRows.map(h => [h.holiday_date, h.name]))
  const holidayDates = new Set(holidays.keys())
  const byDay = new Map<string, YearEntry[]>()
  const withEntries = new Set<string>()

  for (const row of requests) {
    const employee = employeeById.get(row.employee_id)
    const type = typeById.get(row.leave_type_id)
    const person = people.get(row.employee_id)
    if (!employee || !type || !person) continue
    const shown = redactLeaveRequest(viewer, { ...row, employee, type })
    const pending = row.status === 'pending'

    if (row.start_date >= first && row.start_date <= last) {
      if (pending) person.pending += Number(row.days)
      else person.taken += Number(row.days)
    }

    for (let day = row.start_date > first ? row.start_date : first; day <= row.end_date && day <= last; day = addDays(day, 1)) {
      if (!leaveShowsOn(row, day, holidayDates)) continue
      const entry: YearEntry = {
        person, pending, typeName: shown.type.name,
        half: (day === row.start_date && row.start_half_day) || (day === row.end_date && row.end_half_day),
      }
      const list = byDay.get(day)
      if (!list) {
        byDay.set(day, [entry])
      } else {
        // One chip per person per day: a firm booking beats a pending one, a full day beats a half.
        const same = list.findIndex(e => e.person.id === person.id)
        if (same === -1) list.push(entry)
        else if ((list[same].pending && !pending) || (list[same].pending === pending && list[same].half && !entry.half)) list[same] = entry
      }
      withEntries.add(person.id)
    }
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => Number(a.pending) - Number(b.pending) || a.person.label.localeCompare(b.person.label, 'en-IE'))
  }
  for (const person of people.values()) {
    person.taken = Math.round(person.taken * 100) / 100
    person.pending = Math.round(person.pending * 100) / 100
  }

  // Panel: current people always; a leaver only when they have leave in the year.
  const listed: YearPerson[] = []
  for (const e of employees) {
    const person = people.get(e.id)!
    const active = withEntries.has(e.id) || person.taken > 0 || person.pending > 0
    if (isCurrent(e) || active) listed.push(person)
  }
  listed.sort((a, b) => a.label.localeCompare(b.label, 'en-IE', { sensitivity: 'base' }))

  return { year, people: listed, byDay, holidays, anyEntries: byDay.size > 0 }
}

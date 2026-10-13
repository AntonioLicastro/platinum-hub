import { profileCompleteness } from './completeness'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, labelOf } from './constants'
import { addDays, addMonths, displayName } from './format'
import type { LeaveRequestWithContext } from './leave-data'
import { leaveShowsOn, shiftMonth } from './leave-calc'
import type { Employee, EmployeePrivate, EmploymentStatus, PublicHoliday } from './types'

// Pure calculations behind the HR Locker dashboard. Callers pass employees that
// are already limited to the viewer's scope; nothing here touches the database.

export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

export function employeeHref(id: string, tab?: string): string {
  return tab ? `/employees/${id}?tab=${tab}` : `/employees/${id}`
}

const isLeaver = (e: Pick<Employee, 'employment_status'>) => e.employment_status === 'leaver'

// ---- Headcount and movement -------------------------------------------------

export type Headcount = {
  /** Everyone who has not left: active, on leave, suspended and yet to start. */
  current: number
  byStatus: Record<EmploymentStatus, number>
}

export function headcount(employees: Employee[]): Headcount {
  const byStatus: Record<EmploymentStatus, number> = { pre_start: 0, active: 0, on_leave: 0, suspended: 0, leaver: 0 }
  for (const e of employees) byStatus[e.employment_status] += 1
  return { current: employees.length - byStatus.leaver, byStatus }
}

const STARTER_WINDOW_DAYS = 30
const LEAVER_WINDOW_DAYS = 90

export type Movement = {
  starters: number
  leavers: number
  /** Leavers with no end date, who therefore cannot be placed in any period. */
  leaversWithoutDate: number
  startersSince: string
  leaversSince: string
}

export function movement(employees: Employee[], today: string): Movement {
  const startersSince = addDays(today, -STARTER_WINDOW_DAYS)
  const leaversSince = addDays(today, -LEAVER_WINDOW_DAYS)
  let starters = 0
  let leavers = 0
  let leaversWithoutDate = 0
  for (const e of employees) {
    if (e.start_date && e.start_date >= startersSince && e.start_date <= today) starters += 1
    if (!isLeaver(e)) continue
    if (!e.end_date) leaversWithoutDate += 1
    else if (e.end_date >= leaversSince && e.end_date <= today) leavers += 1
  }
  return { starters, leavers, leaversWithoutDate, startersSince, leaversSince }
}

// ---- Breakdowns -------------------------------------------------------------

export type BreakdownRow = { label: string; count: number; kind: 'value' | 'other' | 'unrecorded' }

type BreakdownOptions = {
  /** How many distinct values to list before folding the rest into one row. */
  limit: number
  unrecordedLabel: string
  otherLabel: (groups: number) => string
}

/**
 * Counts people per value, biggest first. Values differing only by case are one
 * group (the Directory filters the same way). People with no value are kept in
 * their own last row so the gap stays visible.
 */
export function breakdown(people: Employee[], pick: (e: Employee) => string | null, options: BreakdownOptions): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>()
  let unrecorded = 0
  for (const person of people) {
    const value = pick(person)?.trim()
    if (!value) {
      unrecorded += 1
      continue
    }
    const key = value.toLowerCase()
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { label: value, count: 1, kind: 'value' })
  }

  const sorted = [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const rows = sorted.slice(0, options.limit)
  const rest = sorted.slice(options.limit)
  if (rest.length > 0) {
    rows.push({ label: options.otherLabel(rest.length), count: rest.reduce((sum, r) => sum + r.count, 0), kind: 'other' })
  }
  if (unrecorded > 0) rows.push({ label: options.unrecordedLabel, count: unrecorded, kind: 'unrecorded' })
  return rows
}

export type SplitSegment = { key: string; label: string; count: number }

const STATUS_ORDER: EmploymentStatus[] = ['active', 'pre_start', 'on_leave', 'suspended']

/** Employment status of current staff, in a fixed order so each status always keeps its colour. */
export function statusSplit(current: Employee[]): SplitSegment[] {
  return STATUS_ORDER
    .map(value => ({ key: value, label: labelOf(EMPLOYMENT_STATUSES, value), count: current.filter(e => e.employment_status === value).length }))
    .filter(s => s.count > 0)
}

const UNRECORDED_TYPE = 'unrecorded'

/** Employment type of current staff, in the order the type list defines, with a last segment for "not recorded". */
export function typeSplit(current: Employee[]): SplitSegment[] {
  const segments: SplitSegment[] = EMPLOYMENT_TYPES
    .map(t => ({ key: t.value, label: t.label, count: current.filter(e => e.employment_type === t.value).length }))
    .filter(s => s.count > 0)
  const unrecorded = current.filter(e => e.employment_type === null).length
  if (unrecorded > 0) segments.push({ key: UNRECORDED_TYPE, label: 'Type not recorded', count: unrecorded })
  return segments
}

// ---- Starters and leavers by month ------------------------------------------

export type MonthFlow = { key: string; starters: number; leavers: number }

export type Flow = {
  months: MonthFlow[]
  starters: number
  leavers: number
  /** Current staff with no start date, who cannot appear in the chart. */
  missingStartDates: number
}

/** Starters (by start date) and leavers (by end date) for the `months` months up to and including this one. */
export function monthlyFlow(employees: Employee[], today: string, months = 12): Flow {
  const thisMonth = today.slice(0, 7)
  const buckets = new Map<string, MonthFlow>()
  for (let back = months - 1; back >= 0; back -= 1) {
    const key = shiftMonth(thisMonth, -back)
    buckets.set(key, { key, starters: 0, leavers: 0 })
  }

  let missingStartDates = 0
  for (const e of employees) {
    if (!isLeaver(e) && !e.start_date) missingStartDates += 1
    if (e.start_date && e.start_date <= today) {
      const bucket = buckets.get(e.start_date.slice(0, 7))
      if (bucket) bucket.starters += 1
    }
    if (isLeaver(e) && e.end_date && e.end_date <= today) {
      const bucket = buckets.get(e.end_date.slice(0, 7))
      if (bucket) bucket.leavers += 1
    }
  }

  const list = [...buckets.values()]
  return {
    months: list,
    starters: list.reduce((sum, m) => sum + m.starters, 0),
    leavers: list.reduce((sum, m) => sum + m.leavers, 0),
    missingStartDates,
  }
}

// ---- Milestones and probation ----------------------------------------------

export type Starter = { employee: Employee; date: string }
type Anniversary = Starter & { years: number }
export type Milestones = { anniversaries: Anniversary[]; starters: Starter[] }

const byDateThenName = (a: Starter, b: Starter) =>
  a.date.localeCompare(b.date) || displayName(a.employee).localeCompare(displayName(b.employee))

/** Work anniversaries and start dates falling in the current month, for people who have not left. */
export function monthMilestones(current: Employee[], today: string): Milestones {
  const month = today.slice(0, 7)
  const year = Number(today.slice(0, 4))
  const anniversaries: Anniversary[] = []
  const starters: Starter[] = []
  for (const employee of current) {
    const start = employee.start_date
    if (!start) continue
    if (start.slice(0, 7) === month) {
      starters.push({ employee, date: start })
    } else if (start.slice(5, 7) === month.slice(5, 7) && Number(start.slice(0, 4)) < year) {
      const years = year - Number(start.slice(0, 4))
      // addMonths clamps 29 Feb to 28 Feb in years that have no leap day.
      anniversaries.push({ employee, date: addMonths(start, years * 12), years })
    }
  }
  return { anniversaries: anniversaries.sort(byDateThenName), starters: starters.sort(byDateThenName) }
}

/** Current staff whose probation ends between today and `withinDays` days from now, soonest first. */
export function probationEnding(current: Employee[], today: string, withinDays: number): Employee[] {
  const last = addDays(today, withinDays)
  return current
    .filter(e =>
      e.probation_end_date !== null && e.probation_end_date >= today && e.probation_end_date <= last &&
      (e.start_date === null || e.start_date <= today))
    .sort((a, b) =>
      (a.probation_end_date ?? '').localeCompare(b.probation_end_date ?? '') || displayName(a).localeCompare(displayName(b)))
}

// ---- Who's off ---------------------------------------------------------------

export type OffEntry = {
  requestId: string
  employeeId: string
  name: string
  typeName: string
  /** The leave type's colour as set in Settings; the page validates it before use. */
  color: string
  /** Last day of the absence when it carries on past this date. */
  until: string | null
  halfDay: boolean
}

export type OffDay = { date: string; holiday: string | null; entries: OffEntry[] }

/**
 * Approved leave grouped by day for `days` days starting today. The leave type is
 * whatever the leave loader allowed the viewer to see, so managers get "Away"
 * for sick and statutory leave.
 */
export function whosOff(requests: LeaveRequestWithContext[], holidays: PublicHoliday[], today: string, days: number): OffDay[] {
  const holidayByDate = new Map(holidays.map(h => [h.holiday_date, h.name]))
  const holidayDates = new Set(holidayByDate.keys())
  const out: OffDay[] = []
  for (let i = 0; i < days; i += 1) {
    const date = addDays(today, i)
    const entries: OffEntry[] = []
    for (const request of requests) {
      if (!leaveShowsOn(request, date, holidayDates)) continue
      entries.push({
        requestId: request.id,
        employeeId: request.employee_id,
        name: displayName(request.employee),
        typeName: request.type.name,
        color: request.type.color,
        until: request.end_date > date ? request.end_date : null,
        halfDay: (date === request.start_date && request.start_half_day) || (date === request.end_date && request.end_half_day),
      })
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    out.push({ date, holiday: holidayByDate.get(date) ?? null, entries })
  }
  return out
}

// ---- Data completeness (HR) -------------------------------------------------

type CompletenessRow = { employee: Employee; percent: number; missing: number }

export type CompletenessSummary = {
  people: number
  /** Mean of every current employee's completeness, 0-100. */
  average: number
  /** False when personal details could not be loaded, so only the employment record was measured. */
  includesPersonal: boolean
  /** The least complete people, lowest first; anyone at 100% is left out. */
  lowest: CompletenessRow[]
  /** The fields missing for the most people. */
  commonGaps: { label: string; count: number }[]
}

export function completenessSummary(
  current: Employee[], personal: ReadonlyMap<string, EmployeePrivate> | null, lowestCount: number, gapCount: number,
): CompletenessSummary {
  const rows: CompletenessRow[] = []
  const gaps = new Map<string, number>()
  for (const employee of current) {
    const result = profileCompleteness(employee, personal ? (personal.get(employee.id) ?? null) : undefined)
    rows.push({ employee, percent: result.percent, missing: result.missing.length })
    for (const field of result.missing) gaps.set(field.label, (gaps.get(field.label) ?? 0) + 1)
  }

  const lowest = rows
    .filter(r => r.percent < 100)
    .sort((a, b) => a.percent - b.percent || displayName(a.employee).localeCompare(displayName(b.employee)))
    .slice(0, lowestCount)
  const commonGaps = [...gaps.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, gapCount)

  return {
    people: rows.length,
    average: rows.length === 0 ? 0 : Math.round(rows.reduce((sum, r) => sum + r.percent, 0) / rows.length),
    includesPersonal: personal !== null,
    lowest,
    commonGaps,
  }
}

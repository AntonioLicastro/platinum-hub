import { displayName } from './format'
import { isSensitiveLeaveCategory } from './leave-calc'
import {
  averageHeadcount, emptyResult, groupByLabel, MONTH_ABBR, MONTH_NAMES, monthPointDate, NO_AREA, percentOf, round1, safeColor,
} from './report-core'
import { formatNumber, formatPercent, plural } from './report-format'
import type { BarItem, Cell, ReportResult, ReportTable } from './report-types'
import type { Employee, LeaveCategory, LeaveType } from './types'

// Leave and absence. Pure: the loader fetches the rows (already limited to the
// viewer's scope) and passes `seesCategories`, the one switch that stops line
// managers learning who was off sick or on statutory leave.

/** How far ahead the "upcoming leave" list looks. */
export const UPCOMING_LEAVE_DAYS = 60

type LeaveTypeInfo = Pick<LeaveType, 'id' | 'name' | 'category' | 'color'>

/** An approved request, trimmed to what the maths needs (never the reason or notes). */
export type LeaveRow = { employee_id: string; leave_type_id: number; start_date: string; days: number }

export type UpcomingLeaveRow = LeaveRow & { end_date: string; status: 'approved' | 'pending' }

type LeaveInput = {
  employees: readonly Employee[]
  types: readonly LeaveTypeInfo[]
  /** Approved requests that start in `year`. */
  requests: readonly LeaveRow[]
  upcoming: readonly UpcomingLeaveRow[]
  year: number
  today: string
  /** HR sees every category. Everyone else gets sick and statutory leave merged as "Other absence". */
  seesCategories: boolean
}

const OTHER_ABSENCE = 'Other absence'

const CATEGORY_LABELS: Record<LeaveCategory, string> = {
  annual: 'Annual leave', sick: 'Sick leave', statutory: 'Statutory leave', other: 'Other',
}

type Bucket = { key: string; name: string; category: string | null; color: string | undefined }

function bucketFor(type: LeaveTypeInfo | undefined, seesCategories: boolean): Bucket {
  if (!type) return { key: 'unrecognised', name: 'Unrecognised leave type', category: null, color: undefined }
  if (!seesCategories && isSensitiveLeaveCategory(type.category)) {
    return { key: 'other-absence', name: OTHER_ABSENCE, category: null, color: '#64748b' }
  }
  return { key: `type-${type.id}`, name: type.name, category: CATEGORY_LABELS[type.category], color: safeColor(type.color) }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

type Totals = { bucket: Bucket; requests: number; days: number; people: Set<string> }

export function buildLeave(input: LeaveInput): ReportResult {
  const { employees, year, today, seesCategories } = input
  const people = new Map(employees.map(e => [e.id, e]))
  const types = new Map(input.types.map(t => [t.id, t]))
  const upcoming = input.upcoming.filter(r => people.has(r.employee_id))
  const requests = input.requests.filter(r => people.has(r.employee_id) && r.start_date.startsWith(`${year}-`))

  if (requests.length === 0 && upcoming.length === 0) {
    return emptyResult(
      'leave', `No leave recorded for ${year}`,
      'Approved leave appears here once requests are approved, or recorded on someone’s behalf.',
    )
  }

  const byType = new Map<string, Totals>()
  const monthDays: number[] = MONTH_ABBR.map(() => 0)
  const sickByEmployee = new Map<string, number>()
  const takers = new Set<string>()
  let totalDays = 0
  let sickDays = 0
  for (const row of requests) {
    const days = Number(row.days)
    const type = types.get(row.leave_type_id)
    const bucket = bucketFor(type, seesCategories)
    const totals = byType.get(bucket.key) ?? { bucket, requests: 0, days: 0, people: new Set<string>() }
    totals.requests += 1
    totals.days += days
    totals.people.add(row.employee_id)
    byType.set(bucket.key, totals)

    monthDays[Number(row.start_date.slice(5, 7)) - 1] += days
    takers.add(row.employee_id)
    totalDays += days
    if (type?.category === 'sick') {
      sickDays += days
      sickByEmployee.set(row.employee_id, (sickByEmployee.get(row.employee_id) ?? 0) + days)
    }
  }

  // The year's headcount: one snapshot per month so far (or today, for a year that has not begun).
  const monthKeys = MONTH_ABBR.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter(key => `${key}-01` <= today)
  const dates = monthKeys.length > 0 ? monthKeys.map(key => monthPointDate(key, today)) : [today]
  const average = averageHeadcount(employees, dates, 'assume')

  const typeRows = [...byType.values()].sort((a, b) => b.days - a.days || a.bucket.name.localeCompare(b.bucket.name))
  const busiest = monthDays.reduce((best, d, i) => (d > monthDays[best] ? i : best), 0)
  const takersShare = percentOf(takers.size, average)
  const perHead = average > 0 ? sickDays / average : null

  const thirdStat: ReportResult['stats'][number] = seesCategories
    ? {
        label: 'Sick days per head',
        value: perHead === null ? '–' : formatNumber(perHead),
        tone: 'pink',
        icon: 'sick',
        hint: `${formatNumber(round1(sickDays))} sick days across an average of ${formatNumber(round1(average))} staff`,
      }
    : {
        label: 'Busiest month',
        value: totalDays > 0 ? MONTH_NAMES[busiest] : '–',
        tone: 'amber',
        icon: 'trend',
        hint: totalDays > 0 ? `${formatNumber(round1(monthDays[busiest]))} days starting that month` : undefined,
      }

  const typeBars: BarItem[] = typeRows.map(t => ({
    label: t.bucket.name, value: round2(t.days), color: t.bucket.color, note: plural(t.requests, 'request', 'requests'),
  }))

  const tables: ReportTable[] = [
    {
      id: 'by-type',
      title: `Days taken by leave type, ${year}`,
      columns: [
        { label: 'Leave type' }, ...(seesCategories ? [{ label: 'Category' }] : []),
        { label: 'Requests', kind: 'integer' }, { label: 'Days', kind: 'decimal' }, { label: 'People', kind: 'integer' },
        { label: 'Share of days (%)', kind: 'percent' },
      ],
      rows: typeRows.map(t => [
        t.bucket.name, ...(seesCategories ? [t.bucket.category] : []),
        t.requests, round2(t.days), t.people.size, percentOf(t.days, totalDays),
      ]),
      emptyText: `No approved leave starting in ${year} yet.`,
    },
    {
      id: 'by-month',
      title: `Days taken by month, ${year}`,
      description: 'Each request is counted in the month it starts.',
      columns: [{ label: 'Month' }, { label: 'Days', kind: 'decimal' }],
      rows: [...MONTH_NAMES.map((name, i): Cell[] => [name, round2(monthDays[i])]), [`Total ${year}`, round2(totalDays)]],
      emptyText: 'No leave recorded yet.',
      hasTotalRow: true,
    },
  ]

  if (seesCategories) tables.push(sickTable(employees, sickByEmployee, dates, year))

  tables.push({
    id: 'upcoming',
    title: `Upcoming leave, next ${UPCOMING_LEAVE_DAYS} days`,
    description: 'Approved and pending requests that are under way or about to start.',
    columns: [
      { label: 'Employee' }, { label: 'Area' }, { label: 'Leave' }, { label: 'From', kind: 'date' }, { label: 'To', kind: 'date' },
      { label: 'Days', kind: 'decimal' }, { label: 'Status' },
    ],
    ...upcomingRows(upcoming, people, types, seesCategories),
    emptyText: `No one is booked off in the next ${UPCOMING_LEAVE_DAYS} days.`,
    displayLimit: 25,
  })

  return {
    id: 'leave',
    empty: null,
    notices: seesCategories ? [] : ['Some absence types are combined as “Other absence”, so personal circumstances are not shown.'],
    stats: [
      { label: `Days taken in ${year}`, value: formatNumber(round1(totalDays)), tone: 'blue', icon: 'leave', hint: plural(requests.length, 'approved request', 'approved requests') },
      {
        label: 'People with leave', value: formatNumber(takers.size), tone: 'green', icon: 'people',
        hint: takersShare === null ? undefined : `${formatPercent(takersShare)} of average headcount`,
      },
      thirdStat,
    ],
    charts: [
      ...(totalDays > 0
        ? [{
            kind: 'columns' as const,
            title: `Days taken by month, ${year}`,
            description: 'Approved leave, counted in the month each request starts.',
            categories: [...MONTH_ABBR],
            series: [{ name: 'Days', tone: 'blue' as const, values: monthDays.map(round2) }],
          }]
        : []),
      ...(typeBars.length > 0
        ? [{ kind: 'bars' as const, title: `Days taken by leave type, ${year}`, description: 'Approved leave', items: typeBars }]
        : []),
    ],
    tables,
    method: [
      'Only approved leave counts as taken. Each request is counted in the month and year it starts, the same way leave balances work.',
      'Days are the working days saved with each request, half days included.',
      seesCategories
        ? 'Sick days per head divides sick leave days by the average number of people in post across the year. People with no start date are assumed to have been in post throughout.'
        : 'For line managers, some absence types are combined as “Other absence”.',
      `Upcoming leave lists approved and pending requests running in the next ${UPCOMING_LEAVE_DAYS} days.`,
    ],
  }
}

function sickTable(employees: readonly Employee[], sickByEmployee: ReadonlyMap<string, number>, dates: readonly string[], year: number): ReportTable {
  const rows = groupByLabel(employees, e => e.area, NO_AREA)
    .map(g => {
      const days = g.items.reduce((sum, e) => sum + (sickByEmployee.get(e.id) ?? 0), 0)
      const average = averageHeadcount(g.items, dates, 'assume')
      return { label: g.label, days, average, perHead: average > 0 ? days / average : null }
    })
    .filter(r => r.days > 0 || r.average > 0)
  const totalDays = rows.reduce((sum, r) => sum + r.days, 0)
  const totalAverage = rows.reduce((sum, r) => sum + r.average, 0)
  const asRow = (r: { label: string; days: number; average: number; perHead: number | null }): Cell[] =>
    [r.label, round2(r.days), round1(r.average), r.perHead === null ? null : round2(r.perHead)]
  const total = { label: 'All areas', days: totalDays, average: totalAverage, perHead: totalAverage > 0 ? totalDays / totalAverage : null }
  return {
    id: 'sick',
    title: `Sick leave by area, ${year}`,
    description: 'Visible to HR only.',
    columns: [{ label: 'Area' }, { label: 'Sick days', kind: 'decimal' }, { label: 'Average headcount', kind: 'decimal' }, { label: 'Sick days per head', kind: 'decimal' }],
    rows: [...rows.map(asRow), ...(rows.length > 1 ? [asRow(total)] : [])],
    emptyText: `No sick leave recorded for ${year} yet.`,
    hasTotalRow: rows.length > 1,
  }
}

function upcomingRows(
  upcoming: readonly UpcomingLeaveRow[], people: ReadonlyMap<string, Employee>, types: ReadonlyMap<number, LeaveTypeInfo>,
  seesCategories: boolean,
): Pick<ReportTable, 'rows' | 'rowHrefs'> {
  const sorted = upcoming
    .flatMap(r => {
      const employee = people.get(r.employee_id)
      return employee ? [{ row: r, employee }] : []
    })
    .sort((a, b) =>
      a.row.start_date.localeCompare(b.row.start_date) || displayName(a.employee).localeCompare(displayName(b.employee)))
  return {
    rows: sorted.map(({ row, employee }) => [
      displayName(employee),
      employee.area,
      bucketFor(types.get(row.leave_type_id), seesCategories).name,
      row.start_date,
      row.end_date,
      round2(Number(row.days)),
      row.status === 'approved' ? 'Approved' : 'Pending',
    ]),
    rowHrefs: sorted.map(({ employee }) => `/employees/${employee.id}`),
  }
}

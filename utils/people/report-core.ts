import { daysBetween, parseIsoDate } from './format'
import { monthRange, shiftMonth } from './leave-calc'
import type { ReportId, ReportResult } from './report-types'
import type { Employee } from './types'

// Pure building blocks shared by every report calculation: grouping, months,
// and the "who was in post on this date" rule. No I/O, no clock: callers pass
// `today`, so results are repeatable and easy to check.

/** Filter value meaning "people with no area recorded". */
export const AREA_NONE = '__none__'
export const NO_AREA = 'No area recorded'
export const NO_TITLE = 'No job title recorded'
export const NO_TYPE = 'Employment type not recorded'

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]

const collator = new Intl.Collator('en-IE', { sensitivity: 'base', numeric: true })

export const round1 = (n: number): number => Math.round(n * 10) / 10

/** part / whole as a percentage to one decimal place, or null when there is no whole to measure against. */
export const percentOf = (part: number, whole: number): number | null => (whole > 0 ? round1((part / whole) * 100) : null)

export const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** A report with nothing to show yet: the page renders `title` and `body` as an inviting empty state. */
export function emptyResult(id: ReportId, title: string, body: string): ReportResult {
  return { id, empty: { title, body }, notices: [], stats: [], charts: [], tables: [], method: [] }
}

/** Leave-type colours come from the database, so only plain `#rrggbb` ever reaches a style attribute. */
export const safeColor = (color: string | null | undefined): string | undefined =>
  color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined

// ---- Grouping ----------------------------------------------------------------

export type Group<T> = { label: string; items: T[]; blank: boolean }

/**
 * Groups rows by a text field, ignoring case and stray spaces ("Carer" and
 * "carer " are one group, shown in the commonest spelling). Biggest first,
 * with the "nothing recorded" group always last.
 */
export function groupByLabel<T>(items: readonly T[], valueOf: (item: T) => string | null | undefined, blankLabel: string): Group<T>[] {
  const byKey = new Map<string, { spellings: Map<string, number>; items: T[] }>()
  const blank: T[] = []
  for (const item of items) {
    const value = valueOf(item)?.trim()
    if (!value) {
      blank.push(item)
      continue
    }
    const key = value.toLowerCase()
    const group = byKey.get(key) ?? { spellings: new Map<string, number>(), items: [] }
    group.items.push(item)
    group.spellings.set(value, (group.spellings.get(value) ?? 0) + 1)
    byKey.set(key, group)
  }
  const groups: Group<T>[] = [...byKey.values()].map(g => ({
    label: [...g.spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    items: g.items,
    blank: false,
  }))
  groups.sort((a, b) => b.items.length - a.items.length || collator.compare(a.label, b.label))
  if (blank.length > 0) groups.push({ label: blankLabel, items: blank, blank: true })
  return groups
}

export type AreaOption = { value: string; label: string }

/** The areas present among these people, A to Z, plus "no area" when some have none. Drives the area filter. */
export function areaOptions(employees: readonly Pick<Employee, 'area'>[]): AreaOption[] {
  const groups = groupByLabel(employees, e => e.area, NO_AREA)
  const options = groups.filter(g => !g.blank).map(g => g.label).sort(collator.compare).map(label => ({ value: label, label }))
  if (groups.some(g => g.blank)) options.push({ value: AREA_NONE, label: NO_AREA })
  return options
}

export function filterByArea<T extends Pick<Employee, 'area'>>(employees: readonly T[], area: string): T[] {
  if (area === '') return [...employees]
  if (area === AREA_NONE) return employees.filter(e => !e.area?.trim())
  const wanted = area.trim().toLowerCase()
  return employees.filter(e => e.area?.trim().toLowerCase() === wanted)
}

// ---- Months ------------------------------------------------------------------

/** The last `count` calendar months as `YYYY-MM` keys, oldest first, ending with today's month. */
export function recentMonths(today: string, count: number): string[] {
  const current = today.slice(0, 7)
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)))
}

/** "Oct 26". */
export function shortMonth(key: string): string {
  const [year, month] = key.split('-')
  return `${MONTH_ABBR[Number(month) - 1]} ${year.slice(2)}`
}

/** The date a month's figure is taken at: its last day, or today for the month still in progress. */
export function monthPointDate(key: string, today: string): string {
  const last = monthRange(key).last
  return last > today ? today : last
}

/** Whole calendar months from start to end, the way the employee profile counts tenure. */
export function wholeMonths(startIso: string, endIso: string): number {
  const from = parseIsoDate(startIso)
  const to = parseIsoDate(endIso)
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/** Months with a fraction, for averages (an average of whole months would round every short stay to zero). */
export const monthsBetween = (startIso: string, endIso: string): number => Math.max(0, daysBetween(endIso, startIso) / 30.4375)

// ---- Who is in post ----------------------------------------------------------

type Dated = Pick<Employee, 'start_date' | 'end_date' | 'employment_status'>

/** Active, on leave or suspended: working for the company today. Pre-start and leavers are not headcount. */
export const isInPost = (e: Pick<Employee, 'employment_status'>): boolean =>
  e.employment_status === 'active' || e.employment_status === 'on_leave' || e.employment_status === 'suspended'

/**
 * What to do with people who have no start date:
 *  - 'exclude': they cannot be placed in time, so leave them out (the headcount trend);
 *  - 'assume': they were here all along, so a rate's denominator is not understated while records fill in.
 */
type UndatedPolicy = 'exclude' | 'assume'

/**
 * Whether the person was working on `iso`: started on or before it, and not past
 * their last working day (end_date is that last day, so it still counts).
 * A leaver with no end date is never counted: we cannot say when they left.
 */
function inPostOn(e: Dated, iso: string, undated: UndatedPolicy): boolean {
  if (e.start_date) {
    if (e.start_date > iso) return false
  } else if (undated === 'exclude' || e.employment_status === 'pre_start') {
    return false
  }
  if (e.end_date) return e.end_date >= iso
  return e.employment_status !== 'leaver'
}

export const headcountOn = (employees: readonly Dated[], iso: string, undated: UndatedPolicy): number =>
  employees.reduce((count, e) => count + (inPostOn(e, iso, undated) ? 1 : 0), 0)

/** Mean headcount across several dates. */
export function averageHeadcount(employees: readonly Dated[], dates: readonly string[], undated: UndatedPolicy): number {
  if (dates.length === 0) return 0
  return dates.reduce((sum, iso) => sum + headcountOn(employees, iso, undated), 0) / dates.length
}

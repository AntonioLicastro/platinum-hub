import { formatDate, formatDayMonth, parseIsoDate, toIsoDate } from './format'
import type { LeaveCategory, LeaveRequest, LeaveType } from './types'

// Pure leave arithmetic and calendar helpers. No server imports, so client
// components (the request form's live preview) can use exactly the same maths
// the server action uses to store the final figure.

type DayCountOptions = {
  /** The first day is a half day. */
  startHalf?: boolean
  /** The last day is a half day. */
  endHalf?: boolean
  /**
   * Count every calendar day, weekends and public holidays included. Carers
   * work rotating rosters, so for them a Saturday off is a day of leave.
   * Default false: Monday to Friday, excluding public holidays.
   */
  includeWeekends?: boolean
}

/** The longest single request the app accepts. Statutory maternity leave is well inside this. */
export const MAX_LEAVE_SPAN_DAYS = 400

/** Staff can start a request this many days in the past (a forgotten sick day); older leave goes through HR. */
export const LEAVE_BACKDATE_DAYS = 31

/** How far ahead leave can be booked. */
export const LEAVE_MAX_AHEAD_DAYS = 1100

const DAY_MS = 86_400_000

export const yearOf = (iso: string): number => Number(iso.slice(0, 4))

export function isWeekend(iso: string): boolean {
  const day = parseIsoDate(iso).getUTCDay()
  return day === 0 || day === 6
}

/** Inclusive date ranges overlap. Works on `YYYY-MM-DD` strings. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

/**
 * Days of leave between two ISO dates, inclusive. Weekdays only and public
 * holidays excluded unless `includeWeekends`. Each half-day flag takes 0.5 off
 * its own day; a single day with either flag is 0.5. A flag on a day that
 * isn't counted anyway (a weekend start, say) takes nothing off.
 */
export function countWorkingDays(
  startIso: string, endIso: string, holidays: ReadonlySet<string>, opts: DayCountOptions = {},
): number {
  if (endIso < startIso) return 0
  const counts = (iso: string) => opts.includeWeekends === true || (!isWeekend(iso) && !holidays.has(iso))

  let total = 0
  const last = parseIsoDate(endIso).getTime()
  for (let t = parseIsoDate(startIso).getTime(); t <= last; t += DAY_MS) {
    if (counts(toIsoDate(new Date(t)))) total += 1
  }

  if (startIso === endIso) {
    if ((opts.startHalf || opts.endHalf) && counts(startIso)) total -= 0.5
  } else {
    if (opts.startHalf && counts(startIso)) total -= 0.5
    if (opts.endHalf && counts(endIso)) total -= 0.5
  }
  return Math.max(0, total)
}

/**
 * Whether a request should show as "away" on a given date. Weekends and public
 * holidays only count when the request counted calendar days (we don't store
 * that choice, but it shows as more days than the weekdays in the range).
 */
export function leaveShowsOn(
  request: Pick<LeaveRequest, 'start_date' | 'end_date' | 'days' | 'start_half_day' | 'end_half_day'>,
  iso: string,
  holidays: ReadonlySet<string>,
): boolean {
  if (iso < request.start_date || iso > request.end_date) return false
  if (!isWeekend(iso) && !holidays.has(iso)) return true
  const weekdayDays = countWorkingDays(request.start_date, request.end_date, holidays, {
    startHalf: request.start_half_day, endHalf: request.end_half_day,
  })
  return request.days > weekdayDays
}

/** "Mon 13 Oct 2026", or "Mon 13 Oct – Wed 15 Oct 2026" (years shown on both ends when they differ). */
export function formatLeaveRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatDate(startIso)
  const sameYear = yearOf(startIso) === yearOf(endIso)
  const from = sameYear ? formatDayMonth(startIso) : formatDate(startIso)
  return `${from} – ${sameYear ? `${formatDayMonth(endIso)} ${yearOf(endIso)}` : formatDate(endIso)}`
}

/** "Starts on a half day · Ends on a half day", or "Half day" for a single day. */
export function halfDayNote(startIso: string, endIso: string, startHalf: boolean, endHalf: boolean): string | null {
  if (startIso === endIso) return startHalf || endHalf ? 'Half day' : null
  const parts: string[] = []
  if (startHalf) parts.push('Starts on a half day')
  if (endHalf) parts.push('Ends on a half day')
  return parts.length ? parts.join(' · ') : null
}

// ---- What a line manager may see ------------------------------------------

/** Sick and statutory leave can reveal health or family circumstances, so managers only see "Away". */
export function isSensitiveLeaveCategory(category: LeaveCategory): boolean {
  return category === 'sick' || category === 'statutory'
}

/** Stands in for a leave type the viewer isn't allowed to see. */
export const AWAY_LEAVE_TYPE: LeaveType = {
  id: 0,
  code: 'away',
  name: 'Away',
  category: 'other',
  paid: true,
  requires_approval: true,
  uses_balance: false,
  default_entitlement_days: null,
  color: '#64748b',
  statutory_note: null,
  active: true,
  sort_order: 0,
}

export const isAwayType = (type: Pick<LeaveType, 'code'>): boolean => type.code === AWAY_LEAVE_TYPE.code

// ---- Month grid ------------------------------------------------------------

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

/** `YYYY-MM` within the years the database accepts for entitlements. */
export function isMonthKey(value: string | undefined): value is string {
  if (!value) return false
  const match = MONTH_KEY.exec(value)
  return match !== null && Number(match[1]) >= 2000 && Number(match[1]) <= 2100
}

export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  return toIsoDate(new Date(Date.UTC(year, month - 1 + delta, 1))).slice(0, 7)
}

export function monthRange(key: string): { first: string; last: string } {
  const [year, month] = key.split('-').map(Number)
  return { first: `${key}-01`, last: toIsoDate(new Date(Date.UTC(year, month, 0))) }
}

export function monthLabel(key: string): string {
  return parseIsoDate(`${key}-01`).toLocaleDateString('en-IE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Weeks (Monday first) of ISO dates for a month; days outside the month are null. */
export function monthWeeks(key: string): (string | null)[][] {
  const { first, last } = monthRange(key)
  const leading = (parseIsoDate(first).getUTCDay() + 6) % 7
  const lastDay = Number(last.slice(8))
  const cells: (string | null)[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= lastDay; day++) cells.push(`${key}-${String(day).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

import { addDays, parseIsoDate } from './format'
import type { PublicHoliday } from './types'

// Pure date rules for the standard set of Irish public holidays. Statutory
// rules can change, so callers must tell the user to check the result against
// the official list (gov.ie) before relying on it.

/** St Brigid's Day became a public holiday in 2023; earlier years have no such day. */
export const FIRST_HOLIDAY_YEAR = 2023
const LAST_HOLIDAY_YEAR = 2100

export const isSupportedHolidayYear = (year: number): boolean =>
  Number.isInteger(year) && year >= FIRST_HOLIDAY_YEAR && year <= LAST_HOLIDAY_YEAR

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
const weekdayOf = (iso: string) => parseIsoDate(iso).getUTCDay() // 0 = Sunday ... 6 = Saturday

/** Easter Sunday for a year in the Gregorian calendar (Anonymous Gregorian / Meeus-Jones-Butcher algorithm). */
function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return isoOf(year, month, day)
}

function firstMonday(year: number, month: number): string {
  const first = isoOf(year, month, 1)
  return addDays(first, (8 - weekdayOf(first)) % 7)
}

function lastMonday(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = isoOf(year, month, lastDay)
  return addDays(last, -((weekdayOf(last) + 6) % 7))
}

/** The ten standard Irish public holidays for a year, in date order. */
export function irishPublicHolidays(year: number): PublicHoliday[] {
  const feb1 = isoOf(year, 2, 1)
  // St Brigid's Day: first Monday in February, unless 1 February is itself a Friday.
  const brigid = weekdayOf(feb1) === 5 ? feb1 : firstMonday(year, 2)
  return [
    { holiday_date: isoOf(year, 1, 1), name: "New Year's Day" },
    { holiday_date: brigid, name: "St Brigid's Day" },
    { holiday_date: isoOf(year, 3, 17), name: "St Patrick's Day" },
    { holiday_date: addDays(easterSunday(year), 1), name: 'Easter Monday' },
    { holiday_date: firstMonday(year, 5), name: 'May Bank Holiday' },
    { holiday_date: firstMonday(year, 6), name: 'June Bank Holiday' },
    { holiday_date: firstMonday(year, 8), name: 'August Bank Holiday' },
    { holiday_date: lastMonday(year, 10), name: 'October Bank Holiday' },
    { holiday_date: isoOf(year, 12, 25), name: 'Christmas Day' },
    { holiday_date: isoOf(year, 12, 26), name: "St Stephen's Day" },
  ]
}

import { COUNTIES, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, labelOf } from './constants'
import { formatDate, maskPps } from './format'
import { isPrivateField, type ImportField } from './import-fields'
import { isPhone, isPlausibleDate } from './profile-validate'
import { isEircode, isEmail, isIsoDate, isPps, normaliseEircode, normalisePps } from './validate'
import type { EmploymentStatus, EmploymentType } from './types'

// Turns one spreadsheet cell into a value the database accepts, or a plain
// language reason it cannot. Nothing here guesses: a value that is not clearly
// understood is reported, never silently changed.

export type Parsed =
  | { status: 'blank' }
  | { status: 'ok'; value: string | number }
  | { status: 'invalid'; message: string }

const BLANK: Parsed = { status: 'blank' }
const ok = (value: string | number): Parsed => ({ status: 'ok', value })
const invalid = (message: string): Parsed => ({ status: 'invalid', message })

// "jan" and "january" both work, and so does "sept". A Map, so odd text like "constructor" can never match.
const MONTHS = new Map<string, number>([['sept', 9]])
;['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].forEach(
  (name, i) => {
    MONTHS.set(name, i + 1)
    MONTHS.set(name.slice(0, 3), i + 1)
  },
)

const pad = (n: number) => String(n).padStart(2, '0')

function toIso(year: number, month: number, day: number): string | null {
  const iso = `${year}-${pad(month)}-${pad(day)}`
  return isIsoDate(iso) && isPlausibleDate(iso) ? iso : null
}

/** Excel stores dates as day numbers counted from 30 Dec 1899. 10000 is 1927 and 73415 is 2100. */
const SERIAL_MIN = 10_000
const SERIAL_MAX = 73_415

type DateReading = { iso: string } | { twoDigitYear: true } | null

/**
 * Reads the date formats HR files use. Day comes first (Irish order): 05/01/2024 is 5 January.
 * Two-digit years are refused rather than guessed (is "30" 1930 or 2030?).
 */
function readDate(text: string): DateReading {
  const t = text.trim().replace(/\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?$/i, '')

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(t) ?? /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(t)
  if (m) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]))
    return iso ? { iso } : null
  }

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t)
  if (m) {
    const iso = toIso(Number(m[3]), Number(m[2]), Number(m[1]))
    return iso ? { iso } : null
  }
  if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2}$/.test(t)) return { twoDigitYear: true }

  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})\.?,?[\s\-/.]+(\d{4})$/.exec(t)
  const dayFirstMonth = m ? MONTHS.get(m[2].toLowerCase()) : undefined
  if (m && dayFirstMonth) {
    const iso = toIso(Number(m[3]), dayFirstMonth, Number(m[1]))
    return iso ? { iso } : null
  }

  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(t)
  const monthFirstMonth = m ? MONTHS.get(m[1].toLowerCase()) : undefined
  if (m && monthFirstMonth) {
    const iso = toIso(Number(m[3]), monthFirstMonth, Number(m[2]))
    return iso ? { iso } : null
  }

  m = /^(\d{5})(?:\.\d+)?$/.exec(t)
  if (m) {
    const serial = Number(m[1])
    if (serial < SERIAL_MIN || serial > SERIAL_MAX) return null
    return { iso: new Date(Date.UTC(1899, 11, 30 + serial)).toISOString().slice(0, 10) }
  }
  return null
}

// Words in a status / contract-type cell that clearly mean one of our values.
// Anything not listed is reported instead of guessed (e.g. "Permanent part time").
const normaliseWords = (text: string) => text.toLowerCase().replace(/[_\-/.]+/g, ' ').replace(/\s+/g, ' ').trim()

const STATUS_WORDS: Record<EmploymentStatus, string[]> = {
  active: ['active', 'current', 'employed', 'current employee', 'active employee'],
  leaver: ['leaver', 'left', 'terminated', 'resigned', 'former employee', 'ex employee', 'dismissed', 'redundant', 'retired'],
  pre_start: ['pre start', 'prestart'],
  on_leave: ['on leave'],
  suspended: ['suspended'],
}

const TYPE_WORDS: Record<EmploymentType, string[]> = {
  permanent: ['permanent', 'full time', 'fulltime', 'perm', 'permanent full time'],
  part_time: ['part time', 'parttime'],
  fixed_term: ['fixed term', 'fixedterm', 'fixed term contract', 'temporary', 'temp'],
  casual: ['casual', 'relief'],
  contract: ['contract', 'contractor'],
  agency: ['agency'],
}

function lookupWords<T extends string>(table: Record<T, string[]>, text: string): T | null {
  const words = normaliseWords(text)
  for (const key of Object.keys(table) as T[]) if (table[key].includes(words)) return key
  return null
}

const clip = (text: string) => (text.length > 40 ? `${text.slice(0, 37)}…` : text)

/** Parses one cell for one field. `today` is `YYYY-MM-DD` (Irish time). */
export function parseFieldValue(field: ImportField, input: string, today: string): Parsed {
  const raw = input.trim()
  if (!raw) return BLANK
  // Personal details are never echoed back in messages.
  const quoted = isPrivateField(field) ? '' : ` “${clip(raw)}”`
  const label = field.label

  if (field.maxLength && raw.length > field.maxLength && field.kind !== 'email') {
    return invalid(`${label} is too long (maximum ${field.maxLength} characters)`)
  }

  switch (field.kind) {
    case 'email': {
      const email = raw.replace(/^mailto:/i, '').toLowerCase()
      if (!isEmail(email) || email.length > 254) return invalid(`${label}${quoted} is not a valid email address`)
      return ok(email)
    }
    case 'date': {
      const reading = readDate(raw)
      if (reading && 'twoDigitYear' in reading) {
        return invalid(`${label}${quoted} has a two-digit year. Use four digits, like 05/01/2024`)
      }
      if (!reading) return invalid(`${label}${quoted} is not a date I can read. Use day/month/year, like 05/01/2024`)
      if (field.notFuture && reading.iso > today) return invalid(`${label} is in the future`)
      return ok(reading.iso)
    }
    case 'hours': {
      const cleaned = raw.replace(/\s*(?:hours?|hrs?|h)(?:\s*(?:\/|per|a)\s*(?:wk|week))?\.?$/i, '').replace(/^(\d+),(\d+)$/, '$1.$2')
      const hours = /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN
      if (!Number.isFinite(hours) || hours > 168) return invalid(`${label}${quoted} is not a number between 0 and 168`)
      return ok(Math.round(hours * 100) / 100)
    }
    case 'status': {
      const status = lookupWords(STATUS_WORDS, raw)
      if (!status) {
        const options = EMPLOYMENT_STATUSES.map(s => s.label).join(', ')
        return invalid(`${label}${quoted} is not one I recognise. Use one of: ${options}`)
      }
      return ok(status)
    }
    case 'type': {
      const type = lookupWords(TYPE_WORDS, raw)
      if (!type) {
        const options = EMPLOYMENT_TYPES.map(t => t.label).join(', ')
        return invalid(`${label}${quoted} is not one I recognise. Use one of: ${options}`)
      }
      return ok(type)
    }
    case 'phone':
      return isPhone(raw) ? ok(raw) : invalid(`${label}${quoted} does not look like a phone number`)
    case 'pps': {
      const pps = normalisePps(raw)
      return isPps(pps) ? ok(pps) : invalid(`${label} is not valid (7 digits followed by 1 or 2 letters, like 1234567TA)`)
    }
    case 'eircode':
      return isEircode(raw) ? ok(normaliseEircode(raw)) : invalid(`${label} is not a valid Eircode`)
    case 'county': {
      const name = raw.replace(/^(?:co\.?|county)\s+/i, '').trim()
      return ok(COUNTIES.find(county => county.toLowerCase() === name.toLowerCase()) ?? name)
    }
    case 'text':
    case 'manager':
      return ok(raw)
  }
}

/** How a stored value reads in the preview table. PPS numbers are masked. */
export function displayValue(field: ImportField, value: string | number): string {
  switch (field.kind) {
    case 'date': return formatDate(String(value))
    case 'status': return labelOf(EMPLOYMENT_STATUSES, value as EmploymentStatus)
    case 'type': return labelOf(EMPLOYMENT_TYPES, value as EmploymentType)
    case 'hours': return `${value} h`
    case 'pps': return maskPps(String(value))
    default: return String(value)
  }
}

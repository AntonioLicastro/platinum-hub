import { DEFAULT_EXPIRY_WARNING_DAYS } from './constants'
import type { Employee } from './types'

// All date columns are `YYYY-MM-DD` strings. We deliberately parse them as UTC
// midnight and compare against "today" in Europe/Dublin, so a server running in
// UTC never shifts a date by a day.

const DUBLIN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Today's date in Ireland as `YYYY-MM-DD`. */
export function todayIso(): string {
  return DUBLIN_DATE.format(new Date())
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  // Date.UTC maps years 0-99 to 1900-1999; setUTCFullYear does not.
  const date = new Date(Date.UTC(2000, m - 1, d))
  date.setUTCFullYear(y)
  return date
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

export function addMonths(iso: string, months: number): string {
  const d = parseIsoDate(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return toIsoDate(d)
}

/** Whole days from `fromIso` (default today) to `toIso`. Negative when `toIso` is in the past. */
export function daysBetween(toIso: string, fromIso: string = todayIso()): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000)
}

/** 13 Oct 2026 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return parseIsoDate(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Mon 13 Oct */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return ''
  return parseIsoDate(iso).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** For timestamptz values: 13 Oct 2026, 14:05 (Irish time). */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-IE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Dublin',
  })
}

/** "in 5 days", "today", "3 days ago" */
export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return ''
  const n = daysBetween(iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export function formatDays(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`
}

/** "2 yrs 3 mos", "5 mos", "12 days" — from start date to end date (or today). */
export function tenure(start: string | null | undefined, end?: string | null): string {
  if (!start) return ''
  const from = parseIsoDate(start)
  const to = parseIsoDate(end ?? todayIso())
  if (to < from) return 'Not started'
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  if (months < 1) {
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  const years = Math.floor(months / 12)
  const rem = months % 12
  const parts: string[] = []
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`)
  if (rem) parts.push(`${rem} ${rem === 1 ? 'mo' : 'mos'}`)
  return parts.join(' ')
}

export type ExpiryState = 'none' | 'valid' | 'expiring' | 'expired'

/** Classify an expiry date. `none` = no expiry date recorded. */
export function expiryState(expiresOn: string | null | undefined, warnDays: number = DEFAULT_EXPIRY_WARNING_DAYS): ExpiryState {
  if (!expiresOn) return 'none'
  const n = daysBetween(expiresOn)
  if (n < 0) return 'expired'
  if (n <= warnDays) return 'expiring'
  return 'valid'
}

export function fullName(e: Pick<Employee, 'first_name' | 'last_name'>): string {
  return `${e.first_name} ${e.last_name}`.trim()
}

/** Name shown in lists: "Jane Doe", or "Jane Doe (Janey)" when a preferred name is set. */
export function displayName(e: Pick<Employee, 'first_name' | 'last_name' | 'preferred_name' | 'email'>): string {
  const base = fullName(e) || e.email
  const preferred = e.preferred_name?.trim()
  return preferred && preferred.toLowerCase() !== e.first_name.trim().toLowerCase() ? `${base} (${preferred})` : base
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Splits "Mary Anne O'Brien" into first/last for imports and syncs. */
export function splitName(name: string): { first_name: string; last_name: string } {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const i = trimmed.indexOf(' ')
  if (i === -1) return { first_name: trimmed, last_name: '' }
  return { first_name: trimmed.slice(0, i), last_name: trimmed.slice(i + 1) }
}

/** Masks a PPS number for display: 1234567A -> •••••67A */
export function maskPps(pps: string | null | undefined): string {
  if (!pps) return ''
  return pps.length <= 3 ? '•'.repeat(pps.length) : '•'.repeat(pps.length - 3) + pps.slice(-3)
}

/** Escapes a value for a CSV cell, neutralising spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  // Neutralise spreadsheet formulas, but leave international phone numbers (+353 87 123 4567) alone:
  // digits and spaces after the plus cannot form a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d[\d ]*$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

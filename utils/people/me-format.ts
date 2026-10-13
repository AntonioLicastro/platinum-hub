import type { ComplianceItem, ComplianceState, DocumentAlert } from './compliance-data'
import { formatDate, tenure, todayIso } from './format'
import type { Employee } from './types'

// Pure helpers for "My space". No server imports, so any component can use them.

const DUBLIN_HOUR = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: 'numeric', hourCycle: 'h23' })
const DUBLIN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' })

export function greeting(now: Date = new Date()): string {
  const hour = Number(DUBLIN_HOUR.format(now))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The Irish calendar day (`YYYY-MM-DD`) a timestamptz falls on. */
export function dublinDay(timestamp: string): string {
  return DUBLIN_DAY.format(new Date(timestamp))
}

export function pluralise(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural
}

/** What the person likes to be called, falling back to their first name and then their login. */
export function firstNameOf(employee: Pick<Employee, 'first_name' | 'preferred_name' | 'email'>): string {
  return employee.preferred_name?.trim() || employee.first_name.trim() || employee.email.split('@')[0]
}

/** "2 yrs 3 mos", "Started today" or "Starts 3 Nov 2026". Null when no start date is recorded. */
export function tenureLabel(employee: Pick<Employee, 'start_date' | 'end_date' | 'employment_status'>): string | null {
  const { start_date: start } = employee
  if (!start) return null
  const today = todayIso()
  if (start > today) return `Starts ${formatDate(start)}`
  if (start === today) return 'Started today'
  return tenure(start, employee.employment_status === 'leaver' ? employee.end_date : null)
}

// ---- Masking ------------------------------------------------------------------
// The page is often opened on a phone in a public place, so contact details are
// only shown in part. The full values live on the person's own profile.

/** "085 123 4567" becomes "••• ••• •567": the layout stays, all but the last 3 digits are hidden. */
export function maskMobile(value: string): string {
  const digits = (value.match(/\d/g) ?? []).length
  if (digits === 0) return '•••'
  // Very short numbers are hidden completely rather than half-revealed.
  const visibleFrom = digits > 4 ? digits - 3 : digits
  let seen = 0
  return value.replace(/\d/g, digit => (++seen > visibleFrom ? digit : '•'))
}

/** "jane@gmail.com" becomes "j•••@gmail.com". A one or two character name is hidden completely. */
export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@')
  if (at < 1) return '•••'
  return `${at > 2 ? value.slice(0, 1) : ''}•••${value.slice(at)}`
}

// ---- Compliance ---------------------------------------------------------------

const URGENCY: Record<ComplianceState, number> = { expired: 0, rejected: 1, missing: 2, expiring: 3, pending: 4, valid: 5 }

/** True when the person themselves has something to do (upload, renew or re-send). */
export function needsAction(state: ComplianceState): boolean {
  return state === 'expired' || state === 'rejected' || state === 'missing' || state === 'expiring'
}

/** Button text for a state that needs action; null otherwise. */
export function actionLabel(state: ComplianceState): string | null {
  switch (state) {
    case 'expired': return 'Upload a new one'
    case 'expiring': return 'Upload a renewal'
    case 'missing': return 'Upload it now'
    case 'rejected': return 'Upload it again'
    default: return null
  }
}

/** Most urgent first; within a state, whatever runs out soonest. */
export function sortByUrgency(items: ComplianceItem[]): ComplianceItem[] {
  const far = Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) =>
    URGENCY[a.state] - URGENCY[b.state] ||
    (a.daysToExpiry ?? far) - (b.daysToExpiry ?? far) ||
    a.documentType.sort_order - b.documentType.sort_order ||
    a.documentType.name.localeCompare(b.documentType.name)
  )
}

/** One plain-English line under a required document. */
export function complianceNote(item: ComplianceItem): string | null {
  const expires = item.document?.expires_on ? formatDate(item.document.expires_on) : null
  switch (item.state) {
    case 'expired': return expires ? `Ran out on ${expires}` : 'This has run out'
    case 'expiring': return expires ? `Runs out on ${expires}` : null
    case 'valid': return expires ? `Valid until ${expires}` : null
    case 'pending':
      return item.document?.status !== 'pending' && item.documentType.requires_expiry
        ? 'HR is adding the expiry date'
        : 'HR is checking this'
    case 'rejected': return "HR couldn't accept the last file. Please send it again."
    case 'missing': return item.documentType.description
  }
}

export type AlertCounts = { expired: number; expiring: number; missing: number }

export const NO_ALERTS: AlertCounts = { expired: 0, expiring: 0, missing: 0 }

export function countAlerts(alerts: Pick<DocumentAlert, 'state'>[]): AlertCounts {
  const counts: AlertCounts = { ...NO_ALERTS }
  for (const alert of alerts) counts[alert.state] += 1
  return counts
}

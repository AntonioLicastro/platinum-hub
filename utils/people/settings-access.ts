import { isFleetOnlyUser } from '@/utils/fleet-only'
import { isBootstrapAdmin } from './access'
import { createAdminClient, fetchAllPages, fetchByIds, withRetry } from './db'
import type { AccessRoleValue } from './settings-input'

// Loaders for Settings > Access. Callers must already have checked
// access.manage; these read hr_access and who is named as a line manager.
// A database error throws (the HR Locker error page offers a retry) rather
// than returning an empty list: "nobody has access" must never be a guess.

export type AccessRow = {
  email: string
  role: AccessRoleValue
  areas: string[]
  note: string | null
  granted_by: string | null
  created_at: string
}

/** An access row plus whether the grant can actually be used (see getViewer in access.ts). */
export type AccessListRow = AccessRow & {
  /** Recorded as a leaver, so getViewer ignores this grant. */
  leaver: boolean
  /** Not a company address, so they can never sign in to HR Locker. */
  cannotSignIn: boolean
}

const ACCESS_COLUMNS = 'email, role, areas, note, granted_by, created_at'

export async function listAccessRows(): Promise<AccessListRow[]> {
  const admin = createAdminClient()
  const { data, error } = await withRetry(() =>
    admin.from('hr_access').select(ACCESS_COLUMNS).order('created_at', { ascending: false }).order('email').returns<AccessRow[]>()
  )
  if (error) {
    console.error('listAccessRows failed', error.message)
    throw new Error('Could not load who has access. Please try again.')
  }
  const rows = data ?? []

  const { data: people, error: peopleError } = await fetchByIds<{ email: string; employment_status: string }>(
    rows.map(r => r.email),
    chunk => admin.from('hr_employees').select('email, employment_status').in('email', chunk).returns<{ email: string; employment_status: string }[]>(),
  )
  if (peopleError) {
    console.error('listAccessRows (employees) failed', peopleError.message)
    throw new Error('Could not load who has access. Please try again.')
  }
  const left = new Set(people.filter(p => p.employment_status === 'leaver').map(p => p.email.toLowerCase()))

  return rows.map(row => ({
    ...row,
    // The bootstrap admins keep their role whatever their employee record says.
    leaver: left.has(row.email.toLowerCase()) && !isBootstrapAdmin(row.email),
    cannotSignIn: isFleetOnlyUser(row.email),
  }))
}

/** `failed` distinguishes "no such row" from "could not check", which callers must not treat the same. */
export async function getAccessRow(email: string): Promise<{ row: AccessRow | null; failed: boolean }> {
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_access')
      .select(ACCESS_COLUMNS)
      .eq('email', email)
      .maybeSingle<AccessRow>()
  )
  if (error) console.error('getAccessRow failed', error.message)
  return { row: data ?? null, failed: !!error }
}

type LineManager = {
  email: string
  name: string | null
  reports: number
  /** False for a personal email address: getViewer never lets those sign in, so the automatic access cannot work. */
  canSignIn: boolean
}

type ReportRow = { manager_email: string | null }
type ManagerRow = { email: string; first_name: string; last_name: string; employment_status: string }

/**
 * People who get manager access automatically because an employee record names
 * them as line manager (see getViewer). Mirrors that rule: only current
 * (non-leaver) reports count, and a manager who has left no longer qualifies.
 * Managers with a non-company email are still listed, flagged `canSignIn: false`,
 * so HR can fix the address instead of assuming they have access.
 */
export async function listLineManagers(): Promise<LineManager[]> {
  const admin = createAdminClient()
  const { data: reports, error } = await fetchAllPages<ReportRow>((from, to) =>
    admin
      .from('hr_employees')
      .select('manager_email')
      .not('manager_email', 'is', null)
      .neq('employment_status', 'leaver')
      .order('id')
      .range(from, to)
      .returns<ReportRow[]>()
  )
  if (error) {
    console.error('listLineManagers (reports) failed', error.message)
    throw new Error('Could not load line managers. Please try again.')
  }

  const counts = new Map<string, number>()
  for (const r of reports) if (r.manager_email) counts.set(r.manager_email, (counts.get(r.manager_email) ?? 0) + 1)
  if (counts.size === 0) return []

  const { data: people, error: peopleError } = await fetchByIds<ManagerRow>([...counts.keys()], chunk =>
    admin
      .from('hr_employees')
      .select('email, first_name, last_name, employment_status')
      .in('email', chunk)
      .returns<ManagerRow[]>()
  )
  if (peopleError) {
    console.error('listLineManagers (managers) failed', peopleError.message)
    throw new Error('Could not load line managers. Please try again.')
  }
  const byEmail = new Map(people.map(p => [p.email, p]))

  const managers: LineManager[] = []
  for (const [email, reportCount] of counts) {
    const person = byEmail.get(email)
    if (person?.employment_status === 'leaver') continue
    const name = person ? `${person.first_name} ${person.last_name}`.trim() : ''
    managers.push({ email, name: name || null, reports: reportCount, canSignIn: !isFleetOnlyUser(email) })
  }
  return managers.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, 'en-IE'))
}

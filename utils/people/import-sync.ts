import type { PeopleViewer } from './access'
import { createAdminClient, fetchAllPages, withRetry } from './db'
import { BATCH_SIZE, chunk, runPool } from './import-db'
import { splitName } from './format'

// Brings HR Locker in line with the Platinum directory: the expected-staff
// roster and everyone registered in the apps. Mirrors the backfill at the end
// of the HR Locker setup SQL. It only ever ADDS people, LINKS them to their
// app account and FILLS blank area / job title / payroll number; it never
// overwrites anything HR has entered and never writes to profiles or
// staff_roster. Server only: callers must have passed authorize('import.run').

const COMPANY_DOMAIN = '@platinumhomecare.ie'
const USERS_PER_PAGE = 1000
const CONCURRENCY = 8

type RosterRow = { email: string | null; full_name: string | null; title: string | null }
type ProfileRow = { id: string; full_name: string | null; title: string | null; area: string | null; payroll_no: string | null }
type EmployeeRow = {
  id: string
  email: string
  profile_id: string | null
  first_name: string
  last_name: string
  area: string | null
  job_title: string | null
  payroll_no: string | null
}

type NewPerson = {
  email: string
  first_name: string
  last_name: string
  job_title: string | null
  area: string | null
  payroll_no: string | null
  profile_id: string | null
  source: 'roster_sync' | 'profiles_sync'
}

type Change = { id: string; patch: Record<string, string>; links: boolean; fills: string[] }

export type SyncPerson = { email: string; name: string }

export type SyncPlan = {
  /** People in the staff roster who are not in HR Locker yet. */
  fromRoster: SyncPerson[]
  /** Registered app users with a company email who are not in HR Locker (or the roster) yet. */
  fromAccounts: SyncPerson[]
  /** People already in HR Locker whose app account is not linked yet. */
  toLink: SyncPerson[]
  /** People with blank fields their linked profile can fill. */
  toFill: (SyncPerson & { fields: string[] })[]
  inserts: NewPerson[]
  changes: Change[]
}

type SyncSummary = { created: number; linked: number; filledPeople: number; filledFields: number; failed: number }

const FILL_FIELDS: { column: 'area' | 'job_title' | 'payroll_no'; profileKey: 'area' | 'title' | 'payroll_no'; label: string }[] = [
  { column: 'area', profileKey: 'area', label: 'area' },
  { column: 'job_title', profileKey: 'title', label: 'job title' },
  { column: 'payroll_no', profileKey: 'payroll_no', label: 'payroll number' },
]

const blank = (value: string | null | undefined) => !value || value.trim() === ''
const clean = (value: string | null | undefined) => (blank(value) ? null : (value as string).trim())
const nameOf = (first: string, last: string, email: string) => `${first} ${last}`.trim() || email

/** Every auth user, paged (Supabase returns at most 1000 per page) with the same retry guard as the admin page. */
async function listAccounts(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, string> | null> {
  const idByEmail = new Map<string, string>()
  for (let page = 1; ; page++) {
    const { data, error } = await withRetry(() => admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE }))
    if (error) {
      console.error('sync: listing users failed', error.message)
      return null
    }
    for (const user of data.users) if (user.email) idByEmail.set(user.email.toLowerCase().trim(), user.id)
    if (data.users.length < USERS_PER_PAGE) return idByEmail
  }
}

/** Works out what a sync would do, without changing anything. Null when the directory could not be read. */
export async function loadSyncPlan(): Promise<SyncPlan | null> {
  const admin = createAdminClient()
  const [roster, profiles, employees, accounts] = await Promise.all([
    fetchAllPages<RosterRow>((from, to) =>
      admin.from('staff_roster').select('email, full_name, title').order('email').range(from, to).returns<RosterRow[]>()
    ),
    fetchAllPages<ProfileRow>((from, to) =>
      admin.from('profiles').select('id, full_name, title, area, payroll_no').order('id').range(from, to).returns<ProfileRow[]>()
    ),
    fetchAllPages<EmployeeRow>((from, to) =>
      admin
        .from('hr_employees')
        .select('id, email, profile_id, first_name, last_name, area, job_title, payroll_no')
        .order('id')
        .range(from, to)
        .returns<EmployeeRow[]>()
    ),
    listAccounts(admin),
  ])
  for (const [label, result] of [['staff roster', roster], ['profiles', profiles], ['employees', employees]] as const) {
    if (result.error) {
      console.error(`sync: reading ${label} failed`, result.error.message)
      return null
    }
  }
  if (!accounts) return null

  const profileById = new Map(profiles.data.map(p => [p.id, p]))
  const employeeByEmail = new Map(employees.data.map(e => [e.email, e]))
  const linkedProfiles = new Set(employees.data.flatMap(e => (e.profile_id ? [e.profile_id] : [])))
  // The profile behind an email, unless another employee record already uses it (profile_id is unique).
  const freeProfileFor = (email: string): ProfileRow | null => {
    const id = accounts.get(email)
    const profile = id ? profileById.get(id) : undefined
    return profile && !linkedProfiles.has(profile.id) ? profile : null
  }

  const inserts = new Map<string, NewPerson>()
  for (const r of roster.data) {
    const email = r.email?.toLowerCase().trim()
    if (!email || blank(r.full_name) || employeeByEmail.has(email) || inserts.has(email)) continue
    const profile = freeProfileFor(email)
    const { first_name, last_name } = splitName(r.full_name as string)
    inserts.set(email, {
      email, first_name, last_name,
      job_title: clean(r.title) ?? clean(profile?.title),
      area: clean(profile?.area),
      payroll_no: clean(profile?.payroll_no),
      profile_id: profile?.id ?? null,
      source: 'roster_sync',
    })
  }
  const fromRosterEmails = new Set(inserts.keys())
  for (const [email] of accounts) {
    if (!email.endsWith(COMPANY_DOMAIN) || employeeByEmail.has(email) || inserts.has(email)) continue
    const profile = freeProfileFor(email)
    if (!profile) continue
    const { first_name, last_name } = splitName(profile.full_name ?? '')
    inserts.set(email, {
      email, first_name, last_name,
      job_title: clean(profile.title), area: clean(profile.area), payroll_no: clean(profile.payroll_no),
      profile_id: profile.id, source: 'profiles_sync',
    })
  }

  const changes: Change[] = []
  const toLink: SyncPerson[] = []
  const toFill: SyncPlan['toFill'] = []
  for (const e of employees.data) {
    const links = e.profile_id === null
    const profile = links ? freeProfileFor(e.email) : (profileById.get(e.profile_id as string) ?? null)
    if (!profile) continue
    const patch: Record<string, string> = links ? { profile_id: profile.id } : {}
    const fills: string[] = []
    for (const f of FILL_FIELDS) {
      const value = clean(profile[f.profileKey])
      if (blank(e[f.column]) && value) {
        patch[f.column] = value
        fills.push(f.label)
      }
    }
    if (Object.keys(patch).length === 0) continue
    changes.push({ id: e.id, patch, links, fills })
    const person = { email: e.email, name: nameOf(e.first_name, e.last_name, e.email) }
    if (links) toLink.push(person)
    if (fills.length > 0) toFill.push({ ...person, fields: fills })
  }

  const people = [...inserts.values()]
  const named = (p: NewPerson): SyncPerson => ({ email: p.email, name: nameOf(p.first_name, p.last_name, p.email) })
  return {
    fromRoster: people.filter(p => fromRosterEmails.has(p.email)).map(named),
    fromAccounts: people.filter(p => !fromRosterEmails.has(p.email)).map(named),
    toLink, toFill, inserts: people, changes,
  }
}

/** Applies a plan from loadSyncPlan. Counts what was saved; a failed write is counted, not thrown. */
export async function applySyncPlan(viewer: Pick<PeopleViewer, 'email'>, plan: SyncPlan): Promise<SyncSummary> {
  const admin = createAdminClient()
  const summary: SyncSummary = { created: 0, linked: 0, filledPeople: 0, filledFields: 0, failed: 0 }

  for (const batch of chunk(plan.inserts, BATCH_SIZE)) {
    const rows = batch.map(p => ({ ...p, created_by: viewer.email, updated_by: viewer.email }))
    // ignoreDuplicates: someone added the same person since the preview, which is fine.
    const { data, error } = await admin
      .from('hr_employees')
      .upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
      .select('id')
    if (error) {
      console.error('sync: adding people failed', error.code, error.message)
      summary.failed += batch.length
    } else {
      summary.created += data.length
    }
  }

  await runPool(plan.changes, CONCURRENCY, async change => {
    const { error } = await admin.from('hr_employees').update({ ...change.patch, updated_by: viewer.email }).eq('id', change.id)
    if (error) {
      console.error('sync: updating a person failed', error.code, error.message)
      summary.failed++
      return
    }
    if (change.links) summary.linked++
    if (change.fills.length > 0) {
      summary.filledPeople++
      summary.filledFields += change.fills.length
    }
  })
  return summary
}

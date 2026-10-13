import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { isFleetOnlyUser } from '@/utils/fleet-only'
import { createAdminClient, withRetry } from './db'
import { isHrLockerEnabled } from './rollout'
import type { Employee } from './types'

// ---------------------------------------------------------------------------
// Who can do what in HR Locker. Everything is enforced HERE, in server code,
// because the hr_* tables have RLS on with no policies (service-role only).
// Every server component, server action and API route under /people or
// /api/people MUST go through getViewer()/authorize() before touching data.
// ---------------------------------------------------------------------------

export type PeopleRole = 'hr_admin' | 'hr' | 'manager' | 'employee'

/**
 * Accounts that are always full HR admins, so there is someone who can open
 * Settings > Access and grant everyone else. Deliberately NOT the same list as
 * the Easy Mileage admins in utils/admin-emails.ts: those people can approve
 * expenses but shouldn't automatically see PPS numbers and pay.
 */
const BOOTSTRAP_HR_ADMINS = ['antoniolicastro@platinumhomecare.ie']

/** Permanent HR admins; shown read-only in Settings > Access and counted by its last-admin guard. */
export function isBootstrapAdmin(email: string | null | undefined): boolean {
  return !!email && BOOTSTRAP_HR_ADMINS.includes(email.toLowerCase().trim())
}

export function listBootstrapAdmins(): string[] {
  return [...BOOTSTRAP_HR_ADMINS]
}

export type Capability =
  | 'employees.view'        // directory-level data for in-scope employees
  | 'employees.edit'        // create / edit core employee records
  | 'private.view'          // personal details, PPS, emergency contacts
  | 'private.edit'
  | 'compensation.view'
  | 'compensation.edit'
  | 'documents.view'        // see documents & compliance status
  | 'documents.manage'      // upload / verify / delete documents
  | 'documents.download'    // open the stored FILE (scans, contracts) and see reference numbers - HR and the employee only
  | 'leave.view'            // see others' leave (scoped)
  | 'leave.approve'
  | 'leave.manage'          // edit entitlements, record leave on someone's behalf
  | 'reviews.view'
  | 'reviews.manage'
  | 'events.view_manager'   // timeline entries with visibility 'manager'
  | 'events.view_hr'        // timeline entries with visibility 'hr_only'
  | 'events.add'
  | 'checklists.view'
  | 'checklists.manage'
  | 'reports.view'
  | 'import.run'
  | 'settings.manage'       // document types, leave types, holidays, checklist templates
  | 'access.manage'         // grant / revoke HR Locker roles
  | 'audit.view'

const HR: Capability[] = [
  'employees.view', 'employees.edit', 'private.view', 'private.edit', 'compensation.view', 'compensation.edit',
  'documents.view', 'documents.manage', 'documents.download', 'leave.view', 'leave.approve', 'leave.manage', 'reviews.view',
  'reviews.manage', 'events.view_manager', 'events.view_hr', 'events.add', 'checklists.view', 'checklists.manage',
  'reports.view', 'import.run', 'settings.manage',
]

const CAPABILITIES: Record<PeopleRole, ReadonlySet<Capability>> = {
  hr_admin: new Set<Capability>([...HR, 'access.manage', 'audit.view']),
  hr: new Set<Capability>(HR),
  manager: new Set<Capability>([
    'employees.view', 'documents.view', 'leave.view', 'leave.approve', 'reviews.view', 'reviews.manage',
    'events.view_manager', 'events.add', 'checklists.view', 'checklists.manage', 'reports.view',
  ]),
  employee: new Set<Capability>(),
}

export type PeopleViewer = {
  userId: string
  email: string
  role: PeopleRole
  /** Areas a `manager` role covers (from hr_access.areas). Empty for other roles. */
  areas: string[]
  /** The viewer's own hr_employees row id, if they have one. */
  employeeId: string | null
  /** The viewer's own display name. */
  name: string
  /** True when their role comes from being named as someone's line manager, not from hr_access. */
  impliedManager: boolean
}

/**
 * The signed-in user's HR Locker identity, or null when signed out or not a
 * company account (Fleet-only users never get in). Cached per request.
 */
export const getViewer = cache(async (): Promise<PeopleViewer | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const email = user.email.toLowerCase().trim()
  if (isFleetOnlyUser(email)) return null
  // Closed trial: HR Locker is switched on for named people only (utils/people/rollout.ts).
  if (!isHrLockerEnabled(email)) return null

  const admin = createAdminClient()
  const [accessRes, employeeRes, reportsRes] = await Promise.all([
    withRetry(() => admin.from('hr_access').select('role, areas').eq('email', email).maybeSingle()),
    withRetry(() => admin.from('hr_employees').select('id, first_name, last_name, employment_status').eq('email', email).maybeSingle()),
    withRetry(() => admin.from('hr_employees').select('id', { count: 'exact', head: true }).eq('manager_email', email).neq('employment_status', 'leaver')),
  ])
  // Fail closed: a transient database error must never be read as "no role" or
  // "no employee record" (that would demote an HR admin to a plain employee, or
  // switch off the self-approval guards that depend on employeeId).
  if (accessRes.error || employeeRes.error || reportsRes.error) {
    console.error('getViewer failed', accessRes.error?.message, employeeRes.error?.message, reportsRes.error?.message)
    throw new Error('Could not load your HR Locker access. Please try again.')
  }
  const access = accessRes.data
  const employee = employeeRes.data
  const directReports = reportsRes.count

  // A leaver keeps no HR Locker role: neither an explicit grant nor an implied
  // manager role survives being recorded as a leaver (only the permanent
  // bootstrap admins are exempt, so there is always someone who can fix access).
  const isLeaver = employee?.employment_status === 'leaver'
  let role: PeopleRole = 'employee'
  let areas: string[] = []
  let impliedManager = false
  if (BOOTSTRAP_HR_ADMINS.includes(email)) {
    role = 'hr_admin'
  } else if (access?.role && !isLeaver) {
    role = access.role as PeopleRole
    areas = access.areas ?? []
  } else if ((directReports ?? 0) > 0 && !isLeaver) {
    role = 'manager'
    impliedManager = true
  }

  const name = employee ? `${employee.first_name} ${employee.last_name}`.trim() : ''
  return {
    userId: user.id,
    email,
    role,
    areas,
    employeeId: employee?.id ?? null,
    name: name || (user.user_metadata?.full_name as string | undefined) || email,
    impliedManager,
  }
})

/** For pages/layouts: redirect to login when there is no HR Locker user. */
export async function requireViewer(): Promise<PeopleViewer> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  return viewer
}

/** For pages: redirect to the viewer's own space when they lack a capability. */
export async function requireCapability(cap: Capability): Promise<PeopleViewer> {
  const viewer = await requireViewer()
  if (!can(viewer, cap)) redirect(viewer.role === 'employee' ? '/me' : '/')
  return viewer
}

export function can(viewer: PeopleViewer, cap: Capability): boolean {
  return CAPABILITIES[viewer.role].has(cap)
}

export const isHr = (viewer: PeopleViewer) => viewer.role === 'hr_admin' || viewer.role === 'hr'

type Scopable = Pick<Employee, 'id' | 'area' | 'manager_email'>

export function isSelf(viewer: PeopleViewer, employee: Pick<Employee, 'id'>): boolean {
  return viewer.employeeId !== null && viewer.employeeId === employee.id
}

/**
 * Whether the viewer may see this employee's directory-level record at all.
 * HR sees everyone; a manager sees their areas and direct reports; anyone
 * sees themselves. This is the ONLY place that decides row-level scope.
 */
export function inScope(viewer: PeopleViewer, employee: Scopable): boolean {
  if (isHr(viewer)) return true
  if (isSelf(viewer, employee)) return true
  if (viewer.role === 'manager') {
    if (employee.manager_email && employee.manager_email === viewer.email) return true
    if (employee.area && viewer.areas.includes(employee.area)) return true
  }
  return false
}

/**
 * Capability check that also respects row scope. Employees can additionally
 * read their own personal data, documents, leave and reviews (their right of
 * access under GDPR) — never edit them (leave requests have their own check).
 */
const SELF_READ: ReadonlySet<Capability> = new Set<Capability>([
  'employees.view', 'private.view', 'documents.view', 'documents.download', 'leave.view', 'reviews.view', 'checklists.view',
])

/**
 * Capabilities nobody may use on their own record, even HR admins: approving
 * their own leave, changing their own leave allowance, verifying their own
 * documents, setting their own pay, completing/deleting their own reviews, or
 * writing their own case notes. Another HR user has to do these.
 */
const SELF_DENIED: ReadonlySet<Capability> = new Set<Capability>([
  'leave.approve', 'leave.manage', 'documents.manage', 'compensation.edit', 'reviews.manage', 'events.add',
])

export function canOnEmployee(viewer: PeopleViewer, cap: Capability, employee: Scopable): boolean {
  if (!inScope(viewer, employee)) return false
  if (isSelf(viewer, employee)) {
    // See SELF_DENIED: some things always need a second person.
    if (SELF_DENIED.has(cap)) return false
    // A manager's authority covers their reports, not themselves: on their own
    // record they get the same read-only view as any employee.
    if (!isHr(viewer)) return SELF_READ.has(cap)
  }
  return can(viewer, cap)
}

/** getViewer() for actions: a failed lookup becomes an error result instead of an exception. */
async function viewerOrError(): Promise<PeopleViewer | { error: string }> {
  try {
    return (await getViewer()) ?? { error: 'Not authenticated' }
  } catch (err) {
    console.error('viewerOrError: getViewer failed', err)
    return { error: 'Something went wrong. Please try again.' }
  }
}

export type Authorized = { ok: true; viewer: PeopleViewer; employee: Employee }
export type Denied = { ok: false; error: string }

/**
 * Standard preamble for a server action that touches one employee:
 * authenticates, loads the employee, and checks capability + scope.
 */
export async function authorizeEmployee(cap: Capability, employeeId: string): Promise<Authorized | Denied> {
  const viewer = await viewerOrError()
  if ('error' in viewer) return { ok: false, error: viewer.error }
  if (!employeeId) return { ok: false, error: 'Employee not found' }
  const admin = createAdminClient()
  const { data: employee, error } = await withRetry(() => admin.from('hr_employees').select('*').eq('id', employeeId).maybeSingle<Employee>())
  if (error) {
    console.error('authorizeEmployee lookup failed', error.message)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
  // Same message for "missing" and "out of scope" so scope can't be probed.
  if (!employee || !canOnEmployee(viewer, cap, employee)) return { ok: false, error: 'Employee not found' }
  return { ok: true, viewer, employee }
}

/** Preamble for actions not tied to one employee (settings, imports, access). */
export async function authorize(cap: Capability): Promise<{ ok: true; viewer: PeopleViewer } | Denied> {
  const viewer = await viewerOrError()
  if ('error' in viewer) return { ok: false, error: viewer.error }
  if (!can(viewer, cap)) return { ok: false, error: 'You do not have permission to do that' }
  return { ok: true, viewer }
}

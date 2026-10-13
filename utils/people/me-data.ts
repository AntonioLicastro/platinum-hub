import { unstable_rethrow } from 'next/navigation'
import { canOnEmployee, isSelf, type Capability, type PeopleViewer } from './access'
import { listEmployeeChecklists } from './checklist-data'
import { compareByDue } from './checklist-status'
import { profileCompleteness, type Completeness } from './completeness'
import { getEmployeeCompliance, listDocumentAlerts, type ComplianceItem } from './compliance-data'
import { createAdminClient, withRetry } from './db'
import { isCurrent } from './employees-data'
import { todayIso } from './format'
import {
  employeesInScope, getLeaveBalances, listLeaveForEmployee, listLeaveTypes, listPendingLeaveFor, type LeaveBalance,
} from './leave-data'
import { countAlerts, maskEmail, maskMobile, NO_ALERTS, type AlertCounts } from './me-format'
import { getEmployeePrivate, getManagerName } from './profile-data'
import type { Checklist, ChecklistItem, Employee, LeaveRequest, LeaveType } from './types'

// Loaders for "My space" (/people/me). Everything about the signed-in person is
// read for viewer.employeeId only; everything about other people goes through
// employeesInScope(), so a manager can never learn more than inScope() allows.
// Each card loads independently: one failing query leaves the others intact
// instead of taking the whole page down or passing off a failure as "nothing yet".

export type Loaded<T> = { ok: true; data: T } | { ok: false }

export type LeaveEntry = { request: LeaveRequest; type: LeaveType }

export type MyLeave = {
  year: number
  balances: LeaveBalance[]
  /** Approved leave that has not finished yet, soonest first. */
  upcoming: LeaveEntry[]
  /** Requests still waiting for a decision, soonest first. */
  pending: LeaveEntry[]
}

export type MyTask = { item: ChecklistItem; checklist: Checklist }

/** Contact details already masked: the unmasked values never leave this file. */
type MyContact = { mobile: string | null; personalEmail: string | null; county: string | null }

export type MyDetails = {
  contact: Loaded<MyContact>
  /** Not loaded when the personal details could not be read: a score that skips them would call an unchecked record complete. */
  completeness: Loaded<Completeness>
}

type MyOwn = {
  employee: Employee
  managerName: string | null
  leave: Loaded<MyLeave>
  compliance: Loaded<ComplianceItem[]>
  tasks: Loaded<MyTask[]>
  details: MyDetails
}

export type MyTeam = {
  /** Current staff who name the viewer as their line manager. */
  reports: Employee[]
  /** Headcount per area the viewer manages (managers only). */
  areas: { area: string; headcount: number }[]
  pendingLeave: Loaded<{ count: number; oldestRequestedAt: string | null }>
  alerts: Loaded<AlertCounts>
}

type MySpace = {
  /** `data` is null when the viewer has no HR record yet; `ok: false` when it could not be read. */
  own: Loaded<MyOwn | null>
  /** Null for ordinary employees; `ok: false` when the team could not be loaded. */
  team: Loaded<MyTeam> | null
}

async function settle<T>(label: string, run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await run() }
  } catch (err) {
    unstable_rethrow(err)
    console.error(`${label} failed`, err)
    return { ok: false }
  }
}

// ---- The viewer's own record --------------------------------------------------

async function loadLeave(employeeId: string): Promise<MyLeave> {
  const today = todayIso()
  const year = Number(today.slice(0, 4))
  const [balances, requests, types] = await Promise.all([
    getLeaveBalances(employeeId, year),
    listLeaveForEmployee(employeeId, ['pending', 'approved']),
    listLeaveTypes(),
  ])
  const typeById = new Map(types.map(t => [t.id, t]))
  const entries = requests.flatMap(request => {
    const type = typeById.get(request.leave_type_id)
    return type ? [{ request, type }] : []
  })
  const soonestFirst = (a: LeaveEntry, b: LeaveEntry) => a.request.start_date.localeCompare(b.request.start_date)
  const annualFirst = (a: LeaveBalance, b: LeaveBalance) =>
    Number(b.type.category === 'annual') - Number(a.type.category === 'annual')
  return {
    year,
    balances: [...balances].sort(annualFirst),
    upcoming: entries.filter(e => e.request.status === 'approved' && e.request.end_date >= today).sort(soonestFirst),
    pending: entries.filter(e => e.request.status === 'pending').sort(soonestFirst),
  }
}

async function loadTasks(employee: Employee): Promise<MyTask[]> {
  const checklists = await listEmployeeChecklists(employee.id)
  // Onboarding steps for someone who has left would only be noise.
  const leaver = employee.employment_status === 'leaver'
  return checklists
    .filter(({ checklist }) => !checklist.completed_at && (!leaver || checklist.kind === 'offboarding'))
    .flatMap(({ checklist, items }) =>
      items.filter(item => item.owner_role === 'employee' && !item.completed_at).map(item => ({ item, checklist }))
    )
    .sort((a, b) => compareByDue(a.item, b.item))
}

async function loadDetails(viewer: PeopleViewer, employee: Employee): Promise<MyDetails> {
  // A failed read is neither "you haven't given us your mobile" nor "your record is complete":
  // the contact details and the completeness score both become "couldn't load".
  const loaded = canOnEmployee(viewer, 'private.view', employee) ? await getEmployeePrivate(employee.id) : null
  if (!loaded || loaded.failed) return { contact: { ok: false }, completeness: { ok: false } }

  const priv = loaded.data
  return {
    contact: {
      ok: true,
      data: {
        mobile: priv?.mobile ? maskMobile(priv.mobile) : null,
        personalEmail: priv?.personal_email ? maskEmail(priv.personal_email) : null,
        county: priv?.county ?? null,
      },
    },
    completeness: { ok: true, data: profileCompleteness(employee, priv) },
  }
}

async function loadOwn(viewer: PeopleViewer, employeeId: string): Promise<MyOwn | null> {
  const { data: employee, error } = await withRetry(() =>
    createAdminClient().from('hr_employees').select('*').eq('id', employeeId).maybeSingle<Employee>()
  )
  if (error) {
    console.error('loadOwn failed', error.message)
    // Not "no record": that would tell someone with a record that HR has not set them up.
    throw new Error('Could not load your HR record')
  }
  if (!employee || !isSelf(viewer, employee)) return null

  const guarded = <T>(cap: Capability, label: string, run: () => Promise<T>): Promise<Loaded<T>> =>
    canOnEmployee(viewer, cap, employee) ? settle(label, run) : Promise.resolve({ ok: false })

  const [managerName, leave, compliance, tasks, details] = await Promise.all([
    getManagerName(employee.manager_email),
    guarded('leave.view', 'loadLeave', () => loadLeave(employee.id)),
    guarded('documents.view', 'getEmployeeCompliance', () => getEmployeeCompliance(employee)),
    guarded('checklists.view', 'loadTasks', () => loadTasks(employee)),
    loadDetails(viewer, employee),
  ])
  return { employee, managerName, leave, compliance, tasks, details }
}

// ---- Team (managers and HR) ---------------------------------------------------

async function loadTeam(viewer: PeopleViewer): Promise<MyTeam> {
  // Started first so it runs while the employee list loads (both share one cached employee query).
  const pendingLeave = settle('listPendingLeaveFor', async () => {
    const pending = await listPendingLeaveFor(viewer)
    return { count: pending.length, oldestRequestedAt: pending[0]?.requested_at ?? null }
  })

  const current = (await employeesInScope(viewer)).filter(isCurrent)
  const reports = current.filter(e => e.manager_email === viewer.email && !isSelf(viewer, e))

  const managedAreas = viewer.role === 'manager' ? [...viewer.areas].sort((a, b) => a.localeCompare(b)) : []
  const areas = managedAreas.map(area => ({ area, headcount: current.filter(e => e.area === area).length }))

  // "Your team" is your direct reports plus, for a manager, everyone in their areas.
  // HR's team is their direct reports: the whole company has its own page.
  const team = current.filter(e =>
    !isSelf(viewer, e) && (e.manager_email === viewer.email || (e.area !== null && managedAreas.includes(e.area)))
  )
  const alerts: Loaded<AlertCounts> = team.length === 0
    ? { ok: true, data: NO_ALERTS }
    : await settle('listDocumentAlerts', async () => countAlerts(await listDocumentAlerts(viewer, team)))

  return { reports, areas, pendingLeave: await pendingLeave, alerts }
}

export async function loadMySpace(viewer: PeopleViewer): Promise<MySpace> {
  const employeeId = viewer.employeeId
  const [own, team] = await Promise.all([
    employeeId ? settle('loadOwn', () => loadOwn(viewer, employeeId)) : { ok: true as const, data: null },
    viewer.role === 'employee' ? null : settle('loadTeam', () => loadTeam(viewer)),
  ])
  // The two halves fail separately, so one outage never hides the other. With
  // nothing at all to show, throw to the error boundary (it offers "Try again").
  if (!own.ok && !team?.ok) throw new Error('Could not load My space')
  return { own, team }
}

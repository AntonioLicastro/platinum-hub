import { cache } from 'react'
import { canOnEmployee, isHr, isSelf, type Capability, type PeopleViewer } from './access'
import { createAdminClient, fetchAllPages, fetchByIds, withRetry } from './db'
import { listEmployees } from './employees-data'
import { AWAY_LEAVE_TYPE, isSensitiveLeaveCategory } from './leave-calc'
import type {
  Employee, LeaveEntitlement, LeaveRequest, LeaveStatus, LeaveType, PublicHoliday,
} from './types'

// Loaders for the leave module. hr_leave_* tables are service-role only, so the
// scoping done here (canOnEmployee / inScope) is the only access control.
// Leave years are calendar years. A request that spans New Year is counted
// entirely in the year it STARTS in: it keeps balances simple and auditable,
// and HR can split a request across the year end if the split matters.

export { countWorkingDays } from './leave-calc'

export type LeaveBalance = {
  type: LeaveType
  entitlement: number
  carriedOver: number
  taken: number      // approved days falling in the year
  pending: number    // pending days falling in the year
  remaining: number  // entitlement + carriedOver - taken - pending
  /** 'recorded' = an hr_leave_entitlements row; 'default' = the type's default; 'none' = nothing recorded yet. */
  entitlementSource: 'recorded' | 'default' | 'none'
}

export type LeaveRequestWithContext = LeaveRequest & { employee: Employee; type: LeaveType }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * A failed query must never read as "no leave" (nothing pending, everyone fine).
 * Log the cause and throw: pages fall to the error boundary, and the dashboard
 * and My space turn it into an "unavailable" notice.
 */
export function loadFailed(what: string, error: { message: string }): never {
  console.error(`${what} failed`, error.message)
  throw new Error('Could not load leave information. Please try again.')
}

/** Employees the viewer may see, loaded once per request however many loaders ask. */
export const employeesInScope = cache((viewer: PeopleViewer): Promise<Employee[]> => listEmployees(viewer))

export const listLeaveTypes = cache(async (): Promise<LeaveType[]> => {
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_leave_types').select('*').order('sort_order').order('id').returns<LeaveType[]>()
  )
  if (error) loadFailed('listLeaveTypes', error)
  return data ?? []
})

export async function listPublicHolidays(fromIso: string, toIso: string): Promise<PublicHoliday[]> {
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_public_holidays')
      .select('holiday_date, name')
      .gte('holiday_date', fromIso)
      .lte('holiday_date', toIso)
      .order('holiday_date')
      .returns<PublicHoliday[]>()
  )
  if (error) loadFailed('listPublicHolidays', error)
  return data ?? []
}

// ---- Redaction ---------------------------------------------------------------

/**
 * Managers must not learn why someone is away when it is sick or statutory
 * leave. HR sees everything and people always see their own.
 */
function hidesLeaveDetail(viewer: PeopleViewer, employee: Pick<Employee, 'id'>, type: Pick<LeaveType, 'category'>): boolean {
  return isSensitiveLeaveCategory(type.category) && !isHr(viewer) && !isSelf(viewer, employee)
}

/** The request with its type shown as "Away" (and reason / note dropped) when the viewer may not see the detail. */
export function redactLeaveRequest(viewer: PeopleViewer, request: LeaveRequestWithContext): LeaveRequestWithContext {
  if (!hidesLeaveDetail(viewer, request.employee, request.type)) return request
  return { ...request, leave_type_id: AWAY_LEAVE_TYPE.id, type: AWAY_LEAVE_TYPE, reason: null, decision_note: null }
}

function withContext(
  viewer: PeopleViewer, cap: Capability, requests: LeaveRequest[], employees: Employee[], types: LeaveType[],
  allow?: (employee: Employee, type: LeaveType) => boolean,
): LeaveRequestWithContext[] {
  const employeeById = new Map(employees.map(e => [e.id, e]))
  const typeById = new Map(types.map(t => [t.id, t]))
  const out: LeaveRequestWithContext[] = []
  for (const request of requests) {
    const employee = employeeById.get(request.employee_id)
    const type = typeById.get(request.leave_type_id)
    if (!employee || !type || !canOnEmployee(viewer, cap, employee) || (allow && !allow(employee, type))) continue
    out.push(redactLeaveRequest(viewer, { ...request, employee, type }))
  }
  return out
}

// ---- Requests ----------------------------------------------------------------

/**
 * Whether the viewer may approve or reject this request: in scope, not their own,
 * and sick / statutory leave only for HR (managers see those as "Away" and
 * decideLeave refuses them). Pass the request's REAL type, not a redacted one.
 */
export function canDecideLeave(viewer: PeopleViewer, employee: Employee, type: Pick<LeaveType, 'category'>): boolean {
  return canOnEmployee(viewer, 'leave.approve', employee) && (isHr(viewer) || !isSensitiveLeaveCategory(type.category))
}

/** Pending requests the viewer can actually decide, so counts and queues never include ones decideLeave would refuse. */
export async function listPendingLeaveFor(viewer: PeopleViewer): Promise<LeaveRequestWithContext[]> {
  const admin = createAdminClient()
  const [employees, types, pending] = await Promise.all([
    employeesInScope(viewer),
    listLeaveTypes(),
    fetchAllPages<LeaveRequest>((from, to) =>
      admin.from('hr_leave_requests').select('*').eq('status', 'pending')
        .order('requested_at').order('id').range(from, to).returns<LeaveRequest[]>()
    ),
  ])
  if (pending.error) loadFailed('listPendingLeaveFor', pending.error)
  return withContext(viewer, 'leave.approve', pending.data, employees, types, (employee, type) => canDecideLeave(viewer, employee, type))
}

/** Leave in the given statuses overlapping [fromIso, toIso], for the people the viewer may see. */
export async function listLeaveBetween(
  viewer: PeopleViewer, fromIso: string, toIso: string, statuses: LeaveStatus[],
): Promise<LeaveRequestWithContext[]> {
  const admin = createAdminClient()
  const [employees, types, requests] = await Promise.all([
    employeesInScope(viewer),
    listLeaveTypes(),
    fetchAllPages<LeaveRequest>((from, to) =>
      admin.from('hr_leave_requests').select('*').in('status', statuses).lte('start_date', toIso).gte('end_date', fromIso)
        .order('start_date').order('id').range(from, to).returns<LeaveRequest[]>()
    ),
  ])
  if (requests.error) loadFailed('listLeaveBetween', requests.error)
  return withContext(viewer, 'leave.view', requests.data, employees, types)
}

/** Approved leave overlapping [fromIso, toIso], for the viewer's scope — drives "who's off" widgets. */
export function listApprovedLeaveBetween(viewer: PeopleViewer, fromIso: string, toIso: string): Promise<LeaveRequestWithContext[]> {
  return listLeaveBetween(viewer, fromIso, toIso, ['approved'])
}

/** Requests decided (approved, rejected or cancelled) since the timestamp, newest first. */
export async function listRecentlyDecidedLeave(viewer: PeopleViewer, sinceTimestamp: string, limit: number): Promise<LeaveRequestWithContext[]> {
  const admin = createAdminClient()
  const [employees, types, decided] = await Promise.all([
    employeesInScope(viewer),
    listLeaveTypes(),
    fetchAllPages<LeaveRequest>((from, to) =>
      admin.from('hr_leave_requests').select('*').in('status', ['approved', 'rejected', 'cancelled']).gte('decided_at', sinceTimestamp)
        .order('decided_at', { ascending: false }).order('id').range(from, to).returns<LeaveRequest[]>()
    ),
  ])
  if (decided.error) loadFailed('listRecentlyDecidedLeave', decided.error)
  return withContext(viewer, 'leave.view', decided.data, employees, types).slice(0, limit)
}

/**
 * One employee's requests, newest first. Does NOT check permissions: the caller
 * must already have passed canOnEmployee(viewer, 'leave.view', employee), and
 * should redact each row with redactLeaveRequest.
 */
export async function listLeaveForEmployee(employeeId: string, statuses?: LeaveStatus[]): Promise<LeaveRequest[]> {
  const admin = createAdminClient()
  const { data, error } = await fetchAllPages<LeaveRequest>((from, to) => {
    let query = admin.from('hr_leave_requests').select('*').eq('employee_id', employeeId)
    if (statuses) query = query.in('status', statuses)
    return query.order('start_date', { ascending: false }).order('id').range(from, to).returns<LeaveRequest[]>()
  })
  if (error) loadFailed('listLeaveForEmployee', error)
  return data
}

/**
 * Whether this viewer may cancel this request right now (the action re-checks with the same function).
 * Pass the request's REAL type, not a redacted one: redaction would hide that it is sensitive.
 */
export function canCancelLeave(
  viewer: PeopleViewer, employee: Employee, request: Pick<LeaveRequest, 'status' | 'start_date'>, type: Pick<LeaveType, 'category'>, todayIso: string,
): boolean {
  if (!canOnEmployee(viewer, 'leave.view', employee)) return false
  // On their own record nobody (HR included, see SELF_DENIED) undoes approved leave: they can only withdraw a pending request.
  if (isSelf(viewer, employee)) return request.status === 'pending'
  if (request.status !== 'approved') return false
  // HR can undo a mistaken record whatever its date; managers only leave that hasn't started and that they may see.
  if (canOnEmployee(viewer, 'leave.manage', employee)) return true
  return canOnEmployee(viewer, 'leave.approve', employee)
    && request.start_date >= todayIso
    && !hidesLeaveDetail(viewer, employee, type)
}

/** HR looking at their own approved leave: they can't cancel it themselves, so the UI says another HR user has to. */
export function needsAnotherHrToCancel(viewer: PeopleViewer, employee: Pick<Employee, 'id'>, request: Pick<LeaveRequest, 'status'>): boolean {
  return isHr(viewer) && isSelf(viewer, employee) && request.status === 'approved'
}

// ---- Balances ----------------------------------------------------------------

type BalanceTable = Map<string, Map<number, LeaveBalance[]>>

/**
 * Balances for many employees and years in one pass (a handful of queries
 * however many people), for leave types that draw down an entitlement.
 * Does NOT check permissions: callers pass ids they are already allowed to see.
 */
export async function loadLeaveBalances(employeeIds: string[], years: number[], onlyTypeId?: number): Promise<BalanceTable> {
  const table: BalanceTable = new Map()
  const types = (await listLeaveTypes()).filter(t => t.uses_balance && (onlyTypeId === undefined || t.id === onlyTypeId))
  if (employeeIds.length === 0 || years.length === 0 || types.length === 0) return table

  const admin = createAdminClient()
  const typeIds = types.map(t => t.id)
  const firstDay = `${Math.min(...years)}-01-01`
  const lastDay = `${Math.max(...years)}-12-31`

  type Usage = Pick<LeaveRequest, 'employee_id' | 'leave_type_id' | 'start_date' | 'days' | 'status'>
  const [entitlementRows, usageRows] = await Promise.all([
    fetchByIds<LeaveEntitlement>(employeeIds, chunk =>
      fetchAllPages<LeaveEntitlement>((from, to) =>
        admin.from('hr_leave_entitlements').select('*').in('employee_id', chunk).in('year', years).in('leave_type_id', typeIds)
          .order('id').range(from, to).returns<LeaveEntitlement[]>()
      )
    ),
    fetchByIds<Usage>(employeeIds, chunk =>
      fetchAllPages<Usage>((from, to) =>
        admin.from('hr_leave_requests').select('employee_id, leave_type_id, start_date, days, status')
          .in('employee_id', chunk).in('leave_type_id', typeIds).in('status', ['pending', 'approved'])
          .gte('start_date', firstDay).lte('start_date', lastDay)
          .order('start_date').order('id').range(from, to).returns<Usage[]>()
      )
    ),
  ])
  if (entitlementRows.error) loadFailed('loadLeaveBalances entitlements', entitlementRows.error)
  if (usageRows.error) loadFailed('loadLeaveBalances requests', usageRows.error)

  const entitlementByKey = new Map<string, LeaveEntitlement>()
  for (const row of entitlementRows.data) entitlementByKey.set(`${row.employee_id}|${row.year}|${row.leave_type_id}`, row)

  const taken = new Map<string, number>()
  const pending = new Map<string, number>()
  for (const row of usageRows.data) {
    const key = `${row.employee_id}|${row.start_date.slice(0, 4)}|${row.leave_type_id}`
    const bucket = row.status === 'approved' ? taken : pending
    bucket.set(key, (bucket.get(key) ?? 0) + Number(row.days))
  }

  for (const employeeId of employeeIds) {
    const byYear = new Map<number, LeaveBalance[]>()
    for (const year of years) {
      const balances: LeaveBalance[] = []
      for (const type of types) {
        const key = `${employeeId}|${year}|${type.id}`
        const row = entitlementByKey.get(key)
        const takenDays = round2(taken.get(key) ?? 0)
        const pendingDays = round2(pending.get(key) ?? 0)
        // A retired type only appears for people who still have something recorded against it.
        if (!type.active && !row && takenDays === 0 && pendingDays === 0) continue

        const entitlement = row ? Number(row.entitlement_days) : Number(type.default_entitlement_days ?? 0)
        const carriedOver = row ? Number(row.carried_over_days) : 0
        balances.push({
          type,
          entitlement,
          carriedOver,
          taken: takenDays,
          pending: pendingDays,
          remaining: round2(entitlement + carriedOver - takenDays - pendingDays),
          entitlementSource: row ? 'recorded' : type.default_entitlement_days != null ? 'default' : 'none',
        })
      }
      byYear.set(year, balances)
    }
    table.set(employeeId, byYear)
  }
  return table
}

/**
 * Balances for leave types that draw down an entitlement (uses_balance), for one leave year.
 * Pass the `viewer` whenever the result is shown to someone: for anyone who is neither
 * HR nor the employee it drops sick and statutory balances, the same rule as
 * redactLeaveRequest, so a balance card can't reveal what the request row hides.
 * Without a viewer nothing is dropped, so only omit it for the employee's own data.
 */
export async function getLeaveBalances(employeeId: string, year: number, viewer?: PeopleViewer): Promise<LeaveBalance[]> {
  const table = await loadLeaveBalances([employeeId], [year])
  const balances = table.get(employeeId)?.get(year) ?? []
  return viewer ? balances.filter(b => !hidesLeaveDetail(viewer, { id: employeeId.toLowerCase() }, b.type)) : balances
}

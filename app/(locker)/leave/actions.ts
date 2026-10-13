'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import {
  authorizeEmployee, can, canOnEmployee, getViewer, inScope, isHr, isSelf, type PeopleViewer,
} from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { createAdminClient, fetchAllPages, withRetry } from '@/utils/people/db'
import { isCurrent, listEmployees } from '@/utils/people/employees-data'
import { addDays, daysBetween, formatDays, todayIso } from '@/utils/people/format'
import {
  countWorkingDays, formatLeaveRange, isSensitiveLeaveCategory, LEAVE_BACKDATE_DAYS, LEAVE_MAX_AHEAD_DAYS, MAX_LEAVE_SPAN_DAYS, yearOf,
} from '@/utils/people/leave-calc'
import {
  canCancelLeave, canDecideLeave, getLeaveBalances, listLeaveTypes, listPublicHolidays, needsAnotherHrToCancel,
} from '@/utils/people/leave-data'
import { notifyLeaveDecided, notifyLeaveRequested } from '@/utils/people/leave-email'
import type { ActionState, Employee, LeaveRequest } from '@/utils/people/types'
import { isRateLimited } from '@/utils/rate-limit'
import { bool, isIsoDate, oneOf, optNumber, optStr, str } from '@/utils/people/validate'

// Server actions for leave. Every action authenticates and re-checks scope for
// the employee it touches: ids bound with .bind() or posted from the browser
// are never trusted (they are lower-cased, and "is this me?" is decided from the
// loaded row, never by comparing the posted string), and the day count is always
// recomputed here.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRY_AGAIN = 'Something went wrong while saving. Please try again.'
const MAX_TEXT = 500
const MAX_ENTITLEMENT_DAYS = 366
const DECISIONS = ['approved', 'rejected'] as const
const INSERT_CHUNK = 500
const MAX_PENDING_REQUESTS = 10
// Per user per minute. Deciding gets more room: an approver works through a queue.
const REQUESTS_PER_MINUTE = 8
const DECISIONS_PER_MINUTE = 12
const TOO_FAST = 'You\'re doing that too quickly. Wait a minute and try again.'
const SELF_DECIDE = 'You can\'t decide your own leave. Another approver needs to do it.'
const SELF_ENTITLEMENT = 'You can\'t change your own leave entitlement. Another HR user needs to do this.'

type DbError = { code?: string; message: string }

function dbFailure(context: string, error: DbError): ActionState {
  console.error(`${context} failed`, error.code, error.message)
  return { error: TRY_AGAIN }
}

const round2 = (n: number) => Math.round(n * 100) / 100

function refreshLeave(employeeId: string) {
  revalidatePath('/leave')
  revalidatePath('/')
  revalidatePath('/me')
  revalidatePath(`/employees/${employeeId}`)
}

/** Ids arrive from the browser in any case: Postgres matches uuids case-insensitively, string compares don't. */
function normaliseId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

// The loaders throw on a database error (guarded() turns that into TRY_AGAIN): a
// failed lookup must not read as "not found" or, worse, as "not me".
async function loadEmployee(id: string): Promise<Employee | null> {
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_employees').select('*').eq('id', id).maybeSingle<Employee>()
  )
  if (error) throw new Error(`leave loadEmployee failed: ${error.message}`)
  return data
}

async function loadRequest(id: string): Promise<LeaveRequest | null> {
  if (!UUID.test(id)) return null
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_leave_requests').select('*').eq('id', id).maybeSingle<LeaveRequest>()
  )
  if (error) throw new Error(`leave loadRequest failed: ${error.message}`)
  return data
}

/**
 * Runs an action for the signed-in viewer. An unexpected throw (a database error
 * in a loader, or getViewer failing closed) becomes a message the form or button
 * can show, instead of an unhandled rejection that would take the page down.
 */
async function guarded(label: string, run: (viewer: PeopleViewer) => Promise<ActionState>): Promise<ActionState> {
  try {
    const viewer = await getViewer()
    if (!viewer) return { error: 'Not authenticated' }
    return await run(viewer)
  } catch (err) {
    console.error(`${label} failed`, err)
    return { error: TRY_AGAIN }
  }
}

// ---------------------------------------------------------------------------
// Requesting and recording leave
// ---------------------------------------------------------------------------

/**
 * Anyone with an employee record can ask for their own leave. HR (leave.manage)
 * can also record leave for someone else, which is approved straight away and
 * may carry a manually set number of days. That on-behalf path is never open
 * for the viewer's own record, HR included: their own leave is requested like
 * anyone's and another approver decides it.
 */
export async function requestLeave(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded('requestLeave', viewer => submitLeave(viewer, employeeId, formData))
}

async function submitLeave(viewer: PeopleViewer, rawEmployeeId: string, formData: FormData): Promise<ActionState> {
  if (isRateLimited(`leave:request:${viewer.userId}`, REQUESTS_PER_MINUTE)) return { error: TOO_FAST }
  const employeeId = normaliseId(rawEmployeeId)
  if (!UUID.test(employeeId)) return { error: 'Employee not found' }

  // Whose leave this is comes from the loaded row, not from comparing the id the
  // browser sent with the viewer's own (an upper-cased copy would not match).
  const employee = await loadEmployee(employeeId)
  if (!employee || !inScope(viewer, employee)) return { error: 'Employee not found' }
  const forSelf = isSelf(viewer, employee)
  // Same message for "missing" and "out of scope" so scope can't be probed.
  if (!forSelf && !canOnEmployee(viewer, 'leave.manage', employee)) return { error: 'Employee not found' }
  const onBehalf = !forSelf
  if (employee.employment_status === 'leaver') {
    return { error: `${forSelf ? 'You are' : `${employee.first_name} is`} recorded as having left, so leave can't be added.` }
  }

  const typeId = optNumber(formData, 'leave_type_id')
  const type = typeId !== null && Number.isInteger(typeId)
    ? (await listLeaveTypes()).find(t => t.id === typeId && t.active)
    : undefined
  if (!type) return { error: 'Choose a type of leave' }

  const start = str(formData, 'start_date')
  const end = str(formData, 'end_date')
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: 'Enter a start date and an end date' }
  if (end < start) return { error: 'The end date can\'t be before the start date' }
  const today = todayIso()
  if (!onBehalf && start < addDays(today, -LEAVE_BACKDATE_DAYS)) {
    return { error: `You can request leave that started up to ${LEAVE_BACKDATE_DAYS} days ago. Ask HR to record anything older.` }
  }
  if (start < '2000-01-01' || end > addDays(today, LEAVE_MAX_AHEAD_DAYS)) return { error: 'Those dates are out of range' }
  if (daysBetween(end, start) + 1 > MAX_LEAVE_SPAN_DAYS) {
    return { error: `A single request can cover up to ${MAX_LEAVE_SPAN_DAYS} days. Split longer leave into separate requests.` }
  }

  const single = start === end
  const startHalf = bool(formData, 'start_half_day') || (single && bool(formData, 'end_half_day'))
  const endHalf = !single && bool(formData, 'end_half_day')
  const includeWeekends = bool(formData, 'include_weekends')

  const reason = optStr(formData, 'reason')
  if (reason && reason.length > MAX_TEXT) return { error: `Keep the reason under ${MAX_TEXT} characters` }

  // The client's number is only a preview. The stored figure is recomputed here, unless HR set it by hand.
  const holidays = new Set((await listPublicHolidays(start, end)).map(h => h.holiday_date))
  let days = countWorkingDays(start, end, holidays, { startHalf, endHalf, includeWeekends })
  const override = onBehalf ? optNumber(formData, 'days_override') : null
  if (override !== null) {
    if (!Number.isFinite(override) || override <= 0 || override > MAX_LEAVE_SPAN_DAYS) {
      return { error: `Enter a number of days above 0 and up to ${MAX_LEAVE_SPAN_DAYS}, or clear it to use the calculated figure` }
    }
    days = round2(override)
  }
  if (days <= 0) {
    return { error: 'No days to take off in that range: weekends and public holidays aren\'t counted. Tick "Include weekends / calendar days" if they are rostered days.' }
  }

  const admin = createAdminClient()
  const { data: clashes, error: clashError } = await admin
    .from('hr_leave_requests')
    .select('start_date, end_date, status')
    .eq('employee_id', employee.id)
    .in('status', ['pending', 'approved'])
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date')
    .limit(1)
    .returns<Pick<LeaveRequest, 'start_date' | 'end_date' | 'status'>[]>()
  if (clashError) return dbFailure('requestLeave overlap check', clashError)
  if (clashes && clashes.length > 0) {
    const clash = clashes[0]
    return {
      error: `${forSelf ? 'You already have' : `${employee.first_name} already has`} ${clash.status} leave on ${formatLeaveRange(clash.start_date, clash.end_date)}, which overlaps these dates.`,
    }
  }

  // HR recording leave, or a type that doesn't need sign-off (sick leave), is approved on the spot.
  const approvedNow = onBehalf || !type.requires_approval

  // Best-effort cap (two requests sent at the same instant can both slip past it).
  if (!approvedNow) {
    const { count, error: countError } = await withRetry(() =>
      admin.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('employee_id', employee.id).eq('status', 'pending')
    )
    if (countError) return dbFailure('requestLeave pending count', countError)
    if ((count ?? 0) >= MAX_PENDING_REQUESTS) {
      return { error: `You already have ${MAX_PENDING_REQUESTS} requests waiting for a decision. Wait for some to be decided, or cancel one, before sending another.` }
    }
  }

  if (!onBehalf && type.uses_balance) {
    const year = yearOf(start)
    const balance = (await getLeaveBalances(employee.id, year)).find(b => b.type.id === type.id)
    if (balance && balance.entitlementSource !== 'none' && days > balance.remaining) {
      return {
        error: `That's ${formatDays(days)}, but only ${formatDays(Math.max(0, balance.remaining))} of ${type.name.toLowerCase()} is left for ${year}. Ask HR if you need more.`,
      }
    }
  }

  const { data: created, error } = await admin
    .from('hr_leave_requests')
    .insert({
      employee_id: employee.id,
      leave_type_id: type.id,
      start_date: start,
      end_date: end,
      start_half_day: startHalf,
      end_half_day: endHalf,
      days,
      status: approvedNow ? 'approved' : 'pending',
      reason,
      requested_by: viewer.email,
      decided_by: approvedNow ? viewer.email : null,
      decided_at: approvedNow ? new Date().toISOString() : null,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !created) return dbFailure('requestLeave', error ?? { message: 'no row returned' })

  // The request is saved; a failed audit write is logged by logAudit but must not turn a saved request into an error.
  await logAudit(viewer, {
    action: onBehalf ? 'leave.record' : 'leave.request',
    entity: 'hr_leave_requests',
    entityId: created.id,
    employeeId: employee.id,
    detail: { leave_type_id: type.id, days, status: approvedNow ? 'approved' : 'pending' },
  })

  const managerEmail = employee.manager_email
  if (!approvedNow && managerEmail && managerEmail !== employee.email) {
    const employeeName = `${employee.first_name} ${employee.last_name}`.trim() || employee.email
    after(() => notifyLeaveRequested({
      managerEmail,
      employeeId: employee.id,
      employeeName,
      typeName: isSensitiveLeaveCategory(type.category) ? null : type.name,
      startIso: start,
      endIso: end,
      days,
    }))
  }

  refreshLeave(employee.id)
  return { error: null, ok: true, message: approvedNow ? 'Leave recorded' : 'Request sent' }
}

// ---------------------------------------------------------------------------
// Deciding and cancelling
// ---------------------------------------------------------------------------

export async function decideLeave(requestId: string, decision: 'approved' | 'rejected', note: string): Promise<ActionState> {
  return guarded('decideLeave', viewer => decide(viewer, requestId, decision, note))
}

async function decide(viewer: PeopleViewer, rawRequestId: string, decision: 'approved' | 'rejected', note: string): Promise<ActionState> {
  if (isRateLimited(`leave:decide:${viewer.userId}`, DECISIONS_PER_MINUTE)) return { error: TOO_FAST }
  const verdict = oneOf(decision, DECISIONS)
  if (!verdict) return { error: 'Choose approve or reject' }
  const cleanNote = typeof note === 'string' ? note.trim() : ''
  if (cleanNote.length > MAX_TEXT) return { error: `Keep the note under ${MAX_TEXT} characters` }
  if (verdict === 'rejected' && !cleanNote) return { error: 'Add a short note so they know why it wasn\'t approved' }

  // Re-load the request: nothing about it is taken from the browser.
  const request = await loadRequest(normaliseId(rawRequestId))
  if (!request) return { error: 'That request could not be found' }
  if (isSelf(viewer, { id: request.employee_id })) return { error: SELF_DECIDE }
  const auth = await authorizeEmployee('leave.approve', request.employee_id)
  if (!auth.ok) return { error: auth.error }
  const { employee } = auth

  const type = (await listLeaveTypes()).find(t => t.id === request.leave_type_id)
  if (!type) return { error: 'That request could not be found' }
  // Managers only ever see "Away" for sick / statutory leave, so they must not approve or reject it blind.
  if (!canDecideLeave(viewer, employee, type)) return { error: 'Only HR can decide this request' }
  const sensitive = isSensitiveLeaveCategory(type.category)
  if (request.status !== 'pending') return { error: `This request has already been ${request.status}` }

  const { data: updated, error } = await createAdminClient()
    .from('hr_leave_requests')
    .update({ status: verdict, decided_by: viewer.email, decided_at: new Date().toISOString(), decision_note: cleanNote || null })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id')
  if (error) return dbFailure('decideLeave', error)
  if (!updated || updated.length === 0) return { error: 'Someone else has just decided or withdrawn this request. Refresh to see where it stands.' }

  await logAudit(viewer, {
    action: verdict === 'approved' ? 'leave.approve' : 'leave.reject',
    entity: 'hr_leave_requests',
    entityId: request.id,
    employeeId: employee.id,
    detail: { days: request.days, hasNote: cleanNote !== '' },
  })
  after(() => notifyLeaveDecided({
    employeeEmail: employee.email,
    decision: verdict,
    startIso: request.start_date,
    endIso: request.end_date,
    note: sensitive ? null : cleanNote || null,
  }))

  refreshLeave(employee.id)
  return { error: null, ok: true, message: verdict === 'approved' ? 'Approved' : 'Rejected' }
}

/**
 * The requester withdraws their own pending request; approvers cancel approved
 * leave that hasn't started; HR can undo any approved record (see canCancelLeave).
 */
export async function cancelLeave(requestId: string): Promise<ActionState> {
  return guarded('cancelLeave', viewer => cancel(viewer, requestId))
}

async function cancel(viewer: PeopleViewer, rawRequestId: string): Promise<ActionState> {
  if (isRateLimited(`leave:cancel:${viewer.userId}`, REQUESTS_PER_MINUTE)) return { error: TOO_FAST }

  const request = await loadRequest(normaliseId(rawRequestId))
  const employee = request ? await loadEmployee(request.employee_id) : null
  const type = request ? (await listLeaveTypes()).find(t => t.id === request.leave_type_id) : undefined
  if (request && employee && needsAnotherHrToCancel(viewer, employee, request)) {
    return { error: 'You can\'t cancel your own approved leave. Another HR user needs to do this.' }
  }
  if (!request || !employee || !type || !canCancelLeave(viewer, employee, request, type, todayIso())) {
    return { error: 'This request can\'t be cancelled' }
  }

  const { data: updated, error } = await createAdminClient()
    .from('hr_leave_requests')
    .update({ status: 'cancelled', decided_by: viewer.email, decided_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', request.status)
    .select('id')
  if (error) return dbFailure('cancelLeave', error)
  if (!updated || updated.length === 0) return { error: 'This request has just changed. Refresh to see where it stands.' }

  await logAudit(viewer, {
    action: 'leave.cancel',
    entity: 'hr_leave_requests',
    entityId: request.id,
    employeeId: employee.id,
    detail: { previous_status: request.status, days: request.days },
  })
  if (!isSelf(viewer, employee)) {
    after(() => notifyLeaveDecided({
      employeeEmail: employee.email,
      decision: 'cancelled',
      startIso: request.start_date,
      endIso: request.end_date,
      note: null,
    }))
  }

  refreshLeave(employee.id)
  return { error: null, ok: true, message: 'Cancelled' }
}

// ---------------------------------------------------------------------------
// Entitlements (HR only)
// ---------------------------------------------------------------------------

function validYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100
}

/**
 * Sets entitlement and carried-over days for one employee and year. The form
 * has `entitlement_<typeId>` and `carried_<typeId>` fields for each balance
 * type it shows; a type whose fields are both blank is left alone.
 */
export async function saveEntitlements(employeeId: string, year: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded('saveEntitlements', viewer => saveEntitlementRows(viewer, employeeId, year, formData))
}

async function saveEntitlementRows(viewer: PeopleViewer, rawEmployeeId: string, year: number, formData: FormData): Promise<ActionState> {
  if (!validYear(year)) return { error: 'Choose a valid year' }
  const employeeId = normaliseId(rawEmployeeId)
  if (!UUID.test(employeeId)) return { error: 'Employee not found' }
  const employee = await loadEmployee(employeeId)
  if (!employee || !inScope(viewer, employee)) return { error: 'Employee not found' }
  // HR can't set their own allowance (see SELF_DENIED): say so instead of pretending the person doesn't exist.
  if (isSelf(viewer, employee) && isHr(viewer)) return { error: SELF_ENTITLEMENT }
  if (!canOnEmployee(viewer, 'leave.manage', employee)) return { error: 'Employee not found' }

  const types = (await listLeaveTypes()).filter(t => t.uses_balance)
  const rows: { employee_id: string; leave_type_id: number; year: number; entitlement_days: number; carried_over_days: number }[] = []
  for (const type of types) {
    const entitlement = optNumber(formData, `entitlement_${type.id}`)
    const carried = optNumber(formData, `carried_${type.id}`)
    if (entitlement === null && carried === null) continue
    if (entitlement === null) return { error: `Enter the ${type.name.toLowerCase()} entitlement in days (0 if there is none)` }
    for (const value of [entitlement, carried]) {
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > MAX_ENTITLEMENT_DAYS)) {
        return { error: `${type.name}: enter a number of days between 0 and ${MAX_ENTITLEMENT_DAYS}` }
      }
    }
    rows.push({
      employee_id: employee.id,
      leave_type_id: type.id,
      year,
      entitlement_days: round2(entitlement),
      carried_over_days: round2(carried ?? 0),
    })
  }
  if (rows.length === 0) return { error: 'Enter an entitlement for at least one type of leave' }

  const { error } = await createAdminClient()
    .from('hr_leave_entitlements')
    .upsert(rows, { onConflict: 'employee_id,leave_type_id,year' })
  if (error) return dbFailure('saveEntitlements', error)

  await logAudit(viewer, {
    action: 'leave.entitlement.set',
    entity: 'hr_leave_entitlements',
    employeeId: employee.id,
    detail: { year, leave_type_ids: rows.map(r => r.leave_type_id) },
  })
  refreshLeave(employee.id)
  return { error: null, ok: true, message: 'Entitlements saved' }
}

/**
 * Gives every current employee who has no entitlement row for this type and year the type's default.
 * The viewer's own record is skipped: nobody sets their own allowance, another HR user does.
 */
export async function applyDefaultEntitlements(leaveTypeId: number, year: number): Promise<ActionState> {
  return guarded('applyDefaultEntitlements', viewer => applyDefaults(viewer, leaveTypeId, year))
}

async function applyDefaults(viewer: PeopleViewer, leaveTypeId: number, year: number): Promise<ActionState> {
  if (!can(viewer, 'leave.manage')) return { error: 'You do not have permission to do that' }
  if (!validYear(year)) return { error: 'Choose a valid year' }

  const type = (await listLeaveTypes()).find(t => t.id === leaveTypeId)
  if (!type || !type.uses_balance || !type.active) return { error: 'Choose a type of leave that has an entitlement' }
  if (type.default_entitlement_days == null) {
    return { error: `${type.name} has no default entitlement. Set one in Settings first, or enter entitlements person by person.` }
  }
  const defaultDays = Number(type.default_entitlement_days)

  const admin = createAdminClient()
  const [employees, existing] = await Promise.all([
    listEmployees(viewer),
    fetchAllPages<{ employee_id: string }>((from, to) =>
      admin.from('hr_leave_entitlements').select('employee_id').eq('leave_type_id', type.id).eq('year', year)
        .order('id').range(from, to).returns<{ employee_id: string }[]>()
    ),
  ])
  if (existing.error) return dbFailure('applyDefaultEntitlements lookup', existing.error)

  const hasOne = new Set(existing.data.map(r => r.employee_id))
  const without = employees.filter(e => isCurrent(e) && !hasOne.has(e.id))
  const missing = without.filter(e => !isSelf(viewer, e))
  const ownLeftOut = without.length > missing.length
  if (missing.length === 0) {
    return {
      error: null,
      ok: true,
      message: ownLeftOut
        ? 'Everyone else already has an entitlement for this year. Your own needs another HR user.'
        : 'Everyone already has an entitlement for this year',
    }
  }

  for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
    const chunk = missing.slice(i, i + INSERT_CHUNK).map(e => ({
      employee_id: e.id,
      leave_type_id: type.id,
      year,
      entitlement_days: defaultDays,
      carried_over_days: 0,
    }))
    // ignoreDuplicates: if someone saved a row in the meantime, theirs wins.
    const { error } = await admin
      .from('hr_leave_entitlements')
      .upsert(chunk, { onConflict: 'employee_id,leave_type_id,year', ignoreDuplicates: true })
    if (error) return dbFailure('applyDefaultEntitlements', error)
  }

  await logAudit(viewer, {
    action: 'leave.entitlement.apply_default',
    entity: 'hr_leave_entitlements',
    detail: { year, leave_type_id: type.id, employees: missing.length, already_set: hasOne.size },
  })
  revalidatePath('/leave')
  revalidatePath('/employees/[id]', 'page')
  return {
    error: null,
    ok: true,
    message: `Applied ${defaultDays} days to ${missing.length} ${missing.length === 1 ? 'employee' : 'employees'}${ownLeftOut ? '. Your own needs another HR user.' : ''}`,
  }
}

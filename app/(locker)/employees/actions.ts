'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { authorize, authorizeEmployee, canOnEmployee, type Authorized } from '@/utils/people/access'
import { AUDIT_UNAVAILABLE, auditBeforeRead, logAudit } from '@/utils/people/audit'
import { COUNTIES, PAY_BASES } from '@/utils/people/constants'
import { createAdminClient } from '@/utils/people/db'
import { todayIso } from '@/utils/people/format'
import { changedCoreFields, isPhone, isPlausibleDate, parseCoreFields, tooLong } from '@/utils/people/profile-validate'
import type { EventInsertRow, RevealPpsResult } from '@/utils/people/profile-types'
import type { ActionState, Employee, EmployeePrivate } from '@/utils/people/types'
import {
  bool, isEircode, isEmail, isPps, normaliseEircode, normalisePps, oneOf, optDate, optEmail, optNumber, optStr, str,
} from '@/utils/people/validate'
import { isRateLimited } from '@/utils/rate-limit'

// Server actions for the employee profile. Every action authenticates and
// re-checks capability + scope for the employee it touches: ids bound with
// .bind() or posted in a form come from the browser and are never trusted.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EMERGENCY_CONTACTS = 10
const MAX_PPS_REVEALS_PER_MINUTE = 10
const TRY_AGAIN = 'Something went wrong while saving. Please try again.'

type DbError = { code?: string; message: string }

/** Logs the real error and returns a message that is safe to show. */
function writeFailure(context: string, error: DbError): ActionState {
  if (error.code === '23505') {
    if (error.message.includes('employee_no')) return { error: 'That employee number is already used by someone else' }
    if (error.message.includes('email')) return { error: 'An employee with that email address already exists' }
    return { error: 'That would duplicate an existing record' }
  }
  console.error(`${context} failed`, error.code, error.message)
  return { error: TRY_AGAIN }
}

function refreshProfile(employeeId: string, alsoDirectory = false) {
  revalidatePath(`/employees/${employeeId}`)
  if (alsoDirectory) {
    revalidatePath('/directory')
    revalidatePath('/')
  }
}

// The titles of the stored timeline entries that createEmployee / recordLeaver write. The same titles
// identify them when a date is corrected, so a note HR typed by hand is never moved or deleted.
const JOINED_TITLE = 'Joined Platinum Home Care'
const LEFT_TITLE = 'Left Platinum Home Care'

type LifecycleSync = { change: 'moved' | 'removed' | null; failed: boolean }

/**
 * Brings the stored 'joined' / 'leaver' entry in line with the employee record:
 * moves it to `date`, or deletes it when `date` is null. Without this the timeline
 * shows the old date from the stored entry plus a second automatic entry for the new one.
 */
async function syncLifecycleEvent(employeeId: string, kind: 'joined' | 'leaver', date: string | null): Promise<LifecycleSync> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hr_events')
    .select('id, occurred_on')
    .eq('employee_id', employeeId)
    .eq('event_type', kind)
    .eq('title', kind === 'joined' ? JOINED_TITLE : LEFT_TITLE)
    .returns<{ id: string; occurred_on: string }[]>()
  if (error) {
    console.error(`syncLifecycleEvent ${kind} lookup failed`, error.message)
    return { change: null, failed: true }
  }
  const stale = data.filter(event => date === null || event.occurred_on !== date).map(event => event.id)
  if (stale.length === 0) return { change: null, failed: false }

  const { error: writeError } = date === null
    ? await admin.from('hr_events').delete().in('id', stale)
    : await admin.from('hr_events').update({ occurred_on: date }).in('id', stale)
  if (writeError) {
    console.error(`syncLifecycleEvent ${kind} write failed`, writeError.message)
    return { change: null, failed: true }
  }
  return { change: date === null ? 'removed' : 'moved', failed: false }
}

/** A line manager must be a current employee (and not create a two-person loop). */
async function managerProblem(email: string | null, subject: Pick<Employee, 'email' | 'manager_email'>): Promise<string | null> {
  if (!email || email === subject.manager_email) return null
  if (email === subject.email) return 'Someone cannot be their own line manager'
  const { data, error } = await createAdminClient()
    .from('hr_employees')
    .select('employment_status, manager_email')
    .eq('email', email)
    .maybeSingle<{ employment_status: string; manager_email: string | null }>()
  if (error) {
    console.error('managerProblem lookup failed', error.message)
    return TRY_AGAIN
  }
  if (!data) return 'The line manager must already be an employee. Add them first, then choose them here.'
  if (data.employment_status === 'leaver') return 'That person has left. Choose a current employee as line manager.'
  if (data.manager_email === subject.email) return 'That would make two people each other\'s line manager'
  return null
}

// ---------------------------------------------------------------------------
// Core employee record
// ---------------------------------------------------------------------------

export async function createEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('employees.edit')
  if (!auth.ok) return { error: auth.error }
  const { viewer } = auth

  const email = optEmail(formData, 'email')
  if (!email || !isEmail(email) || email.length > 254) return { error: 'Enter a valid email address' }

  const startDate = optDate(formData, 'start_date')
  const parsed = parseCoreFields(formData, {
    requireLastName: true,
    defaultStatus: startDate && startDate > todayIso() ? 'pre_start' : 'active',
  })
  if (!parsed.ok) return { error: parsed.error }
  const values = parsed.values
  if (values.employment_status === 'leaver') return { error: 'Choose Pre-start or Active for a new employee' }

  const problem = await managerProblem(values.manager_email, { email, manager_email: null })
  if (problem) return { error: problem }

  // Sent only when set, so adding people keeps working on a database that has not had the leave_group migration yet.
  const { leave_group: leaveGroup, ...coreValues } = values
  const admin = createAdminClient()
  const { data: created, error } = await admin
    .from('hr_employees')
    .insert({
      ...coreValues, ...(leaveGroup ? { leave_group: leaveGroup } : {}),
      email, source: 'manual', created_by: viewer.email, updated_by: viewer.email,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !created) return writeFailure('createEmployee', error ?? { message: 'no row returned' })

  if (values.start_date) {
    const { error: eventError } = await admin.from('hr_events').insert({
      employee_id: created.id,
      event_type: 'joined',
      occurred_on: values.start_date,
      title: JOINED_TITLE,
      visibility: 'manager',
      created_by: viewer.email,
    } satisfies EventInsertRow)
    if (eventError) console.error('createEmployee joined event failed', eventError.message)
  }

  await logAudit(viewer, { action: 'employee.create', entity: 'hr_employees', entityId: created.id, employeeId: created.id, detail: { source: 'manual' } })
  revalidatePath('/directory')
  revalidatePath('/')
  // redirect() throws; with useActionState the client router handles it and navigates, so it must come last.
  redirect(`/employees/${created.id}?created=1`)
}

export async function updateEmployee(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('employees.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const parsed = parseCoreFields(formData, { requireLastName: false })
  if (!parsed.ok) return { error: parsed.error }
  const values = parsed.values

  if (values.employment_status === 'leaver' && employee.employment_status !== 'leaver') {
    return { error: 'To mark someone as a leaver use "Record leaver" on the Personal tab, so their leaving details are kept too.' }
  }
  const problem = await managerProblem(values.manager_email, employee)
  if (problem) return { error: problem }

  const changed = changedCoreFields(employee, values)
  if (changed.length === 0) return { error: null, ok: true, message: 'No changes to save' }

  const patch: Record<string, unknown> = { updated_by: viewer.email }
  for (const key of changed) patch[key] = values[key]

  const admin = createAdminClient()
  const { error } = await admin.from('hr_employees').update(patch).eq('id', employee.id)
  if (error) return writeFailure('updateEmployee', error)

  const events: EventInsertRow[] = []
  if (changed.includes('job_title')) {
    events.push({
      employee_id: employee.id,
      event_type: 'role_change',
      occurred_on: todayIso(),
      title: values.job_title ? `Job title changed to ${values.job_title}` : 'Job title removed',
      details: employee.job_title ? `Previously ${employee.job_title}` : null,
      visibility: 'manager',
      created_by: viewer.email,
    })
  }
  if (changed.includes('area')) {
    events.push({
      employee_id: employee.id,
      event_type: 'area_change',
      occurred_on: todayIso(),
      title: values.area ? `Area changed to ${values.area}` : 'Area removed',
      details: employee.area ? `Previously ${employee.area}` : null,
      visibility: 'manager',
      created_by: viewer.email,
    })
  }
  if (events.length > 0) {
    const { error: eventError } = await admin.from('hr_events').insert(events)
    if (eventError) console.error('updateEmployee timeline events failed', eventError.message)
  }

  // A corrected start or end date, or a leaver brought back, must not leave the stored entry on the old date.
  const lifecycle: LifecycleSync[] = []
  const timeline: string[] = []
  if (changed.includes('start_date')) {
    const result = await syncLifecycleEvent(employee.id, 'joined', values.start_date)
    lifecycle.push(result)
    if (result.change) timeline.push(`joined_${result.change}`)
  }
  if (changed.includes('end_date') || changed.includes('employment_status')) {
    const result = await syncLifecycleEvent(employee.id, 'leaver', values.employment_status === 'leaver' ? values.end_date : null)
    lifecycle.push(result)
    if (result.change) timeline.push(`leaver_${result.change}`)
  }

  await logAudit(viewer, {
    action: 'employee.update',
    entity: 'hr_employees',
    entityId: employee.id,
    employeeId: employee.id,
    detail: timeline.length > 0 ? { fields: changed, timeline } : { fields: changed },
  })
  refreshProfile(employee.id, true)
  if (lifecycle.some(result => result.failed)) {
    return { error: null, ok: true, message: 'Employment details saved, but the matching timeline entry could not be updated. Check the Timeline tab.' }
  }
  return { error: null, ok: true, message: 'Employment details saved' }
}

// ---------------------------------------------------------------------------
// Personal details (hr_employee_private)
// ---------------------------------------------------------------------------

type PrivateCandidate = Partial<Omit<EmployeePrivate, 'employee_id' | 'updated_by' | 'updated_at'>>

async function loadPrivate(employeeId: string): Promise<{ existing: EmployeePrivate | null; failed: boolean }> {
  const { data, error } = await createAdminClient()
    .from('hr_employee_private')
    .select('*')
    .eq('employee_id', employeeId)
    .maybeSingle<EmployeePrivate>()
  if (error) console.error('loadPrivate failed', error.message)
  return { existing: data ?? null, failed: !!error }
}

/** Upserts only the candidate fields that differ from what is stored, and audits their names. */
async function persistPrivate(
  auth: Authorized,
  existing: EmployeePrivate | null,
  candidate: PrivateCandidate,
  auditAction: string,
  successMessage: string,
): Promise<ActionState> {
  const { viewer, employee } = auth
  const keys = (Object.keys(candidate) as (keyof PrivateCandidate)[]).filter(key => (existing?.[key] ?? null) !== candidate[key])
  if (keys.length === 0) return { error: null, ok: true, message: 'No changes to save' }

  const patch: Record<string, unknown> = {}
  for (const key of keys) patch[key] = candidate[key]

  const { error } = await createAdminClient()
    .from('hr_employee_private')
    .upsert({ employee_id: employee.id, ...patch, updated_by: viewer.email }, { onConflict: 'employee_id' })
  if (error) return writeFailure(auditAction, error)

  await logAudit(viewer, { action: auditAction, entity: 'hr_employee_private', entityId: employee.id, employeeId: employee.id, detail: { fields: keys } })
  refreshProfile(employee.id)
  return { error: null, ok: true, message: successMessage }
}

export async function savePersonal(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('private.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { existing, failed } = await loadPrivate(auth.employee.id)
  if (failed) return { error: TRY_AGAIN }

  const personalEmail = optEmail(formData, 'personal_email')
  if (personalEmail && (!isEmail(personalEmail) || personalEmail.length > 254)) return { error: 'Enter a valid personal email address' }

  const mobile = optStr(formData, 'mobile')
  if (mobile && !isPhone(mobile)) return { error: 'Enter a valid mobile number' }

  const addressLine1 = optStr(formData, 'address_line1')
  const addressLine2 = optStr(formData, 'address_line2')
  const town = optStr(formData, 'town')
  const nationality = optStr(formData, 'nationality')
  const rightToWork = optStr(formData, 'right_to_work_basis')
  const lengthProblem =
    tooLong(addressLine1, 120, 'Address line 1') ?? tooLong(addressLine2, 120, 'Address line 2') ??
    tooLong(town, 80, 'Town') ?? tooLong(nationality, 80, 'Nationality') ?? tooLong(rightToWork, 200, 'Right to work')
  if (lengthProblem) return { error: lengthProblem }

  const countyRaw = str(formData, 'county')
  // A county already on file stays valid even if it is not one of the standard 26.
  if (countyRaw && countyRaw !== existing?.county && !oneOf(countyRaw, COUNTIES)) return { error: 'Choose a county from the list' }

  const eircodeRaw = optStr(formData, 'eircode')
  if (eircodeRaw && !isEircode(eircodeRaw)) return { error: 'That Eircode does not look right (for example D02 X285)' }

  const dateOfBirth = optDate(formData, 'date_of_birth')
  if (dateOfBirth && (!isPlausibleDate(dateOfBirth) || dateOfBirth >= todayIso())) return { error: 'Enter a valid date of birth in the past' }

  const candidate: PrivateCandidate = {
    personal_email: personalEmail,
    mobile,
    address_line1: addressLine1,
    address_line2: addressLine2,
    town,
    county: countyRaw || null,
    eircode: eircodeRaw ? normaliseEircode(eircodeRaw) : null,
    date_of_birth: dateOfBirth,
    nationality,
    right_to_work_basis: rightToWork,
  }

  // The PPS number is never sent to the browser, so a blank box means "keep what is on file".
  const ppsRaw = str(formData, 'pps_number')
  const clearPps = bool(formData, 'clear_pps')
  if (ppsRaw && clearPps) return { error: 'Either enter a new PPS number or tick remove, not both' }
  if (ppsRaw) {
    if (!isPps(ppsRaw)) return { error: 'That PPS number does not look right (for example 1234567TA)' }
    candidate.pps_number = normalisePps(ppsRaw)
  } else if (clearPps) {
    candidate.pps_number = null
  }

  return persistPrivate(auth, existing, candidate, 'private.update', 'Personal details saved')
}

export async function saveLeavingDetails(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('private.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { existing, failed } = await loadPrivate(auth.employee.id)
  if (failed) return { error: TRY_AGAIN }

  const candidate = parseLeaving(formData)
  if (!candidate.ok) return { error: candidate.error }
  return persistPrivate(auth, existing, candidate.values, 'leaving.update', 'Leaving details saved')
}

function parseLeaving(formData: FormData): { ok: true; values: PrivateCandidate } | { ok: false; error: string } {
  const noticeGivenOn = optDate(formData, 'notice_given_on')
  if (noticeGivenOn && !isPlausibleDate(noticeGivenOn)) return { ok: false, error: 'Notice given on is not a valid date' }
  const reason = optStr(formData, 'leaving_reason')
  const notes = optStr(formData, 'leaving_notes')
  const problem = tooLong(reason, 200, 'Reason for leaving') ?? tooLong(notes, 2000, 'Notes')
  if (problem) return { ok: false, error: problem }
  const rehire = str(formData, 'eligible_for_rehire')
  if (rehire !== '' && rehire !== 'yes' && rehire !== 'no') return { ok: false, error: 'Choose whether they are eligible for rehire' }
  return {
    ok: true,
    values: {
      notice_given_on: noticeGivenOn,
      leaving_reason: reason,
      leaving_notes: notes,
      eligible_for_rehire: rehire === '' ? null : rehire === 'yes',
    },
  }
}

export async function recordLeaver(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('employees.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  // Recording a leaver also writes their personal row, so it needs private.edit as well.
  if (!canOnEmployee(viewer, 'private.edit', employee)) return { error: 'You do not have permission to do that' }
  if (employee.employment_status === 'leaver') return { error: 'This person is already recorded as a leaver' }

  const endDate = optDate(formData, 'end_date')
  if (!endDate || !isPlausibleDate(endDate)) return { error: 'Enter their last working day' }
  if (employee.start_date && endDate < employee.start_date) return { error: 'The last working day cannot be before their start date' }
  const leaving = parseLeaving(formData)
  if (!leaving.ok) return { error: leaving.error }
  if (leaving.values.notice_given_on && leaving.values.notice_given_on > endDate) return { error: 'Notice cannot be given after the last working day' }

  const { existing, failed } = await loadPrivate(employee.id)
  if (failed) return { error: TRY_AGAIN }

  const admin = createAdminClient()
  // Personal row first: if it fails nothing has changed yet, and retrying is safe.
  const { error: privateError } = await admin
    .from('hr_employee_private')
    .upsert({ employee_id: employee.id, ...leaving.values, updated_by: viewer.email }, { onConflict: 'employee_id' })
  if (privateError) return writeFailure('recordLeaver private', privateError)

  const { error } = await admin
    .from('hr_employees')
    .update({ employment_status: 'leaver', end_date: endDate, updated_by: viewer.email })
    .eq('id', employee.id)
  if (error) return writeFailure('recordLeaver', error)

  const { error: eventError } = await admin.from('hr_events').insert({
    employee_id: employee.id,
    event_type: 'leaver',
    occurred_on: endDate,
    title: LEFT_TITLE,
    visibility: 'manager',
    created_by: viewer.email,
  } satisfies EventInsertRow)
  if (eventError) console.error('recordLeaver timeline event failed', eventError.message)

  const leavingFields = (Object.keys(leaving.values) as (keyof PrivateCandidate)[]).filter(key => (existing?.[key] ?? null) !== leaving.values[key])
  await logAudit(viewer, {
    action: 'employee.leaver',
    entity: 'hr_employees',
    entityId: employee.id,
    employeeId: employee.id,
    detail: { fields: ['employment_status', 'end_date', ...leavingFields] },
  })
  refreshProfile(employee.id, true)
  return { error: null, ok: true, message: 'Recorded as a leaver' }
}

/**
 * Returns the full PPS number to someone allowed to see it. Fails closed: the
 * reveal is written to the audit log BEFORE the number is read, and if that
 * write fails nothing is returned.
 */
export async function revealPps(employeeId: string): Promise<RevealPpsResult> {
  const auth = await authorizeEmployee('private.view', employeeId)
  if (!auth.ok) return { ok: false, error: auth.error }
  // Checked before the audit write so a hammering client cannot flood the audit log either.
  if (isRateLimited(`people-pps-reveal:${auth.viewer.userId}`, MAX_PPS_REVEALS_PER_MINUTE)) {
    return { ok: false, error: 'You are revealing PPS numbers very quickly. Wait a minute and try again.' }
  }
  const audited = await auditBeforeRead(auth.viewer, {
    action: 'pps.reveal', entity: 'hr_employee_private', entityId: auth.employee.id, employeeId: auth.employee.id,
  })
  if (!audited) return { ok: false, error: AUDIT_UNAVAILABLE }

  const { data, error } = await createAdminClient()
    .from('hr_employee_private')
    .select('pps_number')
    .eq('employee_id', auth.employee.id)
    .maybeSingle<{ pps_number: string | null }>()
  if (error) {
    console.error('revealPps failed', error.message)
    return { ok: false, error: 'Could not load the PPS number. Please try again.' }
  }
  if (!data?.pps_number) return { ok: false, error: 'No PPS number is recorded yet' }
  return { ok: true, pps: data.pps_number }
}

// ---------------------------------------------------------------------------
// Emergency contacts
// ---------------------------------------------------------------------------

export async function addEmergencyContact(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('private.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const name = str(formData, 'contact_name')
  if (!name) return { error: 'Enter the contact\'s name' }
  const relationship = optStr(formData, 'contact_relationship')
  const phone = optStr(formData, 'contact_phone')
  const altPhone = optStr(formData, 'contact_alt_phone')
  const notes = optStr(formData, 'contact_notes')
  if (!phone && !altPhone) return { error: 'Enter at least one phone number for the contact' }
  if ((phone && !isPhone(phone)) || (altPhone && !isPhone(altPhone))) return { error: 'Enter valid phone numbers' }
  const problem = tooLong(name, 120, 'Name') ?? tooLong(relationship, 60, 'Relationship') ?? tooLong(notes, 500, 'Notes')
  if (problem) return { error: problem }

  const admin = createAdminClient()
  const { count, error: countError } = await admin
    .from('hr_emergency_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employee.id)
  if (countError) return writeFailure('addEmergencyContact count', countError)
  if ((count ?? 0) >= MAX_EMERGENCY_CONTACTS) return { error: `You can record up to ${MAX_EMERGENCY_CONTACTS} emergency contacts` }

  const { error } = await admin.from('hr_emergency_contacts').insert({
    employee_id: employee.id,
    name,
    relationship,
    phone,
    alt_phone: altPhone,
    notes,
    is_primary: (count ?? 0) === 0,
  })
  if (error) return writeFailure('addEmergencyContact', error)

  await logAudit(viewer, { action: 'emergency_contact.add', entity: 'hr_emergency_contacts', employeeId: employee.id })
  refreshProfile(employee.id)
  return { error: null, ok: true, message: 'Emergency contact added' }
}

export async function deleteEmergencyContact(employeeId: string, contactId: string): Promise<ActionState> {
  const auth = await authorizeEmployee('private.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  if (!UUID.test(contactId)) return { error: 'Contact not found' }

  const admin = createAdminClient()
  const { data: contact, error: readError } = await admin
    .from('hr_emergency_contacts')
    .select('id, is_primary')
    .eq('id', contactId)
    .eq('employee_id', employee.id)
    .maybeSingle<{ id: string; is_primary: boolean }>()
  if (readError) return writeFailure('deleteEmergencyContact read', readError)
  if (!contact) return { error: 'Contact not found' }

  const { error } = await admin.from('hr_emergency_contacts').delete().eq('id', contact.id).eq('employee_id', employee.id)
  if (error) return writeFailure('deleteEmergencyContact', error)

  if (contact.is_primary) {
    // Someone should always be first to ring: promote the longest-standing remaining contact.
    const { data: next } = await admin
      .from('hr_emergency_contacts')
      .select('id')
      .eq('employee_id', employee.id)
      .order('created_at')
      .limit(1)
      .maybeSingle<{ id: string }>()
    if (next) {
      const { error: promoteError } = await admin.from('hr_emergency_contacts').update({ is_primary: true }).eq('id', next.id).eq('employee_id', employee.id)
      if (promoteError) console.error('deleteEmergencyContact promote failed', promoteError.message)
    }
  }

  await logAudit(viewer, { action: 'emergency_contact.delete', entity: 'hr_emergency_contacts', entityId: contact.id, employeeId: employee.id })
  refreshProfile(employee.id)
  return { error: null, ok: true }
}

export async function setPrimaryEmergencyContact(employeeId: string, contactId: string): Promise<ActionState> {
  const auth = await authorizeEmployee('private.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  if (!UUID.test(contactId)) return { error: 'Contact not found' }

  const admin = createAdminClient()
  const { data: contact, error: readError } = await admin
    .from('hr_emergency_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('employee_id', employee.id)
    .maybeSingle<{ id: string }>()
  if (readError) return writeFailure('setPrimaryEmergencyContact read', readError)
  if (!contact) return { error: 'Contact not found' }

  // Promote first, then demote the rest: a failure in between leaves two primaries rather than none.
  const { error } = await admin.from('hr_emergency_contacts').update({ is_primary: true }).eq('id', contact.id).eq('employee_id', employee.id)
  if (error) return writeFailure('setPrimaryEmergencyContact', error)
  const { error: demoteError } = await admin
    .from('hr_emergency_contacts')
    .update({ is_primary: false })
    .eq('employee_id', employee.id)
    .neq('id', contact.id)
  if (demoteError) return writeFailure('setPrimaryEmergencyContact demote', demoteError)

  await logAudit(viewer, { action: 'emergency_contact.primary', entity: 'hr_emergency_contacts', entityId: contact.id, employeeId: employee.id })
  refreshProfile(employee.id)
  return { error: null, ok: true }
}

// ---------------------------------------------------------------------------
// Pay (insert-only history)
// ---------------------------------------------------------------------------

export async function addPayChange(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('compensation.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const effectiveFrom = optDate(formData, 'effective_from')
  if (!effectiveFrom || !isPlausibleDate(effectiveFrom)) return { error: 'Enter the date this pay takes effect' }
  const basis = oneOf(str(formData, 'pay_basis'), PAY_BASES.map(b => b.value))
  if (!basis) return { error: 'Choose hourly or annual salary' }

  const rate = optNumber(formData, 'rate')
  const maxRate = basis === 'hourly' ? 1_000 : 1_000_000
  if (rate === null || Number.isNaN(rate) || rate < 0 || rate > maxRate) {
    return { error: basis === 'hourly' ? 'Enter an hourly rate between 0 and 1,000' : 'Enter an annual salary between 0 and 1,000,000' }
  }
  const hours = optNumber(formData, 'hours_per_week')
  if (hours !== null && (Number.isNaN(hours) || hours < 0 || hours > 168)) return { error: 'Hours per week must be between 0 and 168' }

  const reason = optStr(formData, 'reason')
  const notes = optStr(formData, 'notes')
  const problem = tooLong(reason, 200, 'Reason') ?? tooLong(notes, 1000, 'Notes')
  if (problem) return { error: problem }

  const admin = createAdminClient()
  const { error } = await admin.from('hr_compensation').insert({
    employee_id: employee.id,
    effective_from: effectiveFrom,
    pay_basis: basis,
    rate: Math.round(rate * 100) / 100,
    currency: 'EUR',
    hours_per_week: hours === null ? null : Math.round(hours * 100) / 100,
    reason,
    notes,
    created_by: viewer.email,
  })
  if (error) return writeFailure('addPayChange', error)

  // The timeline records that pay changed, never what it changed to.
  const { error: eventError } = await admin.from('hr_events').insert({
    employee_id: employee.id,
    event_type: 'pay_change',
    occurred_on: effectiveFrom,
    title: 'Pay change recorded',
    details: reason,
    visibility: 'hr_only',
    created_by: viewer.email,
  } satisfies EventInsertRow)
  if (eventError) console.error('addPayChange timeline event failed', eventError.message)

  await logAudit(viewer, {
    action: 'compensation.add',
    entity: 'hr_compensation',
    employeeId: employee.id,
    detail: { pay_basis: basis, scheduled: effectiveFrom > todayIso() },
  })
  refreshProfile(employee.id)
  return { error: null, ok: true, message: 'Pay change recorded' }
}

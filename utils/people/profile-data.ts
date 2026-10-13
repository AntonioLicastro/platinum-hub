import { cache } from 'react'
import { createAdminClient, withRetry } from './db'
import { emailNameMap, isCurrent, listEmployees } from './employees-data'
import { fullName } from './format'
import type { PeopleViewer } from './access'
import type { Compensation, EmergencyContact, EmployeePrivate } from './types'

// Loaders for the sensitive profile tabs. They do NOT check permissions: the
// caller must already have passed canOnEmployee() for the matching capability
// (private.view / compensation.view) before calling them, so managers never
// cause this data to be fetched. A failed read is reported (never swallowed as
// "nothing recorded") so HR is not misled into thinking a record is empty.

type Loaded<T> = { data: T; failed: boolean }

export async function getEmployeePrivate(employeeId: string): Promise<Loaded<EmployeePrivate | null>> {
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_employee_private').select('*').eq('employee_id', employeeId).maybeSingle<EmployeePrivate>()
  )
  if (error) console.error('getEmployeePrivate failed', error.message)
  return { data: data ?? null, failed: !!error }
}

export async function listEmergencyContacts(employeeId: string): Promise<Loaded<EmergencyContact[]>> {
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_emergency_contacts')
      .select('*')
      .eq('employee_id', employeeId)
      .order('is_primary', { ascending: false })
      .order('created_at')
      .returns<EmergencyContact[]>()
  )
  if (error) console.error('listEmergencyContacts failed', error.message)
  return { data: data ?? [], failed: !!error }
}

/** Pay history, newest first. */
export async function listCompensation(employeeId: string): Promise<Loaded<Compensation[]>> {
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_compensation')
      .select('*')
      .eq('employee_id', employeeId)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .returns<Compensation[]>()
  )
  if (error) console.error('listCompensation failed', error.message)
  return { data: data ?? [], failed: !!error }
}

/** The three Easy Mileage profile fields HR Locker compares against the HR record. Read-only. */
export type EasyMileageProfile = { title: string | null; area: string | null; payroll_no: string | null }

export async function getEasyMileageProfile(profileId: string): Promise<EasyMileageProfile | null> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('title, area, payroll_no')
    .eq('id', profileId)
    .maybeSingle<EasyMileageProfile>()
  if (error) console.error('getEasyMileageProfile failed', error.message)
  return data ?? null
}

type ManagerOption = { email: string; name: string }

/** Current employees the viewer can see, as line-manager choices (the person themselves excluded). */
export async function listManagerOptions(viewer: PeopleViewer, excludeEmployeeId?: string): Promise<ManagerOption[]> {
  const employees = await listEmployees(viewer)
  return employees
    .filter(e => isCurrent(e) && e.id !== excludeEmployeeId)
    .map(e => ({ email: e.email, name: fullName(e) || e.email }))
}

/** A line manager's display name, looked up once per request however many parts of the profile ask for it. */
export const getManagerName = cache(async (email: string | null): Promise<string | null> => {
  if (!email) return null
  const names = await emailNameMap([email])
  return names.get(email.toLowerCase()) ?? null
})

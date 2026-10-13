import { createAdminClient, fetchAllPages, withRetry } from './db'
import type { DocumentType, LeaveType, PublicHoliday } from './types'

// Loaders for Settings > Document types, Leave types and Public holidays.
// Callers must already have checked settings.manage.

type DbError = { message: string }

/** How many rows reference each id, paging past PostgREST's 1000-row cap. */
async function tallyBy<Column extends string>(
  label: string,
  column: Column,
  run: (from: number, to: number) => PromiseLike<{ data: Record<Column, number | null>[] | null; error: DbError | null }>,
): Promise<Map<number, number>> {
  const { data, error } = await fetchAllPages(run)
  if (error) console.error(`${label} usage count failed`, error.message)
  const counts = new Map<number, number>()
  for (const row of data) {
    const id = row[column]
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

// ---- Document types -------------------------------------------------------

export type DocumentTypeRow = DocumentType & { documents: number }

export async function listDocumentTypes(): Promise<DocumentTypeRow[]> {
  const admin = createAdminClient()
  const [{ data, error }, usage] = await Promise.all([
    withRetry(() =>
      admin.from('hr_document_types').select('*').order('sort_order').order('name').order('id').returns<DocumentType[]>()
    ),
    tallyBy('document type', 'document_type_id', (from, to) =>
      admin.from('hr_documents').select('document_type_id').order('id').range(from, to).returns<{ document_type_id: number | null }[]>()
    ),
  ])
  if (error) console.error('listDocumentTypes failed', error.message)
  return (data ?? []).map(t => ({ ...t, documents: usage.get(t.id) ?? 0 }))
}

export async function findDocumentType(id: number): Promise<DocumentType | null> {
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_document_types').select('*').eq('id', id).maybeSingle<DocumentType>()
  )
  if (error) console.error('findDocumentType failed', error.message)
  return data
}

/** Documents on file of this type; null when the count could not be read. */
export async function countDocumentsOfType(id: number): Promise<number | null> {
  const { count, error } = await withRetry(() =>
    createAdminClient().from('hr_documents').select('id', { count: 'exact', head: true }).eq('document_type_id', id)
  )
  if (error) {
    console.error('countDocumentsOfType failed', error.message)
    return null
  }
  return count ?? 0
}

// ---- Leave types ----------------------------------------------------------

export type LeaveTypeRow = LeaveType & { requests: number; entitlements: number }

export async function listLeaveTypes(): Promise<LeaveTypeRow[]> {
  const admin = createAdminClient()
  const [{ data, error }, requests, entitlements] = await Promise.all([
    withRetry(() =>
      admin.from('hr_leave_types').select('*').order('sort_order').order('name').order('id').returns<LeaveType[]>()
    ),
    tallyBy('leave request', 'leave_type_id', (from, to) =>
      admin.from('hr_leave_requests').select('leave_type_id').order('id').range(from, to).returns<{ leave_type_id: number | null }[]>()
    ),
    tallyBy('leave entitlement', 'leave_type_id', (from, to) =>
      admin.from('hr_leave_entitlements').select('leave_type_id').order('id').range(from, to).returns<{ leave_type_id: number | null }[]>()
    ),
  ])
  if (error) console.error('listLeaveTypes failed', error.message)
  return (data ?? []).map(t => ({ ...t, requests: requests.get(t.id) ?? 0, entitlements: entitlements.get(t.id) ?? 0 }))
}

export async function findLeaveType(id: number): Promise<LeaveType | null> {
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_leave_types').select('*').eq('id', id).maybeSingle<LeaveType>()
  )
  if (error) console.error('findLeaveType failed', error.message)
  return data
}

/** Requests and entitlements that reference this type; null when either count could not be read. */
export async function countLeaveTypeUse(id: number): Promise<{ requests: number; entitlements: number } | null> {
  const admin = createAdminClient()
  const [requests, entitlements] = await Promise.all([
    withRetry(() => admin.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('leave_type_id', id)),
    withRetry(() => admin.from('hr_leave_entitlements').select('id', { count: 'exact', head: true }).eq('leave_type_id', id)),
  ])
  if (requests.error || entitlements.error) {
    console.error('countLeaveTypeUse failed', requests.error?.message ?? entitlements.error?.message)
    return null
  }
  return { requests: requests.count ?? 0, entitlements: entitlements.count ?? 0 }
}

// ---- Public holidays ------------------------------------------------------

export async function listHolidays(year: number): Promise<PublicHoliday[]> {
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_public_holidays')
      .select('holiday_date, name')
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
      .order('holiday_date')
      .returns<PublicHoliday[]>()
  )
  if (error) console.error('listHolidays failed', error.message)
  return data ?? []
}

/** Number of holidays recorded in each year of the range, so the year picker can show which years are still empty. */
export async function holidayCountsByYear(firstYear: number, lastYear: number): Promise<Map<number, number>> {
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_public_holidays')
      .select('holiday_date')
      .gte('holiday_date', `${firstYear}-01-01`)
      .lte('holiday_date', `${lastYear}-12-31`)
      .returns<{ holiday_date: string }[]>()
  )
  if (error) console.error('holidayCountsByYear failed', error.message)
  const counts = new Map<number, number>()
  for (const row of data ?? []) {
    const year = Number(row.holiday_date.slice(0, 4))
    counts.set(year, (counts.get(year) ?? 0) + 1)
  }
  return counts
}

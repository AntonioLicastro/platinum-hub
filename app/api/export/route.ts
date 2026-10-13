import { NextResponse, type NextRequest } from 'next/server'
import { can, canOnEmployee, getViewer, type PeopleViewer } from '@/utils/people/access'
import { AUDIT_UNAVAILABLE, auditBeforeRead } from '@/utils/people/audit'
import { createAdminClient, fetchAllPages } from '@/utils/people/db'
import { loadDirectory } from '@/utils/people/directory-load'
import { activeFilterNames, parseDirectoryParams } from '@/utils/people/directory-query'
import { csvCell, todayIso } from '@/utils/people/format'
import type { Employee, EmployeePrivate } from '@/utils/people/types'
import { isRateLimited } from '@/utils/rate-limit'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

/** A database problem is temporary: a clean 503 the person can retry, never an unhandled 500. */
const UNAVAILABLE = 'The export could not be prepared just now. Please try again in a moment.'

type Column<T> = { header: string; value: (row: T) => unknown }

const CORE_COLUMNS: Column<Employee>[] = [
  { header: 'first_name', value: e => e.first_name },
  { header: 'last_name', value: e => e.last_name },
  { header: 'email', value: e => e.email },
  { header: 'employee_no', value: e => e.employee_no },
  { header: 'payroll_no', value: e => e.payroll_no },
  { header: 'job_title', value: e => e.job_title },
  { header: 'department', value: e => e.department },
  { header: 'area', value: e => e.area },
  { header: 'employment_status', value: e => e.employment_status },
  { header: 'employment_type', value: e => e.employment_type },
  { header: 'contract_hours_per_week', value: e => e.contract_hours_per_week },
  { header: 'work_pattern', value: e => e.work_pattern },
  { header: 'base_location', value: e => e.base_location },
  { header: 'manager_email', value: e => e.manager_email },
  { header: 'work_phone', value: e => e.work_phone },
  { header: 'start_date', value: e => e.start_date },
  { header: 'probation_end_date', value: e => e.probation_end_date },
  { header: 'end_date', value: e => e.end_date },
]

// Deliberately a short allow-list: the PPS number, right-to-work basis and leaving notes are never selected.
const PRIVATE_SELECT = 'employee_id, personal_email, mobile, address_line1, address_line2, town, county, eircode, date_of_birth, nationality'
type ExportPrivate = Pick<EmployeePrivate, 'employee_id' | 'personal_email' | 'mobile' | 'address_line1' | 'address_line2' | 'town' | 'county' | 'eircode' | 'date_of_birth' | 'nationality'>

const PRIVATE_COLUMNS: Column<ExportPrivate | undefined>[] = [
  { header: 'personal_email', value: p => p?.personal_email },
  { header: 'mobile', value: p => p?.mobile },
  { header: 'address', value: p => [p?.address_line1, p?.address_line2, p?.town].filter(Boolean).join(', ') },
  { header: 'county', value: p => p?.county },
  { header: 'eircode', value: p => p?.eircode },
  { header: 'date_of_birth', value: p => p?.date_of_birth },
  { header: 'nationality', value: p => p?.nationality },
]

async function loadPrivateRows(ids: Set<string>): Promise<Map<string, ExportPrivate> | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await fetchAllPages<ExportPrivate>((from, to) =>
      admin
        .from('hr_employee_private')
        .select(PRIVATE_SELECT)
        .order('employee_id')
        .range(from, to)
        .returns<ExportPrivate[]>()
    )
    if (error) {
      console.error('directory export: personal details failed', error.message)
      return null
    }
    return new Map(data.filter(row => ids.has(row.employee_id)).map(row => [row.employee_id, row]))
  } catch (err) {
    console.error('directory export: personal details failed', err)
    return null
  }
}

/**
 * GET /api/export?<the Directory's filters>: the rows currently in the
 * directory as a CSV. Everyone with employees.view gets the directory-level
 * columns for people in their scope; personal contact details are added only for
 * viewers with private.view (HR). The PPS number is never exported.
 */
export async function GET(request: NextRequest) {
  // getViewer() throws on a database error rather than guessing a role.
  let viewer: PeopleViewer | null
  try {
    viewer = await getViewer()
  } catch (err) {
    console.error('directory export: could not identify the viewer', err)
    return fail(UNAVAILABLE, 503)
  }
  if (!viewer) return fail('Not authenticated', 401)
  if (!can(viewer, 'employees.view')) return fail('You do not have permission to export the directory', 403)
  if (isRateLimited(`people-export:${viewer.userId}`, 6)) {
    return fail('Too many exports in a short time. Wait a minute and try again.', 429)
  }

  const filters = parseDirectoryParams(Object.fromEntries(request.nextUrl.searchParams))
  // listEmployees() throws on a database error: say so, never export a partial or empty list.
  let directory: Awaited<ReturnType<typeof loadDirectory>>
  try {
    directory = await loadDirectory(viewer, filters)
  } catch (err) {
    console.error('directory export: could not load the directory', err)
    return fail(UNAVAILABLE, 503)
  }
  const { filtered, compliance } = directory
  // A file that silently ignored the compliance filter would be mistaken for the filtered list.
  if (filters.complianceIssues && compliance === 'failed') {
    return fail('Document compliance could not be checked just now. Please try again in a moment.', 503)
  }

  const includePersonal = can(viewer, 'private.view')

  // Recorded BEFORE any personal details are read or the file is built, and the export is
  // refused when the row cannot be written: no data may leave without a trace.
  const audited = await auditBeforeRead(viewer, {
    action: 'employees.export',
    entity: 'hr_employees',
    detail: { rows: filtered.length, includesPersonalDetails: includePersonal, filters: activeFilterNames(filters) },
  })
  if (!audited) return fail(AUDIT_UNAVAILABLE, 503)

  let personal = new Map<string, ExportPrivate>()
  if (includePersonal) {
    const loaded = await loadPrivateRows(new Set(filtered.map(e => e.id)))
    if (!loaded) return fail(UNAVAILABLE, 503)
    personal = loaded
  }

  const header = [...CORE_COLUMNS, ...(includePersonal ? PRIVATE_COLUMNS : [])].map(c => c.header).join(',')
  const lines = filtered.map(e => {
    const cells = CORE_COLUMNS.map(c => csvCell(c.value(e)))
    if (includePersonal) {
      const row = canOnEmployee(viewer, 'private.view', e) ? personal.get(e.id) : undefined
      cells.push(...PRIVATE_COLUMNS.map(c => csvCell(c.value(row))))
    }
    return cells.join(',')
  })

  // The BOM makes Excel read the file as UTF-8, so Irish names keep their accents.
  return new NextResponse(`﻿${[header, ...lines].join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="platinum-people-directory-${todayIso()}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

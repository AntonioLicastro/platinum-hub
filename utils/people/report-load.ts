import { can, canOnEmployee, isHr, type PeopleViewer } from './access'
import { getComplianceItems } from './compliance-data'
import { createAdminClient, fetchAllPages, fetchByIds } from './db'
import { listEmployees } from './employees-data'
import { addDays, todayIso } from './format'
import { listLeaveTypes } from './leave-data'
import { findReport, firstParam, parseReportFilters, REPORTS, type RawParams, type ReportDef } from './report-catalog'
import { buildCoverage, buildMovement, buildTenure, buildTurnover, buildWorkforce, leaversInLastYear, type CoverageItem, type LeavingReasons } from './report-calc'
import { buildCompliance } from './report-calc-compliance'
import { buildLeave, UPCOMING_LEAVE_DAYS, type LeaveRow, type UpcomingLeaveRow } from './report-calc-leave'
import { buildReviews, REVIEW_HORIZON_DAYS } from './report-calc-reviews'
import { areaOptions, filterByArea, type AreaOption } from './report-core'
import type { ReportFilters, ReportResult } from './report-types'
import { listUpcomingReviews } from './review-data'
import type { Employee } from './types'

// Loads what each report needs and hands it to the pure calculations. Every
// dataset starts from listEmployees(viewer), so a manager's numbers can only
// ever describe their own people, and anything private is fetched only for
// viewers who hold the capability for it. The Reports page and the CSV route
// both come through runReport, so they apply identical rules.

/** The reports this viewer may open: reports.view plus whatever data the report itself needs. */
export function reportsFor(viewer: PeopleViewer): ReportDef[] {
  return can(viewer, 'reports.view') ? REPORTS.filter(def => can(viewer, def.requires)) : []
}

export type ReportRun =
  | { ok: false; reason: 'unknown' | 'forbidden' }
  | {
      ok: true
      def: ReportDef
      filters: ReportFilters
      /** Areas the viewer can filter by (from the people in their scope). */
      areas: AreaOption[]
      /** People the report describes, after the area filter. */
      people: number
      today: string
      result: ReportResult
    }

/** A failed report query throws rather than returning zeros, which would read as "nothing happened". */
export async function runReport(viewer: PeopleViewer, raw: RawParams): Promise<ReportRun> {
  const def = findReport(firstParam(raw.report))
  if (!def) return { ok: false, reason: 'unknown' }
  if (!reportsFor(viewer).some(r => r.id === def.id)) return { ok: false, reason: 'forbidden' }

  const today = todayIso()
  const everyone = await listEmployees(viewer)
  const areas = areaOptions(everyone)
  const filters = parseReportFilters(raw, areas, today)
  const employees = filterByArea(everyone, filters.area)
  const result = await compute(def, viewer, employees, filters, today)
  return { ok: true, def, filters, areas, people: employees.length, today, result }
}

/** For the Reports home: how complete the records behind the reports are. */
export async function loadCoverage(viewer: PeopleViewer): Promise<{ people: number; coverage: CoverageItem[] }> {
  const employees = await listEmployees(viewer)
  return { people: employees.length, coverage: buildCoverage(employees) }
}

async function compute(def: ReportDef, viewer: PeopleViewer, employees: Employee[], filters: ReportFilters, today: string): Promise<ReportResult> {
  switch (def.id) {
    case 'workforce': return buildWorkforce(employees, today)
    case 'movement': return buildMovement(employees, today)
    case 'turnover': return buildTurnover(employees, today, await loadLeavingReasons(viewer, leaversInLastYear(employees, today)))
    case 'tenure': return buildTenure(employees, today)
    case 'leave': return loadLeave(viewer, employees, filters.year, today)
    case 'compliance': return loadCompliance(viewer, employees)
    case 'reviews': return loadReviews(viewer, employees, today)
  }
}

// ---- Turnover ----------------------------------------------------------------

/** Leaving reasons live in the HR-only private record, so they are read only for viewers with private.view. */
type ReasonRow = { employee_id: string; leaving_reason: string | null }

async function loadLeavingReasons(viewer: PeopleViewer, leavers: Employee[]): Promise<LeavingReasons> {
  if (!can(viewer, 'private.view')) return null
  const ids = leavers.filter(e => canOnEmployee(viewer, 'private.view', e)).map(e => e.id)
  const admin = createAdminClient()
  // Only the reason is selected: the PPS number and the rest of the private record are never read here.
  const { data, error } = await fetchByIds<ReasonRow>(ids, chunk =>
    admin.from('hr_employee_private').select('employee_id, leaving_reason').in('employee_id', chunk).returns<ReasonRow[]>()
  )
  if (error) {
    console.error('report: leaving reasons failed', error.message)
    throw new Error('Could not load leaving reasons')
  }
  return new Map(data.map(row => [row.employee_id, row.leaving_reason]))
}

// ---- Leave -------------------------------------------------------------------

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * HR reads a table once, page by page. Anyone else asks only for the people in
 * their scope, so a manager's query never pulls the whole company's rows.
 */
async function readScoped<T extends { employee_id: string }>(
  viewer: PeopleViewer, people: readonly Employee[], what: string,
  page: (employeeIds: string[] | null, from: number, to: number) => Page<T>,
): Promise<T[]> {
  const keep = new Set(people.map(e => e.id))
  const { data, error } = isHr(viewer)
    ? await fetchAllPages<T>((from, to) => page(null, from, to))
    : await fetchByIds<T>([...keep], chunk => fetchAllPages<T>((from, to) => page(chunk, from, to)))
  if (error) {
    console.error(`report: ${what} failed`, error.message)
    throw new Error(`Could not load ${what}`)
  }
  return data.filter(row => keep.has(row.employee_id))
}

async function loadLeave(viewer: PeopleViewer, employees: Employee[], year: number, today: string): Promise<ReportResult> {
  const admin = createAdminClient()
  const people = employees.filter(e => canOnEmployee(viewer, 'leave.view', e))
  const horizon = addDays(today, UPCOMING_LEAVE_DAYS)

  // Only the columns the sums need: reasons and decision notes are never read.
  const [types, requests, upcoming] = await Promise.all([
    listLeaveTypes(),
    readScoped<LeaveRow>(viewer, people, 'leave', (ids, from, to) => {
      let query = admin.from('hr_leave_requests').select('employee_id, leave_type_id, start_date, days')
        .eq('status', 'approved').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
      if (ids) query = query.in('employee_id', ids)
      return query.order('start_date').order('id').range(from, to).returns<LeaveRow[]>()
    }),
    readScoped<UpcomingLeaveRow>(viewer, people, 'upcoming leave', (ids, from, to) => {
      let query = admin.from('hr_leave_requests').select('employee_id, leave_type_id, start_date, end_date, days, status')
        .in('status', ['approved', 'pending']).gte('end_date', today).lte('start_date', horizon)
      if (ids) query = query.in('employee_id', ids)
      return query.order('start_date').order('id').range(from, to).returns<UpcomingLeaveRow[]>()
    }),
  ])

  return buildLeave({ employees: people, types, requests, upcoming, year, today, seesCategories: isHr(viewer) })
}

// ---- Compliance and reviews ---------------------------------------------------

async function loadCompliance(viewer: PeopleViewer, employees: Employee[]): Promise<ReportResult> {
  const current = employees.filter(e => e.employment_status !== 'leaver' && canOnEmployee(viewer, 'documents.view', e))
  // One pass for everybody (two query sets in total), which also gives the per-type breakdown.
  return buildCompliance(current, await getComplianceItems(current))
}

async function loadReviews(viewer: PeopleViewer, employees: Employee[], today: string): Promise<ReportResult> {
  const inReport = new Set(employees.map(e => e.id))
  const reviews = (await listUpcomingReviews(viewer, REVIEW_HORIZON_DAYS))
    .filter(r => inReport.has(r.employee_id) && canOnEmployee(viewer, 'reviews.view', r.employee))
  return buildReviews(reviews, today)
}

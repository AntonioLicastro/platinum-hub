import type { Capability } from './access'
import type { AreaOption } from './report-core'
import type { ReportFilters, ReportId } from './report-types'

// The list of reports, and how the page and the CSV route read their filters
// from the query string. Pure: the capability names are only data here, and
// report-load.ts is what actually checks them against the signed-in viewer.

export type ReportDef = {
  id: ReportId
  title: string
  summary: string
  /** Needed on top of reports.view. */
  requires: Capability
  /** Whether the report has a year filter. */
  hasYear: boolean
}

export const REPORTS: readonly ReportDef[] = [
  {
    id: 'workforce', title: 'Workforce', requires: 'employees.view', hasYear: false,
    summary: 'Headcount now by area, job title, employment type and status, and how it has changed over 24 months.',
  },
  {
    id: 'movement', title: 'Starters and leavers', requires: 'employees.view', hasYear: false,
    summary: 'Who joined and who left, month by month over the last year.',
  },
  {
    id: 'turnover', title: 'Turnover', requires: 'employees.view', hasYear: false,
    summary: 'Rolling 12-month turnover by area, and how long leavers stayed.',
  },
  {
    id: 'tenure', title: 'Tenure', requires: 'employees.view', hasYear: false,
    summary: 'How long current staff have been here, from under three months to five years or more.',
  },
  {
    id: 'leave', title: 'Leave and absence', requires: 'leave.view', hasYear: true,
    summary: 'Days taken by leave type and by month, plus who is away in the coming weeks.',
  },
  {
    id: 'compliance', title: 'Compliance', requires: 'documents.view', hasYear: false,
    summary: 'Valid, expiring, expired and missing documents for each required document type.',
  },
  {
    id: 'reviews', title: 'Reviews', requires: 'reviews.view', hasYear: false,
    summary: 'Overdue and upcoming probation reviews, appraisals and supervisions by type.',
  },
]

export type RawParams = Record<string, string | string[] | undefined>

export const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

export function findReport(id: string | undefined): ReportDef | null {
  return REPORTS.find(r => r.id === id) ?? null
}

/**
 * Filters from the query string. An area the viewer was not offered is ignored
 * (it falls back to everyone in their scope), and so is an unusable year.
 */
export function parseReportFilters(raw: RawParams, areas: readonly AreaOption[], today: string): ReportFilters {
  const area = firstParam(raw.area) ?? ''
  const year = Number.parseInt(firstParam(raw.year) ?? '', 10)
  return {
    area: areas.some(a => a.value === area) ? area : '',
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(today.slice(0, 4)),
  }
}

/** The years offered in the year filter: a few back, one ahead, and whatever is selected. */
export function yearOptions(today: string, selected: number): number[] {
  const current = Number(today.slice(0, 4))
  const years = new Set([selected, ...Array.from({ length: 6 }, (_, i) => current + 1 - i)])
  return [...years].sort((a, b) => b - a)
}

/** `report=…&area=…&year=…`, carrying only the filters this report uses. */
export function reportQuery(def: Pick<ReportDef, 'id' | 'hasYear'>, filters: ReportFilters): string {
  const query = new URLSearchParams({ report: def.id })
  if (filters.area) query.set('area', filters.area)
  if (def.hasYear) query.set('year', String(filters.year))
  return query.toString()
}

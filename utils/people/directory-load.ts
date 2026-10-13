import { can, type PeopleViewer } from './access'
import { getComplianceSummary, listDocumentTypes, type ComplianceSummary } from './compliance-data'
import { applyDirectoryFilters, countByStatus, type DirectoryFilters } from './directory-query'
import { listEmployees } from './employees-data'
import type { Employee, EmploymentStatus } from './types'

/**
 * Whether the "compliance issues only" filter can be offered and applied:
 *  - `unavailable`: the viewer cannot see documents, or no required document types are set up yet;
 *  - `ready`: required documents are configured;
 *  - `failed`: they could not be read, so the filter is ignored rather than guessed at.
 */
type ComplianceFilterState = 'unavailable' | 'ready' | 'failed'

type DirectoryData = {
  /** Everyone the viewer may see, before any filter. */
  all: Employee[]
  filtered: Employee[]
  statusCounts: Record<EmploymentStatus, number>
  compliance: ComplianceFilterState
}

/**
 * The one place the Directory page and the CSV export load and filter people, so
 * the file always matches the screen. Rows come from listEmployees(), which is
 * already limited to the viewer's scope.
 */
export async function loadDirectory(viewer: PeopleViewer, filters: DirectoryFilters): Promise<DirectoryData> {
  const all = await listEmployees(viewer)

  let compliance: ComplianceFilterState = 'unavailable'
  let summaries: Map<string, ComplianceSummary> | undefined
  if (can(viewer, 'documents.view')) {
    try {
      const types = await listDocumentTypes()
      if (types.some(t => t.active && t.mandatory)) {
        compliance = 'ready'
        if (filters.complianceIssues) {
          // Only people who could still match need their documents loaded; leavers are exempt from the rules.
          const candidates = applyDirectoryFilters(all, { ...filters, status: 'all' }).filter(e => e.employment_status !== 'leaver')
          summaries = await getComplianceSummary(candidates)
        }
      }
    } catch (err) {
      console.error('directory compliance filter failed', err)
      compliance = 'failed'
      summaries = undefined
    }
  }

  const extras = { compliance: summaries }
  return {
    all,
    filtered: applyDirectoryFilters(all, filters, extras),
    statusCounts: countByStatus(all, filters, extras),
    compliance,
  }
}

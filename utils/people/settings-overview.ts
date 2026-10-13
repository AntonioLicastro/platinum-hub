import { createAdminClient, withRetry } from './db'

// Live counts for the Settings overview. Callers decide which counts the viewer
// may see (access.manage, audit.view) and pass the flags in; a count that
// can't be read comes back as null so the page shows a dash instead of failing.

export type OverviewCounts = {
  employees: number | null
  accessRows: number | null
  managerRows: number | null
  documentTypes: number | null
  mandatoryDocumentTypes: number | null
  leaveTypes: number | null
  entitlementsThisYear: number | null
  holidaysThisYear: number | null
  holidaysNextYear: number | null
  checklistTemplates: number | null
  auditLastWeek: number | null
}

type CountResult = { count: number | null; error: { message: string } | null }

async function countOf(label: string, run: () => PromiseLike<CountResult>): Promise<number | null> {
  const { count, error } = await withRetry(run)
  if (error) {
    console.error(`settings overview: ${label} count failed`, error.message)
    return null
  }
  return count ?? 0
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function loadOverviewCounts(opts: {
  year: number
  includeAccess: boolean
  includeAudit: boolean
}): Promise<OverviewCounts> {
  const admin = createAdminClient()
  const { year } = opts
  const head = { count: 'exact', head: true } as const
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString()

  const [
    employees, accessRows, managerRows, documentTypes, mandatoryDocumentTypes, leaveTypes,
    entitlementsThisYear, holidaysThisYear, holidaysNextYear, checklistTemplates, auditLastWeek,
  ] = await Promise.all([
    countOf('employees', () => admin.from('hr_employees').select('id', head)),
    opts.includeAccess ? countOf('access', () => admin.from('hr_access').select('email', head)) : null,
    countOf('manager access', () => admin.from('hr_access').select('email', head).eq('role', 'manager')),
    countOf('document types', () => admin.from('hr_document_types').select('id', head)),
    countOf('mandatory document types', () =>
      admin.from('hr_document_types').select('id', head).eq('mandatory', true).eq('active', true)),
    countOf('leave types', () => admin.from('hr_leave_types').select('id', head)),
    countOf('entitlements', () => admin.from('hr_leave_entitlements').select('id', head).eq('year', year)),
    countOf('holidays this year', () =>
      admin.from('hr_public_holidays').select('holiday_date', head).gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`)),
    countOf('holidays next year', () =>
      admin.from('hr_public_holidays').select('holiday_date', head).gte('holiday_date', `${year + 1}-01-01`).lte('holiday_date', `${year + 1}-12-31`)),
    countOf('checklist templates', () => admin.from('hr_checklist_templates').select('id', head)),
    opts.includeAudit ? countOf('audit log', () => admin.from('hr_audit_log').select('id', head).gte('at', weekAgo)) : null,
  ])

  return {
    employees, accessRows, managerRows, documentTypes, mandatoryDocumentTypes, leaveTypes,
    entitlementsThisYear, holidaysThisYear, holidaysNextYear, checklistTemplates, auditLastWeek,
  }
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ChartColumn, Download } from 'lucide-react'
import { can, isHr, requireCapability } from '@/utils/people/access'
import { firstParam, reportQuery, yearOptions } from '@/utils/people/report-catalog'
import { loadCoverage, reportsFor, runReport } from '@/utils/people/report-load'
import { plural } from '@/utils/people/report-format'
import { buttonClass, PageHeader } from '../_components/ui'
import { FilterBar } from './_components/filter-bar'
import { REPORT_ICONS } from './_components/report-icons'
import { ReportNav } from './_components/report-nav'
import { ReportView } from './_components/report-view'
import { ReportsHome } from './_components/reports-home'

export const metadata: Metadata = { title: 'Reports · HR Locker' }

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireCapability('reports.view')
  const raw = await searchParams
  const reports = reportsFor(viewer)
  const canAddEmployees = can(viewer, 'employees.edit')
  const scope = isHr(viewer) ? 'across Platinum Home Care' : 'in your areas and direct reports'

  if (!firstParam(raw.report)) {
    const { people, coverage } = await loadCoverage(viewer)
    return (
      <>
        <PageHeader
          title="Reports"
          icon={ChartColumn}
          subtitle={`Headcount, turnover, leave and compliance ${scope}. Each report downloads as a CSV.`}
        />
        <ReportsHome reports={reports} people={people} coverage={coverage} canAddEmployees={canAddEmployees} />
      </>
    )
  }

  const run = await runReport(viewer, raw)
  // An unknown report, or one this viewer's role does not cover, goes back to the list.
  if (!run.ok) redirect('/reports')
  const { def, filters, areas, people, result, today } = run

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Reports', href: '/reports' }, { label: def.title }]}
        title={def.title}
        icon={REPORT_ICONS[def.id]}
        subtitle={def.summary}
        actions={!result.empty && (
          <a href={`/api/report?${reportQuery(def, filters)}`} className={buttonClass('secondary')}>
            <Download size={16} aria-hidden="true" /> Download CSV
          </a>
        )}
      />
      <ReportNav reports={reports} current={def.id} filters={filters} />
      <FilterBar def={def} filters={filters} areas={areas} years={yearOptions(today, filters.year)} />
      <p className="mb-5 text-sm text-slate-500">
        Based on {plural(people, 'person', 'people')} {scope}{filters.area ? ' who match the area filter' : ''}.
      </p>
      <ReportView result={result} links={{ canAddEmployees, canEditDocumentTypes: can(viewer, 'settings.manage') }} />
    </>
  )
}

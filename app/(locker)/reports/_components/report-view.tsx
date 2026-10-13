import Link from 'next/link'
import { Info } from 'lucide-react'
import type { ReportId, ReportResult } from '@/utils/people/report-types'
import { buttonClass, EmptyState, Stat } from '../../_components/ui'
import { Chart, isNarrowChart } from './charts'
import { DataTable } from './data-table'
import { REPORT_ICONS, STAT_ICONS } from './report-icons'

type Links = { canAddEmployees: boolean; canEditDocumentTypes: boolean }

/** Where to go to fill in whatever an empty report is waiting for. */
function EmptyAction({ id, links }: { id: ReportId; links: Links }) {
  switch (id) {
    case 'leave':
      return <Link href="/leave" className={buttonClass('primary')}>Open leave</Link>
    case 'compliance':
      return links.canEditDocumentTypes
        ? <Link href="/settings/document-types" className={buttonClass('primary')}>Set up required documents</Link>
        : <Link href="/documents" className={buttonClass('primary')}>Open compliance</Link>
    default:
      return (
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/directory" className={buttonClass('primary')}>Open the directory</Link>
          {links.canAddEmployees && <Link href="/employees/new" className={buttonClass('secondary')}>Add an employee</Link>}
        </div>
      )
  }
}

export function ReportView({ result, links }: { result: ReportResult; links: Links }) {
  if (result.empty) {
    return <EmptyState icon={REPORT_ICONS[result.id]} title={result.empty.title} body={result.empty.body} action={<EmptyAction id={result.id} links={links} />} />
  }

  const wide = result.charts.filter(c => !isNarrowChart(c))
  const narrow = result.charts.filter(isNarrowChart)

  return (
    <div className="space-y-8">
      {result.notices.length > 0 && (
        <div role="note" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
          <ul className="space-y-1">
            {result.notices.map(notice => <li key={notice}>{notice}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.stats.map(stat => (
          <Stat key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} tone={stat.tone} icon={STAT_ICONS[stat.icon]} />
        ))}
      </div>

      {wide.map(spec => <Chart key={spec.title} spec={spec} />)}
      {narrow.length > 0 && (
        <div className={`grid gap-6 ${narrow.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {narrow.map(spec => <Chart key={spec.title} spec={spec} />)}
        </div>
      )}

      {result.tables.map(table => <DataTable key={table.id} table={table} />)}

      <details className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        <summary className="cursor-pointer font-medium text-slate-800">How this is calculated</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          {result.method.map(line => <li key={line}>{line}</li>)}
        </ul>
      </details>
    </div>
  )
}

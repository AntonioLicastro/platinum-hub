import Link from 'next/link'
import { ArrowRight, ChartColumn } from 'lucide-react'
import type { ReportDef } from '@/utils/people/report-catalog'
import type { CoverageItem } from '@/utils/people/report-calc'
import { percentOf } from '@/utils/people/report-core'
import { formatNumber } from '@/utils/people/report-format'
import { buttonClass, Card, CardHeader, EmptyState, ProgressBar } from '../../_components/ui'
import { REPORT_ICONS } from './report-icons'

type Props = {
  reports: ReportDef[]
  people: number
  coverage: CoverageItem[]
  canAddEmployees: boolean
}

export function ReportsHome({ reports, people, coverage, canAddEmployees }: Props) {
  if (people === 0) {
    return (
      <EmptyState
        icon={ChartColumn}
        title="Reports fill in as employee records and start dates are added"
        body="There is no one to report on yet. Once people are in the directory with their start dates, areas and job titles, headcount, turnover, leave and compliance appear here without any set-up."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/directory" className={buttonClass('primary')}>Open the directory</Link>
            {canAddEmployees && <Link href="/employees/new" className={buttonClass('secondary')}>Add an employee</Link>}
          </div>
        }
      />
    )
  }

  const hasCurrentStaff = coverage.some(item => item.total > 0)

  return (
    <div className="space-y-8">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(report => {
          const Icon = REPORT_ICONS[report.id]
          return (
            <li key={report.id}>
              <Link
                href={`/reports?report=${report.id}`}
                className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-[#323398]/30 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
              >
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#323398]/10 text-[#323398]">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="text-base font-semibold text-slate-900">{report.title}</span>
                <span className="mt-1 flex-1 text-sm text-slate-500">{report.summary}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#323398]">
                  Open report <ArrowRight size={15} aria-hidden="true" className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      {hasCurrentStaff && (
        <Card>
          <CardHeader
            title="How complete are the records?"
            description="Reports are only as good as the records behind them. These fields feed the most reports: fill in the gaps and the numbers sharpen."
          />
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {coverage.map(item => {
              const percent = percentOf(item.filled, item.total) ?? 0
              return (
                <li key={item.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <span className="tabular-nums text-slate-500">{formatNumber(item.filled)} of {formatNumber(item.total)}</span>
                  </div>
                  <ProgressBar
                    value={percent}
                    tone={percent === 100 ? 'green' : percent >= 60 ? 'blue' : 'amber'}
                    label={`${item.label} recorded for ${percent}% of current staff`}
                  />
                  <p className="mt-1.5 text-xs text-slate-500">{item.reports}</p>
                </li>
              )
            })}
          </ul>
          {coverage.some(item => item.filled < item.total) && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <Link href="/directory" className={buttonClass('secondary', 'sm')}>Open the directory to fill in the gaps</Link>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

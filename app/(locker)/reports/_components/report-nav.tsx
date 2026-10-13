import Link from 'next/link'
import { reportQuery, type ReportDef } from '@/utils/people/report-catalog'
import type { ReportFilters, ReportId } from '@/utils/people/report-types'
import { REPORT_ICONS } from './report-icons'

/** One pill per report the viewer can open; the area filter follows them from report to report. */
export function ReportNav({ reports, current, filters }: { reports: ReportDef[]; current: ReportId; filters: ReportFilters }) {
  return (
    <nav aria-label="Reports" className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-2">
        {reports.map(report => {
          const Icon = REPORT_ICONS[report.id]
          const active = report.id === current
          return (
            <li key={report.id}>
              <Link
                href={`/reports?${reportQuery(report, filters)}`}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
                  active
                    ? 'border-[#323398] bg-[#323398] text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-[#323398]/40 hover:text-[#323398]'
                }`}
              >
                <Icon size={15} aria-hidden="true" /> {report.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

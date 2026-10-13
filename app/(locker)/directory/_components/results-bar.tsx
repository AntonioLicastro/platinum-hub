import Link from 'next/link'
import { LayoutGrid, Table2, type LucideIcon } from 'lucide-react'
import { EMPLOYMENT_STATUSES } from '@/utils/people/constants'
import {
  DIRECTORY_VIEWS, directoryHref, type DirectoryFilters, type DirectoryView,
} from '@/utils/people/directory-query'
import type { EmploymentStatus } from '@/utils/people/types'
import { Badge } from '../../_components/ui'

const VIEW_META: Record<DirectoryView, { label: string; icon: LucideIcon }> = {
  cards: { label: 'Cards', icon: LayoutGrid },
  table: { label: 'Table', icon: Table2 },
}

function ViewToggle({ filters }: { filters: DirectoryFilters }) {
  return (
    <nav aria-label="Directory layout" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {DIRECTORY_VIEWS.map(view => {
        const { label, icon: Icon } = VIEW_META[view]
        const active = filters.view === view
        return (
          <Link
            key={view}
            href={directoryHref(filters, { view })}
            aria-current={active ? 'true' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
              active ? 'bg-[#323398] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Result count, headcount chips (each a quick status filter) and the cards/table switch. */
export function ResultsBar({ filters, total, statusCounts }: {
  filters: DirectoryFilters
  total: number
  statusCounts: Record<EmploymentStatus, number>
}) {
  const current = EMPLOYMENT_STATUSES.filter(s => s.value !== 'leaver').reduce((sum, s) => sum + statusCounts[s.value], 0)
  const chips = EMPLOYMENT_STATUSES.filter(s => statusCounts[s.value] > 0 || filters.status === s.value)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-slate-600">
          <span className="text-lg font-semibold tabular-nums text-slate-900">{total}</span>{' '}
          {total === 1 ? 'person' : 'people'}
        </p>
        <ViewToggle filters={filters} />
      </div>

      <nav aria-label="Headcount by status" className="flex flex-wrap gap-2">
        <Link
          href={directoryHref(filters, { status: 'current' })}
          aria-current={filters.status === 'current' ? 'true' : undefined}
          className={`inline-flex rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
            filters.status === 'current' ? 'ring-2 ring-[#323398] ring-offset-2' : 'opacity-90 hover:opacity-100'
          }`}
        >
          <Badge tone="blue">Current staff <span className="font-semibold tabular-nums">{current}</span></Badge>
        </Link>
        {chips.map(s => (
          <Link
            key={s.value}
            href={directoryHref(filters, { status: s.value })}
            aria-current={filters.status === s.value ? 'true' : undefined}
            className={`inline-flex rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
              filters.status === s.value ? 'ring-2 ring-[#323398] ring-offset-2' : 'opacity-90 hover:opacity-100'
            }`}
          >
            <Badge tone={s.tone} dot>{s.label} <span className="font-semibold tabular-nums">{statusCounts[s.value]}</span></Badge>
          </Link>
        ))}
      </nav>
    </div>
  )
}

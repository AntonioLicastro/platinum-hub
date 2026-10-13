import Link from 'next/link'
import type { BreakdownRow } from '@/utils/people/dashboard-metrics'
import { BAR_COLOUR, OTHER_COLOUR, UNRECORDED_FILL } from './palette'

const FILLS: Record<BreakdownRow['kind'], string> = {
  value: BAR_COLOUR,
  other: OTHER_COLOUR,
  unrecorded: UNRECORDED_FILL,
}

const rowClass =
  '-mx-2 block rounded-lg px-2 py-1.5 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15'

/**
 * Horizontal bars, biggest first. Label and count sit above each bar so long
 * names never get cut off on a phone; the bar only shows relative size.
 */
export function BarList({ label, rows, total, hrefFor }: {
  label: string
  rows: BreakdownRow[]
  total: number
  hrefFor: (row: BreakdownRow) => string | undefined
}) {
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <ul aria-label={label} className="space-y-1">
      {rows.map(row => {
        const href = hrefFor(row)
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 break-words text-sm ${row.kind === 'value' ? 'text-slate-700' : 'italic text-slate-500'}`}>{row.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {row.count}<span className="sr-only"> people</span>
                <span className="ml-1.5 text-xs font-normal text-slate-500">{Math.round((row.count / total) * 100)}%</span>
              </span>
            </span>
            <span className="mt-1.5 block h-2.5 w-full rounded-full bg-slate-100" aria-hidden="true">
              <span
                className="block h-full rounded-l-sm rounded-r-md"
                style={{ width: `${(row.count / max) * 100}%`, background: FILLS[row.kind] }}
              />
            </span>
          </>
        )
        return (
          <li key={`${row.kind}-${row.label}`}>
            {href
              ? <Link href={href} className={`${rowClass} hover:bg-slate-50`}>{body}</Link>
              : <div className={rowClass}>{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}

import type { SplitSegment } from '@/utils/people/dashboard-metrics'
import { UNRECORDED_FILL } from './palette'

/**
 * One stacked bar with its legend. The legend prints every label, count and share
 * in the same order as the bar, so a reader never has to match colours to know
 * which segment is which. Segments with no colour (not recorded) are hatched.
 */
export function SplitBar({ title, segments, colours }: {
  title: string
  segments: SplitSegment[]
  colours: Record<string, string>
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0)
  const fillOf = (key: string) => colours[key] ?? UNRECORDED_FILL
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
        <span className="text-xs tabular-nums text-slate-500">{total} {total === 1 ? 'person' : 'people'}</span>
      </div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
        {segments.map(s => (
          <span key={s.key} className="h-full min-w-1.5" style={{ flex: `${s.count} 1 0`, background: fillOf(s.key) }} />
        ))}
      </div>
      <ul aria-label={title} className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {segments.map(s => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: fillOf(s.key) }} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-slate-700">{s.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{s.count}</span>
            <span className="w-9 text-right text-xs tabular-nums text-slate-500">{Math.round((s.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

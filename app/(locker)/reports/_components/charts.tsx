import type { Tone } from '@/utils/people/constants'
import { formatNumber } from '@/utils/people/report-format'
import type { ChartSpec } from '@/utils/people/report-types'

// Hand-written charts: CSS for bars and columns, one SVG for the line. No chart
// library and nothing loaded from elsewhere, so they work under the app's CSP.
// Each chart has a text alternative (the figures are also in the table under
// it), so the drawing itself is hidden from screen readers.

type Spec<K extends ChartSpec['kind']> = Extract<ChartSpec, { kind: K }>

const FILL: Record<Tone, string> = {
  blue: 'bg-[#323398]', green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-500',
  purple: 'bg-violet-500', sky: 'bg-sky-400', pink: 'bg-pink-500', gray: 'bg-slate-300',
}

/** Round steps (1, 2, 2.5, 5, 10 and their multiples) giving at most five bands, whole numbers when the data is all whole. */
function axisScale(max: number, whole: boolean): { top: number; ticks: number[] } {
  const base = 10 ** Math.floor(Math.log10(Math.max(max, 1) / 5))
  let step = [1, 2, 2.5, 5, 10].map(m => m * base).find(candidate => max / candidate <= 5) ?? base * 10
  if (whole) step = Math.max(1, Math.ceil(step))
  const bands = Math.max(2, Math.ceil(max / step - 1e-9))
  return { top: step * bands, ticks: Array.from({ length: bands + 1 }, (_, i) => Number((step * i).toFixed(6))) }
}

function ChartFrame({ spec, children }: { spec: ChartSpec; children: React.ReactNode }) {
  return (
    <figure className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <figcaption className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{spec.title}</h2>
        {spec.description && <p className="mt-0.5 text-sm text-slate-500">{spec.description}</p>}
      </figcaption>
      {children}
    </figure>
  )
}

function Key({ items }: { items: { name: string; tone: Tone }[] }) {
  return (
    <ul aria-label="Key" className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(item => (
        <li key={item.name} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${FILL[item.tone]}`} />
          {item.name}
        </li>
      ))}
    </ul>
  )
}

/** Horizontal gridlines with their value labels, shared by the line and column charts. */
function Grid({ ticks, top }: { ticks: number[]; top: number }) {
  return (
    <>
      {ticks.map(tick => (
        <div key={tick} className="absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${(tick / top) * 100}%` }}>
          <span className="absolute -left-9 w-7 -translate-y-1/2 text-right text-[11px] tabular-nums text-slate-500">{formatNumber(tick)}</span>
        </div>
      ))}
    </>
  )
}

function BarsChart({ spec }: { spec: Spec<'bars'> }) {
  const max = Math.max(0, ...spec.items.map(item => item.value))
  return (
    <ChartFrame spec={spec}>
      <ul className="space-y-3.5">
        {spec.items.map(item => {
          const width = max > 0 && item.value > 0 ? Math.max(1.5, (item.value / max) * 100) : 0
          return (
            <li key={item.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-700" title={item.label}>{item.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {item.display ?? formatNumber(item.value)}
                  {item.note && <span className="ml-1.5 text-xs font-normal text-slate-500">{item.note}</span>}
                </span>
              </div>
              <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${item.color ? '' : FILL[item.tone ?? 'blue']}`}
                  style={{ width: `${width}%`, backgroundColor: item.color }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </ChartFrame>
  )
}

function ColumnsChart({ spec }: { spec: Spec<'columns'> }) {
  const values = spec.series.flatMap(s => s.values)
  const { top, ticks } = axisScale(Math.max(0, ...values), values.every(Number.isInteger))
  const showValues = spec.series.length === 1 && spec.categories.length <= 12
  return (
    <ChartFrame spec={spec}>
      {spec.series.length > 1 && <Key items={spec.series} />}
      <div role="img" aria-label={`${spec.title}. The same figures are in the table below.`}>
        <div aria-hidden="true">
          <div className="relative ml-9 mt-5 h-48">
            <Grid ticks={ticks} top={top} />
            <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
              {spec.categories.map((category, i) => (
                <div key={category} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
                  {spec.series.map(s => {
                    const value = s.values[i] ?? 0
                    return (
                      <div
                        key={s.name}
                        className={`flex h-full w-full flex-col items-center justify-end ${spec.series.length === 1 ? 'max-w-12' : 'max-w-7'}`}
                        title={`${category}, ${s.name}: ${formatNumber(value)}`}
                      >
                        {showValues && value > 0 && <span className="mb-0.5 text-[10px] font-medium tabular-nums text-slate-600">{formatNumber(value)}</span>}
                        <div className={`w-full rounded-t-md ${FILL[s.tone]}`} style={{ height: `${(value / top) * 100}%`, minHeight: value > 0 ? 2 : 0 }} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="ml-9 mt-2 flex gap-1 sm:gap-2">
            {spec.categories.map(category => (
              <span key={category} className="min-w-0 flex-1 break-words text-center text-[10px] leading-tight text-slate-500 sm:text-xs">{category}</span>
            ))}
          </div>
        </div>
      </div>
    </ChartFrame>
  )
}

function LineChart({ spec }: { spec: Spec<'line'> }) {
  const { points } = spec
  const values = points.map(p => p.value)
  const { top, ticks } = axisScale(Math.max(0, ...values), values.every(Number.isInteger))
  const count = points.length
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * 100 : 50)
  const y = (value: number) => 100 - (value / top) * 100
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
  const every = Math.ceil(count / 6)
  const first = points[0]
  const last = points[count - 1]
  const summary = `${spec.title}. ${first.label}: ${formatNumber(first.value)}. ${last.label}: ${formatNumber(last.value)}. Highest ${formatNumber(Math.max(...values))}, lowest ${formatNumber(Math.min(...values))}. The same figures are in the table below.`

  return (
    <ChartFrame spec={spec}>
      <div role="img" aria-label={summary}>
        <div aria-hidden="true">
          <div className="relative ml-9 mr-4 mt-5 h-52">
            <Grid ticks={ticks} top={top} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <path d={`${path} L100,100 L0,100 Z`} fill="#323398" fillOpacity="0.08" />
              <path d={path} fill="none" stroke="#323398" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {points.map((p, i) => (
              <span
                key={p.label}
                title={`${p.label}: ${formatNumber(p.value)}`}
                className={`absolute -translate-x-1/2 translate-y-1/2 rounded-full bg-[#323398] ring-2 ring-white ${i === count - 1 ? 'h-3 w-3' : 'h-1.5 w-1.5'}`}
                style={{ left: `${x(i)}%`, bottom: `${100 - y(p.value)}%` }}
              />
            ))}
            <span
              className="absolute -translate-x-1/2 -translate-y-full pb-2 text-xs font-semibold tabular-nums text-[#323398]"
              style={{ left: `${x(count - 1)}%`, bottom: `${100 - y(last.value)}%` }}
            >
              {formatNumber(last.value)}
            </span>
          </div>
          <div className="relative ml-9 mr-4 mt-3 h-4">
            {points.map((p, i) => (count - 1 - i) % every === 0 && (
              <span key={p.label} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-500" style={{ left: `${x(i)}%` }}>{p.label}</span>
            ))}
          </div>
        </div>
      </div>
    </ChartFrame>
  )
}

function StackedChart({ spec }: { spec: Spec<'stacked'> }) {
  return (
    <ChartFrame spec={spec}>
      <Key items={spec.segments} />
      <ul className="mt-5 space-y-4">
        {spec.rows.map(row => {
          const total = row.values.reduce((sum, v) => sum + v, 0)
          const summary = spec.segments.map((s, i) => `${row.values[i]} ${s.name.toLowerCase()}`).join(', ')
          return (
            <li key={row.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-700" title={row.label}>{row.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatNumber(total)} in total</span>
              </div>
              <div role="img" aria-label={`${row.label}: ${summary}`} className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {spec.segments.map((s, i) => row.values[i] > 0 && (
                  <div key={s.name} className={FILL[s.tone]} style={{ width: `${(row.values[i] / total) * 100}%` }} title={`${s.name}: ${formatNumber(row.values[i])}`} />
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </ChartFrame>
  )
}

export function Chart({ spec }: { spec: ChartSpec }) {
  switch (spec.kind) {
    case 'bars': return <BarsChart spec={spec} />
    case 'columns': return <ColumnsChart spec={spec} />
    case 'line': return <LineChart spec={spec} />
    case 'stacked': return <StackedChart spec={spec} />
  }
}

/** Bars sit two to a row; everything else needs the full width. */
export const isNarrowChart = (spec: ChartSpec): boolean => spec.kind === 'bars'

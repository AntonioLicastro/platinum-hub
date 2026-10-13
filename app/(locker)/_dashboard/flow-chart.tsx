import { plural, type Flow, type MonthFlow } from '@/utils/people/dashboard-metrics'
import { parseIsoDate } from '@/utils/people/format'
import { tableClass, tdClass, thClass } from '../_components/ui'
import { LEAVERS_COLOUR, STARTERS_COLOUR } from './palette'

const monthFormat = (key: string, options: Intl.DateTimeFormatOptions) =>
  parseIsoDate(`${key}-01`).toLocaleDateString('en-IE', { ...options, timeZone: 'UTC' })

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

const SERIES = [
  { key: 'starters', label: 'Starters', colour: STARTERS_COLOUR },
  { key: 'leavers', label: 'Leavers', colour: LEAVERS_COLOUR },
] as const

type Series = (typeof SERIES)[number]['key']

/** Index of the first month holding the series' highest value, or -1 when the series is all zeros. */
function peakIndex(months: MonthFlow[], series: Series): number {
  const peak = Math.max(...months.map(m => m[series]))
  return peak === 0 ? -1 : months.findIndex(m => m[series] === peak)
}

/**
 * Paired columns, one pair per month: starters (by start date) beside leavers
 * (by end date). Only each series' highest month carries a number; the table
 * under the chart has every value.
 */
export function FlowChart({ flow }: { flow: Flow }) {
  const { months } = flow
  const peak = Math.max(...months.flatMap(m => [m.starters, m.leavers]))
  // A multiple of 4 keeps the three axis ticks whole numbers.
  const top = Math.max(4, Math.ceil(peak / 4) * 4)
  const ticks = [top, top / 2, 0]
  const peaks: Record<Series, number> = { starters: peakIndex(months, 'starters'), leavers: peakIndex(months, 'leavers') }
  const net = flow.starters - flow.leavers
  const summary =
    `${flow.starters} ${plural(flow.starters, 'starter', 'starters')} and ${flow.leavers} ${plural(flow.leavers, 'leaver', 'leavers')} ` +
    `in the last 12 months, a net change of ${signed(net)}.`

  return (
    <figure aria-label="Starters and leavers by month for the last 12 months" className="m-0">
      <figcaption className="sr-only">{summary} The table below the chart lists every month.</figcaption>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-2" aria-hidden="true">
        <ul className="flex items-center gap-4">
          {SERIES.map(s => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colour }} /> {s.label}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          <span className="font-semibold tabular-nums text-slate-900">{flow.starters}</span> in,{' '}
          <span className="font-semibold tabular-nums text-slate-900">{flow.leavers}</span> out,{' '}
          <span className="font-semibold tabular-nums text-slate-900">{signed(net)}</span> net
        </p>
      </div>

      <div className="flex gap-2" aria-hidden="true">
        <div className="relative mt-5 h-40 w-5 shrink-0 text-[10px] tabular-nums text-slate-500">
          {ticks.map(t => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative mt-5 h-40">
            {ticks.map(t => (
              <span
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? 'border-slate-300' : 'border-slate-100'}`}
                style={{ top: `${100 - (t / top) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 grid grid-cols-12 gap-1">
              {months.map((m, i) => (
                <div
                  key={m.key}
                  className="flex h-full items-end justify-center gap-0.5"
                  title={`${monthFormat(m.key, { month: 'long', year: 'numeric' })}: ${m.starters} ${plural(m.starters, 'starter', 'starters')}, ${m.leavers} ${plural(m.leavers, 'leaver', 'leavers')}`}
                >
                  {SERIES.map(s => (
                    <span key={s.key} className="flex h-full max-w-4 flex-1 items-end">
                      <span className="relative block w-full rounded-t-[4px]" style={{ height: `${(m[s.key] / top) * 100}%`, background: s.colour }}>
                        {peaks[s.key] === i && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-slate-700">{m[s.key]}</span>
                        )}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-12 gap-1 text-center text-[10px] text-slate-500 sm:text-xs">
            {months.map((m, i) => (
              <span key={m.key} className={i === months.length - 1 ? 'font-semibold text-slate-900' : undefined}>
                {monthFormat(m.key, { month: 'short' })}
                {(i === 0 || m.key.endsWith('-01')) && <span className="block text-[9px] text-slate-500">&rsquo;{m.key.slice(2, 4)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {flow.missingStartDates > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {flow.missingStartDates} current {plural(flow.missingStartDates, 'employee has', 'employees have')} no start date recorded, so they are not counted as starters.
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer rounded text-sm font-medium text-[#323398] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15">
          View as a table
        </summary>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80">
          <table className={tableClass}>
            <caption className="sr-only">Starters and leavers per month</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={thClass}>Month</th>
                <th scope="col" className={`${thClass} text-right`}>Starters</th>
                <th scope="col" className={`${thClass} text-right`}>Leavers</th>
                <th scope="col" className={`${thClass} text-right`}>Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {months.map(m => (
                <tr key={m.key}>
                  <th scope="row" className={`${tdClass} font-medium text-slate-900`}>{monthFormat(m.key, { month: 'long', year: 'numeric' })}</th>
                  <td className={`${tdClass} text-right tabular-nums`}>{m.starters}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{m.leavers}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{signed(m.starters - m.leavers)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <th scope="row" className={tdClass}>Total</th>
                <td className={`${tdClass} text-right tabular-nums`}>{flow.starters}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{flow.leavers}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{signed(net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </figure>
  )
}

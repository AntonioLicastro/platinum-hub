import { formatDayMonth, parseIsoDate } from '@/utils/people/format'
import { monthWeeks } from '@/utils/people/leave-calc'
import type { YearEntry } from '@/utils/people/leave-year'
import { Card } from '../../_components/ui'
import { PersonChip } from './year-chip'

const WEEKDAYS = [
  ['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'], ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday'], ['S', 'Sunday'],
]

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0])

const entryDetail = (e: YearEntry) =>
  [e.typeName, e.half ? 'half day' : null, e.pending ? 'waiting for approval' : null].filter(Boolean).join(', ')

/** "Tue 13 Oct: Aoife M, Niamh K on leave" - for screen readers; names also come from the people panel. */
function dayLabel(iso: string, entries: YearEntry[], holiday: string | undefined): string | undefined {
  const date = formatDayMonth(iso).replace(',', '')
  const away = entries.filter(e => !e.pending).map(e => e.person.label)
  const waiting = entries.filter(e => e.pending).map(e => e.person.label)
  const parts = [
    away.length > 0 ? `${list(away)} on leave` : null,
    waiting.length > 0 ? `${list(waiting)} waiting for approval` : null,
  ].filter(Boolean)
  const heading = holiday ? `${date} (${holiday})` : date
  return parts.length > 0 ? `${heading}: ${parts.join('; ')}` : holiday ? heading : undefined
}

export default function YearMonth({ year, month, byDay, holidays, today }: {
  year: number
  month: number
  byDay: Map<string, YearEntry[]>
  holidays: Map<string, string>
  today: string
}) {
  const key = `${year}-${String(month).padStart(2, '0')}`
  const name = parseIsoDate(`${key}-01`).toLocaleDateString('en-IE', { month: 'long', timeZone: 'UTC' })

  return (
    <Card padded={false} className="@container break-inside-avoid p-1.5">
      <table className="w-full table-fixed border-collapse">
        <caption className="px-1 pb-1.5 text-left text-sm font-semibold text-slate-900">{name}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, full], i) => (
              <th key={i} scope="col" className="pb-1 text-center text-[10px] font-semibold text-slate-600">
                <span aria-hidden="true">{short}</span>
                <span className="sr-only">{full}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(key).map((week, w) => (
            <tr key={w}>
              {week.map((iso, i) => {
                if (!iso) return <td key={i} className="border border-slate-100" />
                const entries = byDay.get(iso) ?? []
                const holiday = holidays.get(iso)
                const isToday = iso === today
                const tooltip = [
                  holiday ? `${holiday} (public holiday)` : null,
                  ...entries.map(e => `${e.person.name} - ${entryDetail(e)}`),
                ].filter(Boolean).join('\n')
                return (
                  <td
                    key={iso}
                    aria-label={dayLabel(iso, entries, holiday)}
                    aria-current={isToday ? 'date' : undefined}
                    title={tooltip || undefined}
                    className={`h-9 border border-slate-200 p-0 align-top ${holiday ? 'bg-emerald-50' : i >= 5 ? 'bg-slate-100' : 'bg-white'}`}
                  >
                    <span
                      className={`mb-px ml-px flex h-4 min-w-4 items-center justify-center text-[11px] leading-none text-slate-600 ${
                        isToday ? 'w-fit rounded-full bg-[#323398] px-1 font-bold text-white' : holiday ? 'w-fit font-semibold underline decoration-emerald-600 decoration-dotted underline-offset-2' : 'w-fit'
                      }`}
                    >
                      {Number(iso.slice(8))}
                    </span>
                    {entries.length > 0 && (
                      <ul className="flex flex-wrap gap-px pb-px">
                        {entries.map(e => (
                          <li key={e.person.id}>
                            <PersonChip person={e.person} size="calendar" pending={e.pending} half={e.half} detail={entryDetail(e)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

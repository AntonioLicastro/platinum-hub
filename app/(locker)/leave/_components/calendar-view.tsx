import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PeopleViewer } from '@/utils/people/access'
import { addDays, displayName, formatDate, formatDays, todayIso } from '@/utils/people/format'
import { formatLeaveRange, leaveShowsOn, monthLabel, monthRange, monthWeeks, shiftMonth } from '@/utils/people/leave-calc'
import {
  employeesInScope, listLeaveBetween, listPublicHolidays, type LeaveRequestWithContext,
} from '@/utils/people/leave-data'
import { Avatar, buttonClass, Card, CardHeader, EmptyState, inputClass } from '../../_components/ui'
import { chipStyle, shortName, StatusBadge, TypeChip } from './leave-ui'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3

function Swatch({ pending }: { pending: boolean }) {
  return <span aria-hidden="true" className="inline-block h-3 w-6 rounded-sm" style={chipStyle('#323398', pending)} />
}

export default async function CalendarView({ viewer, month, area }: { viewer: PeopleViewer; month: string; area: string | null }) {
  const { first, last } = monthRange(month)
  const today = todayIso()
  const [employees, leave, holidays] = await Promise.all([
    employeesInScope(viewer),
    listLeaveBetween(viewer, first, last, ['approved', 'pending']),
    listPublicHolidays(first, last),
  ])

  const areas = [...new Set(employees.map(e => e.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b))
  const activeArea = area && areas.includes(area) ? area : null
  const visible = activeArea ? leave.filter(r => r.employee.area === activeArea) : leave

  const holidayName = new Map(holidays.map(h => [h.holiday_date, h.name]))
  const holidayDates = new Set(holidayName.keys())
  const byDay = new Map<string, LeaveRequestWithContext[]>()
  for (const request of visible) {
    const from = request.start_date > first ? request.start_date : first
    const to = request.end_date < last ? request.end_date : last
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!leaveShowsOn(request, day, holidayDates)) continue
      const list = byDay.get(day)
      if (list) list.push(request)
      else byDay.set(day, [request])
    }
  }
  // Approved leave first, so a crowded day keeps the firm bookings visible.
  for (const list of byDay.values()) {
    list.sort((a, b) => Number(a.status === 'pending') - Number(b.status === 'pending') || a.employee.last_name.localeCompare(b.employee.last_name))
  }

  const href = (m: string) => {
    const params = new URLSearchParams({ view: 'calendar', month: m })
    if (activeArea) params.set('area', activeArea)
    return `/leave?${params}`
  }
  const label = monthLabel(month)
  const weeks = monthWeeks(month)

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link href={href(shiftMonth(month, -1))} className={buttonClass('secondary', 'sm')} aria-label="Previous month"><ChevronLeft size={16} /></Link>
            <h2 className="min-w-40 px-3 text-center text-base font-semibold text-slate-900" aria-live="polite">{label}</h2>
            <Link href={href(shiftMonth(month, 1))} className={buttonClass('secondary', 'sm')} aria-label="Next month"><ChevronRight size={16} /></Link>
            {month !== today.slice(0, 7) && (
              <Link href={href(today.slice(0, 7))} className={`${buttonClass('ghost', 'sm')} ml-1`}>Today</Link>
            )}
          </div>
          {areas.length > 0 && (
            <form method="get" action="/leave" className="flex items-center gap-2">
              <input type="hidden" name="view" value="calendar" />
              <input type="hidden" name="month" value={month} />
              <label htmlFor="calendar-area" className="sr-only">Area</label>
              <select id="calendar-area" name="area" defaultValue={activeArea ?? ''} className={`${inputClass} w-auto! py-1.5!`}>
                <option value="">All areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button type="submit" className={buttonClass('secondary', 'sm')}>Filter</button>
            </form>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-2"><Swatch pending={false} /> Approved</span>
          <span className="inline-flex items-center gap-2"><Swatch pending /> Waiting for approval</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" /> Public holiday</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#323398]" /> Today</span>
        </div>
      </Card>

      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">Who is away in {label}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map((d, i) => (
                  <th key={d} scope="col" className={`border-b border-slate-200 px-2 py-2.5 text-xs font-semibold uppercase tracking-wide ${i >= 5 ? 'bg-slate-50 text-slate-400' : 'text-slate-500'}`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((iso, i) => {
                    if (!iso) return <td key={i} className="h-28 border border-slate-100 bg-slate-50/60" />
                    const entries = byDay.get(iso) ?? []
                    const holiday = holidayName.get(iso)
                    const isToday = iso === today
                    const shaded = holiday ? 'bg-emerald-50/70' : i >= 5 ? 'bg-slate-50/80' : 'bg-white'
                    return (
                      <td key={iso} className={`h-28 border border-slate-100 p-1.5 align-top ${shaded}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span
                            aria-current={isToday ? 'date' : undefined}
                            className={isToday
                              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[#323398] text-xs font-semibold text-white'
                              : `px-1 text-xs font-medium ${i >= 5 ? 'text-slate-400' : 'text-slate-600'}`}
                          >
                            <span className="sr-only">{formatDate(iso)}</span>
                            <span aria-hidden="true">{Number(iso.slice(8))}</span>
                          </span>
                          {holiday && <span className="truncate text-[10px] font-medium text-emerald-700" title={holiday}>{holiday}</span>}
                        </div>
                        {entries.length > 0 && (
                          <ul className="mt-1 space-y-1">
                            {entries.slice(0, MAX_CHIPS).map(r => (
                              <li key={r.id} className="truncate rounded px-1.5 py-0.5 text-[11px] leading-tight text-slate-800" style={chipStyle(r.type.color, r.status === 'pending')}>
                                <span className="sr-only">{displayName(r.employee)}, {r.type.name}, {r.status === 'pending' ? 'waiting for approval' : 'approved'}</span>
                                <span aria-hidden="true">{shortName(r.employee)}</span>
                              </li>
                            ))}
                            {entries.length > MAX_CHIPS && (
                              <li className="px-1 text-[11px] font-medium text-slate-500">+{entries.length - MAX_CHIPS} more</li>
                            )}
                          </ul>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section aria-labelledby="month-list-heading">
        <Card>
          <CardHeader
            icon={CalendarDays}
            title={<span id="month-list-heading">Leave in {label}</span>}
            description={activeArea ? `Showing ${activeArea} only` : undefined}
          />
          {visible.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={`Nobody is away in ${label}`}
              body="Approved and waiting leave shows up here and on the calendar as soon as it is booked."
              action={<Link href="/leave/request" className={buttonClass('primary', 'sm')}>Request leave</Link>}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map(r => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={displayName(r.employee)} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{displayName(r.employee)}</p>
                      <p className="truncate text-xs text-slate-500">{formatLeaveRange(r.start_date, r.end_date)} · {formatDays(r.days)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <TypeChip type={r.type} />
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}

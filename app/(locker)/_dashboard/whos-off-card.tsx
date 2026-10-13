import Link from 'next/link'
import { CalendarDays, Palmtree, TriangleAlert } from 'lucide-react'
import type { Section } from '@/utils/people/dashboard-data'
import { employeeHref, type OffDay, type OffEntry } from '@/utils/people/dashboard-metrics'
import { formatDate, formatDayMonth, relativeDays } from '@/utils/people/format'
import { Avatar, Badge, Card, CardHeader } from '../_components/ui'

const ENTRIES_PER_DAY = 6
const CALENDAR_HREF = '/leave?view=calendar'

// Leave type colours are editable in Settings, so only a plain hex value reaches a style attribute.
const safeColour = (colour: string) => (/^#[0-9a-f]{6}$/i.test(colour) ? colour : '#64748b')

function Entry({ entry }: { entry: OffEntry }) {
  return (
    <li>
      <Link
        href={employeeHref(entry.employeeId, 'leave')}
        className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15"
      >
        <Avatar name={entry.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{entry.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: safeColour(entry.color) }} aria-hidden="true" />
              {entry.typeName}
            </span>
            {entry.until && <span>until {formatDayMonth(entry.until)}</span>}
          </span>
        </span>
        {entry.halfDay && <Badge tone="gray">Half day</Badge>}
      </Link>
    </li>
  )
}

function Day({ day, today }: { day: OffDay; today: boolean }) {
  const shown = day.entries.slice(0, ENTRIES_PER_DAY)
  const rest = day.entries.length - shown.length
  return (
    <section aria-label={today ? 'Today' : formatDayMonth(day.date)} className="py-3 first:pt-0 last:pb-0">
      <div className="mb-1 flex flex-wrap items-center gap-2 px-2">
        <h3 className="text-sm font-semibold text-slate-900">{today ? 'Today' : formatDayMonth(day.date)}</h3>
        <span className="text-xs text-slate-500">{today ? formatDate(day.date) : relativeDays(day.date)}</span>
        {day.holiday && <Badge tone="sky">{day.holiday}</Badge>}
        {day.entries.length > 0 && <span className="ml-auto text-xs font-medium tabular-nums text-slate-500">{day.entries.length} off</span>}
      </div>
      {day.entries.length > 0 ? (
        <ul>{shown.map(entry => <Entry key={entry.requestId} entry={entry} />)}</ul>
      ) : today ? (
        <p className="px-2 text-sm text-slate-500">{day.holiday ? 'A public holiday, so no leave is shown.' : 'Nobody is on approved leave today.'}</p>
      ) : null}
      {rest > 0 && (
        <p className="px-2 pt-1 text-xs text-slate-500">
          and {rest} more, <Link href={CALENDAR_HREF} className="font-medium text-[#323398] hover:underline">see the calendar</Link>
        </p>
      )}
    </section>
  )
}

export function WhosOffCard({ section }: { section: Section<OffDay[]> }) {
  if (section.status === 'hidden') return null

  const header = (
    <CardHeader
      icon={Palmtree}
      title="Who's off"
      description="Approved leave today and over the next 7 days"
      actions={(
        <Link href={CALENDAR_HREF} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#323398] hover:underline">
          <CalendarDays size={14} aria-hidden="true" /> Calendar
        </Link>
      )}
    />
  )

  if (section.status === 'error') {
    return (
      <Card>
        {header}
        <p role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          We couldn&apos;t load the leave calendar just now, so we can&apos;t say who is off. Try refreshing the page.
        </p>
      </Card>
    )
  }

  const [today, ...ahead] = section.data
  const upcoming = ahead.filter(day => day.entries.length > 0 || day.holiday)
  const anyoneAhead = ahead.some(day => day.entries.length > 0)

  return (
    <Card>
      {header}
      <div className="divide-y divide-slate-100">
        <Day day={today} today />
        {upcoming.map(day => <Day key={day.date} day={day} today={false} />)}
      </div>
      {!anyoneAhead && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
          No approved leave is booked over the next 7 days. New requests appear here once they are approved.
        </p>
      )}
    </Card>
  )
}

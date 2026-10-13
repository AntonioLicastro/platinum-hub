import type { ReactNode } from 'react'
import Link from 'next/link'
import { PartyPopper } from 'lucide-react'
import { employeeHref, plural, type Milestones, type Starter } from '@/utils/people/dashboard-metrics'
import { displayName, formatDayMonth, parseIsoDate } from '@/utils/people/format'
import { Avatar, Badge, Card, CardHeader } from '../_components/ui'

const PER_LIST = 6

function Person({ item, children }: { item: Starter; children: ReactNode }) {
  const name = displayName(item.employee)
  return (
    <li>
      <Link
        href={employeeHref(item.employee.id)}
        className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15"
      >
        <Avatar name={name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
          <span className="block truncate text-xs text-slate-500">{children}</span>
        </span>
      </Link>
    </li>
  )
}

function List({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 px-2 text-sm font-semibold text-slate-900">
        {title}
        {count > 0 && <Badge tone="gray">{count}</Badge>}
      </h3>
      {count > 0 ? (
        <ul>{children}</ul>
      ) : (
        <p className="px-2 text-sm italic text-slate-500">{empty}</p>
      )}
      {count > PER_LIST && <p className="px-2 pt-1 text-xs text-slate-500">and {count - PER_LIST} more this month</p>}
    </div>
  )
}

export function MilestonesCard({ milestones, today, missingStartDates, wide }: {
  milestones: Milestones
  today: string
  missingStartDates: number
  /** True when the card has the whole row, so the two lists sit side by side. */
  wide: boolean
}) {
  const month = parseIsoDate(today).toLocaleDateString('en-IE', { month: 'long', timeZone: 'UTC' })
  const { anniversaries, starters } = milestones

  return (
    <Card className={wide ? 'lg:col-span-2' : ''}>
      <CardHeader icon={PartyPopper} title="Milestones" description={`Work anniversaries and new starters in ${month}`} />
      <div className={`grid grid-cols-1 gap-6 ${wide ? 'md:grid-cols-2' : ''}`}>
        <List title="Work anniversaries" count={anniversaries.length} empty={`No work anniversaries in ${month}`}>
          {anniversaries.slice(0, PER_LIST).map(a => (
            <Person key={a.employee.id} item={a}>
              {a.years} {plural(a.years, 'year', 'years')} on {formatDayMonth(a.date)}
              {a.date === today && ' (today)'}
            </Person>
          ))}
        </List>
        <List title="New starters" count={starters.length} empty={`No new starters in ${month}`}>
          {starters.slice(0, PER_LIST).map(s => (
            <Person key={s.employee.id} item={s}>
              {s.date > today ? 'Starts' : 'Started'} {formatDayMonth(s.date)}
              {s.employee.job_title ? ` · ${s.employee.job_title}` : ''}
            </Person>
          ))}
        </List>
      </div>
      {missingStartDates > 0 && (
        <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {missingStartDates} current {plural(missingStartDates, 'employee has', 'employees have')} no start date recorded, so can&apos;t appear here.
        </p>
      )}
    </Card>
  )
}

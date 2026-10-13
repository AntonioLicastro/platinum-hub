import Link from 'next/link'
import { ArrowRight, CalendarClock, FileWarning, Users } from 'lucide-react'
import { can, type PeopleViewer } from '@/utils/people/access'
import { EMPLOYMENT_STATUSES } from '@/utils/people/constants'
import { daysBetween, displayName, todayIso } from '@/utils/people/format'
import type { Loaded, MyTeam } from '@/utils/people/me-data'
import { dublinDay, pluralise } from '@/utils/people/me-format'
import type { Employee } from '@/utils/people/types'
import { Avatar, Badge, Card, CardHeader, Stat } from '../../_components/ui'
import { Unavailable } from './unavailable'

const SHOWN = 6

// Amber and worded: a grey dash alone could be read as "zero".
const UNAVAILABLE_HINT = <span className="font-medium text-amber-800">We couldn&apos;t load this just now.</span>

export function TeamCard({ team, viewer }: { team: Loaded<MyTeam>; viewer: PeopleViewer }) {
  return (
    <Card>
      <CardHeader
        icon={Users}
        title="My team"
        description={
          viewer.role === 'manager'
            ? 'The people you manage, and what needs you'
            : 'Your direct reports, and what needs you'
        }
      />
      {team.ok ? <TeamBody team={team.data} viewer={viewer} /> : <Unavailable what="your team" />}
    </Card>
  )
}

function TeamBody({ team, viewer }: { team: MyTeam; viewer: PeopleViewer }) {
  const directoryHref = can(viewer, 'employees.view') ? `/directory?manager=${encodeURIComponent(viewer.email)}` : null
  const hidden = team.reports.length - SHOWN

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LeaveStat pending={team.pendingLeave} href={can(viewer, 'leave.view') ? '/leave?view=requests' : undefined} />
        <AlertsStat alerts={team.alerts} href={can(viewer, 'documents.view') ? '/documents?view=alerts' : undefined} />
      </div>

      {team.areas.length > 0 && (
        <section aria-labelledby="me-areas-heading" className="mt-6">
          <h3 id="me-areas-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Areas you manage</h3>
          <ul className="flex flex-wrap gap-2">
            {team.areas.map(({ area, headcount }) => (
              <li key={area} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm">
                <span className="font-medium text-slate-900">{area}</span>
                <span className="text-slate-500"> · {headcount} {pluralise(headcount, 'person', 'people')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="me-reports-heading" className="mt-6">
        <h3 id="me-reports-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          People who report to you{team.reports.length > 0 && ` (${team.reports.length})`}
        </h3>
        {team.reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
            <span className="block font-medium text-slate-700">Nobody reports to you yet</span>
            People appear here when HR names you as their line manager.
          </p>
        ) : (
          <ul className="-mx-2 divide-y divide-slate-100">
            {team.reports.slice(0, SHOWN).map(person => <ReportRow key={person.id} person={person} />)}
          </ul>
        )}
        {hidden > 0 && directoryHref && (
          <Link
            href={directoryHref}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#323398] hover:underline focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20"
          >
            See all {team.reports.length} in the directory <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </section>
    </>
  )
}

function ReportRow({ person }: { person: Employee }) {
  const status = EMPLOYMENT_STATUSES.find(s => s.value === person.employment_status)
  const detail = [person.job_title, person.area].filter(Boolean).join(' · ')
  return (
    <li>
      <Link
        href={`/employees/${person.id}`}
        prefetch={false}
        className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        <Avatar name={displayName(person)} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{displayName(person)}</span>
          <span className="block truncate text-xs text-slate-500">{detail || 'Job title and area not recorded yet'}</span>
        </span>
        {person.employment_status !== 'active' && <Badge tone={status?.tone ?? 'gray'}>{status?.label ?? person.employment_status}</Badge>}
      </Link>
    </li>
  )
}

function LeaveStat({ pending, href }: { pending: MyTeam['pendingLeave']; href?: string }) {
  if (!pending.ok) {
    return <Stat label="Leave awaiting your approval" value="–" hint={UNAVAILABLE_HINT} icon={CalendarClock} tone="amber" href={href} />
  }
  const { count, oldestRequestedAt } = pending.data
  let hint = 'Nothing is waiting. You are all caught up.'
  if (count > 0 && oldestRequestedAt) {
    const days = daysBetween(todayIso(), dublinDay(oldestRequestedAt))
    hint = days <= 0 ? 'The oldest request came in today.' : `The oldest has been waiting ${days} ${pluralise(days, 'day')}.`
  }
  return <Stat label="Leave awaiting your approval" value={count} hint={hint} icon={CalendarClock} tone={count > 0 ? 'amber' : 'green'} href={href} />
}

function AlertsStat({ alerts, href }: { alerts: MyTeam['alerts']; href?: string }) {
  if (!alerts.ok) {
    return <Stat label="Document alerts in your team" value="–" hint={UNAVAILABLE_HINT} icon={FileWarning} tone="amber" href={href} />
  }
  const { expired, expiring, missing } = alerts.data
  const total = expired + expiring + missing
  const parts = [
    ...(expired > 0 ? [`${expired} expired`] : []),
    ...(expiring > 0 ? [`${expiring} running out soon`] : []),
    ...(missing > 0 ? [`${missing} missing`] : []),
  ]
  return (
    <Stat
      label="Document alerts in your team"
      value={total}
      hint={parts.length > 0 ? parts.join(' · ') : 'Nothing needs chasing right now.'}
      icon={FileWarning}
      tone={expired > 0 ? 'red' : total > 0 ? 'amber' : 'green'}
      href={href}
    />
  )
}

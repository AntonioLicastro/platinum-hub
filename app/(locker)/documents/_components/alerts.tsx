import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock3, type LucideIcon } from 'lucide-react'
import type { DocumentAlert } from '@/utils/people/compliance-data'
import { relativeSpan } from '@/utils/people/documents-meta'
import { daysBetween, displayName, formatDate } from '@/utils/people/format'
import { Avatar, Badge, Card, EmptyState, buttonClass } from '../../_components/ui'

// Long lists stay readable and fast; the matrix shows everyone if this isn't enough.
const MAX_ROWS = 200

const profileHref = (alert: DocumentAlert) => `/employees/${alert.employee.id}?tab=documents`

function Person({ alert }: { alert: DocumentAlert }) {
  const name = displayName(alert.employee)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="truncate text-xs text-slate-500">{alert.employee.job_title ?? 'No job title recorded'}</p>
      </div>
    </div>
  )
}

function OpenLink({ alert }: { alert: DocumentAlert }) {
  return (
    <Link
      href={profileHref(alert)}
      prefetch={false}
      aria-label={`Open ${displayName(alert.employee)}'s documents`}
      className={buttonClass('ghost', 'sm')}
    >
      Open <ArrowRight size={14} />
    </Link>
  )
}

function Group({ title, count, icon: Icon, tone, action, children }: {
  title: string
  count: number
  icon: LucideIcon
  tone: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><Icon size={16} /></span>
          {title}
          <Badge tone="gray">{count}</Badge>
        </h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

const rowClass = 'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3'

function DatedRows({ alerts, verb }: { alerts: DocumentAlert[]; verb: 'Expired' | 'Expires' }) {
  return (
    <ul className="divide-y divide-slate-100">
      {alerts.slice(0, MAX_ROWS).map(alert => (
        <li key={`${alert.employee.id}-${alert.documentType.id}`} className={rowClass}>
          <div className="w-full min-w-0 sm:w-64"><Person alert={alert} /></div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-slate-800">{alert.documentType.name}</p>
            {alert.expiresOn && (
              <p className="text-slate-500">
                {verb} {formatDate(alert.expiresOn)} <span className="text-slate-400">({relativeSpan(daysBetween(alert.expiresOn))})</span>
              </p>
            )}
          </div>
          <OpenLink alert={alert} />
        </li>
      ))}
      {alerts.length > MAX_ROWS && (
        <li className="px-5 py-3 text-xs text-slate-500">Showing the first {MAX_ROWS} of {alerts.length}. The matrix lists everyone.</li>
      )}
    </ul>
  )
}

/** Missing documents, one row per person so a new starter with nothing on file is one line, not nine. */
function MissingRows({ alerts }: { alerts: DocumentAlert[] }) {
  const byPerson = new Map<string, DocumentAlert[]>()
  for (const alert of alerts) {
    const list = byPerson.get(alert.employee.id)
    if (list) list.push(alert)
    else byPerson.set(alert.employee.id, [alert])
  }
  const people = [...byPerson.values()]
  return (
    <ul className="divide-y divide-slate-100">
      {people.slice(0, MAX_ROWS).map(list => (
        <li key={list[0].employee.id} className={rowClass}>
          <div className="w-full min-w-0 sm:w-64"><Person alert={list[0]} /></div>
          <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Missing documents">
            {list.map(alert => (
              <li key={alert.documentType.id}>
                <Badge tone="gray">{alert.documentType.name}{alert.document ? ' (rejected)' : ''}</Badge>
              </li>
            ))}
          </ul>
          <OpenLink alert={list[0]} />
        </li>
      ))}
      {people.length > MAX_ROWS && (
        <li className="px-5 py-3 text-xs text-slate-500">Showing the first {MAX_ROWS} of {people.length} people. The matrix lists everyone.</li>
      )}
    </ul>
  )
}

export function AlertsView({ alerts, windowDays, windows, hrefForWindow }: {
  alerts: DocumentAlert[]
  windowDays: number
  windows: readonly number[]
  hrefForWindow: (days: number) => string
}) {
  const expired = alerts.filter(a => a.state === 'expired')
  const expiring = alerts.filter(a => a.state === 'expiring')
  const missing = alerts.filter(a => a.state === 'missing')

  if (alerts.length === 0) {
    return (
      <div className="space-y-4">
        <WindowPicker windowDays={windowDays} windows={windows} hrefForWindow={hrefForWindow} />
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs attention"
          body={`No documents are expired, none expire in the next ${windowDays} days, and nothing required is missing. Everyone is up to date.`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Group title="Expired" count={expired.length} icon={AlertTriangle} tone="bg-red-50 text-red-600">
        {expired.length > 0
          ? <DatedRows alerts={expired} verb="Expired" />
          : <p className="px-5 py-6 text-sm text-slate-500">No expired documents.</p>}
      </Group>
      <Group
        title="Expiring soon"
        count={expiring.length}
        icon={Clock3}
        tone="bg-amber-50 text-amber-600"
        action={<WindowPicker windowDays={windowDays} windows={windows} hrefForWindow={hrefForWindow} />}
      >
        {expiring.length > 0
          ? <DatedRows alerts={expiring} verb="Expires" />
          : <p className="px-5 py-6 text-sm text-slate-500">No expiring documents. Nothing runs out in the next {windowDays} days.</p>}
      </Group>
      <Group title="Missing" count={missing.length} icon={CircleDashed} tone="bg-slate-100 text-slate-500">
        {missing.length > 0
          ? <MissingRows alerts={missing} />
          : <p className="px-5 py-6 text-sm text-slate-500">Nothing required is missing.</p>}
      </Group>
    </div>
  )
}

function WindowPicker({ windowDays, windows, hrefForWindow }: {
  windowDays: number
  windows: readonly number[]
  hrefForWindow: (days: number) => string
}) {
  return (
    <nav aria-label="Expiring soon window" className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
      {windows.map(days => (
        <Link
          key={days}
          href={hrefForWindow(days)}
          prefetch={false}
          aria-current={days === windowDays ? 'true' : undefined}
          className={`rounded-lg px-3 py-1.5 transition ${days === windowDays ? 'bg-white text-[#323398] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {days} days
        </Link>
      ))}
    </nav>
  )
}

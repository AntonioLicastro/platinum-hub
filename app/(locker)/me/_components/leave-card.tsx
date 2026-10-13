import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, CalendarPlus, Palmtree } from 'lucide-react'
import { formatDays, relativeDays, todayIso } from '@/utils/people/format'
import { formatLeaveRange, halfDayNote } from '@/utils/people/leave-calc'
import type { LeaveBalance } from '@/utils/people/leave-data'
import type { LeaveEntry, Loaded, MyLeave } from '@/utils/people/me-data'
import { pluralise } from '@/utils/people/me-format'
import { Badge, buttonClass, Card, CardHeader, NotRecorded, ProgressBar } from '../../_components/ui'
import { StatusBadge, TypeChip } from '../../leave/_components/leave-ui'
import { Unavailable } from './unavailable'

const SHOWN = 3

export function LeaveCard({ leave, employeeId, canRequest }: { leave: Loaded<MyLeave>; employeeId: string; canRequest: boolean }) {
  const requestLink = canRequest && (
    <Link href="/leave/request" className={buttonClass('primary')}>
      <CalendarPlus size={16} aria-hidden="true" /> Request leave
    </Link>
  )

  return (
    <Card>
      <CardHeader
        icon={Palmtree}
        title="My leave"
        description={leave.ok ? `Your allowance and time off for ${leave.data.year}` : undefined}
        actions={requestLink || undefined}
      />
      {leave.ok ? <LeaveBody leave={leave.data} employeeId={employeeId} /> : <Unavailable what="your leave" />}
    </Card>
  )
}

function LeaveBody({ leave, employeeId }: { leave: MyLeave; employeeId: string }) {
  const today = todayIso()
  const nothingBooked = leave.upcoming.length === 0 && leave.pending.length === 0

  return (
    <div className="space-y-5">
      {leave.balances.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
          <span className="block font-medium text-slate-700">No leave allowance set up yet</span>
          Your annual leave appears here once HR has recorded your allowance for {leave.year}.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {leave.balances.map(balance => <BalanceTile key={balance.type.id} balance={balance} year={leave.year} />)}
        </ul>
      )}

      {leave.upcoming.length > 0 && (
        <EntryList heading="Coming up" entries={leave.upcoming} headingId="me-leave-upcoming" employeeId={employeeId}
          trailing={({ request }) => (
            request.start_date <= today
              ? <Badge tone="green" dot>On leave now</Badge>
              : <span className="text-xs font-medium text-slate-500">Starts {relativeDays(request.start_date)}</span>
          )}
        />
      )}

      {leave.pending.length > 0 && (
        <EntryList heading="Waiting for approval" entries={leave.pending} headingId="me-leave-pending" employeeId={employeeId}
          trailing={({ request }) => <StatusBadge status={request.status} />}
        />
      )}

      {nothingBooked && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center">
          <p className="text-sm font-medium text-slate-700">No leave booked or waiting</p>
          <p className="mt-1 text-sm text-slate-500">When you ask for time off, it shows up here.</p>
        </div>
      )}

      <Link
        href={`/employees/${employeeId}?tab=leave`}
        prefetch={false}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#323398] hover:underline focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        See my leave history, or cancel a request <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}

function BalanceTile({ balance, year }: { balance: LeaveBalance; year: number }) {
  const total = balance.entitlement + balance.carriedOver
  const used = balance.taken + balance.pending
  const over = balance.remaining < 0
  const facts = [
    `${formatDays(balance.taken)} taken`,
    ...(balance.pending > 0 ? [`${formatDays(balance.pending)} waiting for approval`] : []),
    ...(balance.carriedOver > 0 ? [`${formatDays(balance.carriedOver)} carried over`] : []),
  ]

  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <TypeChip type={balance.type} />
      {balance.entitlementSource === 'none' ? (
        <div className="mt-3">
          <NotRecorded label="No allowance recorded yet" />
          <p className="mt-1 text-xs text-slate-500">HR will add your {balance.type.name.toLowerCase()} allowance for {year}.</p>
        </div>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-3xl font-semibold tabular-nums ${over ? 'text-red-600' : 'text-slate-900'}`}>{balance.remaining}</span>
            <span className="text-sm text-slate-500">{pluralise(Math.abs(balance.remaining), 'day')} left</span>
          </p>
          {total > 0 && (
            <div className="mt-3">
              <ProgressBar value={(used / total) * 100} tone={over ? 'red' : 'green'} label={`${balance.type.name} used`} />
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">{facts.join(' · ')}</p>
        </>
      )}
    </li>
  )
}

function EntryList({ heading, headingId, entries, employeeId, trailing }: {
  heading: string
  headingId: string
  entries: LeaveEntry[]
  employeeId: string
  trailing: (entry: LeaveEntry) => ReactNode
}) {
  const hidden = entries.length - SHOWN
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</h3>
      <ul className="space-y-2">
        {entries.slice(0, SHOWN).map(entry => {
          const { request, type } = entry
          const note = halfDayNote(request.start_date, request.end_date, request.start_half_day, request.end_half_day)
          return (
            <li key={request.id} className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <TypeChip type={type} />
                {trailing(entry)}
              </div>
              <p className="mt-1.5 text-sm text-slate-700">
                {formatLeaveRange(request.start_date, request.end_date)}
                <span aria-hidden="true" className="text-slate-300"> · </span>
                <span className="whitespace-nowrap">{formatDays(request.days)}</span>
              </p>
              {note && <p className="text-xs text-slate-500">{note}</p>}
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          and {hidden} more.{' '}
          <Link href={`/employees/${employeeId}?tab=leave`} prefetch={false} className="font-medium text-[#323398] hover:underline">
            See them all
          </Link>
        </p>
      )}
    </section>
  )
}

import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarClock, CalendarDays, CheckCircle2, Clock, Hourglass, TriangleAlert, UserCheck } from 'lucide-react'
import { can, type PeopleViewer } from '@/utils/people/access'
import { emailNameMap } from '@/utils/people/employees-data'
import {
  addDays, displayName, formatDateTime, formatDays, relativeDays, todayIso,
} from '@/utils/people/format'
import { formatLeaveRange, halfDayNote, leaveShowsOn, rangesOverlap } from '@/utils/people/leave-calc'
import {
  canCancelLeave, employeesInScope, listApprovedLeaveBetween, listLeaveBetween, listLeaveForEmployee, listLeaveTypes,
  listPendingLeaveFor, listPublicHolidays, listRecentlyDecidedLeave, type LeaveRequestWithContext,
} from '@/utils/people/leave-data'
import { ActionButton } from '../../_components/action-form'
import { Avatar, Badge, Card, CardHeader, EmptyState, NotRecorded, Stat } from '../../_components/ui'
import { cancelLeave } from '../actions'
import { DecisionActions } from './decision-actions'
import { shortName, StatusBadge, TypeChip } from './leave-ui'

const RECENT_DAYS = 30
const RECENT_LIMIT = 15

/** Colleagues in the same area or under the same manager who are already off while this request runs. */
function overlapsFor(request: LeaveRequestWithContext, approved: LeaveRequestWithContext[]): LeaveRequestWithContext[] {
  const { employee } = request
  return approved.filter(other => {
    if (other.employee.id === employee.id) return false
    if (!rangesOverlap(request.start_date, request.end_date, other.start_date, other.end_date)) return false
    const sameArea = employee.area !== null && other.employee.area === employee.area
    const sameManager = employee.manager_email !== null && other.employee.manager_email === employee.manager_email
    return sameArea || sameManager
  })
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

export default async function RequestsView({ viewer }: { viewer: PeopleViewer }) {
  const today = todayIso()
  const weekAhead = addDays(today, 7)
  const since = `${addDays(today, -RECENT_DAYS)}T00:00:00Z`

  const [pending, decided, soon, holidays, types, employees, ownPending] = await Promise.all([
    listPendingLeaveFor(viewer),
    listRecentlyDecidedLeave(viewer, since, RECENT_LIMIT),
    listApprovedLeaveBetween(viewer, today, weekAhead),
    listPublicHolidays(today, weekAhead),
    listLeaveTypes(),
    employeesInScope(viewer),
    viewer.employeeId ? listLeaveForEmployee(viewer.employeeId, ['pending']) : Promise.resolve([]),
  ])
  pending.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.requested_at.localeCompare(b.requested_at))

  const holidayDates = new Set(holidays.map(h => h.holiday_date))
  const awayToday = new Set(soon.filter(r => leaveShowsOn(r, today, holidayDates)).map(r => r.employee.id)).size
  const startingSoon = new Set(soon.filter(r => r.start_date > today).map(r => r.employee.id)).size

  const overlapPool = pending.length > 0
    ? await listLeaveBetween(
        viewer,
        pending.reduce((min, r) => (r.start_date < min ? r.start_date : min), pending[0].start_date),
        pending.reduce((max, r) => (r.end_date > max ? r.end_date : max), pending[0].end_date),
        ['approved'],
      )
    : []
  const decidedBy = await emailNameMap(decided.map(d => d.decided_by))

  const me = employees.find(e => e.id === viewer.employeeId)
  const typeById = new Map(types.map(t => [t.id, t]))

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for you" value={pending.length} hint={pending.length === 0 ? 'All caught up' : 'Requests to approve or reject'} icon={Hourglass} tone={pending.length > 0 ? 'amber' : 'green'} />
        <Stat label="Away today" value={awayToday} hint="People on approved leave" icon={UserCheck} tone="blue" href="?view=calendar" />
        <Stat label="Starting this week" value={startingSoon} hint="Approved leave starting in the next 7 days" icon={CalendarClock} tone="purple" href="?view=calendar" />
      </div>

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="mb-3 text-base font-semibold text-slate-900">
          Waiting for a decision {pending.length > 0 && <span className="ml-1 text-slate-400">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing waiting for you"
            body="When someone in your team asks for leave it lands here, soonest first, with a heads-up if colleagues are already off."
          />
        ) : (
          <ul className="space-y-3">
            {pending.map(request => {
              const clashes = overlapsFor(request, overlapPool)
              const note = halfDayNote(request.start_date, request.end_date, request.start_half_day, request.end_half_day)
              const name = displayName(request.employee)
              return (
                <li key={request.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={name} />
                      <div className="min-w-0">
                        <Link href={`/employees/${request.employee.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-[#323398] hover:underline">
                          {name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {[request.employee.job_title, request.employee.area].filter(Boolean).join(' · ') || 'Role and area not recorded yet'}
                        </p>
                      </div>
                    </div>
                    <TypeChip type={request.type} />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    <Detail label="Dates">
                      {formatLeaveRange(request.start_date, request.end_date)}
                      {note && <span className="block text-xs text-slate-500">{note}</span>}
                    </Detail>
                    <Detail label="Days">
                      {formatDays(request.days)}
                      <span className="block text-xs text-slate-500">
                        {request.start_date >= today ? `starts ${relativeDays(request.start_date)}` : 'already started'}
                      </span>
                    </Detail>
                    <Detail label="Requested">{formatDateTime(request.requested_at)}</Detail>
                    <Detail label="Reason">
                      {request.reason
                        ? <span className="break-words">{request.reason}</span>
                        : <NotRecorded label="No reason given" />}
                    </Detail>
                  </dl>

                  {clashes.length > 0 && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                      <span>
                        Also off in the same team:{' '}
                        {clashes.slice(0, 3).map(c => `${shortName(c.employee)} (${formatLeaveRange(c.start_date, c.end_date)})`).join(', ')}
                        {clashes.length > 3 && ` and ${clashes.length - 3} more`}.
                      </span>
                    </p>
                  )}

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <DecisionActions requestId={request.id} employeeName={name} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {me && (
        <section aria-labelledby="own-heading">
          <Card>
            <CardHeader
              title={<span id="own-heading">Your own requests</span>}
              icon={Clock}
              description={can(viewer, 'leave.approve') ? 'You can\'t approve your own leave, so someone else decides these.' : undefined}
            />
            {ownPending.length === 0 ? (
              <p className="text-sm text-slate-500">
                No requests of yours are waiting. <Link href="/leave/request" className="font-medium text-[#323398] hover:underline">Request leave</Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ownPending.map(request => {
                  const type = typeById.get(request.leave_type_id)
                  if (!type) return null
                  return (
                    <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 space-y-1">
                        <TypeChip type={type} />
                        <p className="text-sm text-slate-600">
                          {formatLeaveRange(request.start_date, request.end_date)} · {formatDays(request.days)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge tone="amber" dot>Needs another approver</Badge>
                        {canCancelLeave(viewer, me, request, type, today) && (
                          <ActionButton action={cancelLeave.bind(null, request.id)} label="Cancel request" pendingLabel="Cancelling…" confirm="Cancel this leave request?" variant="ghost" />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>
      )}

      <section aria-labelledby="decided-heading">
        <h2 id="decided-heading" className="mb-3 text-base font-semibold text-slate-900">Recently decided</h2>
        {decided.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No decisions in the last 30 days"
            body="Approved, rejected and cancelled requests appear here for a month so you can see what changed."
          />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {decided.map(request => {
                const name = displayName(request.employee)
                const by = request.decided_by ? decidedBy.get(request.decided_by) ?? request.decided_by : null
                const auto = request.status === 'approved' && request.decided_by === request.employee.email
                return (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={name} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/employees/${request.employee.id}?tab=leave`} className="block truncate text-sm font-medium text-slate-900 hover:text-[#323398] hover:underline">
                          {name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {request.type.name} · {formatLeaveRange(request.start_date, request.end_date)} · {formatDays(request.days)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={request.status} />
                      <span className="text-xs text-slate-500">
                        {auto ? 'Recorded automatically' : by ? `by ${by}` : ''}{request.decided_at ? ` · ${formatDateTime(request.decided_at)}` : ''}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}

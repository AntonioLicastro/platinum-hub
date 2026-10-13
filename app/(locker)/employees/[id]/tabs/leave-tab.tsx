import Link from 'next/link'
import { CalendarDays, CalendarPlus, Lock, Scale } from 'lucide-react'
import { canOnEmployee, isHr, isSelf } from '@/utils/people/access'
import { emailNameMap } from '@/utils/people/employees-data'
import { todayIso } from '@/utils/people/format'
import { formatLeaveRange, halfDayNote } from '@/utils/people/leave-calc'
import {
  canCancelLeave, getLeaveBalances, listLeaveForEmployee, listLeaveTypes, needsAnotherHrToCancel, redactLeaveRequest,
} from '@/utils/people/leave-data'
import { ActionButton, ActionForm } from '../../../_components/action-form'
import {
  Badge, buttonClass, Card, CardHeader, EmptyState, Field, FormGrid, inputClass, ProgressBar, TableCard,
  tableClass, tdClass, thClass,
} from '../../../_components/ui'
import { cancelLeave, saveEntitlements } from '../../../leave/actions'
import { StatusBadge, TypeChip } from '../../../leave/_components/leave-ui'
import type { TabProps } from './types'

export default async function LeaveTab({ viewer, employee, searchParams }: TabProps) {
  if (!canOnEmployee(viewer, 'leave.view', employee)) {
    return <Card><EmptyState icon={Lock} title="Leave is restricted" body="You don't have access to this person's leave." /></Card>
  }

  const today = todayIso()
  const rawYear = Number(Array.isArray(searchParams.year) ? searchParams.year[0] : searchParams.year)
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? rawYear : Number(today.slice(0, 4))
  const canManage = canOnEmployee(viewer, 'leave.manage', employee)
  const canRequest = employee.employment_status !== 'leaver' && (isSelf(viewer, employee) || canManage)

  const [balances, allRequests, types] = await Promise.all([
    // Passing the viewer drops sick / statutory balances for anyone but HR and the employee.
    getLeaveBalances(employee.id, year, viewer),
    listLeaveForEmployee(employee.id),
    listLeaveTypes(),
  ])
  const typeById = new Map(types.map(t => [t.id, t]))
  const inYear = allRequests.filter(r => r.start_date <= `${year}-12-31` && r.end_date >= `${year}-01-01`)
  const decidedBy = await emailNameMap(inYear.map(r => r.decided_by))

  const rows = inYear.flatMap(request => {
    const type = typeById.get(request.leave_type_id)
    if (!type) return []
    return [{
      request: redactLeaveRequest(viewer, { ...request, employee, type }),
      cancellable: canCancelLeave(viewer, employee, request, type, today),
      // HR can't undo their own approved leave: say who can, rather than leaving a button missing.
      needsOtherHr: needsAnotherHrToCancel(viewer, employee, request),
    }]
  })

  const yearLink = (y: number) => `?tab=leave&year=${y}`
  const requestHref = `/leave/request?employee=${employee.id}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Leave year" className="flex items-center gap-1">
          <Link href={yearLink(year - 1)} prefetch={false} className={buttonClass('secondary', 'sm')}>{year - 1}</Link>
          <span className="px-3 text-base font-semibold tabular-nums text-slate-900">{year}</span>
          <Link href={yearLink(year + 1)} prefetch={false} className={buttonClass('secondary', 'sm')}>{year + 1}</Link>
        </nav>
        {canRequest && (
          <Link href={requestHref} className={buttonClass('primary')}>
            <CalendarPlus size={16} /> {canManage && !isSelf(viewer, employee) ? 'Record leave' : 'Request leave'}
          </Link>
        )}
      </div>

      {balances.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No leave balances yet"
          body="Annual leave and time off in lieu keep a balance. Once HR sets those leave types up, entitlements and what has been taken show here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {balances.map(b => {
            const total = b.entitlement + b.carriedOver
            const used = b.taken + b.pending
            return (
              <Card key={b.type.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <TypeChip type={b.type} />
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                      {b.entitlementSource === 'none' ? <span className="text-base font-normal italic text-slate-400">No entitlement recorded yet</span> : b.remaining}
                    </p>
                    {b.entitlementSource !== 'none' && <p className="text-xs text-slate-500">days left in {year}</p>}
                  </div>
                  {b.entitlementSource === 'default' && <Badge tone="gray">Default</Badge>}
                </div>
                {total > 0 && (
                  <div className="mt-4">
                    <ProgressBar value={(used / total) * 100} tone={b.remaining < 0 ? 'red' : 'green'} label={`${b.type.name} used`} />
                  </div>
                )}
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {([['Entitled', b.entitlement], ['Carried', b.carriedOver], ['Taken', b.taken], ['Pending', b.pending]] as const).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="mt-0.5 text-sm font-medium tabular-nums text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )
          })}
        </div>
      )}

      <section aria-labelledby="leave-requests-heading">
        <h2 id="leave-requests-heading" className="mb-3 text-base font-semibold text-slate-900">Leave in {year}</h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={`No leave recorded for ${year}`}
            body="Requests, approved leave and sick days for this person appear here, newest first."
            action={canRequest ? <Link href={requestHref} className={buttonClass('primary', 'sm')}>{canManage && !isSelf(viewer, employee) ? 'Record leave' : 'Request leave'}</Link> : undefined}
          />
        ) : (
          <TableCard>
            <table className={`${tableClass} min-w-[40rem]`}>
              <caption className="sr-only">Leave requests in {year}</caption>
              <thead className="border-b border-slate-200 bg-slate-50/70">
                <tr>
                  <th scope="col" className={thClass}>Type</th>
                  <th scope="col" className={thClass}>Dates</th>
                  <th scope="col" className={`${thClass} text-right`}>Days</th>
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ request, cancellable, needsOtherHr }) => {
                  const note = halfDayNote(request.start_date, request.end_date, request.start_half_day, request.end_half_day)
                  const by = request.decided_by ? decidedBy.get(request.decided_by) ?? request.decided_by : null
                  const auto = request.status === 'approved' && request.decided_by === employee.email
                  return (
                    <tr key={request.id}>
                      <td className={tdClass}>
                        <TypeChip type={request.type} />
                        {request.reason && <p className="mt-1 max-w-xs truncate text-xs text-slate-500" title={request.reason}>{request.reason}</p>}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {formatLeaveRange(request.start_date, request.end_date)}
                        {note && <span className="block text-xs text-slate-500">{note}</span>}
                      </td>
                      <td className={`${tdClass} text-right tabular-nums`}>{request.days}</td>
                      <td className={tdClass}>
                        <StatusBadge status={request.status} />
                        {request.status !== 'pending' && (auto || by) && (
                          <p className="mt-1 text-xs text-slate-500">{auto ? 'Recorded automatically' : `by ${by}`}</p>
                        )}
                        {request.decision_note && <p className="mt-1 max-w-xs text-xs text-slate-500">{request.decision_note}</p>}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {cancellable && (
                          <ActionButton action={cancelLeave.bind(null, request.id)} label="Cancel" pendingLabel="Cancelling…" confirm="Cancel this leave?" variant="ghost" />
                        )}
                        {!cancellable && needsOtherHr && (
                          <span className="block max-w-[11rem] text-xs text-slate-500">Another HR user must cancel this</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableCard>
        )}
      </section>

      {isSelf(viewer, employee) && isHr(viewer) && balances.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          <Lock size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>You can&apos;t change your own leave entitlement or cancel your own approved leave. Another HR user needs to do that.</span>
        </p>
      )}

      {canManage && balances.length > 0 && (
        <Card>
          <CardHeader
            icon={Scale}
            title={`Entitlements for ${year}`}
            description="Set how many days this person gets, and how many carried over from last year. Leave a type blank to keep it unrecorded."
          />
          <ActionForm action={saveEntitlements.bind(null, employee.id, year)} submitLabel="Save entitlements">
            <div className="grid gap-4 md:grid-cols-2">
              {balances.map(b => {
                const recorded = b.entitlementSource === 'recorded'
                return (
                  <fieldset key={b.type.id} className="rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 text-sm font-semibold text-slate-800">{b.type.name}</legend>
                    <FormGrid>
                      <Field label="Entitlement (days)" htmlFor={`tab-ent-${b.type.id}`}>
                        <input
                          id={`tab-ent-${b.type.id}`} name={`entitlement_${b.type.id}`} type="number" inputMode="decimal"
                          min={0} max={366} step={0.5} defaultValue={recorded ? b.entitlement : ''}
                          placeholder={b.type.default_entitlement_days !== null ? `${b.type.default_entitlement_days} (default)` : 'Not recorded yet'}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Carried over (days)" htmlFor={`tab-carried-${b.type.id}`}>
                        <input
                          id={`tab-carried-${b.type.id}`} name={`carried_${b.type.id}`} type="number" inputMode="decimal"
                          min={0} max={366} step={0.5} defaultValue={recorded ? b.carriedOver : ''} placeholder="0"
                          className={inputClass}
                        />
                      </Field>
                    </FormGrid>
                  </fieldset>
                )
              })}
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  )
}

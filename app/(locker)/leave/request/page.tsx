import { notFound } from 'next/navigation'
import { CalendarPlus, UserRoundX } from 'lucide-react'
import { can, canOnEmployee, requireViewer } from '@/utils/people/access'
import { getEmployee, isCurrent } from '@/utils/people/employees-data'
import { addDays, displayName, todayIso } from '@/utils/people/format'
import { employeesInScope, listLeaveTypes, listPublicHolidays, loadLeaveBalances } from '@/utils/people/leave-data'
import { LEAVE_BACKDATE_DAYS, LEAVE_MAX_AHEAD_DAYS } from '@/utils/people/leave-calc'
import { getManagerName } from '@/utils/people/profile-data'
import type { Employee } from '@/utils/people/types'
import { Avatar, buttonClass, Card, EmptyState, Field, inputClass, PageHeader } from '../../_components/ui'
import { RequestForm, type RequestBalance } from '../_components/request-form'
import { requestLeave } from '../actions'

export default async function RequestLeavePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireViewer()
  const query = await searchParams
  // Lower-cased so an upper-cased copy of the viewer's own id still means "me".
  const wanted = typeof query.employee === 'string' ? query.employee.trim().toLowerCase() : ''
  const canManage = can(viewer, 'leave.manage')

  // Anyone can request for themselves; only HR may pick someone else, and out-of-scope people look like missing ones.
  let target: Employee | null = null
  if (wanted && wanted !== viewer.employeeId) {
    target = canManage ? await getEmployee(viewer, wanted) : null
    if (!target || !canOnEmployee(viewer, 'leave.manage', target)) notFound()
  } else if (viewer.employeeId) {
    target = await getEmployee(viewer, viewer.employeeId)
  }
  const onBehalf = target !== null && target.id !== viewer.employeeId
  const backTo = can(viewer, 'leave.view') ? '/leave' : '/me'
  const crumbs = [{ label: can(viewer, 'leave.view') ? 'Leave' : 'My space', href: backTo }, { label: onBehalf ? 'Record leave' : 'Request leave' }]

  const people = canManage ? (await employeesInScope(viewer)).filter(isCurrent) : []
  const picker = canManage && (
    <Card className="mb-5">
      <form method="get" action="/leave/request" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Field label="Who is this leave for?" htmlFor="leave-employee">
            <select id="leave-employee" name="employee" defaultValue={target?.id ?? ''} className={inputClass}>
              {!target && <option value="" disabled>Choose an employee…</option>}
              {people.map(p => (
                <option key={p.id} value={p.id}>{displayName(p)}{p.id === viewer.employeeId ? ' (me)' : ''}</option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" className={buttonClass('secondary')}>Choose</button>
      </form>
    </Card>
  )

  if (!target) {
    return (
      <>
        <PageHeader title="Request leave" icon={CalendarPlus} crumbs={crumbs} />
        {picker}
        <Card>
          {canManage ? (
            <EmptyState
              icon={CalendarPlus}
              title="Choose who this leave is for"
              body="Pick an employee above. HR can record leave for anyone on their behalf, and it is approved straight away."
            />
          ) : (
            <EmptyState
              icon={UserRoundX}
              title="We can't find your employee record yet"
              body="Ask HR to set up your record in HR Locker, then you can request leave here."
            />
          )}
        </Card>
      </>
    )
  }

  if (target.employment_status === 'leaver') {
    return (
      <>
        <PageHeader title="Request leave" icon={CalendarPlus} crumbs={crumbs} />
        {picker}
        <Card>
          <EmptyState
            icon={UserRoundX}
            title={`${onBehalf ? displayName(target) : 'You'} ${onBehalf ? 'has' : 'have'} left`}
            body="Leave can't be added for someone who is recorded as a leaver."
          />
        </Card>
      </>
    )
  }

  const today = todayIso()
  const year = Number(today.slice(0, 4))
  const [allTypes, holidays, balanceTable, managerName] = await Promise.all([
    listLeaveTypes(),
    listPublicHolidays(addDays(today, -LEAVE_MAX_AHEAD_DAYS), addDays(today, LEAVE_MAX_AHEAD_DAYS)),
    loadLeaveBalances([target.id], [year - 1, year, year + 1]),
    target.manager_email ? getManagerName(target.manager_email) : Promise.resolve(null),
  ])
  const types = allTypes.filter(t => t.active)

  const balances: Record<string, Record<string, RequestBalance>> = {}
  for (const [y, list] of balanceTable.get(target.id) ?? []) {
    balances[String(y)] = Object.fromEntries(
      list
        .filter(b => b.entitlementSource !== 'none')
        .map(b => [String(b.type.id), { remaining: b.remaining, entitlement: b.entitlement, carriedOver: b.carriedOver }]),
    )
  }

  return (
    <>
      <PageHeader
        title={onBehalf ? 'Record leave' : 'Request leave'}
        subtitle={onBehalf
          ? 'Leave you record for someone else is approved straight away.'
          : 'Choose your dates and we\'ll work out the days. Your manager is asked to approve.'}
        icon={CalendarPlus}
        crumbs={crumbs}
      />
      {picker}
      {onBehalf && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Avatar name={displayName(target)} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName(target)}</p>
            <p className="truncate text-xs text-slate-500">{[target.job_title, target.area].filter(Boolean).join(' · ') || 'Job title and area not recorded yet'}</p>
          </div>
        </div>
      )}
      <Card className="max-w-3xl">
        {types.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No types of leave set up yet"
            body="Leave types (annual leave, sick leave and so on) are set up by HR in Settings. Once they exist you can request leave here."
          />
        ) : (
          <RequestForm
            action={requestLeave.bind(null, target.id)}
            onBehalf={onBehalf}
            types={types.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color,
              usesBalance: t.uses_balance,
              requiresApproval: t.requires_approval,
              note: t.statutory_note,
            }))}
            holidays={holidays.map(h => ({ date: h.holiday_date, name: h.name }))}
            balances={balances}
            earliestStart={onBehalf ? null : addDays(today, -LEAVE_BACKDATE_DAYS)}
            approverName={managerName ?? target.manager_email}
            redirectTo={backTo}
          />
        )}
      </Card>
    </>
  )
}

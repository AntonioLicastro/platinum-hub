import Link from 'next/link'
import { CalendarCheck, ChevronLeft, ChevronRight, Scale, Users } from 'lucide-react'
import { isSelf, type PeopleViewer } from '@/utils/people/access'
import { isCurrent } from '@/utils/people/employees-data'
import { displayName } from '@/utils/people/format'
import { employeesInScope, listLeaveTypes, loadLeaveBalances } from '@/utils/people/leave-data'
import { ActionForm } from '../../_components/action-form'
import {
  Avatar, Badge, buttonClass, Card, CardHeader, EmptyState, inputClass, NotRecorded, Stat, TableCard, tableClass, tdClass, thClass,
} from '../../_components/ui'
import { applyDefaultEntitlements, saveEntitlements } from '../actions'
import { EntitlementRowForm } from './entitlement-row-form'

const roundDays = (n: number) => Math.round(n * 100) / 100

export default async function BalancesView({ viewer, year, typeId, query }: {
  viewer: PeopleViewer
  year: number
  typeId: number | null
  query: string
}) {
  const types = (await listLeaveTypes()).filter(t => t.uses_balance && t.active)
  if (types.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="No type of leave uses a balance yet"
        body="Annual leave and time off in lieu draw down an entitlement. Once a leave type is set to use a balance in Settings, entitlements can be recorded here."
      />
    )
  }
  const selected = types.find(t => t.id === typeId) ?? types.find(t => t.code === 'annual') ?? types[0]

  const people = (await employeesInScope(viewer)).filter(isCurrent)
  const table = await loadLeaveBalances(people.map(p => p.id), [year], selected.id)
  const rows = people.map(employee => ({ employee, balance: table.get(employee.id)?.get(year)?.[0] }))

  const needle = query.toLowerCase()
  const shown = needle
    ? rows.filter(r => displayName(r.employee).toLowerCase().includes(needle) || (r.employee.area ?? '').toLowerCase().includes(needle))
    : rows

  const recorded = rows.filter(r => r.balance?.entitlementSource === 'recorded').length
  const missing = rows.length - recorded
  // Nobody sets their own allowance (see SELF_DENIED), so the bulk default skips the viewer's own row too.
  const missingOthers = rows.filter(r => r.balance?.entitlementSource !== 'recorded' && !isSelf(viewer, r.employee)).length
  const totalTaken = rows.reduce((sum, r) => sum + (r.balance?.taken ?? 0), 0)
  const totalPending = rows.reduce((sum, r) => sum + (r.balance?.pending ?? 0), 0)
  const defaultDays = selected.default_entitlement_days !== null ? Number(selected.default_entitlement_days) : null

  const href = (next: { year?: number; type?: number }) => {
    const params = new URLSearchParams({ view: 'balances', year: String(next.year ?? year), type: String(next.type ?? selected.id) })
    if (query) params.set('q', query)
    return `/leave?${params}`
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link href={href({ year: year - 1 })} className={buttonClass('secondary', 'sm')} aria-label="Previous year"><ChevronLeft size={16} /></Link>
            <h2 className="min-w-24 px-3 text-center text-base font-semibold tabular-nums text-slate-900">{year}</h2>
            <Link href={href({ year: year + 1 })} className={buttonClass('secondary', 'sm')} aria-label="Next year"><ChevronRight size={16} /></Link>
          </div>
          {types.length > 1 && (
            <nav aria-label="Type of leave" className="flex flex-wrap gap-1.5">
              {types.map(t => (
                <Link
                  key={t.id}
                  href={href({ type: t.id })}
                  aria-current={t.id === selected.id ? 'page' : undefined}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${t.id === selected.id ? 'bg-[#323398] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {t.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Leave years run from 1 January to 31 December. Leave that crosses New Year counts in the year it starts.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Entitlement recorded" value={`${recorded} of ${rows.length}`} hint={missing > 0 ? `${missing} still to record` : 'Everyone is set'} icon={Users} tone={missing > 0 ? 'amber' : 'green'} />
        <Stat label="Days taken" value={roundDays(totalTaken)} hint={`Approved ${selected.name.toLowerCase()} in ${year}`} icon={CalendarCheck} tone="green" />
        <Stat label="Days pending" value={roundDays(totalPending)} hint="Waiting for approval" icon={Scale} tone="purple" />
      </div>

      {missingOthers > 0 && (
        <Card>
          <CardHeader
            title={`${missingOthers} ${missingOthers === 1 ? 'person has' : 'people have'} no ${year} entitlement saved`}
            description={defaultDays !== null
              ? `Give everyone without one the standard ${defaultDays} days of ${selected.name.toLowerCase()}. Anyone you have already set keeps their figure.`
              : `${selected.name} has no standard number of days yet, so enter each person's entitlement below. A default can be set in Settings.`}
          />
          {defaultDays !== null && (
            <ActionForm
              action={applyDefaultEntitlements.bind(null, selected.id, year)}
              submitLabel={`Apply ${defaultDays} days to everyone without one`}
              pendingLabel="Applying…"
              submitVariant="success"
            >
              <p className="text-sm text-slate-600">This is recorded in the audit log.</p>
            </ActionForm>
          )}
        </Card>
      )}

      <form method="get" action="/leave" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value="balances" />
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="type" value={selected.id} />
        <label htmlFor="balance-search" className="sr-only">Search people</label>
        <input id="balance-search" name="q" defaultValue={query} placeholder="Search by name or area" className={`${inputClass} max-w-xs`} />
        <button type="submit" className={buttonClass('secondary', 'sm')}>Search</button>
        {query && <Link href={href({})} className={buttonClass('ghost', 'sm')} prefetch={false}>Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No current employees yet" body="Add employees in the directory and they will appear here, ready for an entitlement." />
      ) : shown.length === 0 ? (
        <EmptyState icon={Users} title="Nobody matches that search" body="Try a different name or area." />
      ) : (
        <TableCard>
          <table className={`${tableClass} min-w-[44rem]`}>
            <caption className="sr-only">{selected.name} balances for {year}</caption>
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th scope="col" className={thClass}>Employee</th>
                <th scope="col" className={thClass}>Entitlement · carried over (days)</th>
                <th scope="col" className={`${thClass} text-right`}>Taken</th>
                <th scope="col" className={`${thClass} text-right`}>Pending</th>
                <th scope="col" className={`${thClass} text-right`}>Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(({ employee, balance }) => {
                const name = displayName(employee)
                const source = balance?.entitlementSource ?? 'none'
                const own = isSelf(viewer, employee)
                return (
                  <tr key={employee.id} className="hover:bg-slate-50/60">
                    <td className={tdClass}>
                      <div className="flex items-center gap-3">
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/employees/${employee.id}?tab=leave`} className="block truncate font-medium text-slate-900 hover:text-[#323398] hover:underline">{name}</Link>
                          <p className="truncate text-xs text-slate-500">{employee.area ?? 'Area not recorded yet'}</p>
                        </div>
                      </div>
                    </td>
                    <td className={tdClass}>
                      {own ? (
                        <div className="space-y-1">
                          <p className="text-sm text-slate-700">
                            {source === 'none'
                              ? 'Not set'
                              : `${balance?.entitlement ?? 0} days · ${balance?.carriedOver ?? 0} carried over`}
                          </p>
                          <p className="text-xs text-slate-500">Another HR user needs to set your own entitlement.</p>
                        </div>
                      ) : (
                        <EntitlementRowForm
                          action={saveEntitlements.bind(null, employee.id, year)}
                          employeeName={name}
                          typeId={selected.id}
                          entitlement={source === 'recorded' ? balance?.entitlement ?? null : null}
                          carriedOver={source === 'recorded' ? balance?.carriedOver ?? null : null}
                          defaultDays={defaultDays}
                        />
                      )}
                      {source === 'default' && <Badge tone="gray">Using the default, not saved</Badge>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{balance?.taken ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{balance?.pending ?? 0}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {!balance || source === 'none'
                        ? <NotRecorded label="Not set" />
                        : <span className={`font-semibold ${balance.remaining < 0 ? 'text-red-600' : 'text-slate-900'}`}>{balance.remaining}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  )
}

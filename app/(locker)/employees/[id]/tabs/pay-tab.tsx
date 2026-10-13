import { Banknote, Lock, TriangleAlert } from 'lucide-react'
import { canOnEmployee } from '@/utils/people/access'
import { AUDIT_UNAVAILABLE, auditBeforeRead } from '@/utils/people/audit'
import { PAY_BASES } from '@/utils/people/constants'
import { emailNameMap } from '@/utils/people/employees-data'
import { formatDate, formatDateTime, todayIso } from '@/utils/people/format'
import { listCompensation } from '@/utils/people/profile-data'
import { formatEuro, formatHours, formatRate } from '@/utils/people/profile-format'
import { ActionForm } from '../../../_components/action-form'
import {
  Badge, Card, CardHeader, EmptyState, FormGrid, TableCard, tableClass, tdClass, thClass,
} from '../../../_components/ui'
import { addPayChange } from '../../actions'
import { Datalist, SelectField, TextAreaField, TextField } from '../../_components/fields'
import type { TabProps } from './types'

const REASON_SUGGESTIONS = [
  'Starting rate', 'Probation completed', 'Annual pay review', 'Promotion', 'Minimum wage increase', 'Change of hours', 'Correction',
]

export default async function PayTab({ viewer, employee }: TabProps) {
  if (!canOnEmployee(viewer, 'compensation.view', employee)) {
    return <Card><EmptyState icon={Lock} title="Pay is restricted" body="Only HR can see pay details." /></Card>
  }
  const canEdit = canOnEmployee(viewer, 'compensation.edit', employee)

  // Viewing pay is itself sensitive: the view is logged BEFORE the pay is read, and nothing is shown if the log cannot be written.
  const audited = await auditBeforeRead(viewer, { action: 'compensation.view', entity: 'hr_compensation', employeeId: employee.id })
  if (!audited) {
    return (
      <Card>
        <p role="alert" className="flex items-center gap-2 text-sm text-amber-800">
          <TriangleAlert size={16} className="shrink-0" /> {AUDIT_UNAVAILABLE}
        </p>
      </Card>
    )
  }

  const history = await listCompensation(employee.id)
  if (history.failed) {
    return (
      <Card>
        <p role="alert" className="flex items-center gap-2 text-sm text-amber-800">
          <TriangleAlert size={16} /> Pay history could not be loaded. Refresh the page to try again.
        </p>
      </Card>
    )
  }
  const rows = history.data

  const today = todayIso()
  // Rows arrive newest first, so the first one that has taken effect is the current rate.
  const current = rows.find(r => r.effective_from <= today) ?? null
  const hours = current?.hours_per_week ?? employee.contract_hours_per_week
  const recordedBy = await emailNameMap(rows.map(r => r.created_by))

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {rows.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No pay recorded yet"
            body={`Pay history lives here. Each change in rate is added with the date it takes effect, so you can always see what ${employee.first_name || 'this person'} was paid and when. Payroll itself runs in Sage; this is the HR record.`}
          />
        ) : (
          <>
            <Card>
              <CardHeader title="Current pay" icon={Banknote} description="The latest entry that has taken effect" />
              {current ? (
                <div className="grid gap-5 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatRate(current)}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Since {formatDate(current.effective_from)}
                      {current.reason && <> · {current.reason}</>}
                    </p>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours</dt>
                      <dd className="mt-0.5 text-slate-900">{hours === null ? <span className="italic text-slate-400">Not recorded yet</span> : formatHours(hours)}</dd>
                    </div>
                    {hours !== null && hours > 0 && (
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {current.pay_basis === 'hourly' ? 'Estimated a year' : 'Estimated an hour'}
                        </dt>
                        <dd className="mt-0.5 text-slate-900">
                          {current.pay_basis === 'hourly'
                            ? formatEuro(current.rate * hours * 52, current.currency)
                            : formatEuro(current.rate / 52 / hours, current.currency)}
                        </dd>
                        <p className="text-xs text-slate-500">{current.pay_basis === 'hourly' ? 'Rate × hours × 52 weeks' : 'Salary ÷ 52 weeks ÷ hours'}</p>
                      </div>
                    )}
                  </dl>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
                  Every pay entry so far starts in the future.
                </p>
              )}
            </Card>

            <div>
              <h2 className="mb-3 text-base font-semibold text-slate-900">Pay history</h2>
              <TableCard>
                <table className={tableClass}>
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr>
                      <th scope="col" className={thClass}>Effective from</th>
                      <th scope="col" className={thClass}>Rate</th>
                      <th scope="col" className={thClass}>Hours</th>
                      <th scope="col" className={thClass}>Reason</th>
                      <th scope="col" className={thClass}>Recorded by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          <span className="font-medium text-slate-900">{formatDate(row.effective_from)}</span>
                          {row.id === current?.id && <span className="ml-2"><Badge tone="green">Current</Badge></span>}
                          {row.effective_from > today && <span className="ml-2"><Badge tone="sky">Scheduled</Badge></span>}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{formatRate(row)}</td>
                        <td className={`${tdClass} whitespace-nowrap`}>{row.hours_per_week === null ? <span className="italic text-slate-400">Not recorded</span> : formatHours(row.hours_per_week)}</td>
                        <td className={tdClass}>
                          {row.reason || <span className="italic text-slate-400">No reason given</span>}
                          {row.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{row.notes}</p>}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-slate-500`}>
                          {row.created_by ? recordedBy.get(row.created_by.toLowerCase()) ?? row.created_by : ''}
                          <span className="block text-xs">{formatDateTime(row.created_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </div>
          </>
        )}
      </div>

      {canEdit && (
        <div>
          <Card>
            <Datalist id="pay-reasons" options={REASON_SUGGESTIONS} />
            <CardHeader title="Add a pay change" description="History is never edited. To fix a mistake, add a corrected entry." />
            <ActionForm action={addPayChange.bind(null, employee.id)} submitLabel="Add pay change" pendingLabel="Adding…" resetOnSuccess>
              <FormGrid>
                <TextField name="effective_from" label="Effective from" type="date" required defaultValue={today} wide />
                <SelectField name="pay_basis" label="Paid" required options={PAY_BASES} defaultValue="hourly" />
                <TextField name="rate" label="Rate (€)" type="number" inputMode="decimal" min={0} step="0.01" required />
                <TextField name="hours_per_week" label="Hours per week" type="number" inputMode="decimal" min={0} max={168} step="0.01" defaultValue={employee.contract_hours_per_week} />
                <TextField name="reason" label="Reason" list="pay-reasons" maxLength={200} wide />
                <TextAreaField name="notes" label="Notes" rows={2} maxLength={1000} hint="Visible to HR only." />
              </FormGrid>
            </ActionForm>
          </Card>
        </div>
      )}
    </div>
  )
}

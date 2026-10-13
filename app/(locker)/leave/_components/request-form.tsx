'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, Info } from 'lucide-react'
import { daysBetween, formatDays, formatDayMonth } from '@/utils/people/format'
import { countWorkingDays, formatLeaveRange, isWeekend, MAX_LEAVE_SPAN_DAYS, yearOf } from '@/utils/people/leave-calc'
import type { ActionState } from '@/utils/people/types'
import { isIsoDate } from '@/utils/people/validate'
import { ActionForm } from '../../_components/action-form'
import { buttonClass, Field, FormGrid, inputClass } from '../../_components/ui'
import { safeColor } from './leave-ui'

type RequestTypeOption = {
  id: number
  name: string
  color: string
  usesBalance: boolean
  requiresApproval: boolean
  note: string | null
}

export type RequestBalance = { remaining: number; entitlement: number; carriedOver: number }

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  /** HR recording leave for someone else: approved on the spot, days can be set by hand, balance is advisory. */
  onBehalf: boolean
  types: RequestTypeOption[]
  holidays: { date: string; name: string }[]
  /** year -> leave type id -> balance, only where an entitlement is recorded or defaulted. */
  balances: Record<string, Record<string, RequestBalance>>
  /** Earliest start date a non-HR requester may pick. */
  earliestStart: string | null
  /** Who will be asked to approve, when anyone is known. */
  approverName: string | null
  redirectTo: string
}

const checkboxClass = 'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#323398] focus:ring-[#323398]'

export function RequestForm({ action, onBehalf, types, holidays, balances, earliestStart, approverName, redirectTo }: Props) {
  const [typeId, setTypeId] = useState(String(types[0]?.id ?? ''))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [startHalf, setStartHalf] = useState(false)
  const [endHalf, setEndHalf] = useState(false)
  const [weekends, setWeekends] = useState(false)
  const [manual, setManual] = useState(false)
  const [manualDays, setManualDays] = useState('')
  const [reason, setReason] = useState('')

  const holidayDates = useMemo(() => new Set(holidays.map(h => h.date)), [holidays])
  const type = types.find(t => String(t.id) === typeId)
  const single = start !== '' && start === end

  const datesValid = isIsoDate(start) && isIsoDate(end) && end >= start
  const tooLong = datesValid && daysBetween(end, start) + 1 > MAX_LEAVE_SPAN_DAYS
  const ready = datesValid && !tooLong
  const calculated = ready
    ? countWorkingDays(start, end, holidayDates, { startHalf, endHalf: !single && endHalf, includeWeekends: weekends })
    : null
  const manualValue = manual && manualDays.trim() !== '' ? Number(manualDays) : null
  const days = manualValue !== null && Number.isFinite(manualValue) ? manualValue : calculated

  // Public holidays that fall on a weekday inside the range and so aren't counted.
  const skippedHolidays = ready && !weekends
    ? holidays.filter(h => h.date >= start && h.date <= end && !isWeekend(h.date))
    : []

  const balance = type?.usesBalance && ready ? balances[String(yearOf(start))]?.[typeId] : undefined
  const overBalance = balance !== undefined && days !== null && days > balance.remaining
  const approval = onBehalf || (type && !type.requiresApproval)
    ? 'This is recorded as approved straight away.'
    : approverName
      ? `This goes to ${approverName} for approval.`
      : 'This goes to HR for approval.'

  const onStartChange = (value: string) => {
    setStart(value)
    if (!end || end < value) setEnd(value)
  }

  return (
    <ActionForm
      action={action}
      redirectTo={redirectTo}
      submitLabel={onBehalf || (type && !type.requiresApproval) ? 'Record leave' : 'Send request'}
      pendingLabel="Sending…"
      footer={<Link href={redirectTo} className={buttonClass('ghost')}>Cancel</Link>}
    >
      <FormGrid>
        <Field
          label="Type of leave" htmlFor="leave-type" wide required
          hint={type?.note ?? undefined}
        >
          <select
            id="leave-type" name="leave_type_id" required value={typeId}
            onChange={e => setTypeId(e.target.value)} className={inputClass}
          >
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>

        <Field label="First day" htmlFor="leave-start" required>
          <input
            id="leave-start" name="start_date" type="date" required value={start}
            min={earliestStart ?? undefined}
            onChange={e => onStartChange(e.target.value)} className={inputClass}
          />
        </Field>
        <Field label="Last day" htmlFor="leave-end" required>
          <input
            id="leave-end" name="end_date" type="date" required value={end}
            min={start || earliestStart || undefined}
            onChange={e => setEnd(e.target.value)} className={inputClass}
          />
        </Field>

        <div className="space-y-3 sm:col-span-2">
          {single ? (
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input type="checkbox" name="start_half_day" checked={startHalf} onChange={e => setStartHalf(e.target.checked)} className={checkboxClass} />
              <span>Half day only</span>
            </label>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" name="start_half_day" checked={startHalf} onChange={e => setStartHalf(e.target.checked)} className={checkboxClass} />
                <span>First day is a half day</span>
              </label>
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" name="end_half_day" checked={endHalf} onChange={e => setEndHalf(e.target.checked)} className={checkboxClass} />
                <span>Last day is a half day</span>
              </label>
            </div>
          )}
          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <input type="checkbox" name="include_weekends" checked={weekends} onChange={e => setWeekends(e.target.checked)} className={checkboxClass} />
            <span>
              Include weekends / calendar days
              <span className="block text-xs text-slate-500">
                Tick this for carers on a rotating roster: every day in the range counts, weekends and public holidays too.
              </span>
            </span>
          </label>
        </div>

        <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#323398] shadow-sm ring-1 ring-slate-200">
              <CalendarDays size={20} />
            </span>
            <div className="min-w-0 text-sm">
              {!ready ? (
                <p className="text-slate-500">
                  {tooLong
                    ? `A single request can cover up to ${MAX_LEAVE_SPAN_DAYS} days. Split longer leave into separate requests.`
                    : start && end && end < start
                      ? 'The last day can\'t be before the first day.'
                      : 'Pick the first and last day to see how many days this takes.'}
                </p>
              ) : (
                <>
                  <p className="font-semibold text-slate-900">
                    {days === null ? '' : formatDays(days)}
                    <span className="ml-2 font-normal text-slate-500">{formatLeaveRange(start, end)}</span>
                  </p>
                  {calculated === 0 && manualValue === null && (
                    <p className="mt-1 text-amber-800">
                      Nothing to take off in that range: weekends and public holidays aren&apos;t counted. Tick &ldquo;Include weekends / calendar days&rdquo; if they are rostered days.
                    </p>
                  )}
                  {skippedHolidays.length > 0 && (
                    <p className="mt-1 text-slate-500">
                      Not counted: {skippedHolidays.map(h => `${formatDayMonth(h.date)} (${h.name})`).join(', ')}.
                    </p>
                  )}
                  {!weekends && calculated !== 0 && (
                    <p className="mt-1 text-slate-500">Saturdays and Sundays aren&apos;t counted.</p>
                  )}
                </>
              )}

              {type?.usesBalance && ready && (
                balance ? (
                  <p className={`mt-2 flex items-start gap-1.5 ${overBalance ? 'text-amber-800' : 'text-slate-600'}`}>
                    {overBalance ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />}
                    <span>
                      {overBalance
                        ? onBehalf
                          ? `That is more than the ${formatDays(Math.max(0, balance.remaining))} left for ${yearOf(start)}. You can still record it.`
                          : `That is more than the ${formatDays(Math.max(0, balance.remaining))} you have left for ${yearOf(start)}, so it can't be sent. Ask HR if you need more.`
                        : `${formatDays(balance.remaining)} left for ${yearOf(start)}${days !== null ? `, ${formatDays(balance.remaining - days)} after this` : ''}.`}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-1.5 text-slate-500">
                    <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>No {type.name.toLowerCase()} entitlement is recorded for {yearOf(start)} yet, so there is no balance to check against.</span>
                  </p>
                )
              )}
            </div>
          </div>
        </div>

        {onBehalf && (
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} className={checkboxClass} />
              <span>
                Set the number of days myself
                <span className="block text-xs text-slate-500">For rosters the calculation can&apos;t know about. Otherwise the figure above is used.</span>
              </span>
            </label>
            {manual && (
              <div className="mt-3 max-w-xs">
                <Field label="Days of leave" htmlFor="leave-days-override" required>
                  <input
                    id="leave-days-override" name="days_override" type="number" inputMode="decimal"
                    min={0.5} max={MAX_LEAVE_SPAN_DAYS} step={0.5} required
                    value={manualDays} onChange={e => setManualDays(e.target.value)} className={inputClass}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field label="Reason" htmlFor="leave-reason" wide hint="Optional. Only HR and the person themselves can see the reason for sick or statutory leave.">
          <textarea id="leave-reason" name="reason" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} />
        </Field>

        <p className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          {type && (
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: safeColor(type.color) }} />
          )}
          {approval}
        </p>
      </FormGrid>
    </ActionForm>
  )
}

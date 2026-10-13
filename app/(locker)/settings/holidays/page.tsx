import Link from 'next/link'
import { CalendarPlus, ChevronLeft, ChevronRight, PartyPopper, Trash2 } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { formatDayMonth, parseIsoDate, todayIso } from '@/utils/people/format'
import { holidayCountsByYear, listHolidays } from '@/utils/people/settings-catalog'
import { FIRST_HOLIDAY_YEAR, isSupportedHolidayYear } from '@/utils/people/settings-holidays'
import { NAME_MAX } from '@/utils/people/settings-input'
import { ActionButton, ActionForm } from '../../_components/action-form'
import {
  Badge, Card, CardHeader, EmptyState, Field, FormGrid, PageHeader, TableCard, inputClass, tableClass, tdClass, thClass,
} from '../../_components/ui'
import { Callout } from '../_components/callout'
import { addHoliday, deleteHoliday, generateHolidays } from './actions'

const BASE = '/settings/holidays'
const MIN_YEAR = 2000
const MAX_YEAR = 2100

const yearHref = (year: number) => `${BASE}?year=${year}`

function parseYear(raw: string | string[] | undefined, fallback: number): number {
  const value = Number.parseInt((Array.isArray(raw) ? raw[0] : raw) ?? '', 10)
  return Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR ? value : fallback
}

const isWeekend = (iso: string) => [0, 6].includes(parseIsoDate(iso).getUTCDay())

const arrowClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20'

export default async function HolidaysPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('settings.manage')
  const query = await searchParams
  const thisYear = Number(todayIso().slice(0, 4))
  const year = parseYear(query.year, thisYear)

  // Last year, this year and the next two, plus whatever is selected.
  const years = [...new Set([thisYear - 1, thisYear, thisYear + 1, thisYear + 2, year])].sort((a, b) => a - b)
  const [holidays, counts] = await Promise.all([listHolidays(year), holidayCountsByYear(years[0], years[years.length - 1])])
  const canGenerate = isSupportedHolidayYear(year)

  return (
    <>
      <PageHeader
        title="Public holidays"
        icon={PartyPopper}
        subtitle="Leave requests don't count these days against anyone's entitlement, so each year needs its list before people start booking."
      />

      <nav aria-label="Choose a year" className="mb-6 flex flex-wrap items-center gap-2">
        {year > MIN_YEAR && (
          <Link href={yearHref(year - 1)} aria-label={`Previous year, ${year - 1}`} className={arrowClass}><ChevronLeft size={18} aria-hidden="true" /></Link>
        )}
        {years.map(y => {
          const count = counts.get(y) ?? 0
          const selected = y === year
          return (
            <Link
              key={y}
              href={yearHref(y)}
              aria-current={selected ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
                selected ? 'bg-[#323398] text-white shadow-sm' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {y}
              <span className={`text-xs font-normal ${selected ? 'text-white/80' : count === 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {count === 0 ? 'none yet' : count}
              </span>
            </Link>
          )
        })}
        {year < MAX_YEAR && (
          <Link href={yearHref(year + 1)} aria-label={`Next year, ${year + 1}`} className={arrowClass}><ChevronRight size={18} aria-hidden="true" /></Link>
        )}
      </nav>

      <div className="mb-8 space-y-6">
        <Card>
          <CardHeader
            icon={PartyPopper}
            title={`Generate Irish public holidays for ${year}`}
            description={
              canGenerate
                ? 'Adds the ten standard days: New Year, St Brigid, St Patrick, Easter Monday, the May, June, August and October bank holidays, Christmas Day and St Stephen’s Day.'
                : `The standard set starts in ${FIRST_HOLIDAY_YEAR}, when St Brigid’s Day became a public holiday. Add earlier dates by hand.`
            }
          />
          {canGenerate && (
            <>
              <p className="text-sm text-slate-500">Days already on the list are left exactly as they are.</p>
              <ActionForm
                key={year}
                action={generateHolidays.bind(null, year)}
                submitLabel={`Generate holidays for ${year}`}
                pendingLabel="Generating…"
                submitVariant="secondary"
              >
                {null}
              </ActionForm>
            </>
          )}
        </Card>

        <Card>
          <CardHeader icon={CalendarPlus} title="Add a holiday" description={`For a one-off day, such as a company closure, in ${year}.`} />
          <ActionForm key={year} action={addHoliday} submitLabel="Add holiday" pendingLabel="Adding…" resetOnSuccess>
            <FormGrid>
              <Field label="Date" htmlFor="holiday-date" required>
                <input
                  id="holiday-date" name="holiday_date" type="date" required
                  min={`${year}-01-01`} max={`${year}-12-31`} className={inputClass}
                />
              </Field>
              <Field label="Name" htmlFor="holiday-name" required>
                <input
                  id="holiday-name" name="name" type="text" required maxLength={NAME_MAX} autoComplete="off"
                  placeholder="e.g. Office closed" className={inputClass}
                />
              </Field>
            </FormGrid>
          </ActionForm>
        </Card>
      </div>

      <Callout tone="caution">
        Public holiday rules can change. Check every year&apos;s list against the official dates on gov.ie, especially anything generated here.
      </Callout>

      {holidays.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title={`No public holidays recorded for ${year} yet`}
          body={
            canGenerate
              ? 'Until they are added, leave requests in this year count public holidays as working days. Use the generate button above to add the standard set, then check it.'
              : 'Add the dates above, one at a time.'
          }
        />
      ) : (
        <TableCard>
          <table className={tableClass}>
            <caption className="sr-only">Public holidays in {year}</caption>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th scope="col" className={thClass}>Date</th>
                <th scope="col" className={thClass}>Holiday</th>
                <th scope="col" className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {holidays.map(holiday => (
                <tr key={holiday.holiday_date}>
                  <td className={`${tdClass} whitespace-nowrap font-medium text-slate-900`}>{formatDayMonth(holiday.holiday_date)}</td>
                  <td className={tdClass}>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {holiday.name}
                      {isWeekend(holiday.holiday_date) && <Badge tone="gray">Weekend</Badge>}
                    </span>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <ActionButton
                      action={deleteHoliday.bind(null, holiday.holiday_date)}
                      label="Delete"
                      pendingLabel="Deleting…"
                      variant="ghost"
                      icon={<Trash2 size={14} />}
                      confirm={`Delete ${holiday.name} (${formatDayMonth(holiday.holiday_date)} ${year})?`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  )
}

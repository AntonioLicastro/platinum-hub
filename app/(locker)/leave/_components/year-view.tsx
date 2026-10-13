import Link from 'next/link'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { can, isHr, type PeopleViewer } from '@/utils/people/access'
import { formatDate, todayIso } from '@/utils/people/format'
import { LEAVE_YEAR_MAX, LEAVE_YEAR_MIN, loadLeaveYear } from '@/utils/people/leave-year'
import { buttonClass, Card } from '../../_components/ui'
import PrintButton from './print-button'
import YearMonth from './year-month'
import YearPeople from './year-people'

// The shared layout wraps every page in a sidebar / mobile header; when printing, only the calendar should come out.
const PRINT_CSS = `@media print {
  @page { size: A4 landscape; margin: 10mm; }
  aside[class~="fixed"], [class~="sticky"][class~="lg:hidden"] { display: none !important; }
  [class~="lg:pl-64"] { padding-left: 0 !important; }
  main { max-width: none !important; padding: 0 !important; }
}`

type YearOptions = { year: number; group: string | null; showPending: boolean; allTypes: boolean }

function hrefFor({ year, group, showPending, allTypes }: YearOptions): string {
  const params = new URLSearchParams({ view: 'year', year: String(year) })
  if (group) params.set('group', group)
  if (showPending) params.set('pending', '1')
  if (allTypes) params.set('all', '1')
  return `/leave?${params}`
}

function Toggle({ href, on, children }: { href: string; on: boolean; children: string }) {
  return (
    <Link
      href={href}
      role="switch"
      aria-checked={on}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
    >
      <span
        aria-hidden="true"
        className={`flex size-4 items-center justify-center rounded border ${on ? 'border-[#323398] bg-[#323398] text-white' : 'border-slate-400 bg-white'}`}
      >
        {on && <Check size={11} strokeWidth={3} />}
      </span>
      {children}
    </Link>
  )
}

export default async function YearView({ viewer, ...options }: { viewer: PeopleViewer } & YearOptions) {
  const data = await loadLeaveYear(viewer, options)
  const { year, activeGroup } = data
  const { showPending, allTypes } = options
  const today = todayIso()
  const hereWith = (changes: Partial<YearOptions>) => hrefFor({ ...options, group: activeGroup, ...changes })
  const canAddLeave = viewer.employeeId !== null || can(viewer, 'leave.manage')
  const away = !allTypes ? 'annual leave' : isHr(viewer) ? 'leave of every type' : 'leave of every type you may see'

  return (
    <div className="@container space-y-4 [print-color-adjust:exact]">
      <style>{PRINT_CSS}</style>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold text-slate-900">Leave calendar {year}</h1>
        <p className="text-xs text-slate-600">
          {activeGroup ?? 'Everyone'} · {allTypes ? 'All leave types' : 'Annual leave'} · {showPending ? 'Approved and waiting for approval' : 'Approved only'} · Printed {formatDate(today)}
        </p>
      </div>

      <Card className="space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-1.5">
            {year > LEAVE_YEAR_MIN ? (
              <Link href={hereWith({ year: year - 1 })} className={buttonClass('secondary', 'sm')} aria-label={`Previous year, ${year - 1}`}>
                <ChevronLeft size={16} />
              </Link>
            ) : (
              <span aria-hidden="true" className={`${buttonClass('secondary', 'sm')} opacity-40`}><ChevronLeft size={16} /></span>
            )}
            <h2 className="min-w-24 px-2 text-center text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
              <span className="sr-only">Leave calendar for </span>{year}
            </h2>
            {year < LEAVE_YEAR_MAX ? (
              <Link href={hereWith({ year: year + 1 })} className={buttonClass('secondary', 'sm')} aria-label={`Next year, ${year + 1}`}>
                <ChevronRight size={16} />
              </Link>
            ) : (
              <span aria-hidden="true" className={`${buttonClass('secondary', 'sm')} opacity-40`}><ChevronRight size={16} /></span>
            )}
            {year !== Number(today.slice(0, 4)) && (
              <Link href={hereWith({ year: Number(today.slice(0, 4)) })} className={`${buttonClass('ghost', 'sm')} ml-1`}>This year</Link>
            )}
          </div>

          <nav aria-label="Filter by group">
            <ul className="flex flex-wrap items-center gap-2">
              {[null, ...data.groups].map(group => {
                const selected = group === activeGroup
                return (
                  <li key={group ?? '~all'}>
                    <Link
                      href={hereWith({ group })}
                      aria-current={selected ? 'true' : undefined}
                      className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
                        selected ? 'border-[#323398] bg-[#323398] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {group ?? 'All'}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Toggle href={hereWith({ showPending: !showPending })} on={showPending}>Show pending</Toggle>
            <Toggle href={hereWith({ allTypes: !allTypes })} on={allTypes}>Include all leave types</Toggle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canAddLeave && (
              <Link href="/leave/request" className={buttonClass('secondary', 'sm')}>
                <CalendarPlus size={14} /> Add leave
              </Link>
            )}
            <PrintButton />
          </div>
        </div>
      </Card>

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="Key">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-4 rounded-full bg-slate-500" /> Approved
        </li>
        {showPending && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-4 rounded-full border-[1.5px] border-dashed border-slate-500 bg-slate-500/15" /> Waiting for approval
          </li>
        )}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="relative size-4 rounded-full bg-slate-500">
            <span className="absolute -bottom-1 -right-1 flex size-2.5 items-center justify-center rounded-full bg-white text-[7px] font-bold text-slate-800 ring-1 ring-slate-400">½</span>
          </span> Half day
        </li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-4 rounded border border-slate-200 bg-slate-100" /> Weekend</li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-4 rounded border border-slate-200 bg-emerald-50" /> <span className="underline decoration-emerald-600 decoration-dotted underline-offset-2">Public holiday</span>
        </li>
      </ul>

      {!data.anyEntries && (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            No {showPending ? '' : 'approved '}{away} is booked in {year}{activeGroup ? ` for ${activeGroup}` : ''}.
            {!allTypes && ' Turn on “Include all leave types” to see other kinds of leave.'}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-5 @5xl:flex-row @5xl:items-start">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 @xl:grid-cols-2 @5xl:grid-cols-3">
          {Array.from({ length: 12 }, (_, i) => (
            <YearMonth key={i} year={year} month={i + 1} byDay={data.byDay} holidays={data.holidays} today={today} />
          ))}
        </div>
        <div className="w-full @5xl:w-48 @5xl:shrink-0">
          <YearPeople sections={data.sections} year={year} showPending={showPending} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Showing {away}, with a chip on each working day it covers.
        Days are approved days for requests that <em>start</em> in {year}, the same rule as the balances, so leave over New Year counts in the year it starts.
        {showPending && ' Requests waiting for approval are dashed and never counted.'}
        {allTypes && !isHr(viewer) && ' Some kinds of leave are private to HR and the person, so they show only as “Away”.'}
        {' '}Hover a chip for the person and type; the people list names every colour.
      </p>
    </div>
  )
}

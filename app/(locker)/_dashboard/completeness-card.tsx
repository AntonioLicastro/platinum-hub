import Link from 'next/link'
import { CheckCircle2, Gauge, TriangleAlert, Upload } from 'lucide-react'
import type { Tone } from '@/utils/people/constants'
import type { Section } from '@/utils/people/dashboard-data'
import { employeeHref, plural, type CompletenessSummary } from '@/utils/people/dashboard-metrics'
import { displayName } from '@/utils/people/format'
import { Avatar, Card, CardHeader, EmptyState, ProgressBar, buttonClass } from '../_components/ui'

/** Below this average the card points HR at the import, the quickest way to fill gaps. */
const LOW_AVERAGE = 70

const toneFor = (percent: number): Tone => (percent >= 80 ? 'green' : percent >= 50 ? 'amber' : 'red')

function Summary({ summary, canImport }: { summary: CompletenessSummary; canImport: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-4xl font-semibold tracking-tight text-slate-900">
            {summary.average}<span className="text-2xl text-slate-500">%</span>
          </p>
          <p className="text-xs text-slate-500">average across {summary.people} current {plural(summary.people, 'person', 'people')}</p>
        </div>
        <div className="min-w-40 flex-1">
          <ProgressBar value={summary.average} tone={toneFor(summary.average)} label="Average data completeness" />
        </div>
      </div>

      {!summary.includesPersonal && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          Personal details could not be loaded just now, so only employment details are scored.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-1 px-2 text-sm font-semibold text-slate-900">Least complete</h3>
          {summary.lowest.length === 0 ? (
            summary.includesPersonal ? (
              <p className="flex items-center gap-2 px-2 py-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} aria-hidden="true" /> Every current record is complete.
              </p>
            ) : (
              <p className="px-2 py-2 text-sm text-slate-600">Nothing is missing from the employment details. Personal details were not checked.</p>
            )
          ) : (
            <ul>
              {summary.lowest.map(row => {
                const name = displayName(row.employee)
                return (
                  <li key={row.employee.id}>
                    <Link
                      href={employeeHref(row.employee.id)}
                      className="block rounded-xl px-2 py-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                          <p className="text-xs text-slate-500">{row.missing} {plural(row.missing, 'field', 'fields')} to fill in</p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{row.percent}%</p>
                      </div>
                      <div className="mt-1.5 pl-11">
                        <ProgressBar value={row.percent} tone={toneFor(row.percent)} label={`${name}, record ${row.percent}% complete`} />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-1 px-2 text-sm font-semibold text-slate-900">Most common gaps</h3>
          {summary.commonGaps.length === 0 ? (
            <p className="px-2 py-2 text-sm italic text-slate-500">
              {summary.includesPersonal ? 'No gaps found' : 'No gaps found in the employment details'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.commonGaps.map(gap => (
                <li key={gap.label} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
                  <span className="text-slate-700">{gap.label}</span>
                  <span className="text-slate-500">
                    missing for <span className="font-semibold tabular-nums text-slate-900">{gap.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {summary.average < LOW_AVERAGE && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#323398]/5 px-4 py-3">
          <p className="text-sm text-slate-700">
            Lots of this can be filled in at once. Importing an export from your previous HR system is the quickest way.
          </p>
          {canImport && (
            <Link href="/settings/import" className={buttonClass('primary', 'sm')}>
              <Upload size={14} aria-hidden="true" /> Import data
            </Link>
          )}
        </div>
      )}
    </>
  )
}

export function CompletenessCard({ section, canImport }: { section: Section<CompletenessSummary>; canImport: boolean }) {
  if (section.status === 'hidden') return null
  return (
    <Card>
      <CardHeader icon={Gauge} title="Data completeness" description="How much of each person's record is filled in. HR only." />
      {section.status === 'error' ? (
        <p role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          We couldn&apos;t work out data completeness just now. Try refreshing the page.
        </p>
      ) : section.data.people === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No current employees to measure"
          body="Completeness appears once people have been added or imported."
          action={canImport ? <Link href="/settings/import" className={buttonClass('primary', 'sm')}><Upload size={14} aria-hidden="true" /> Import data</Link> : undefined}
        />
      ) : (
        <Summary summary={section.data} canImport={canImport} />
      )}
    </Card>
  )
}

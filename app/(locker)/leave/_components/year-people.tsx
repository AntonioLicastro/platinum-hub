import { formatDays } from '@/utils/people/format'
import type { YearPerson, YearSection } from '@/utils/people/leave-year'
import { formatDayTotal } from '@/utils/people/leave-year-people'
import { Card } from '../../_components/ui'
import { PersonChip } from './year-chip'

function PersonRow({ person, showPending }: { person: YearPerson; showPending: boolean }) {
  const waiting = showPending && person.pending > 0 ? `, ${formatDays(person.pending)} waiting for approval` : ''
  return (
    <li className="flex items-center gap-2 py-1" title={`${person.name}: ${formatDays(person.taken)} taken${waiting}`}>
      <PersonChip person={person} size="panel" decorative />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{person.label}</span>
      <span className="text-xs tabular-nums text-slate-500" aria-hidden="true">{formatDayTotal(person.taken)}</span>
      <span className="sr-only">{formatDays(person.taken)} taken{waiting}</span>
    </li>
  )
}

/** The legend: everyone in view with their colour and days taken. Also the place to find a name from initials. */
export default function YearPeople({ sections, year, showPending }: { sections: YearSection[]; year: number; showPending: boolean }) {
  return (
    <Card className="p-3.5 @5xl:sticky @5xl:top-6">
      <h2 className="text-sm font-semibold text-slate-900">People</h2>
      <p className="mb-3 text-xs text-slate-500">Days taken in {year}</p>
      {sections.length === 0 && <p className="text-sm text-slate-500">Nobody to show.</p>}
      <div className="@xl:columns-2 @3xl:columns-3 @5xl:columns-1 [&>section]:break-inside-avoid">
        {sections.map(section => (
          <section key={section.title ?? '~others'} className="mb-4 last:mb-0">
            <h3 className="mb-0.5 border-b border-slate-100 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {section.title ?? 'Everyone else'}
            </h3>
            <ul>
              {section.people.map(p => <PersonRow key={p.id} person={p} showPending={showPending} />)}
            </ul>
            {section.quiet.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer py-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                  {section.people.length > 0 ? `${section.quiet.length} more with no leave` : `${section.quiet.length} with no leave`} in {year}
                </summary>
                <ul>
                  {section.quiet.map(p => <PersonRow key={p.id} person={p} showPending={showPending} />)}
                </ul>
              </details>
            )}
          </section>
        ))}
      </div>
    </Card>
  )
}

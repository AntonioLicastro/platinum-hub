import { formatDays } from '@/utils/people/format'
import type { YearPerson } from '@/utils/people/leave-year'
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
export default function YearPeople({ people, year, showPending }: { people: YearPerson[]; year: number; showPending: boolean }) {
  return (
    <Card className="p-3.5 @5xl:sticky @5xl:top-6">
      <h2 className="text-sm font-semibold text-slate-900">People</h2>
      <p className="mb-3 text-xs text-slate-500">Days taken in {year}</p>
      {people.length === 0 && <p className="text-sm text-slate-500">Nobody to show.</p>}
      <ul className="@xl:columns-2 @3xl:columns-3 @5xl:columns-1">
        {people.map(p => <PersonRow key={p.id} person={p} showPending={showPending} />)}
      </ul>
    </Card>
  )
}

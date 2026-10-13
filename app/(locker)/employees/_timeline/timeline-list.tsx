import { Trash2 } from 'lucide-react'
import { ActionButton } from '../../_components/action-form'
import { Badge } from '../../_components/ui'
import { formatDate } from '@/utils/people/format'
import type { TimelineEntry } from '@/utils/people/timeline-data'
import { deleteEvent } from '../events-actions'
import { DOT_CLASS, categoryMeta } from './timeline-meta'

type Props = {
  entries: TimelineEntry[]
  employeeId: string
  /** HR can delete stored notes (never automatic entries). */
  canDelete: boolean
  today: string
}

function groupByYear(entries: TimelineEntry[]): { year: string; entries: TimelineEntry[] }[] {
  const groups: { year: string; entries: TimelineEntry[] }[] = []
  for (const entry of entries) {
    const year = entry.date.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last && last.year === year) last.entries.push(entry)
    else groups.push({ year, entries: [entry] })
  }
  return groups
}

export function TimelineList({ entries, employeeId, canDelete, today }: Props) {
  return (
    <div className="space-y-8">
      {groupByYear(entries).map(group => (
        <section key={group.year} aria-labelledby={`timeline-year-${group.year}`}>
          <h3 id={`timeline-year-${group.year}`} className="mb-4 flex items-center gap-3 text-sm font-semibold text-slate-900">
            <span className="rounded-full bg-slate-100 px-3 py-1 tabular-nums">{group.year}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
          </h3>
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-slate-200">
            {group.entries.map(entry => (
              <TimelineItem key={entry.key} entry={entry} employeeId={employeeId} canDelete={canDelete} today={today} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function TimelineItem({ entry, employeeId, canDelete, today }: { entry: TimelineEntry; employeeId: string; canDelete: boolean; today: string }) {
  const meta = categoryMeta(entry.category)
  const Icon = meta.icon
  const upcoming = entry.date > today
  const automatic = entry.visibility === null

  return (
    <li className="relative pl-12">
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white ${DOT_CLASS[meta.tone]}`}
      >
        <Icon size={16} />
      </span>
      <article
        className={`rounded-2xl border p-4 ${upcoming ? 'border-dashed border-slate-300 bg-slate-50/60' : 'border-slate-200/80 bg-white shadow-sm'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold text-slate-900">{entry.title}</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              <time dateTime={entry.date}>{formatDate(entry.date)}</time> · {meta.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {upcoming && <Badge tone="sky">Upcoming</Badge>}
            {automatic && <Badge tone="gray">Automatic</Badge>}
            {entry.visibility === 'hr_only' && <Badge tone="purple">HR only</Badge>}
            {entry.visibility === 'manager' && <Badge tone="green">Visible to managers</Badge>}
          </div>
        </div>
        {entry.details && <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-700">{entry.details}</p>}
        {(entry.author || (canDelete && entry.eventId)) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">{entry.author ? `Added by ${entry.author}` : ''}</p>
            {canDelete && entry.eventId && (
              <ActionButton
                action={deleteEvent.bind(null, employeeId, entry.eventId)}
                label="Delete"
                pendingLabel="Deleting…"
                variant="ghost"
                icon={<Trash2 size={14} />}
                confirm="Delete this timeline entry? Notes are meant to be permanent, so only delete one that was added by mistake. This cannot be undone."
              />
            )}
          </div>
        )}
      </article>
    </li>
  )
}

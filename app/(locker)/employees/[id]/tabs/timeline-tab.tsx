import Link from 'next/link'
import { History, Lock, Plus, TriangleAlert } from 'lucide-react'
import { canOnEmployee, isSelf } from '@/utils/people/access'
import { addDays, todayIso } from '@/utils/people/format'
import { auditProfileView } from '@/utils/people/profile-audit'
import { loadTimeline, type TimelineCategory } from '@/utils/people/timeline-data'
import { addEvent } from '../../events-actions'
import { NoteForm } from '../../_timeline/note-form'
import { TimelineList } from '../../_timeline/timeline-list'
import { categoryMeta } from '../../_timeline/timeline-meta'
import { buttonClass, Card, CardHeader, EmptyState } from '../../../_components/ui'
import type { TabProps } from './types'

/** Query parameter holding the category filter, so the tab keeps working next to whatever param selects the tab. */
const FILTER_PARAM = 'tl'

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function filterHref(employeeId: string, searchParams: TabProps['searchParams'], category: TimelineCategory | null): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const single = firstValue(value)
    if (key !== FILTER_PARAM && single !== undefined) params.set(key, single)
  }
  if (category) params.set(FILTER_PARAM, category)
  const query = params.toString()
  return `/employees/${employeeId}${query ? `?${query}` : ''}`
}

export default async function TimelineTab({ viewer, employee, searchParams }: TabProps) {
  const timeline = await loadTimeline(viewer, employee)
  if (!timeline) {
    return (
      <Card>
        <EmptyState
          icon={Lock}
          title="The timeline is not available"
          body="Case notes and history are visible to HR and to the manager responsible for this employee."
        />
      </Card>
    )
  }

  // The HR level includes HR-only notes and every kind of leave: HR reading it for someone else is logged (counts only, de-duplicated).
  if (timeline.level === 'hr') {
    await auditProfileView(viewer, employee, 'timeline.view', {
      entries: timeline.entries.length,
      hr_only_notes: timeline.entries.filter(e => e.visibility === 'hr_only').length,
    })
  }

  const today = todayIso()
  const canAdd = canOnEmployee(viewer, 'events.add', employee)
  // deleteEvent refuses HR on their own record, so the buttons are not offered there either.
  const canDelete = timeline.level === 'hr' && canOnEmployee(viewer, 'employees.edit', employee) && !isSelf(viewer, employee)

  const noteCount = timeline.entries.filter(e => e.eventId !== null).length
  const categories = [...new Set(timeline.entries.map(e => e.category))]
  const requested = firstValue(searchParams[FILTER_PARAM])
  const active = categories.find(c => c === requested) ?? null
  const visible = active ? timeline.entries.filter(e => e.category === active) : timeline.entries

  return (
    <div className="space-y-6">
      {canAdd && (
        <Card>
          <details open={noteCount === 0} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-base font-semibold text-slate-900">Add a note</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  {noteCount === 0
                    ? 'No notes yet. Record conversations, commendations, warnings or anything else worth remembering.'
                    : 'Record a conversation, commendation, warning or anything else worth remembering.'}
                </span>
              </span>
              <span className={`${buttonClass('secondary', 'sm')} group-open:hidden`}>
                <Plus size={14} /> New note
              </span>
            </summary>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <NoteForm
                action={addEvent.bind(null, employee.id)}
                today={today}
                maxDate={addDays(today, 1)}
                canChooseVisibility={timeline.level === 'hr'}
              />
            </div>
          </details>
        </Card>
      )}

      <Card>
        <CardHeader
          icon={History}
          title="Timeline"
          description={
            timeline.level === 'hr'
              ? 'Notes and key moments, newest first. Start date, leave and completed reviews are added automatically.'
              : 'Notes shared with managers and key moments, newest first.'
          }
        />

        {timeline.incomplete && (
          <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            <TriangleAlert size={16} className="shrink-0" /> Some entries could not be loaded. Refresh the page to try again.
          </p>
        )}

        {categories.length > 1 && (
          <nav aria-label="Filter timeline" className="mb-6 flex flex-wrap gap-2">
            <FilterChip href={filterHref(employee.id, searchParams, null)} label="All" current={active === null} />
            {categories.map(category => (
              <FilterChip
                key={category}
                href={filterHref(employee.id, searchParams, category)}
                label={categoryMeta(category).label}
                current={active === category}
              />
            ))}
          </nav>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing on the timeline yet"
            body={
              canAdd
                ? 'Start dates, approved leave and completed reviews appear here automatically. Add the first note above to start the story.'
                : 'Start dates, approved leave and completed reviews appear here automatically, along with any notes shared with managers.'
            }
          />
        ) : (
          <TimelineList entries={visible} employeeId={employee.id} canDelete={canDelete} today={today} />
        )}
      </Card>
    </div>
  )
}

function FilterChip({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'true' : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/30 ${
        current ? 'bg-[#323398] text-white ring-[#323398]' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </Link>
  )
}

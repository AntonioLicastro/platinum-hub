import Link from 'next/link'
import { CheckCheck } from 'lucide-react'
import type { OpenChecklistItem } from '@/utils/people/checklist-data'
import { dueDistance, itemState } from '@/utils/people/checklist-status'
import { displayName, formatDate } from '@/utils/people/format'
import { Card, CardHeader } from '../../_components/ui'
import { toggleChecklistItem } from '../actions'
import { StateChip } from './chips'
import { TickButton } from './tick-button'

/** Open tasks the viewer can action, most urgent first. The caller has already filtered to tasks the viewer may tick. */
export function MyTasks({ items, limit, today }: { items: OpenChecklistItem[]; limit: number; today: string }) {
  const shown = items.slice(0, limit)
  return (
    <Card>
      <CardHeader
        icon={CheckCheck}
        title="My tasks"
        description="Open tasks that are yours to do."
      />
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm italic text-slate-500">
          Nothing is waiting on you right now.
        </p>
      ) : (
        <>
          <ul className="-my-1 divide-y divide-slate-100">
            {shown.map(item => {
              const state = itemState(item, today)
              return (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <TickButton
                    action={toggleChecklistItem.bind(null, item.employee.id, item.id, true)}
                    done={false}
                    title={`${item.title} for ${displayName(item.employee)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <Link
                        href={`/employees/${item.employee.id}?tab=checklists`}
                        prefetch={false}
                        className="font-medium text-[#323398] hover:underline"
                      >
                        {displayName(item.employee)}
                      </Link>
                      {item.due_on && ` · ${formatDate(item.due_on)} (${dueDistance(item.due_on, today).toLowerCase()})`}
                    </p>
                  </div>
                  <StateChip state={state} />
                </li>
              )
            })}
          </ul>
          {items.length > shown.length && (
            <p className="mt-3 text-xs text-slate-500">
              Showing the {shown.length} most urgent of {items.length}. Open a checklist to see the rest.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

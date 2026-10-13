import Link from 'next/link'
import { ArrowRight, CheckCheck, ListChecks } from 'lucide-react'
import { dueDistance, ITEM_STATES, itemState } from '@/utils/people/checklist-status'
import { formatDate, todayIso } from '@/utils/people/format'
import type { Loaded, MyTask } from '@/utils/people/me-data'
import { pluralise } from '@/utils/people/me-format'
import { Badge, Card, CardHeader } from '../../_components/ui'
import { Unavailable } from './unavailable'

const SHOWN = 5

export function TasksCard({ tasks, employeeId }: { tasks: Loaded<MyTask[]>; employeeId: string }) {
  return (
    <Card>
      <CardHeader icon={ListChecks} title="My tasks" description="Steps from your onboarding or offboarding that are yours to do" />
      {tasks.ok ? <TasksBody tasks={tasks.data} employeeId={employeeId} /> : <Unavailable what="your tasks" />}
    </Card>
  )
}

function TasksBody({ tasks, employeeId }: { tasks: MyTask[]; employeeId: string }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
        <CheckCheck size={20} className="mx-auto mb-1.5 text-slate-400" aria-hidden="true" />
        <span className="block font-medium text-slate-700">Nothing on your list right now</span>
        If HR gives you tasks to do, like returning a form or finishing a training step, they show up here.
      </p>
    )
  }

  const today = todayIso()
  const hidden = tasks.length - SHOWN
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {tasks.slice(0, SHOWN).map(({ item, checklist }) => {
          const state = itemState(item, today)
          return (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-300" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-slate-900">{item.title}</p>
                {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {checklist.name}{item.due_on && ` · due ${formatDate(item.due_on)}`}
                </p>
              </div>
              <Badge tone={ITEM_STATES[state].tone}>{dueDistance(item.due_on, today) || ITEM_STATES[state].label}</Badge>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-slate-500">and {hidden} more {pluralise(hidden, 'task')} in your checklists.</p>
      )}
      <Link
        href={`/employees/${employeeId}?tab=checklists`}
        prefetch={false}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#323398] hover:underline focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        Open my checklists to tick them off <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}

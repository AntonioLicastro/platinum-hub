import Link from 'next/link'
import type { ChecklistProgress, OpenChecklistItem } from '@/utils/people/checklist-data'
import { dueDistance, isOverdue } from '@/utils/people/checklist-status'
import { CHECKLIST_KINDS, labelOf } from '@/utils/people/constants'
import { displayName, formatDate } from '@/utils/people/format'
import { Avatar, Badge, ProgressBar } from '../../_components/ui'

type Props = {
  row: ChecklistProgress
  /** The earliest-due open task on this checklist, if any. */
  next: OpenChecklistItem | null
  today: string
}

/** One in-progress checklist: who it is for, how far along it is, and what is due next. Links to the employee's Checklists tab. */
export function ProgressCard({ row, next, today }: Props) {
  const { employee, checklist, done, total, overdue } = row
  const name = displayName(employee)
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const late = next !== null && isOverdue(next, today)

  return (
    <li>
      <Link
        href={`/employees/${employee.id}?tab=checklists`}
        // Opening a profile is audited for some tabs, so don't render it on hover.
        prefetch={false}
        className="block h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-[#323398]/30 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        <div className="flex items-start gap-3">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{name}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={checklist.kind === 'onboarding' ? 'blue' : 'purple'}>{labelOf(CHECKLIST_KINDS, checklist.kind)}</Badge>
                {overdue > 0 && <Badge tone="red" dot>{overdue} overdue</Badge>}
              </div>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {checklist.name}{employee.job_title ? ` · ${employee.job_title}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={percent} tone={overdue > 0 ? 'amber' : 'green'} label={`${name}, ${checklist.name}`} />
          </div>
          <p className="shrink-0 text-xs font-medium tabular-nums text-slate-600">{done} of {total}</p>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {total === 0 ? (
            <span className="italic text-slate-500">No tasks on this checklist yet</span>
          ) : next ? (
            <>
              <span className="font-medium text-slate-700">Next: {next.title}</span>
              {next.due_on && (
                <span className={late ? 'font-medium text-red-600' : undefined}>
                  {' · '}{formatDate(next.due_on)} ({dueDistance(next.due_on, today).toLowerCase()})
                </span>
              )}
            </>
          ) : (
            'Every task is ticked off'
          )}
        </p>
      </Link>
    </li>
  )
}

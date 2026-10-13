import { ChevronDown, ListPlus, StickyNote, Trash2 } from 'lucide-react'
import { isSelf, type PeopleViewer } from '@/utils/people/access'
import type { ChecklistWithItems } from '@/utils/people/checklist-data'
import { canTickItem } from '@/utils/people/checklist-access'
import { ITEM_TEXT_MAX, ITEM_TITLE_MAX, NOTE_MAX } from '@/utils/people/checklist-input'
import { groupByDueDate, isOverdue, itemState, summarise } from '@/utils/people/checklist-status'
import { CHECKLIST_KINDS, OWNER_ROLES, labelOf } from '@/utils/people/constants'
import { formatDate, formatDateTime, relativeDays } from '@/utils/people/format'
import { EARLIEST_DATE } from '@/utils/people/timeline-input'
import type { ChecklistItem, Employee } from '@/utils/people/types'
import { ActionButton, ActionForm } from '../../_components/action-form'
import { Badge, Card, Field, FormGrid, ProgressBar, inputClass } from '../../_components/ui'
import { addChecklistItem, deleteChecklist, deleteChecklistItem, saveChecklistItemNote, toggleChecklistItem } from '../actions'
import { OwnerChip, StateChip } from './chips'
import { TickButton } from './tick-button'

export type ChecklistContext = {
  viewer: PeopleViewer
  employee: Employee
  /** Lowercase email -> display name, for "done by". */
  names: Map<string, string>
  today: string
  canManage: boolean
  isHrUser: boolean
}

function disabledReason(item: ChecklistItem): string {
  return item.owner_role === 'employee'
    ? 'You can view this task but not change it'
    : `This task belongs to ${labelOf(OWNER_ROLES, item.owner_role)}. Only they or HR can tick it off.`
}

function ItemRow({ item, ctx }: { item: ChecklistItem; ctx: ChecklistContext }) {
  const { viewer, employee, names, today, isHrUser } = ctx
  const state = itemState(item, today)
  const done = state === 'done'
  const canTick = canTickItem(viewer, employee, item.owner_role)
  const completedBy = item.completed_by ? names.get(item.completed_by.toLowerCase()) ?? item.completed_by : null
  // Notes on other people's tasks are working notes for HR and managers; the employee sees only the ones on their own tasks.
  const showNote = item.notes !== null && (canTick || !isSelf(viewer, employee))

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <TickButton
          action={toggleChecklistItem.bind(null, employee.id, item.id, !done)}
          done={done}
          title={item.title}
          disabledReason={canTick ? undefined : disabledReason(item)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <p className={`min-w-0 break-words text-sm font-medium ${done ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
              {item.title}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <OwnerChip role={item.owner_role} />
              <StateChip state={state} />
            </div>
          </div>
          {item.description && <p className="mt-0.5 whitespace-pre-line break-words text-xs text-slate-500">{item.description}</p>}
          {done && item.completed_at && (
            <p className="mt-1 text-xs text-slate-500">
              Done {formatDateTime(item.completed_at)}{completedBy ? ` by ${completedBy}` : ''}
            </p>
          )}
          {showNote && (
            <p className="mt-2 whitespace-pre-line break-words rounded-xl bg-amber-50/70 px-3 py-2 text-xs text-slate-700 ring-1 ring-inset ring-amber-200/70">
              <span className="mb-0.5 block font-semibold text-amber-800">Note</span>
              {item.notes}
            </p>
          )}

          {(canTick || isHrUser) && (
            <div className="mt-1.5 flex flex-wrap items-start gap-1">
              {canTick && (
                <details className="group w-full sm:w-auto">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[#323398] hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
                    <StickyNote size={14} aria-hidden="true" />
                    {item.notes ? 'Edit note' : 'Add note'}
                  </summary>
                  <div className="mt-2 sm:w-96 sm:max-w-full">
                    <ActionForm
                      action={saveChecklistItemNote.bind(null, employee.id, item.id)}
                      submitLabel="Save note"
                      pendingLabel="Saving…"
                    >
                      <label htmlFor={`note-${item.id}`} className="sr-only">Note for {item.title}</label>
                      <textarea
                        id={`note-${item.id}`} name="notes" rows={3} maxLength={NOTE_MAX} defaultValue={item.notes ?? ''}
                        placeholder="Anything the next person should know" className={inputClass}
                      />
                    </ActionForm>
                  </div>
                </details>
              )}
              {isHrUser && (
                <ActionButton
                  action={deleteChecklistItem.bind(null, employee.id, item.id)}
                  label="Delete task"
                  pendingLabel="Deleting…"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  confirm={`Delete “${item.title}” from this checklist? This cannot be undone.`}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function AddTaskForm({ checklistId, ctx }: { checklistId: string; ctx: ChecklistContext }) {
  const prefix = `add-${checklistId}`
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#323398] hover:bg-slate-100/70 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
        <ListPlus size={16} aria-hidden="true" />
        Add a task
      </summary>
      <div className="border-t border-slate-200 bg-white p-4">
        <ActionForm
          action={addChecklistItem.bind(null, ctx.employee.id, checklistId)}
          submitLabel="Add task"
          pendingLabel="Adding…"
          resetOnSuccess
        >
          <FormGrid>
            <Field label="Task" htmlFor={`${prefix}-title`} required wide>
              <input
                id={`${prefix}-title`} name="title" type="text" required maxLength={ITEM_TITLE_MAX} autoComplete="off"
                placeholder="e.g. Order a uniform" className={inputClass}
              />
            </Field>
            <Field label="Owner" htmlFor={`${prefix}-owner`} required>
              <select id={`${prefix}-owner`} name="owner_role" defaultValue="hr" className={inputClass}>
                {OWNER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Due on" htmlFor={`${prefix}-due`} hint="Optional.">
              <input id={`${prefix}-due`} name="due_on" type="date" min={EARLIEST_DATE} className={inputClass} />
            </Field>
            <Field label="Details" htmlFor={`${prefix}-details`} wide hint="Optional.">
              <textarea id={`${prefix}-details`} name="description" rows={2} maxLength={ITEM_TEXT_MAX} className={inputClass} />
            </Field>
          </FormGrid>
        </ActionForm>
      </div>
    </details>
  )
}

function ChecklistHeader({ entry, ctx, foldable = false }: { entry: ChecklistWithItems; ctx: ChecklistContext; foldable?: boolean }) {
  const { checklist, items } = entry
  const progress = summarise(items, ctx.today)
  const complete = checklist.completed_at !== null
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{checklist.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Started {formatDate(checklist.started_on)}
            {complete && ` · Completed ${formatDateTime(checklist.completed_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={checklist.kind === 'onboarding' ? 'blue' : 'purple'}>{labelOf(CHECKLIST_KINDS, checklist.kind)}</Badge>
          {complete ? <Badge tone="green" dot>Complete</Badge> : <Badge tone="sky" dot>In progress</Badge>}
          {progress.overdue > 0 && <Badge tone="red" dot>{progress.overdue} overdue</Badge>}
          {foldable && <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={progress.percent} tone={complete ? 'green' : 'blue'} label={`${checklist.name} progress`} />
        </div>
        <p className="shrink-0 text-xs tabular-nums text-slate-500">
          {progress.done} of {progress.total} done
        </p>
      </div>
    </div>
  )
}

function ChecklistBody({ entry, ctx }: { entry: ChecklistWithItems; ctx: ChecklistContext }) {
  const { checklist, items } = entry
  const groups = groupByDueDate(items)
  return (
    <>
      {groups.length === 0 ? (
        <p className="border-t border-slate-100 px-5 py-6 text-center text-sm italic text-slate-500">
          This checklist has no tasks yet.{ctx.canManage ? ' Add the first one below.' : ''}
        </p>
      ) : (
        groups.map(group => {
          const late = group.dueOn !== null && group.items.some(i => isOverdue(i, ctx.today))
          const headingId = `${checklist.id}-${group.dueOn ?? 'undated'}`
          return (
            <section key={group.dueOn ?? 'undated'} aria-labelledby={headingId} className="border-t border-slate-100">
              <h4
                id={headingId}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-slate-50/70 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {group.dueOn ? formatDate(group.dueOn) : 'No due date'}
                {group.dueOn && <span className="font-normal normal-case tracking-normal text-slate-500">{relativeDays(group.dueOn)}</span>}
                {late && <Badge tone="red">Overdue</Badge>}
              </h4>
              <ul className="divide-y divide-slate-100">
                {group.items.map(item => <ItemRow key={item.id} item={item} ctx={ctx} />)}
              </ul>
            </section>
          )
        })
      )}

      {(ctx.canManage || ctx.isHrUser) && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          {ctx.canManage && <AddTaskForm checklistId={checklist.id} ctx={ctx} />}
          {ctx.isHrUser && (
            <ActionButton
              action={deleteChecklist.bind(null, ctx.employee.id, checklist.id)}
              label="Delete checklist"
              pendingLabel="Deleting…"
              variant="ghost"
              icon={<Trash2 size={14} />}
              confirm={`Delete “${checklist.name}” and all of its tasks? This cannot be undone.`}
            />
          )}
        </div>
      )}
    </>
  )
}

/** One employee's checklist: progress header, tasks grouped by due date, and (for managers) add and delete controls. */
export function ChecklistCard({ entry, ctx }: { entry: ChecklistWithItems; ctx: ChecklistContext }) {
  if (entry.checklist.completed_at) {
    // Finished checklists stay on record but fold away so the live ones lead.
    return (
      <Card padded={false}>
        <details className="group">
          <summary className="cursor-pointer list-none rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
            <ChecklistHeader entry={entry} ctx={ctx} foldable />
          </summary>
          <ChecklistBody entry={entry} ctx={ctx} />
        </details>
      </Card>
    )
  }
  return (
    <Card padded={false}>
      <ChecklistHeader entry={entry} ctx={ctx} />
      <ChecklistBody entry={entry} ctx={ctx} />
    </Card>
  )
}

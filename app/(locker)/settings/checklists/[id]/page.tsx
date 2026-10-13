import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDown, ArrowUp, Info, ListChecks, Pencil, Trash2 } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { describeOffset } from '@/utils/people/checklist-status'
import { getTemplate, listTemplateUsage } from '@/utils/people/checklist-templates'
import { CHECKLIST_KINDS, labelOf } from '@/utils/people/constants'
import { OwnerChip } from '../../../onboarding/_components/chips'
import { ActionButton, ActionForm } from '../../../_components/action-form'
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, TableCard, buttonClass, tableClass, tdClass, thClass,
} from '../../../_components/ui'
import { ItemFields } from '../_components/item-fields'
import { TemplateForm } from '../_components/template-form'
import {
  addTemplateItem, deleteTemplateItem, moveTemplateItem, updateTemplate, updateTemplateItem,
} from '../actions'

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

export default async function ChecklistTemplatePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('settings.manage')
  const [{ id }, query] = await Promise.all([params, searchParams])
  if (!/^\d{1,9}$/.test(id)) notFound()
  const templateId = Number(id)

  const [found, usage] = await Promise.all([getTemplate(templateId), listTemplateUsage()])
  if (!found) notFound()
  const { template, items } = found
  const running = usage.get(template.id)?.inProgress ?? 0
  const here = `/settings/checklists/${template.id}`
  const editingId = Number(first(query.edit))

  return (
    <>
      <PageHeader
        title={template.name}
        icon={ListChecks}
        crumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Checklist templates', href: '/settings/checklists' },
          { label: template.name },
        ]}
        subtitle="Edit the template and its tasks. Tasks are dated from the day a checklist starts."
        actions={
          <>
            <Badge tone={template.kind === 'onboarding' ? 'blue' : 'purple'}>{labelOf(CHECKLIST_KINDS, template.kind)}</Badge>
            {template.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray">Inactive</Badge>}
          </>
        }
      />

      <p className="mb-6 flex items-start gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-inset ring-sky-200/70">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Changes only affect checklists started from now on.
          {running > 0
            ? ` ${running} ${running === 1 ? 'checklist is' : 'checklists are'} running from this template and keep${running === 1 ? 's' : ''} their current tasks.`
            : ' Nothing is running from this template at the moment.'}
        </span>
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" description="What the template is called, whether it is onboarding or offboarding, and who it is suggested for." />
          <TemplateForm
            action={updateTemplate.bind(null, template.id)}
            template={template}
            idPrefix="edit-template"
            submitLabel="Save details"
            pendingLabel="Saving…"
          />
        </Card>

        <section aria-labelledby="tasks-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="tasks-heading" className="text-base font-semibold text-slate-900">Tasks</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {items.length === 0 ? 'No tasks yet.' : `${items.length} ${items.length === 1 ? 'task' : 'tasks'}, in the order they appear on a checklist.`}
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="This template has no tasks yet"
              body="A checklist started from it would be empty, so it cannot be used until it has at least one task. Add the first one below."
            />
          ) : (
            <TableCard>
              <table className={tableClass}>
                <caption className="sr-only">Tasks in {template.name}</caption>
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th scope="col" className={thClass}>#</th>
                    <th scope="col" className={thClass}>Task</th>
                    <th scope="col" className={thClass}>Due</th>
                    <th scope="col" className={thClass}>Owner</th>
                    <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => item.id === editingId ? (
                    <tr key={item.id}>
                      <td colSpan={5} className="bg-slate-50/60 p-5">
                        <p className="mb-4 text-sm font-semibold text-slate-900">Edit task {index + 1}</p>
                        <ActionForm
                          action={updateTemplateItem.bind(null, template.id, item.id)}
                          redirectTo={here}
                          submitLabel="Save task"
                          pendingLabel="Saving…"
                          footer={<Link href={here} className={buttonClass('ghost')}>Cancel</Link>}
                        >
                          <ItemFields idPrefix={`edit-item-${item.id}`} item={item} />
                        </ActionForm>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td className={`${tdClass} w-10 tabular-nums text-slate-500`}>{index + 1}</td>
                      <td className={`${tdClass} min-w-56`}>
                        <p className="font-medium text-slate-900">{item.title}</p>
                        {item.description && <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>{describeOffset(item.due_offset_days)}</td>
                      <td className={tdClass}><OwnerChip role={item.owner_role} /></td>
                      <td className={tdClass}>
                        <div className="flex items-center justify-end gap-1">
                          {index > 0 && (
                            <ActionButton
                              action={moveTemplateItem.bind(null, template.id, item.id, 'up')}
                              label={<span className="sr-only">Move “{item.title}” up</span>}
                              pendingLabel=""
                              variant="ghost"
                              icon={<ArrowUp size={14} aria-hidden="true" />}
                            />
                          )}
                          {index < items.length - 1 && (
                            <ActionButton
                              action={moveTemplateItem.bind(null, template.id, item.id, 'down')}
                              label={<span className="sr-only">Move “{item.title}” down</span>}
                              pendingLabel=""
                              variant="ghost"
                              icon={<ArrowDown size={14} aria-hidden="true" />}
                            />
                          )}
                          <Link href={`${here}?edit=${item.id}`} scroll={false} className={buttonClass('ghost', 'sm')}>
                            <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> “{item.title}”</span>
                          </Link>
                          <ActionButton
                            action={deleteTemplateItem.bind(null, template.id, item.id)}
                            label={<span className="sr-only">Delete “{item.title}”</span>}
                            pendingLabel=""
                            variant="ghost"
                            icon={<Trash2 size={14} aria-hidden="true" />}
                            confirm={`Delete “${item.title}” from this template? Checklists already started keep it.`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
        </section>

        <Card>
          <CardHeader title="Add a task" description="It goes at the end of the list. Use the arrows above to move it." />
          <ActionForm action={addTemplateItem.bind(null, template.id)} submitLabel="Add task" pendingLabel="Adding…" resetOnSuccess>
            <ItemFields idPrefix="add-item" />
          </ActionForm>
        </Card>
      </div>
    </>
  )
}

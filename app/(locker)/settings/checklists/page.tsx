import Link from 'next/link'
import { Copy, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { listTemplateUsage, listTemplates, type TemplateSummary, type TemplateUsage } from '@/utils/people/checklist-templates'
import { CHECKLIST_KINDS, labelOf } from '@/utils/people/constants'
import { ActionButton } from '../../_components/action-form'
import { Badge, Card, EmptyState, PageHeader, buttonClass } from '../../_components/ui'
import { ActiveToggle } from './_components/active-toggle'
import { TemplateForm } from './_components/template-form'
import { createTemplate, deleteTemplate, duplicateTemplate, setTemplateActive } from './actions'

/** Job titles listed on a card before the rest collapse into a count. */
const TITLES_SHOWN = 4

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function deleteWarning(template: TemplateSummary, usage: TemplateUsage): string {
  if (usage.total === 0) return `Delete “${template.name}” and its ${plural(template.itemCount, 'task', 'tasks')}? This cannot be undone.`
  const running = usage.inProgress > 0 ? ` (${usage.inProgress} still in progress)` : ''
  return `${plural(usage.total, 'checklist was', 'checklists were')} started from “${template.name}”${running}. ` +
    'They keep all their tasks and progress; they just stop being linked to this template. Delete it anyway? This cannot be undone.'
}

function TemplateCard({ template, usage }: { template: TemplateSummary; usage: TemplateUsage }) {
  const shown = template.applies_to_titles.slice(0, TITLES_SHOWN)
  const hidden = template.applies_to_titles.length - shown.length
  return (
    <li>
      <article className={`flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm ${template.active ? 'border-slate-200/80' : 'border-dashed border-slate-300 bg-slate-50/60'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-slate-900">
            <Link
              href={`/settings/checklists/${template.id}`}
              className="rounded hover:text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
            >
              {template.name}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={template.kind === 'onboarding' ? 'blue' : 'purple'}>{labelOf(CHECKLIST_KINDS, template.kind)}</Badge>
            {!template.active && <Badge tone="gray">Inactive</Badge>}
          </div>
        </div>

        {template.description
          ? <p className="mt-1.5 text-sm text-slate-600">{template.description}</p>
          : <p className="mt-1.5 text-sm italic text-slate-500">No description yet</p>}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {template.applies_to_titles.length === 0 ? (
            <span className="text-xs text-slate-500">Suggested for any job title</span>
          ) : (
            <>
              <span className="text-xs text-slate-500">Suggested for</span>
              {shown.map(title => (
                <span key={title} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{title}</span>
              ))}
              {hidden > 0 && <span className="text-xs text-slate-500">and {hidden} more</span>}
            </>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {template.itemCount === 0 ? <span className="italic text-slate-500">No tasks yet</span> : plural(template.itemCount, 'task', 'tasks')}
          {usage.total > 0 && ` · ${usage.inProgress} in progress · ${usage.total} started in total`}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-1">
            <Link href={`/settings/checklists/${template.id}`} className={buttonClass('secondary', 'sm')}>
              <Pencil size={14} aria-hidden="true" /> Edit tasks
            </Link>
            <ActionButton
              action={duplicateTemplate.bind(null, template.id)}
              label="Duplicate"
              pendingLabel="Copying…"
              variant="ghost"
              icon={<Copy size={14} />}
            />
            <ActionButton
              action={deleteTemplate.bind(null, template.id)}
              label="Delete"
              pendingLabel="Deleting…"
              variant="ghost"
              icon={<Trash2 size={14} />}
              confirm={deleteWarning(template, usage)}
            />
          </div>
          <ActiveToggle
            action={setTemplateActive.bind(null, template.id, !template.active)}
            active={template.active}
            templateName={template.name}
          />
        </div>
      </article>
    </li>
  )
}

export default async function ChecklistTemplatesPage() {
  await requireCapability('settings.manage')
  const [templates, usage] = await Promise.all([listTemplates(), listTemplateUsage()])

  return (
    <>
      <PageHeader
        title="Checklist templates"
        icon={ListChecks}
        subtitle="The standard steps for getting someone started or sending them off. Starting a checklist copies a template’s tasks and dates them from the start day."
      />

      <Card className="mb-8">
        <details open={templates.length === 0} className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-base font-semibold text-slate-900">Create a template</span>
              <span className="mt-0.5 block text-sm text-slate-500">Name it first. You add its tasks on the next screen.</span>
            </span>
            <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">
              <Plus size={14} aria-hidden="true" /> New template
            </span>
          </summary>
          <div className="mt-5 border-t border-slate-100 pt-5">
            <TemplateForm action={createTemplate} idPrefix="new-template" submitLabel="Create template" pendingLabel="Creating…" />
          </div>
        </details>
      </Card>

      {templates.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No templates yet"
          body="Create one above, for example a carer onboarding checklist or a standard offboarding. Each template is a list of tasks with an owner and a due date counted from the start day."
        />
      ) : (
        <div className="space-y-8">
          {CHECKLIST_KINDS.map(kind => {
            const ofKind = templates.filter(t => t.kind === kind.value)
            return (
              <section key={kind.value} aria-labelledby={`kind-${kind.value}`}>
                <h2 id={`kind-${kind.value}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {kind.label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{ofKind.length}</span>
                </h2>
                {ofKind.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm italic text-slate-500">
                    No {kind.label.toLowerCase()} templates yet.
                  </p>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2">
                    {ofKind.map(template => (
                      <TemplateCard key={template.id} template={template} usage={usage.get(template.id) ?? { total: 0, inProgress: 0 }} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

import { TITLE_OPTIONS } from '@/utils/org-options'
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX } from '@/utils/people/checklist-input'
import { CHECKLIST_KINDS } from '@/utils/people/constants'
import type { ActionState, ChecklistTemplate } from '@/utils/people/types'
import { ActionForm } from '../../../_components/action-form'
import { Field, FormGrid, inputClass } from '../../../_components/ui'

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  /** Omit to create a new template. */
  template?: ChecklistTemplate
  idPrefix: string
  submitLabel: string
  pendingLabel: string
}

/** Name, type, description and job titles for a checklist template. */
export function TemplateForm({ action, template, idPrefix, submitLabel, pendingLabel }: Props) {
  // Keep titles already on the template selectable even if they are no longer in the company list.
  const current = template?.applies_to_titles ?? []
  const titles = [...TITLE_OPTIONS, ...current.filter(t => !TITLE_OPTIONS.includes(t))]
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <ActionForm action={action} submitLabel={submitLabel} pendingLabel={pendingLabel}>
      <FormGrid>
        <Field label="Name" htmlFor={id('name')} required>
          <input
            id={id('name')} name="name" type="text" required maxLength={TEMPLATE_NAME_MAX} autoComplete="off"
            defaultValue={template?.name ?? ''} placeholder="e.g. Carer onboarding" className={inputClass}
          />
        </Field>
        <Field label="Type" htmlFor={id('kind')} required>
          <select id={id('kind')} name="kind" defaultValue={template?.kind ?? 'onboarding'} className={inputClass}>
            {CHECKLIST_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Description" htmlFor={id('description')} wide hint="Optional. Shown to HR to explain what the template is for.">
          <textarea
            id={id('description')} name="description" rows={2} maxLength={TEMPLATE_DESCRIPTION_MAX}
            defaultValue={template?.description ?? ''} className={inputClass}
          />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Job titles</legend>
          <p className="mb-3 text-xs text-slate-500">
            Tick the job titles this template is for and it is suggested first when someone with that title starts a checklist.
            Leave every box empty for a general template that suits anyone.
          </p>
          <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {titles.map((title, index) => (
              <label
                key={title}
                htmlFor={`${idPrefix}-title-${index}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-200 has-[:checked]:border-[#323398]/40 has-[:checked]:bg-[#323398]/5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20"
              >
                <input
                  id={`${idPrefix}-title-${index}`} type="checkbox" name="applies_to_titles" value={title}
                  defaultChecked={current.includes(title)} className="h-4 w-4 rounded border-slate-300 accent-[#323398]"
                />
                {title}
              </label>
            ))}
          </div>
        </fieldset>

        {template && (
          <label htmlFor={id('active')} className="flex items-start gap-3 text-sm text-slate-700 sm:col-span-2">
            <input
              id={id('active')} type="checkbox" name="active" defaultChecked={template.active}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#323398]"
            />
            <span>
              <span className="block font-medium text-slate-900">Active</span>
              <span className="block text-xs text-slate-500">Offered when someone starts a checklist. Turn off to retire it without losing it.</span>
            </span>
          </label>
        )}
      </FormGrid>
    </ActionForm>
  )
}

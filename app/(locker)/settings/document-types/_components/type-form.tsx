import type { ReactNode } from 'react'
import { DOCUMENT_CATEGORIES } from '@/utils/people/constants'
import {
  DEFAULT_REMINDER_DAYS, DEFAULT_SORT_ORDER, DESCRIPTION_MAX, MAX_SORT_ORDER, NAME_MAX,
} from '@/utils/people/settings-input'
import type { ActionState, DocumentType } from '@/utils/people/types'
import { Field, FormGrid, inputClass } from '../../../_components/ui'
import { CheckboxField } from '../../_components/checkbox-field'
import { ActionForm } from '../../../_components/action-form'
import { TitlePicker } from '../../_components/title-picker'
import { ExpiryFields } from './expiry-fields'

/** Create (no `type`) or edit form for one document type. */
export function TypeForm({ action, type, idPrefix, submitLabel, footer, resetOnSuccess = false, redirectTo }: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  type?: DocumentType
  idPrefix: string
  submitLabel: string
  footer?: ReactNode
  resetOnSuccess?: boolean
  /** Where to go after a successful save (the list, when editing). */
  redirectTo?: string
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  return (
    <ActionForm action={action} submitLabel={submitLabel} pendingLabel="Saving…" footer={footer} resetOnSuccess={resetOnSuccess} redirectTo={redirectTo}>
      <FormGrid>
        <Field label="Name" htmlFor={id('name')} required>
          <input
            id={id('name')} name="name" type="text" required maxLength={NAME_MAX} autoComplete="off"
            defaultValue={type?.name ?? ''} placeholder="e.g. Manual handling" className={inputClass}
          />
        </Field>
        <Field label="Category" htmlFor={id('category')} required>
          <select id={id('category')} name="category" defaultValue={type?.category ?? 'other'} className={inputClass}>
            {DOCUMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Description" htmlFor={id('description')} wide hint="Optional. Helps HR know what to file under this type.">
          <textarea
            id={id('description')} name="description" rows={2} maxLength={DESCRIPTION_MAX}
            defaultValue={type?.description ?? ''} className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2">
          <CheckboxField
            id={id('mandatory')} name="mandatory" label="Mandatory" defaultChecked={type?.mandatory ?? false}
            hint="Every employee it applies to must have one on file. Anyone missing it is flagged in Compliance."
          />
        </div>

        <ExpiryFields
          idPrefix={idPrefix}
          defaultRequiresExpiry={type?.requires_expiry ?? false}
          defaultMonths={type?.default_validity_months ?? null}
          defaultReminderDays={type?.reminder_days ?? DEFAULT_REMINDER_DAYS}
        />

        <TitlePicker idPrefix={idPrefix} selected={type?.applies_to_titles ?? []} />

        <Field label="Order" htmlFor={id('sort_order')} hint="Lower numbers appear first within their category.">
          <input
            id={id('sort_order')} name="sort_order" type="number" inputMode="numeric" min={0} max={MAX_SORT_ORDER} step={1}
            defaultValue={type?.sort_order ?? DEFAULT_SORT_ORDER} className={inputClass}
          />
        </Field>
        <div className="self-end">
          <CheckboxField
            id={id('active')} name="active" label="Active" defaultChecked={type?.active ?? true}
            hint="Inactive types are hidden from new uploads and checks. Documents already filed are kept."
          />
        </div>
      </FormGrid>
    </ActionForm>
  )
}

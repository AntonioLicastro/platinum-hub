import type { ReactNode } from 'react'
import {
  DEFAULT_SORT_ORDER, DESCRIPTION_MAX, LEAVE_CATEGORIES, LEAVE_CODE_MAX, LEAVE_SWATCHES, MAX_ENTITLEMENT_DAYS, MAX_SORT_ORDER,
  NAME_MAX,
} from '@/utils/people/settings-input'
import type { ActionState, LeaveType } from '@/utils/people/types'
import { Field, FormGrid, inputClass } from '../../../_components/ui'
import { CheckboxField } from '../../_components/checkbox-field'
import { ActionForm } from '../../../_components/action-form'

const DEFAULT_COLOR = LEAVE_SWATCHES[0].value

/** Create (no `type`) or edit form for one leave type. The code can only be set when creating. */
export function LeaveTypeForm({ action, type, idPrefix, submitLabel, footer, resetOnSuccess = false, redirectTo }: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  type?: LeaveType
  idPrefix: string
  submitLabel: string
  footer?: ReactNode
  resetOnSuccess?: boolean
  /** Where to go after a successful save (the list, when editing). */
  redirectTo?: string
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  const selectedColor = type?.color ?? DEFAULT_COLOR
  // A colour saved before the palette existed stays selectable.
  const swatches = LEAVE_SWATCHES.some(s => s.value === selectedColor)
    ? LEAVE_SWATCHES
    : [...LEAVE_SWATCHES, { value: selectedColor, name: 'Current colour' }]

  return (
    <ActionForm action={action} submitLabel={submitLabel} pendingLabel="Saving…" footer={footer} resetOnSuccess={resetOnSuccess} redirectTo={redirectTo}>
      <FormGrid>
        <Field label="Name" htmlFor={id('name')} required>
          <input
            id={id('name')} name="name" type="text" required maxLength={NAME_MAX} autoComplete="off"
            defaultValue={type?.name ?? ''} placeholder="e.g. Study leave" className={inputClass}
          />
        </Field>
        {type ? (
          <Field label="Code" htmlFor={id('code')} hint="The code can't be changed once a leave type exists.">
            <input id={id('code')} type="text" value={type.code} readOnly className={`${inputClass} font-mono`} />
          </Field>
        ) : (
          <Field label="Code" htmlFor={id('code')} required hint="A short name used behind the scenes, such as study_leave. It can't be changed later.">
            <input
              id={id('code')} name="code" type="text" required maxLength={LEAVE_CODE_MAX} autoComplete="off" spellCheck={false}
              pattern="[a-z][a-z0-9_]{1,29}" title="Lowercase letters, numbers and underscores, starting with a letter"
              placeholder="e.g. study_leave" className={`${inputClass} font-mono`}
            />
          </Field>
        )}
        <Field label="Category" htmlFor={id('category')} required>
          <select id={id('category')} name="category" defaultValue={type?.category ?? 'other'} className={inputClass}>
            {LEAVE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field
          label="Default entitlement (days a year)" htmlFor={id('entitlement')}
          hint="Optional. Used when you apply default entitlements to employees."
        >
          <input
            id={id('entitlement')} name="default_entitlement_days" type="number" inputMode="decimal" min={0} max={MAX_ENTITLEMENT_DAYS} step="0.5"
            defaultValue={type?.default_entitlement_days ?? ''} placeholder="e.g. 20" className={inputClass}
          />
        </Field>

        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <CheckboxField
            id={id('paid')} name="paid" label="Paid" defaultChecked={type?.paid ?? true}
            hint="The employee is paid while on this leave."
          />
          <CheckboxField
            id={id('requires_approval')} name="requires_approval" label="Needs approval" defaultChecked={type?.requires_approval ?? true}
            hint="A manager or HR approves each request. Untick for leave that is simply recorded."
          />
          <CheckboxField
            id={id('uses_balance')} name="uses_balance" label="Uses a balance" defaultChecked={type?.uses_balance ?? false}
            hint="Each day taken comes off a yearly entitlement, like annual leave."
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Colour</legend>
          <p className="mb-3 text-xs text-slate-500">Used for this leave type on the leave calendar and in lists.</p>
          <div className="flex flex-wrap gap-3">
            {swatches.map(swatch => (
              <label key={swatch.value} className="relative cursor-pointer">
                <input
                  type="radio" name="color" value={swatch.value} defaultChecked={swatch.value === selectedColor}
                  aria-label={swatch.name} className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  title={swatch.name}
                  className="block h-8 w-8 rounded-full ring-2 ring-transparent ring-offset-2 transition peer-checked:ring-slate-900 peer-focus-visible:ring-[#323398]"
                  style={{ backgroundColor: swatch.value }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="Statutory note" htmlFor={id('note')} wide
          hint="Optional. The rule or policy behind this leave, so HR can check it. Guidance only; confirm against current legislation."
        >
          <textarea
            id={id('note')} name="statutory_note" rows={2} maxLength={DESCRIPTION_MAX}
            defaultValue={type?.statutory_note ?? ''} className={inputClass}
          />
        </Field>

        <Field label="Order" htmlFor={id('sort_order')} hint="Lower numbers appear first.">
          <input
            id={id('sort_order')} name="sort_order" type="number" inputMode="numeric" min={0} max={MAX_SORT_ORDER} step={1}
            defaultValue={type?.sort_order ?? DEFAULT_SORT_ORDER} className={inputClass}
          />
        </Field>
        <div className="self-end">
          <CheckboxField
            id={id('active')} name="active" label="Active" defaultChecked={type?.active ?? true}
            hint="Inactive types can't be chosen for new requests. Existing leave is kept."
          />
        </div>
      </FormGrid>
    </ActionForm>
  )
}

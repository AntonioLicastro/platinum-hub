import type { ReactNode } from 'react'
import { NOTE_MAX } from '@/utils/people/settings-input'
import type { AccessRow } from '@/utils/people/settings-access'
import type { ActionState } from '@/utils/people/types'
import { Field, FormGrid, inputClass } from '../../../_components/ui'
import { ActionForm } from '../../../_components/action-form'
import { RoleFields } from './role-fields'

/** Grant access (no `row`) or change someone's role and areas. The email is fixed when changing. */
export function AccessForm({ action, row, idPrefix, submitLabel, footer, resetOnSuccess = false, redirectTo }: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  row?: AccessRow
  idPrefix: string
  submitLabel: string
  footer?: ReactNode
  resetOnSuccess?: boolean
  /** Where to go after a successful save (the list, when changing someone's access). */
  redirectTo?: string
}) {
  return (
    <ActionForm
      action={action} submitLabel={submitLabel} pendingLabel="Saving…" footer={footer}
      resetOnSuccess={resetOnSuccess} redirectTo={redirectTo}
    >
      <FormGrid>
        <Field
          label="Email address" htmlFor={`${idPrefix}-email`} required
          hint={row ? undefined : 'Must be a @platinumhomecare.ie address: HR Locker sign-in is limited to company accounts.'}
        >
          <input
            id={`${idPrefix}-email`} name="email" type="email" required autoComplete="off" spellCheck={false}
            readOnly={!!row} defaultValue={row?.email ?? ''} placeholder="name@platinumhomecare.ie"
            className={`${inputClass} ${row ? 'bg-slate-50 text-slate-600' : ''}`}
          />
        </Field>
        <Field label="Note" htmlFor={`${idPrefix}-note`} hint="Optional. Why they have this access, for whoever reviews it later.">
          <input
            id={`${idPrefix}-note`} name="note" type="text" maxLength={NOTE_MAX} autoComplete="off"
            defaultValue={row?.note ?? ''} placeholder="e.g. Covers CHO7 during a period of leave" className={inputClass}
          />
        </Field>
        <RoleFields idPrefix={idPrefix} defaultRole={row?.role ?? 'manager'} defaultAreas={row?.areas ?? []} />
      </FormGrid>
    </ActionForm>
  )
}

'use client'

import { useRef, type ChangeEvent } from 'react'
import { ActionForm } from '../../_components/action-form'
import { Field, FormGrid, inputClass } from '../../_components/ui'
import { EVENT_TYPES } from '@/utils/people/constants'
import { EARLIEST_DATE, TEXT_MAX, TITLE_MAX } from '@/utils/people/timeline-input'
import type { ActionState } from '@/utils/people/types'

type Props = {
  /** addEvent bound to the employee id on the server. */
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  today: string
  maxDate: string
  /** HR can choose who sees a note; managers' notes are always visible to managers (also enforced on the server). */
  canChooseVisibility: boolean
}

export function NoteForm({ action, today, maxDate, canChooseVisibility }: Props) {
  const visibilityRef = useRef<HTMLSelectElement>(null)

  // Sensitive kinds of entry (warnings, pay, grievances...) default to HR only; the person can still override it.
  const onTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const type = EVENT_TYPES.find(t => t.value === event.target.value)
    if (type && visibilityRef.current) visibilityRef.current.value = type.hrOnlyByDefault ? 'hr_only' : 'manager'
  }

  return (
    <ActionForm action={action} submitLabel="Add to timeline" pendingLabel="Adding…" resetOnSuccess>
      <FormGrid>
        <Field label="What kind of entry" htmlFor="note-type" required>
          <select id="note-type" name="event_type" defaultValue="note" onChange={onTypeChange} className={inputClass}>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Date" htmlFor="note-date" required hint="When it happened. Past dates are fine.">
          <input
            id="note-date" name="occurred_on" type="date" required defaultValue={today} min={EARLIEST_DATE} max={maxDate}
            className={inputClass}
          />
        </Field>
        <Field label="Title" htmlFor="note-title" required wide>
          <input
            id="note-title" name="title" type="text" required maxLength={TITLE_MAX} autoComplete="off"
            placeholder="e.g. Supervision conversation about punctuality" className={inputClass}
          />
        </Field>
        <Field label="Details" htmlFor="note-details" wide hint="Optional. Stick to facts: what happened, what was agreed.">
          <textarea id="note-details" name="details" rows={4} maxLength={TEXT_MAX} className={inputClass} />
        </Field>
        {canChooseVisibility ? (
          <Field label="Who can see this" htmlFor="note-visibility" wide hint="HR-only notes are never shown to line managers.">
            <select id="note-visibility" name="visibility" defaultValue="hr_only" ref={visibilityRef} className={inputClass}>
              <option value="hr_only">HR only</option>
              <option value="manager">HR and line managers</option>
            </select>
          </Field>
        ) : (
          <p className="text-xs text-slate-500 sm:col-span-2">
            This note will be visible to HR and to the managers responsible for this employee.
          </p>
        )}
      </FormGrid>
    </ActionForm>
  )
}

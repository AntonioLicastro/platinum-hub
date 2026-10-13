'use server'

import { revalidatePath } from 'next/cache'
import { authorizeEmployee, can, isSelf } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { EVENT_TYPES } from '@/utils/people/constants'
import { createAdminClient } from '@/utils/people/db'
import { addDays, todayIso } from '@/utils/people/format'
import { EARLIEST_DATE, TEXT_MAX, TITLE_MAX, isUuid } from '@/utils/people/timeline-input'
import type { ActionState, EventVisibility } from '@/utils/people/types'
import { isIsoDate, oneOf, optStr, str } from '@/utils/people/validate'

const VISIBILITIES: readonly EventVisibility[] = ['hr_only', 'manager']

function refresh(employeeId: string) {
  revalidatePath(`/employees/${employeeId}`)
}

/** Adds a timeline note. Notes are immutable: a correction is a new note. */
export async function addEvent(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('events.add', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const eventType = oneOf(str(formData, 'event_type'), EVENT_TYPES.map(t => t.value))
  if (!eventType) return { error: 'Choose what kind of entry this is' }

  const occurredOn = str(formData, 'occurred_on')
  if (!isIsoDate(occurredOn)) return { error: 'Enter the date this happened' }
  if (occurredOn < EARLIEST_DATE) return { error: 'That date is too far in the past' }
  // One day of slack so a note typed just after midnight is never rejected.
  if (occurredOn > addDays(todayIso(), 1)) return { error: 'The date cannot be in the future' }

  const title = str(formData, 'title')
  if (!title) return { error: 'Add a short title' }
  if (title.length > TITLE_MAX) return { error: `The title must be ${TITLE_MAX} characters or fewer` }

  const details = optStr(formData, 'details')
  if (details && details.length > TEXT_MAX) return { error: `The details must be ${TEXT_MAX} characters or fewer` }

  // Whoever cannot read HR-only notes (managers) may only write manager-visible
  // ones, whatever the form posted. HR picks, defaulting from the entry type.
  let visibility: EventVisibility = 'manager'
  if (can(viewer, 'events.view_hr')) {
    const hrOnlyByDefault = EVENT_TYPES.find(t => t.value === eventType)?.hrOnlyByDefault ?? true
    visibility = oneOf(str(formData, 'visibility'), VISIBILITIES) ?? (hrOnlyByDefault ? 'hr_only' : 'manager')
  }

  const { data, error } = await createAdminClient()
    .from('hr_events')
    .insert({
      employee_id: employee.id,
      event_type: eventType,
      occurred_on: occurredOn,
      title,
      details,
      visibility,
      created_by: viewer.email,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    console.error('addEvent failed', error?.message)
    return { error: 'Could not save the note. Please try again.' }
  }

  await logAudit(viewer, {
    action: 'event.create',
    entity: 'hr_events',
    entityId: data.id,
    employeeId: employee.id,
    detail: { event_type: eventType, visibility },
  })
  refresh(employee.id)
  return { error: null, ok: true, message: 'Added to the timeline' }
}

/** HR only. Removes a note added by mistake. */
export async function deleteEvent(employeeId: string, eventId: string): Promise<ActionState> {
  if (!isUuid(eventId)) return { error: 'That entry no longer exists' }
  const auth = await authorizeEmployee('employees.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  if (!can(viewer, 'events.view_hr')) return { error: 'You do not have permission to do that' }
  // Like adding notes (events.add), removing them needs a second person: nobody edits their own case file.
  if (isSelf(viewer, employee)) return { error: 'Another HR colleague needs to remove entries on your own record' }

  const { data, error } = await createAdminClient()
    .from('hr_events')
    .delete()
    .eq('id', eventId)
    .eq('employee_id', employee.id)
    .select('event_type, visibility')
    .returns<{ event_type: string; visibility: EventVisibility }[]>()
  if (error) {
    console.error('deleteEvent failed', error.message)
    return { error: 'Could not delete the note. Please try again.' }
  }
  if (data.length === 0) return { error: 'That entry no longer exists' }

  await logAudit(viewer, {
    action: 'event.delete',
    entity: 'hr_events',
    entityId: eventId,
    employeeId: employee.id,
    detail: { event_type: data[0].event_type, visibility: data[0].visibility },
  })
  refresh(employee.id)
  return { error: null, ok: true, message: 'Entry deleted' }
}

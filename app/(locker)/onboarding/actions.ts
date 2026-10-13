'use server'

import { revalidatePath } from 'next/cache'
import { authorizeEmployee, isHr, type PeopleViewer } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { canTickItem } from '@/utils/people/checklist-access'
import { ITEM_TEXT_MAX, ITEM_TITLE_MAX, NOTE_MAX, checkDate } from '@/utils/people/checklist-input'
import { OWNER_ROLES } from '@/utils/people/constants'
import { createAdminClient, withRetry } from '@/utils/people/db'
import { addDays, formatDate, todayIso } from '@/utils/people/format'
import { isUuid } from '@/utils/people/timeline-input'
import type { ActionState, Checklist, ChecklistItem, ChecklistTemplate, ChecklistTemplateItem } from '@/utils/people/types'
import { oneOf, optStr, str } from '@/utils/people/validate'

const OWNER_ROLE_VALUES = OWNER_ROLES.map(r => r.value)

const TASK_GONE = 'That task no longer exists'
const CHECKLIST_GONE = 'That checklist no longer exists'
const HR_ONLY = 'Only HR can delete checklist tasks'
const TRY_AGAIN = 'Please try again.'

function refresh(employeeId: string) {
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/onboarding')
  revalidatePath('/')
  revalidatePath('/me')
}

/** A lookup that says why it found nothing: a database error must never be reported as "no longer exists". */
type Lookup<T> = { ok: true; value: T } | { ok: false; error: string }

function lookupFailed(what: string, message: string): { ok: false; error: string } {
  console.error(`${what} failed`, message)
  return { ok: false, error: `Something went wrong. ${TRY_AGAIN}` }
}

/**
 * Loads a task and its checklist, but only if the checklist belongs to the
 * employee the caller was authorised for. Ids arrive from the client, so they
 * are never trusted on their own.
 */
async function loadItem(employeeId: string, itemId: string): Promise<Lookup<{ item: ChecklistItem; checklist: Checklist }>> {
  if (!isUuid(itemId)) return { ok: false, error: TASK_GONE }
  const admin = createAdminClient()
  const { data: item, error } = await withRetry(() =>
    admin.from('hr_checklist_items').select('*').eq('id', itemId).maybeSingle<ChecklistItem>()
  )
  if (error) return lookupFailed('loadItem', error.message)
  if (!item) return { ok: false, error: TASK_GONE }
  const { data: checklist, error: checklistError } = await withRetry(() =>
    admin
      .from('hr_checklists')
      .select('*')
      .eq('id', item.checklist_id)
      .eq('employee_id', employeeId)
      .maybeSingle<Checklist>()
  )
  if (checklistError) return lookupFailed('loadItem checklist', checklistError.message)
  return checklist ? { ok: true, value: { item, checklist } } : { ok: false, error: TASK_GONE }
}

async function loadChecklist(employeeId: string, checklistId: string): Promise<Lookup<Checklist>> {
  if (!isUuid(checklistId)) return { ok: false, error: CHECKLIST_GONE }
  const { data, error } = await withRetry(() =>
    createAdminClient()
      .from('hr_checklists')
      .select('*')
      .eq('id', checklistId)
      .eq('employee_id', employeeId)
      .maybeSingle<Checklist>()
  )
  if (error) return lookupFailed('loadChecklist', error.message)
  return data ? { ok: true, value: data } : { ok: false, error: CHECKLIST_GONE }
}

/**
 * Keeps hr_checklists.completed_at in step with its tasks: stamped when the
 * last task is ticked, cleared when one is un-ticked or added. A checklist
 * with no tasks is never complete.
 */
async function syncCompletion(viewer: PeopleViewer, checklist: Pick<Checklist, 'id' | 'employee_id' | 'kind'>): Promise<'completed' | 'reopened' | 'unchanged'> {
  const admin = createAdminClient()
  const { data: items, error } = await admin
    .from('hr_checklist_items')
    .select('completed_at')
    .eq('checklist_id', checklist.id)
    .returns<Pick<ChecklistItem, 'completed_at'>[]>()
  if (error || !items) {
    console.error('syncCompletion failed', error?.message)
    return 'unchanged'
  }
  const complete = items.length > 0 && items.every(i => i.completed_at !== null)
  const update = admin.from('hr_checklists').update({ completed_at: complete ? new Date().toISOString() : null }).eq('id', checklist.id)
  // Only touch the row when its state actually flips, so the audit log records real transitions.
  const { data: changed, error: updateError } = await (complete ? update.is('completed_at', null) : update.not('completed_at', 'is', null)).select('id')
  if (updateError) {
    console.error('syncCompletion update failed', updateError.message)
    return 'unchanged'
  }
  if (!changed || changed.length === 0) return 'unchanged'
  await logAudit(viewer, {
    action: complete ? 'checklist.complete' : 'checklist.reopen',
    entity: 'hr_checklists',
    entityId: checklist.id,
    employeeId: checklist.employee_id,
    detail: { kind: checklist.kind },
  })
  return complete ? 'completed' : 'reopened'
}

/** Creates a checklist for an employee from a template, with each task dated from the start day. */
export async function startChecklist(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('checklists.manage', str(formData, 'employee_id'))
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const templateId = Number(str(formData, 'template_id'))
  if (!Number.isInteger(templateId) || templateId <= 0) return { error: 'Choose a checklist template' }
  const today = todayIso()
  const startedOn = str(formData, 'started_on')
  const dateError = checkDate(startedOn, today, 'start day')
  if (dateError) return { error: dateError }

  const admin = createAdminClient()
  const { data: template, error: templateError } = await admin
    .from('hr_checklist_templates')
    .select('*')
    .eq('id', templateId)
    .eq('active', true)
    .maybeSingle<ChecklistTemplate>()
  if (templateError) {
    console.error('startChecklist template failed', templateError.message)
    return { error: `Could not load the template. ${TRY_AGAIN}` }
  }
  if (!template) return { error: 'That template is not available. Choose another.' }
  if (template.kind === 'onboarding' && employee.employment_status === 'leaver') {
    return { error: 'This employee has left. Use an offboarding checklist instead.' }
  }

  const { data: running, error: runningError } = await admin
    .from('hr_checklists')
    .select('id')
    .eq('employee_id', employee.id)
    .eq('template_id', template.id)
    .is('completed_at', null)
    .limit(1)
  if (runningError) {
    console.error('startChecklist duplicate check failed', runningError.message)
    return { error: `Could not start the checklist. ${TRY_AGAIN}` }
  }
  if (running.length > 0) return { error: `${template.name} is already in progress for this employee` }

  const { data: templateItems, error: itemsError } = await admin
    .from('hr_checklist_template_items')
    .select('*')
    .eq('template_id', template.id)
    .order('sort_order')
    .order('id')
    .returns<ChecklistTemplateItem[]>()
  if (itemsError) {
    console.error('startChecklist items failed', itemsError.message)
    return { error: `Could not load the template tasks. ${TRY_AGAIN}` }
  }
  if (templateItems.length === 0) return { error: 'That template has no tasks yet. Add some in Settings first.' }

  const { data: checklist, error } = await admin
    .from('hr_checklists')
    .insert({
      employee_id: employee.id,
      template_id: template.id,
      name: template.name,
      kind: template.kind,
      started_on: startedOn,
      created_by: viewer.email,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !checklist) {
    console.error('startChecklist failed', error?.message)
    return { error: `Could not start the checklist. ${TRY_AGAIN}` }
  }

  const { error: insertError } = await admin.from('hr_checklist_items').insert(
    templateItems.map(t => ({
      checklist_id: checklist.id,
      title: t.title,
      description: t.description,
      owner_role: t.owner_role,
      due_on: addDays(startedOn, t.due_offset_days),
      sort_order: t.sort_order,
    }))
  )
  if (insertError) {
    console.error('startChecklist tasks failed', insertError.message)
    // Don't leave an empty checklist behind.
    const { error: cleanupError } = await admin.from('hr_checklists').delete().eq('id', checklist.id)
    if (cleanupError) console.error('startChecklist cleanup failed', cleanupError.message)
    return { error: `Could not start the checklist. ${TRY_AGAIN}` }
  }

  await logAudit(viewer, {
    action: 'checklist.start',
    entity: 'hr_checklists',
    entityId: checklist.id,
    employeeId: employee.id,
    detail: { template_id: template.id, kind: template.kind, tasks: templateItems.length },
  })
  refresh(employee.id)
  return {
    error: null,
    ok: true,
    message: `${template.name} started with ${templateItems.length} ${templateItems.length === 1 ? 'task' : 'tasks'}, counting from ${formatDate(startedOn)}`,
  }
}

/** Ticks a task off or reopens it. Employees may only tick the tasks addressed to them on their own checklist. */
export async function toggleChecklistItem(employeeId: string, itemId: string, done: boolean): Promise<ActionState> {
  const auth = await authorizeEmployee('checklists.view', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const loaded = await loadItem(employee.id, itemId)
  if (!loaded.ok) return { error: loaded.error }
  const { item, checklist } = loaded.value
  if (!canTickItem(viewer, employee, item.owner_role)) return { error: 'You can only tick off tasks assigned to you' }

  const complete = done === true
  if ((item.completed_at !== null) === complete) return { error: null, ok: true }

  const { error } = await createAdminClient()
    .from('hr_checklist_items')
    .update({ completed_at: complete ? new Date().toISOString() : null, completed_by: complete ? viewer.email : null })
    .eq('id', item.id)
    .eq('checklist_id', checklist.id)
  if (error) {
    console.error('toggleChecklistItem failed', error.message)
    return { error: `Could not update the task. ${TRY_AGAIN}` }
  }

  await logAudit(viewer, {
    action: complete ? 'checklist.item_complete' : 'checklist.item_reopen',
    entity: 'hr_checklist_items',
    entityId: item.id,
    employeeId: employee.id,
    detail: { owner_role: item.owner_role },
  })
  const outcome = await syncCompletion(viewer, checklist)
  refresh(employee.id)
  return {
    error: null,
    ok: true,
    message: outcome === 'completed' ? 'That was the last task. The checklist is complete.' : complete ? 'Task done' : 'Task reopened',
  }
}

/** Saves (or clears) the note on a task. Same permission as ticking it off. */
export async function saveChecklistItemNote(employeeId: string, itemId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('checklists.view', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const loaded = await loadItem(employee.id, itemId)
  if (!loaded.ok) return { error: loaded.error }
  const { item } = loaded.value
  if (!canTickItem(viewer, employee, item.owner_role)) return { error: 'You can only add notes to tasks assigned to you' }

  const notes = optStr(formData, 'notes')
  if (notes && notes.length > NOTE_MAX) return { error: `The note must be ${NOTE_MAX} characters or fewer` }

  const { error } = await createAdminClient()
    .from('hr_checklist_items')
    .update({ notes })
    .eq('id', item.id)
    .eq('checklist_id', item.checklist_id)
  if (error) {
    console.error('saveChecklistItemNote failed', error.message)
    return { error: `Could not save the note. ${TRY_AGAIN}` }
  }

  await logAudit(viewer, {
    action: 'checklist.item_note',
    entity: 'hr_checklist_items',
    entityId: item.id,
    employeeId: employee.id,
    detail: { cleared: notes === null },
  })
  refresh(employee.id)
  return { error: null, ok: true, message: notes ? 'Note saved' : 'Note removed' }
}

/** Adds a one-off task to a running checklist. */
export async function addChecklistItem(employeeId: string, checklistId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('checklists.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const found = await loadChecklist(employee.id, checklistId)
  if (!found.ok) return { error: found.error }
  const checklist = found.value

  const title = str(formData, 'title')
  if (!title) return { error: 'Give the task a title' }
  if (title.length > ITEM_TITLE_MAX) return { error: `The title must be ${ITEM_TITLE_MAX} characters or fewer` }
  const description = optStr(formData, 'description')
  if (description && description.length > ITEM_TEXT_MAX) return { error: `The description must be ${ITEM_TEXT_MAX} characters or fewer` }
  const ownerRole = oneOf(str(formData, 'owner_role'), OWNER_ROLE_VALUES)
  if (!ownerRole) return { error: 'Choose who owns the task' }
  const dueOn = str(formData, 'due_on')
  if (dueOn) {
    const dateError = checkDate(dueOn, todayIso(), 'due date')
    if (dateError) return { error: dateError }
  }

  const admin = createAdminClient()
  const { data: last, error: lastError } = await admin
    .from('hr_checklist_items')
    .select('sort_order')
    .eq('checklist_id', checklist.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .returns<Pick<ChecklistItem, 'sort_order'>[]>()
  if (lastError) {
    console.error('addChecklistItem order failed', lastError.message)
    return { error: `Could not add the task. ${TRY_AGAIN}` }
  }

  const { data: created, error } = await admin
    .from('hr_checklist_items')
    .insert({
      checklist_id: checklist.id,
      title,
      description,
      owner_role: ownerRole,
      due_on: dueOn || null,
      sort_order: (last[0]?.sort_order ?? 0) + 10,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !created) {
    console.error('addChecklistItem failed', error?.message)
    return { error: `Could not add the task. ${TRY_AGAIN}` }
  }

  await logAudit(viewer, {
    action: 'checklist.item_add',
    entity: 'hr_checklist_items',
    entityId: created.id,
    employeeId: employee.id,
    detail: { owner_role: ownerRole, has_due_date: dueOn !== '' },
  })
  const outcome = await syncCompletion(viewer, checklist)
  refresh(employee.id)
  return { error: null, ok: true, message: outcome === 'reopened' ? 'Task added. The checklist is open again.' : 'Task added' }
}

/** HR only. Removes a task that should never have been on the checklist. */
export async function deleteChecklistItem(employeeId: string, itemId: string): Promise<ActionState> {
  const auth = await authorizeEmployee('checklists.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  if (!isHr(viewer)) return { error: HR_ONLY }

  const loaded = await loadItem(employee.id, itemId)
  if (!loaded.ok) return { error: loaded.error }
  const { item, checklist } = loaded.value

  const { error } = await createAdminClient()
    .from('hr_checklist_items')
    .delete()
    .eq('id', item.id)
    .eq('checklist_id', checklist.id)
  if (error) {
    console.error('deleteChecklistItem failed', error.message)
    return { error: `Could not delete the task. ${TRY_AGAIN}` }
  }

  await logAudit(viewer, {
    action: 'checklist.item_delete',
    entity: 'hr_checklist_items',
    entityId: item.id,
    employeeId: employee.id,
    detail: { owner_role: item.owner_role, was_done: item.completed_at !== null },
  })
  await syncCompletion(viewer, checklist)
  refresh(employee.id)
  return { error: null, ok: true, message: 'Task deleted' }
}

/** HR only. Removes a whole checklist and its tasks. */
export async function deleteChecklist(employeeId: string, checklistId: string): Promise<ActionState> {
  const auth = await authorizeEmployee('checklists.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  if (!isHr(viewer)) return { error: 'Only HR can delete a checklist' }
  if (!isUuid(checklistId)) return { error: CHECKLIST_GONE }

  const { data, error } = await createAdminClient()
    .from('hr_checklists')
    .delete()
    .eq('id', checklistId)
    .eq('employee_id', employee.id)
    .select('kind, template_id, completed_at')
    .returns<Pick<Checklist, 'kind' | 'template_id' | 'completed_at'>[]>()
  if (error) {
    console.error('deleteChecklist failed', error.message)
    return { error: `Could not delete the checklist. ${TRY_AGAIN}` }
  }
  if (data.length === 0) return { error: CHECKLIST_GONE }

  await logAudit(viewer, {
    action: 'checklist.delete',
    entity: 'hr_checklists',
    entityId: checklistId,
    employeeId: employee.id,
    detail: { kind: data[0].kind, was_complete: data[0].completed_at !== null },
  })
  refresh(employee.id)
  return { error: null, ok: true, message: 'Checklist deleted' }
}

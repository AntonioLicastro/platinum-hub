'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { TITLE_OPTIONS } from '@/utils/org-options'
import { authorize } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import {
  ITEM_TEXT_MAX, ITEM_TITLE_MAX, MAX_OFFSET_DAYS, TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX,
} from '@/utils/people/checklist-input'
import { CHECKLIST_KINDS, OWNER_ROLES } from '@/utils/people/constants'
import { createAdminClient, withRetry } from '@/utils/people/db'
import type { ActionState, ChecklistKind, ChecklistTemplate, ChecklistTemplateItem, OwnerRole } from '@/utils/people/types'
import { bool, oneOf, optNumber, optStr, str } from '@/utils/people/validate'

// Server actions for Settings > Checklist templates. Templates only shape
// checklists started from now on: a started checklist keeps its own copy of
// every task, so nothing here changes work already under way.

const BASE = '/settings/checklists'
const KIND_VALUES = CHECKLIST_KINDS.map(k => k.value)
const OWNER_ROLE_VALUES = OWNER_ROLES.map(r => r.value)
const TRY_AGAIN = 'Please try again.'
const TEMPLATE_GONE = 'That template no longer exists'
const TASK_GONE = 'That task no longer exists'

type DbError = { code?: string; message: string }

const isId = (value: number) => Number.isInteger(value) && value > 0

function refresh(templateId?: number) {
  revalidatePath(BASE)
  if (templateId !== undefined) revalidatePath(`${BASE}/${templateId}`)
  // The start-a-checklist form lists active templates.
  revalidatePath('/onboarding')
}

/** Logs the real error and returns a message that is safe to show. */
function writeFailure(context: string, error: DbError): ActionState {
  if (error.code === '23505') return { error: 'A template with that name already exists. Choose a different name.' }
  console.error(`${context} failed`, error.code, error.message)
  return { error: `Could not save the change. ${TRY_AGAIN}` }
}

type TemplateFields = { name: string; kind: ChecklistKind; description: string | null; appliesTo: string[] }

/** Job titles must come from the company list, but titles already on the template stay valid. */
function parseTemplate(formData: FormData, currentTitles: readonly string[] = []): TemplateFields | { error: string } {
  const name = str(formData, 'name')
  if (!name) return { error: 'Give the template a name' }
  if (name.length > TEMPLATE_NAME_MAX) return { error: `The name must be ${TEMPLATE_NAME_MAX} characters or fewer` }
  const kind = oneOf(str(formData, 'kind'), KIND_VALUES)
  if (!kind) return { error: 'Choose onboarding or offboarding' }
  const description = optStr(formData, 'description')
  if (description && description.length > TEMPLATE_DESCRIPTION_MAX) {
    return { error: `The description must be ${TEMPLATE_DESCRIPTION_MAX} characters or fewer` }
  }
  const allowed = new Set<string>([...TITLE_OPTIONS, ...currentTitles])
  const appliesTo: string[] = []
  for (const raw of formData.getAll('applies_to_titles')) {
    const title = typeof raw === 'string' ? raw.trim() : ''
    if (!allowed.has(title)) return { error: 'Choose job titles from the list' }
    if (!appliesTo.includes(title)) appliesTo.push(title)
  }
  return { name, kind, description, appliesTo }
}

type ItemFields = { title: string; description: string | null; dueOffsetDays: number; ownerRole: OwnerRole }

function parseItem(formData: FormData): ItemFields | { error: string } {
  const title = str(formData, 'title')
  if (!title) return { error: 'Give the task a title' }
  if (title.length > ITEM_TITLE_MAX) return { error: `The title must be ${ITEM_TITLE_MAX} characters or fewer` }
  const description = optStr(formData, 'description')
  if (description && description.length > ITEM_TEXT_MAX) return { error: `The description must be ${ITEM_TEXT_MAX} characters or fewer` }
  const ownerRole = oneOf(str(formData, 'owner_role'), OWNER_ROLE_VALUES)
  if (!ownerRole) return { error: 'Choose who owns the task' }
  const dueOffsetDays = optNumber(formData, 'due_offset_days') ?? 0
  if (!Number.isInteger(dueOffsetDays) || Math.abs(dueOffsetDays) > MAX_OFFSET_DAYS) {
    return { error: `Days must be a whole number between -${MAX_OFFSET_DAYS} and ${MAX_OFFSET_DAYS}` }
  }
  return { title, description, dueOffsetDays, ownerRole }
}

/** Says why it found nothing: a database error must never be reported as "no longer exists". */
async function loadTemplate(templateId: number): Promise<{ ok: true; template: ChecklistTemplate } | { ok: false; error: string }> {
  if (!isId(templateId)) return { ok: false, error: TEMPLATE_GONE }
  const { data, error } = await withRetry(() =>
    createAdminClient().from('hr_checklist_templates').select('*').eq('id', templateId).maybeSingle<ChecklistTemplate>()
  )
  if (error) {
    console.error('loadTemplate failed', error.message)
    return { ok: false, error: `Something went wrong. ${TRY_AGAIN}` }
  }
  return data ? { ok: true, template: data } : { ok: false, error: TEMPLATE_GONE }
}

export async function createTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  const fields = parseTemplate(formData)
  if ('error' in fields) return fields

  const { data, error } = await createAdminClient()
    .from('hr_checklist_templates')
    .insert({ name: fields.name, kind: fields.kind, description: fields.description, applies_to_titles: fields.appliesTo })
    .select('id')
    .single<{ id: number }>()
  if (error || !data) return writeFailure('createTemplate', error ?? { message: 'no row returned' })

  await logAudit(auth.viewer, {
    action: 'checklist_template.create',
    entity: 'hr_checklist_templates',
    entityId: String(data.id),
    detail: { kind: fields.kind },
  })
  refresh()
  // Straight on to adding its tasks.
  redirect(`${BASE}/${data.id}`)
}

export async function updateTemplate(templateId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  const loaded = await loadTemplate(templateId)
  if (!loaded.ok) return { error: loaded.error }
  const current = loaded.template
  const fields = parseTemplate(formData, current.applies_to_titles)
  if ('error' in fields) return fields
  const active = bool(formData, 'active')

  const { error } = await createAdminClient()
    .from('hr_checklist_templates')
    .update({
      name: fields.name,
      kind: fields.kind,
      description: fields.description,
      applies_to_titles: fields.appliesTo,
      active,
    })
    .eq('id', current.id)
  if (error) return writeFailure('updateTemplate', error)

  const changed = [
    fields.name !== current.name && 'name',
    fields.kind !== current.kind && 'kind',
    fields.description !== current.description && 'description',
    fields.appliesTo.join('|') !== current.applies_to_titles.join('|') && 'applies_to_titles',
    active !== current.active && 'active',
  ].filter((f): f is string => f !== false)
  await logAudit(auth.viewer, {
    action: 'checklist_template.update',
    entity: 'hr_checklist_templates',
    entityId: String(current.id),
    detail: { fields: changed },
  })
  refresh(current.id)
  return { error: null, ok: true, message: 'Template saved' }
}

export async function setTemplateActive(templateId: number, active: boolean): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(templateId)) return { error: TEMPLATE_GONE }
  const next = active === true

  const { data, error } = await createAdminClient()
    .from('hr_checklist_templates')
    .update({ active: next })
    .eq('id', templateId)
    .select('id')
  if (error) return writeFailure('setTemplateActive', error)
  if (data.length === 0) return { error: TEMPLATE_GONE }

  await logAudit(auth.viewer, {
    action: next ? 'checklist_template.activate' : 'checklist_template.deactivate',
    entity: 'hr_checklist_templates',
    entityId: String(templateId),
  })
  refresh(templateId)
  return { error: null, ok: true, message: next ? 'Template is active' : 'Template deactivated' }
}

/** Copies a template and its tasks. The copy starts inactive so nothing goes out before it has been edited. */
export async function duplicateTemplate(templateId: number): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  const loaded = await loadTemplate(templateId)
  if (!loaded.ok) return { error: loaded.error }
  const source = loaded.template

  const admin = createAdminClient()
  const candidates = [`${source.name} (copy)`, ...Array.from({ length: 20 }, (_, i) => `${source.name} (copy ${i + 2})`)]
  const { data: taken, error: takenError } = await admin
    .from('hr_checklist_templates')
    .select('name')
    .in('name', candidates)
    .returns<Pick<ChecklistTemplate, 'name'>[]>()
  if (takenError) {
    console.error('duplicateTemplate name lookup failed', takenError.message)
    return { error: `Could not duplicate the template. ${TRY_AGAIN}` }
  }
  const used = new Set(taken.map(t => t.name))
  const name = candidates.find(c => !used.has(c))
  if (!name) return { error: 'There are too many copies of this template already. Rename or delete some first.' }

  const { data: items, error: itemsError } = await admin
    .from('hr_checklist_template_items')
    .select('*')
    .eq('template_id', source.id)
    .order('sort_order')
    .order('id')
    .returns<ChecklistTemplateItem[]>()
  if (itemsError) {
    console.error('duplicateTemplate items failed', itemsError.message)
    return { error: `Could not duplicate the template. ${TRY_AGAIN}` }
  }

  const { data: copy, error } = await admin
    .from('hr_checklist_templates')
    .insert({
      name,
      kind: source.kind,
      description: source.description,
      applies_to_titles: source.applies_to_titles,
      active: false,
    })
    .select('id')
    .single<{ id: number }>()
  if (error || !copy) return writeFailure('duplicateTemplate', error ?? { message: 'no row returned' })

  if (items.length > 0) {
    const { error: copyError } = await admin.from('hr_checklist_template_items').insert(
      items.map(i => ({
        template_id: copy.id,
        title: i.title,
        description: i.description,
        due_offset_days: i.due_offset_days,
        owner_role: i.owner_role,
        sort_order: i.sort_order,
      }))
    )
    if (copyError) {
      console.error('duplicateTemplate tasks failed', copyError.message)
      // Don't leave a half-copied template behind.
      const { error: cleanupError } = await admin.from('hr_checklist_templates').delete().eq('id', copy.id)
      if (cleanupError) console.error('duplicateTemplate cleanup failed', cleanupError.message)
      return { error: `Could not duplicate the template. ${TRY_AGAIN}` }
    }
  }

  await logAudit(auth.viewer, {
    action: 'checklist_template.duplicate',
    entity: 'hr_checklist_templates',
    entityId: String(copy.id),
    detail: { copied_from: source.id, tasks: items.length },
  })
  refresh()
  return { error: null, ok: true, message: `Created “${name}”. It is inactive until you switch it on.` }
}

/** Existing checklists keep their tasks: hr_checklists.template_id is simply set to null. */
export async function deleteTemplate(templateId: number): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(templateId)) return { error: TEMPLATE_GONE }

  const admin = createAdminClient()
  const { count, error: countError } = await admin
    .from('hr_checklists')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
  if (countError) console.error('deleteTemplate usage count failed', countError.message)

  const { data, error } = await admin.from('hr_checklist_templates').delete().eq('id', templateId).select('kind')
  if (error) return writeFailure('deleteTemplate', error)
  if (data.length === 0) return { error: TEMPLATE_GONE }

  await logAudit(auth.viewer, {
    action: 'checklist_template.delete',
    entity: 'hr_checklist_templates',
    entityId: String(templateId),
    detail: { checklists_started: count ?? null },
  })
  refresh()
  return { error: null, ok: true, message: 'Template deleted' }
}

export async function addTemplateItem(templateId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  const loaded = await loadTemplate(templateId)
  if (!loaded.ok) return { error: loaded.error }
  const template = loaded.template
  const fields = parseItem(formData)
  if ('error' in fields) return fields

  const admin = createAdminClient()
  const { data: last, error: lastError } = await admin
    .from('hr_checklist_template_items')
    .select('sort_order')
    .eq('template_id', template.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .returns<Pick<ChecklistTemplateItem, 'sort_order'>[]>()
  if (lastError) {
    console.error('addTemplateItem order failed', lastError.message)
    return { error: `Could not add the task. ${TRY_AGAIN}` }
  }

  const { data, error } = await admin
    .from('hr_checklist_template_items')
    .insert({
      template_id: template.id,
      title: fields.title,
      description: fields.description,
      due_offset_days: fields.dueOffsetDays,
      owner_role: fields.ownerRole,
      sort_order: (last[0]?.sort_order ?? 0) + 10,
    })
    .select('id')
    .single<{ id: number }>()
  if (error || !data) return writeFailure('addTemplateItem', error ?? { message: 'no row returned' })

  await logAudit(auth.viewer, {
    action: 'checklist_template.item_add',
    entity: 'hr_checklist_template_items',
    entityId: String(data.id),
    detail: { template_id: template.id },
  })
  refresh(template.id)
  return { error: null, ok: true, message: 'Task added' }
}

export async function updateTemplateItem(templateId: number, itemId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(templateId) || !isId(itemId)) return { error: TASK_GONE }
  const fields = parseItem(formData)
  if ('error' in fields) return fields

  const { data, error } = await createAdminClient()
    .from('hr_checklist_template_items')
    .update({
      title: fields.title,
      description: fields.description,
      due_offset_days: fields.dueOffsetDays,
      owner_role: fields.ownerRole,
    })
    .eq('id', itemId)
    .eq('template_id', templateId)
    .select('id')
  if (error) return writeFailure('updateTemplateItem', error)
  if (data.length === 0) return { error: TASK_GONE }

  await logAudit(auth.viewer, {
    action: 'checklist_template.item_update',
    entity: 'hr_checklist_template_items',
    entityId: String(itemId),
    detail: { template_id: templateId },
  })
  refresh(templateId)
  return { error: null, ok: true, message: 'Task saved' }
}

export async function deleteTemplateItem(templateId: number, itemId: number): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(templateId) || !isId(itemId)) return { error: TASK_GONE }

  const { data, error } = await createAdminClient()
    .from('hr_checklist_template_items')
    .delete()
    .eq('id', itemId)
    .eq('template_id', templateId)
    .select('id')
  if (error) return writeFailure('deleteTemplateItem', error)
  if (data.length === 0) return { error: TASK_GONE }

  await logAudit(auth.viewer, {
    action: 'checklist_template.item_delete',
    entity: 'hr_checklist_template_items',
    entityId: String(itemId),
    detail: { template_id: templateId },
  })
  refresh(templateId)
  return { error: null, ok: true, message: 'Task deleted' }
}

/** Swaps a task with its neighbour. Order is renumbered 10, 20, 30… so ties from older data cannot confuse it. */
export async function moveTemplateItem(templateId: number, itemId: number, direction: 'up' | 'down'): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(templateId) || !isId(itemId)) return { error: TASK_GONE }
  const step = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
  if (step === 0) return { error: 'Choose up or down' }

  const admin = createAdminClient()
  const { data: items, error } = await admin
    .from('hr_checklist_template_items')
    .select('id, sort_order')
    .eq('template_id', templateId)
    .order('sort_order')
    .order('id')
    .returns<Pick<ChecklistTemplateItem, 'id' | 'sort_order'>[]>()
  if (error) {
    console.error('moveTemplateItem failed', error.message)
    return { error: `Could not move the task. ${TRY_AGAIN}` }
  }
  const from = items.findIndex(i => i.id === itemId)
  if (from === -1) return { error: TASK_GONE }
  const to = from + step
  if (to < 0 || to >= items.length) return { error: null, ok: true }

  const order = items.slice()
  order.splice(to, 0, ...order.splice(from, 1))
  const changes = order.flatMap((item, position) => (item.sort_order === (position + 1) * 10 ? [] : [{ id: item.id, sortOrder: (position + 1) * 10 }]))
  const results = await Promise.all(changes.map(c =>
    admin.from('hr_checklist_template_items').update({ sort_order: c.sortOrder }).eq('id', c.id).eq('template_id', templateId)
  ))
  const failed = results.find(r => r.error)
  if (failed?.error) {
    console.error('moveTemplateItem update failed', failed.error.message)
    return { error: `Could not move the task. ${TRY_AGAIN}` }
  }

  await logAudit(auth.viewer, {
    action: 'checklist_template.item_move',
    entity: 'hr_checklist_template_items',
    entityId: String(itemId),
    detail: { template_id: templateId, direction },
  })
  refresh(templateId)
  return { error: null, ok: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { TITLE_OPTIONS } from '@/utils/org-options'
import { authorize } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { DOCUMENT_CATEGORIES } from '@/utils/people/constants'
import { createAdminClient } from '@/utils/people/db'
import { countDocumentsOfType, findDocumentType } from '@/utils/people/settings-catalog'
import {
  DEFAULT_REMINDER_DAYS, DEFAULT_SORT_ORDER, DESCRIPTION_MAX, MAX_REMINDER_DAYS, MAX_SORT_ORDER, MAX_VALIDITY_MONTHS, NAME_MAX,
} from '@/utils/people/settings-input'
import type { ActionState, DocumentCategory, DocumentType } from '@/utils/people/types'
import { bool, oneOf, optNumber, optStr, str } from '@/utils/people/validate'

// Server actions for Settings > Document types. Every action re-checks
// settings.manage: bound ids and form values come from the browser.

const BASE = '/settings/document-types'
const CATEGORY_VALUES = DOCUMENT_CATEGORIES.map(c => c.value)
const TRY_AGAIN = 'Please try again.'
const TYPE_GONE = 'That document type no longer exists'

type DbError = { code?: string; message: string }

const isId = (value: number) => Number.isInteger(value) && value > 0

function refresh() {
  revalidatePath(BASE)
  revalidatePath('/settings')
  // The compliance matrix is built from the active document types.
  revalidatePath('/documents')
}

/** Logs the real error and returns a message that is safe to show. */
function writeFailure(context: string, error: DbError): ActionState {
  if (error.code === '23505') return { error: 'A document type with that name already exists. Choose a different name.' }
  console.error(`${context} failed`, error.code, error.message)
  return { error: `Could not save the change. ${TRY_AGAIN}` }
}

type TypeFields = {
  name: string
  category: DocumentCategory
  description: string | null
  requires_expiry: boolean
  default_validity_months: number | null
  /** null = leave as it is (the field is ignored for documents that never expire). */
  reminder_days: number | null
  mandatory: boolean
  applies_to_titles: string[]
  active: boolean
  sort_order: number
}

function wholeNumber(value: number | null, min: number, max: number): boolean {
  return value !== null && Number.isInteger(value) && value >= min && value <= max
}

/** Job titles must come from the company list, but titles already on the type stay valid. */
function parseFields(formData: FormData, currentTitles: readonly string[] = []): TypeFields | { error: string } {
  const name = str(formData, 'name')
  if (!name) return { error: 'Give the document type a name' }
  if (name.length > NAME_MAX) return { error: `The name must be ${NAME_MAX} characters or fewer` }
  const category = oneOf(str(formData, 'category'), CATEGORY_VALUES)
  if (!category) return { error: 'Choose a category' }
  const description = optStr(formData, 'description')
  if (description && description.length > DESCRIPTION_MAX) return { error: `The description must be ${DESCRIPTION_MAX} characters or fewer` }

  const requiresExpiry = bool(formData, 'requires_expiry')
  let validity: number | null = null
  let reminder: number | null = null
  if (requiresExpiry) {
    validity = optNumber(formData, 'default_validity_months')
    if (validity !== null && !wholeNumber(validity, 1, MAX_VALIDITY_MONTHS)) {
      return { error: `Validity must be a whole number of months between 1 and ${MAX_VALIDITY_MONTHS}, or left blank` }
    }
    reminder = optNumber(formData, 'reminder_days') ?? DEFAULT_REMINDER_DAYS
    if (!wholeNumber(reminder, 0, MAX_REMINDER_DAYS)) {
      return { error: `Reminder must be a whole number of days between 0 and ${MAX_REMINDER_DAYS}` }
    }
  }

  const sortOrder = optNumber(formData, 'sort_order') ?? DEFAULT_SORT_ORDER
  if (!wholeNumber(sortOrder, 0, MAX_SORT_ORDER)) return { error: `Order must be a whole number between 0 and ${MAX_SORT_ORDER}` }

  const allowed = new Set<string>([...TITLE_OPTIONS, ...currentTitles])
  const titles: string[] = []
  for (const raw of formData.getAll('applies_to_titles')) {
    const title = typeof raw === 'string' ? raw.trim() : ''
    if (!allowed.has(title)) return { error: 'Choose job titles from the list' }
    if (!titles.includes(title)) titles.push(title)
  }

  return {
    name, category, description,
    requires_expiry: requiresExpiry,
    default_validity_months: validity,
    reminder_days: reminder,
    mandatory: bool(formData, 'mandatory'),
    applies_to_titles: titles,
    active: bool(formData, 'active'),
    sort_order: sortOrder,
  }
}

function toRow(fields: TypeFields) {
  const { reminder_days: reminder, ...rest } = fields
  return reminder === null ? rest : { ...rest, reminder_days: reminder }
}

/** Names (never values) of the fields that differ from what is stored. */
function changedFields(current: DocumentType, next: TypeFields): string[] {
  const sameTitles = current.applies_to_titles.length === next.applies_to_titles.length &&
    current.applies_to_titles.every(t => next.applies_to_titles.includes(t))
  const checks: [string, boolean][] = [
    ['name', current.name !== next.name],
    ['category', current.category !== next.category],
    ['description', (current.description ?? null) !== next.description],
    ['requires_expiry', current.requires_expiry !== next.requires_expiry],
    ['default_validity_months', (current.default_validity_months ?? null) !== next.default_validity_months],
    ['reminder_days', next.reminder_days !== null && current.reminder_days !== next.reminder_days],
    ['mandatory', current.mandatory !== next.mandatory],
    ['applies_to_titles', !sameTitles],
    ['active', current.active !== next.active],
    ['sort_order', current.sort_order !== next.sort_order],
  ]
  return checks.filter(([, differs]) => differs).map(([field]) => field)
}

export async function createDocumentType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  const fields = parseFields(formData)
  if ('error' in fields) return fields

  const { data, error } = await createAdminClient()
    .from('hr_document_types')
    .insert(toRow(fields))
    .select('id')
    .single<{ id: number }>()
  if (error || !data) return writeFailure('createDocumentType', error ?? { message: 'no row returned' })

  await logAudit(auth.viewer, {
    action: 'document_type.create',
    entity: 'hr_document_types',
    entityId: String(data.id),
    detail: { category: fields.category, mandatory: fields.mandatory },
  })
  refresh()
  return { error: null, ok: true, message: 'Document type added' }
}

export async function updateDocumentType(typeId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(typeId)) return { error: TYPE_GONE }
  const current = await findDocumentType(typeId)
  if (!current) return { error: TYPE_GONE }
  const fields = parseFields(formData, current.applies_to_titles)
  if ('error' in fields) return fields

  const changed = changedFields(current, fields)
  if (changed.length === 0) return { error: null, ok: true, message: 'No changes to save' }

  const { error } = await createAdminClient().from('hr_document_types').update(toRow(fields)).eq('id', current.id)
  if (error) return writeFailure('updateDocumentType', error)

  await logAudit(auth.viewer, {
    action: 'document_type.update',
    entity: 'hr_document_types',
    entityId: String(current.id),
    detail: { fields: changed },
  })
  refresh()
  return { error: null, ok: true, message: 'Document type saved' }
}

export async function setDocumentTypeActive(typeId: number, active: boolean): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(typeId)) return { error: TYPE_GONE }
  const current = await findDocumentType(typeId)
  if (!current) return { error: TYPE_GONE }
  const next = active === true
  if (current.active === next) return { error: null, ok: true }

  const { error } = await createAdminClient().from('hr_document_types').update({ active: next }).eq('id', current.id)
  if (error) return writeFailure('setDocumentTypeActive', error)

  await logAudit(auth.viewer, {
    action: next ? 'document_type.activate' : 'document_type.deactivate',
    entity: 'hr_document_types',
    entityId: String(current.id),
  })
  refresh()
  return { error: null, ok: true }
}

export async function deleteDocumentType(typeId: number): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(typeId)) return { error: TYPE_GONE }
  const current = await findDocumentType(typeId)
  if (!current) return { error: TYPE_GONE }

  // Deleting would silently detach the type from every document that uses it.
  const used = await countDocumentsOfType(current.id)
  if (used === null) return { error: `Could not check whether this type is in use. ${TRY_AGAIN}` }
  if (used > 0) {
    return { error: `${used} ${used === 1 ? 'document is' : 'documents are'} filed under this type. Deactivate it instead of deleting it.` }
  }

  const { error } = await createAdminClient().from('hr_document_types').delete().eq('id', current.id)
  if (error) return writeFailure('deleteDocumentType', error)

  await logAudit(auth.viewer, {
    action: 'document_type.delete',
    entity: 'hr_document_types',
    entityId: String(current.id),
    detail: { name: current.name, category: current.category },
  })
  refresh()
  return { error: null, ok: true }
}

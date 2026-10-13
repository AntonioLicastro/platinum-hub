'use server'

import { revalidatePath } from 'next/cache'
import { authorize } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { createAdminClient } from '@/utils/people/db'
import { countLeaveTypeUse, findLeaveType } from '@/utils/people/settings-catalog'
import {
  DEFAULT_SORT_ORDER, DESCRIPTION_MAX, LEAVE_CATEGORY_VALUES, LEAVE_CODE_MAX, LEAVE_CODE_PATTERN, LEAVE_SWATCHES,
  MAX_ENTITLEMENT_DAYS, MAX_SORT_ORDER, NAME_MAX,
} from '@/utils/people/settings-input'
import type { ActionState, LeaveCategory, LeaveType } from '@/utils/people/types'
import { bool, oneOf, optNumber, optStr, str } from '@/utils/people/validate'

// Server actions for Settings > Leave types. Every action re-checks
// settings.manage: bound ids and form values come from the browser.

const BASE = '/settings/leave-types'
const SWATCH_VALUES = LEAVE_SWATCHES.map(s => s.value)
const TRY_AGAIN = 'Please try again.'
const TYPE_GONE = 'That leave type no longer exists'

type DbError = { code?: string; message: string }

const isId = (value: number) => Number.isInteger(value) && value > 0

function refresh() {
  revalidatePath(BASE)
  revalidatePath('/settings')
  // Leave balances, the request form and the calendar are all built from the leave types.
  revalidatePath('/leave')
}

/** Logs the real error and returns a message that is safe to show. */
function writeFailure(context: string, error: DbError): ActionState {
  if (error.code === '23505') return { error: 'A leave type with that code already exists. Choose a different code.' }
  console.error(`${context} failed`, error.code, error.message)
  return { error: `Could not save the change. ${TRY_AGAIN}` }
}

type LeaveFields = {
  name: string
  category: LeaveCategory
  paid: boolean
  requires_approval: boolean
  uses_balance: boolean
  default_entitlement_days: number | null
  color: string
  statutory_note: string | null
  active: boolean
  sort_order: number
}

/** A colour from the palette, or (when editing) the colour the type already has. */
function parseFields(formData: FormData, currentColor?: string): LeaveFields | { error: string } {
  const name = str(formData, 'name')
  if (!name) return { error: 'Give the leave type a name' }
  if (name.length > NAME_MAX) return { error: `The name must be ${NAME_MAX} characters or fewer` }
  const category = oneOf(str(formData, 'category'), LEAVE_CATEGORY_VALUES)
  if (!category) return { error: 'Choose a category' }

  const entitlement = optNumber(formData, 'default_entitlement_days')
  if (entitlement !== null && !(entitlement >= 0 && entitlement <= MAX_ENTITLEMENT_DAYS)) {
    return { error: `Days must be between 0 and ${MAX_ENTITLEMENT_DAYS}, or left blank` }
  }

  const colors: string[] = currentColor ? [...SWATCH_VALUES, currentColor] : SWATCH_VALUES
  const color = oneOf(str(formData, 'color'), colors)
  if (!color) return { error: 'Choose a colour from the list' }

  const note = optStr(formData, 'statutory_note')
  if (note && note.length > DESCRIPTION_MAX) return { error: `The note must be ${DESCRIPTION_MAX} characters or fewer` }

  const sortOrder = optNumber(formData, 'sort_order') ?? DEFAULT_SORT_ORDER
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > MAX_SORT_ORDER) {
    return { error: `Order must be a whole number between 0 and ${MAX_SORT_ORDER}` }
  }

  return {
    name, category,
    paid: bool(formData, 'paid'),
    requires_approval: bool(formData, 'requires_approval'),
    uses_balance: bool(formData, 'uses_balance'),
    default_entitlement_days: entitlement === null ? null : Math.round(entitlement * 100) / 100,
    color,
    statutory_note: note,
    active: bool(formData, 'active'),
    sort_order: sortOrder,
  }
}

/** Names (never values) of the fields that differ from what is stored. */
function changedFields(current: LeaveType, next: LeaveFields): string[] {
  const checks: [string, boolean][] = [
    ['name', current.name !== next.name],
    ['category', current.category !== next.category],
    ['paid', current.paid !== next.paid],
    ['requires_approval', current.requires_approval !== next.requires_approval],
    ['uses_balance', current.uses_balance !== next.uses_balance],
    ['default_entitlement_days', (current.default_entitlement_days ?? null) !== next.default_entitlement_days],
    ['color', current.color !== next.color],
    ['statutory_note', (current.statutory_note ?? null) !== next.statutory_note],
    ['active', current.active !== next.active],
    ['sort_order', current.sort_order !== next.sort_order],
  ]
  return checks.filter(([, differs]) => differs).map(([field]) => field)
}

export async function createLeaveType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }

  // The code is how other parts of the app refer to the type, so it is chosen once and never edited.
  const code = str(formData, 'code').toLowerCase()
  if (!LEAVE_CODE_PATTERN.test(code)) {
    return { error: `The code must start with a letter and use only lowercase letters, numbers and underscores (2 to ${LEAVE_CODE_MAX} characters)` }
  }
  const fields = parseFields(formData)
  if ('error' in fields) return fields

  const { data, error } = await createAdminClient()
    .from('hr_leave_types')
    .insert({ code, ...fields })
    .select('id')
    .single<{ id: number }>()
  if (error || !data) return writeFailure('createLeaveType', error ?? { message: 'no row returned' })

  await logAudit(auth.viewer, {
    action: 'leave_type.create',
    entity: 'hr_leave_types',
    entityId: String(data.id),
    detail: { code, category: fields.category },
  })
  refresh()
  return { error: null, ok: true, message: 'Leave type added' }
}

export async function updateLeaveType(typeId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(typeId)) return { error: TYPE_GONE }
  const current = await findLeaveType(typeId)
  if (!current) return { error: TYPE_GONE }
  const fields = parseFields(formData, current.color)
  if ('error' in fields) return fields

  const changed = changedFields(current, fields)
  if (changed.length === 0) return { error: null, ok: true, message: 'No changes to save' }

  const { error } = await createAdminClient().from('hr_leave_types').update(fields).eq('id', current.id)
  if (error) return writeFailure('updateLeaveType', error)

  await logAudit(auth.viewer, {
    action: 'leave_type.update',
    entity: 'hr_leave_types',
    entityId: String(current.id),
    detail: { fields: changed },
  })
  refresh()
  return { error: null, ok: true, message: 'Leave type saved' }
}

export async function setLeaveTypeActive(typeId: number, active: boolean): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(typeId)) return { error: TYPE_GONE }
  const current = await findLeaveType(typeId)
  if (!current) return { error: TYPE_GONE }
  const next = active === true
  if (current.active === next) return { error: null, ok: true }

  const { error } = await createAdminClient().from('hr_leave_types').update({ active: next }).eq('id', current.id)
  if (error) return writeFailure('setLeaveTypeActive', error)

  await logAudit(auth.viewer, {
    action: next ? 'leave_type.activate' : 'leave_type.deactivate',
    entity: 'hr_leave_types',
    entityId: String(current.id),
  })
  refresh()
  return { error: null, ok: true }
}

export async function deleteLeaveType(typeId: number): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isId(typeId)) return { error: TYPE_GONE }
  const current = await findLeaveType(typeId)
  if (!current) return { error: TYPE_GONE }

  // Requests block the delete outright in the database; entitlements would be deleted along with the type.
  const use = await countLeaveTypeUse(current.id)
  if (!use) return { error: `Could not check whether this type is in use. ${TRY_AGAIN}` }
  if (use.requests > 0 || use.entitlements > 0) {
    const parts = [
      use.requests > 0 ? `${use.requests} ${use.requests === 1 ? 'leave request' : 'leave requests'}` : '',
      use.entitlements > 0 ? `${use.entitlements} ${use.entitlements === 1 ? 'entitlement' : 'entitlements'}` : '',
    ].filter(Boolean)
    return { error: `${parts.join(' and ')} use this leave type. Deactivate it instead of deleting it.` }
  }

  const { error } = await createAdminClient().from('hr_leave_types').delete().eq('id', current.id)
  if (error) return writeFailure('deleteLeaveType', error)

  await logAudit(auth.viewer, {
    action: 'leave_type.delete',
    entity: 'hr_leave_types',
    entityId: String(current.id),
    detail: { code: current.code, name: current.name },
  })
  refresh()
  return { error: null, ok: true }
}

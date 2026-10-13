'use server'

import { revalidatePath } from 'next/cache'
import { AREA_OPTIONS } from '@/utils/org-options'
import { isFleetOnlyUser } from '@/utils/fleet-only'
import { authorize } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { createAdminClient } from '@/utils/people/db'
import { getAccessRow } from '@/utils/people/settings-access'
import { ACCESS_ROLE_VALUES, COMPANY_EMAIL_DOMAIN, EMAIL_MAX, NOTE_MAX } from '@/utils/people/settings-input'
import type { ActionState } from '@/utils/people/types'
import { isEmail, oneOf, optStr, str } from '@/utils/people/validate'

// Server actions for Settings > Access. Only HR admins (access.manage) may
// grant or revoke HR Locker roles, and every action re-checks that: the email,
// role and areas all come from the browser.

const BASE = '/settings/access'
const TRY_AGAIN = 'Please try again.'

function refresh() {
  revalidatePath(BASE)
  revalidatePath('/settings')
}

/**
 * True when removing the admin role from `targetEmail` would leave no hr_admin
 * row at all and the person doing it relies on such a row for their own access.
 * Bootstrap admins (hard-coded in code, so they have no row) are never locked
 * out, which is why they are allowed to remove the last row.
 */
async function wouldRemoveLastAdmin(actorEmail: string, targetEmail: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient().from('hr_access').select('email').eq('role', 'hr_admin').returns<{ email: string }[]>()
  if (error) {
    console.error('wouldRemoveLastAdmin failed', error.message)
    return null
  }
  const admins = (data ?? []).map(a => a.email)
  const remaining = admins.filter(email => email !== targetEmail)
  return remaining.length === 0 && admins.includes(actorEmail)
}

export async function saveAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('access.manage')
  if (!auth.ok) return { error: auth.error }
  const { viewer } = auth

  const email = str(formData, 'email').toLowerCase()
  if (!email || email.length > EMAIL_MAX || !isEmail(email)) return { error: 'Enter a valid email address' }
  // getViewer() turns away every other address (same test), so a grant to one could never be used.
  if (isFleetOnlyUser(email)) return { error: `HR Locker sign-in is limited to ${COMPANY_EMAIL_DOMAIN} addresses` }
  const role = oneOf(str(formData, 'role'), ACCESS_ROLE_VALUES)
  if (!role) return { error: 'Choose a role' }

  // Areas only mean something for managers; every other role sees everyone.
  const areas: string[] = []
  if (role === 'manager') {
    for (const raw of formData.getAll('areas')) {
      const area = typeof raw === 'string' ? raw.trim() : ''
      if (!AREA_OPTIONS.includes(area)) return { error: 'Choose areas from the list' }
      if (!areas.includes(area)) areas.push(area)
    }
  }
  const note = optStr(formData, 'note')
  if (note && note.length > NOTE_MAX) return { error: `The note must be ${NOTE_MAX} characters or fewer` }

  if (email === viewer.email && role !== 'hr_admin') {
    return { error: "You can't lower your own access. Ask another HR admin to change it." }
  }

  const admin = createAdminClient()
  const { row: existing, failed } = await getAccessRow(email)
  if (failed) return { error: `Could not check their current access. ${TRY_AGAIN}` }

  if (!existing) {
    const { error } = await admin.from('hr_access').insert({ email, role, areas, note, granted_by: viewer.email })
    if (error) {
      if (error.code === '23505') return { error: 'That person already has access. Refresh the page to change it.' }
      console.error('saveAccess insert failed', error.code, error.message)
      return { error: `Could not grant access. ${TRY_AGAIN}` }
    }
    await logAudit(viewer, {
      action: 'access.grant',
      entity: 'hr_access',
      entityId: email,
      detail: { target_email: email, role, areas },
    })
    refresh()
    return { error: null, ok: true, message: 'Access granted' }
  }

  if (existing.role === 'hr_admin' && role !== 'hr_admin') {
    const last = await wouldRemoveLastAdmin(viewer.email, email)
    if (last === null) return { error: `Could not check the other HR admins. ${TRY_AGAIN}` }
    if (last) return { error: 'This is the last HR admin. Make someone else an HR admin first.' }
  }

  // Keeps who first granted access and when; the audit log records every later change.
  const { error } = await admin.from('hr_access').update({ role, areas, note }).eq('email', email)
  if (error) {
    console.error('saveAccess update failed', error.code, error.message)
    return { error: `Could not change access. ${TRY_AGAIN}` }
  }
  await logAudit(viewer, {
    action: 'access.change',
    entity: 'hr_access',
    entityId: email,
    detail: { target_email: email, role, areas, previous_role: existing.role, previous_areas: existing.areas },
  })
  refresh()
  return { error: null, ok: true, message: 'Access updated' }
}

export async function revokeAccess(targetEmail: string): Promise<ActionState> {
  const auth = await authorize('access.manage')
  if (!auth.ok) return { error: auth.error }
  const { viewer } = auth

  const email = typeof targetEmail === 'string' ? targetEmail.toLowerCase().trim() : ''
  if (!email || !isEmail(email)) return { error: 'That person no longer has access' }
  if (email === viewer.email) return { error: "You can't remove your own access. Ask another HR admin to do it." }

  const { row: existing, failed } = await getAccessRow(email)
  if (failed) return { error: `Could not check their current access. ${TRY_AGAIN}` }
  if (!existing) return { error: 'That person no longer has access' }

  if (existing.role === 'hr_admin') {
    const last = await wouldRemoveLastAdmin(viewer.email, email)
    if (last === null) return { error: `Could not check the other HR admins. ${TRY_AGAIN}` }
    if (last) return { error: 'This is the last HR admin. Make someone else an HR admin first.' }
  }

  const { error } = await createAdminClient().from('hr_access').delete().eq('email', email)
  if (error) {
    console.error('revokeAccess failed', error.code, error.message)
    return { error: `Could not remove access. ${TRY_AGAIN}` }
  }
  await logAudit(viewer, {
    action: 'access.revoke',
    entity: 'hr_access',
    entityId: email,
    detail: { target_email: email, role: existing.role, areas: existing.areas },
  })
  refresh()
  return { error: null, ok: true }
}

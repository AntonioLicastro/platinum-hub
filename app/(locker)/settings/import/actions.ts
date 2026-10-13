'use server'

import { revalidatePath } from 'next/cache'
import { authorize, can } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { applySyncPlan, loadSyncPlan } from '@/utils/people/import-sync'
import type { ActionState } from '@/utils/people/types'
import { isRateLimited } from '@/utils/rate-limit'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Settings > Import and sync: brings HR Locker in line with the Platinum
 * directory. Adds people who are missing, links them to their app account and
 * fills blank area / job title / payroll number. Never overwrites a value HR
 * has entered and never writes to profiles or staff_roster.
 */
export async function syncFromDirectory(): Promise<ActionState> {
  const auth = await authorize('import.run')
  if (!auth.ok) return { error: auth.error }
  const { viewer } = auth
  if (!can(viewer, 'employees.edit')) return { error: 'You do not have permission to add or change employees' }
  if (isRateLimited(`people-sync:${viewer.userId}`, 4)) return { error: 'Please wait a minute before syncing again.' }

  const plan = await loadSyncPlan()
  if (!plan) return { error: 'The Platinum directory could not be read just now. Please try again in a moment.' }

  const summary = await applySyncPlan(viewer, plan)
  await logAudit(viewer, { action: 'import.sync', entity: 'hr_employees', detail: { ...summary } })
  revalidatePath('/')
  revalidatePath('/directory')
  revalidatePath('/settings/import')

  const parts: string[] = []
  if (summary.created > 0) parts.push(`added ${plural(summary.created, 'person', 'people')}`)
  if (summary.linked > 0) parts.push(`linked ${plural(summary.linked, 'person', 'people')} to their app account`)
  if (summary.filledFields > 0) {
    parts.push(`filled ${plural(summary.filledFields, 'blank field', 'blank fields')} for ${plural(summary.filledPeople, 'person', 'people')}`)
  }

  if (summary.failed > 0) {
    const done = parts.length > 0 ? `Partly done: ${parts.join(', ')}. ` : ''
    return { error: `${done}${plural(summary.failed, 'change', 'changes')} could not be saved. Syncing again is safe and will retry them.` }
  }
  if (parts.length === 0) return { error: null, ok: true, message: 'Everything was already in sync. Nothing changed.' }
  const sentence = parts.join(', ')
  return { error: null, ok: true, message: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` }
}

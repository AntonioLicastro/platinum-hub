import { cache } from 'react'
import { createAdminClient, fetchAllPages, withRetry } from './db'
import { inScope, type PeopleViewer } from './access'
import type { Employee } from './types'

/**
 * Every employee the viewer is allowed to see, sorted by name. HR gets all
 * rows; managers/employees are filtered with inScope() (the single source of
 * truth for row scope). Paginates past PostgREST's 1000-row cap.
 */
export async function listEmployees(viewer: PeopleViewer): Promise<Employee[]> {
  const admin = createAdminClient()
  const { data, error } = await fetchAllPages<Employee>((from, to) =>
    admin
      .from('hr_employees')
      .select('*')
      .order('last_name')
      .order('first_name')
      .order('id')
      .range(from, to)
      .returns<Employee[]>()
  )
  // Throw rather than return the pages that loaded: a partial list would silently
  // become an empty export, a wrong headcount, or an "everyone is compliant" screen.
  if (error) {
    console.error('listEmployees failed', error.message)
    throw new Error('Could not load employees. Please try again.')
  }
  return data.filter(e => inScope(viewer, e))
}

/** A single employee if (and only if) the viewer may see them. */
// Cached per request: the viewer object is itself per-request (getViewer), so the
// profile shell and every tab share one fetch of the same employee.
export const getEmployee = cache(async (viewer: PeopleViewer, id: string): Promise<Employee | null> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const admin = createAdminClient()
  const { data, error } = await withRetry(() => admin.from('hr_employees').select('*').eq('id', id).maybeSingle<Employee>())
  if (error) {
    console.error('getEmployee failed', error.message)
    throw new Error('Could not load this employee. Please try again.')
  }
  return data && inScope(viewer, data) ? data : null
})

/** Active (non-leaver) headcount subset helper. */
export const isCurrent = (e: Pick<Employee, 'employment_status'>) => e.employment_status !== 'leaver'

/** Map of lowercase email -> display name, for showing "approved by …" etc. */
export async function emailNameMap(emails: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(emails.filter((e): e is string => !!e).map(e => e.toLowerCase()))]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const admin = createAdminClient()
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await admin.from('hr_employees').select('email, first_name, last_name').in('email', unique.slice(i, i + 100))
    for (const r of data ?? []) map.set(r.email, `${r.first_name} ${r.last_name}`.trim() || r.email)
  }
  return map
}

import { isHr, isSelf, type PeopleViewer } from './access'
import { logAudit } from './audit'
import type { Employee } from './types'

// Audit trail for HR reading ANOTHER person's HR-only data (personal details,
// the HR part of the timeline). Settings > Audit promises this, but unlike a PPS
// reveal or the pay history it is not fail-closed: the page still renders when the
// log is down. Refreshes and tab switches would otherwise write a row each time,
// so one viewer opening the same thing again within the window writes nothing.

const WINDOW_MS = 10 * 60_000
const MAX_TRACKED = 5_000

// Per server instance, like utils/rate-limit.ts: it will not coordinate across
// instances, so at worst a second instance writes one extra row.
const recentlyLogged = new Map<string, number>()

type ProfileViewKind = 'private.view' | 'timeline.view'

function forgetStale(now: number) {
  for (const [key, at] of recentlyLogged) {
    if (now - at >= WINDOW_MS) recentlyLogged.delete(key)
  }
  // Still too many (a burst of distinct pages inside the window): drop the oldest first.
  for (const key of recentlyLogged.keys()) {
    if (recentlyLogged.size <= MAX_TRACKED) break
    recentlyLogged.delete(key)
  }
}

/**
 * Records that an HR viewer opened someone else's `kind` data. `detail` must be
 * counts only, never values. Never throws and never blocks the page on failure.
 */
export async function auditProfileView(
  viewer: PeopleViewer,
  employee: Pick<Employee, 'id'>,
  kind: ProfileViewKind,
  detail: Record<string, number>,
): Promise<void> {
  // Reading your own record is not an access that needs explaining, and only HR can reach these views for others.
  if (!isHr(viewer) || isSelf(viewer, employee)) return

  const key = `${viewer.userId}|${employee.id}|${kind}`
  const now = Date.now()
  const last = recentlyLogged.get(key)
  if (last !== undefined && now - last < WINDOW_MS) return

  // Claim the slot before the await so two renders of the same page do not both write.
  recentlyLogged.delete(key)
  recentlyLogged.set(key, now)
  if (recentlyLogged.size > MAX_TRACKED) forgetStale(now)

  const written = await logAudit(viewer, {
    action: kind,
    entity: 'hr_employees',
    entityId: employee.id,
    employeeId: employee.id,
    detail,
  })
  // A failed write must not suppress the next attempt.
  if (!written) recentlyLogged.delete(key)
}

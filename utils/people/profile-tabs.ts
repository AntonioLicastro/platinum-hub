import { canOnEmployee, isSelf, type Capability, type PeopleViewer } from './access'
import type { Employee } from './types'

export type ProfileTabKey =
  | 'overview' | 'employment' | 'personal' | 'pay' | 'documents' | 'leave' | 'reviews' | 'checklists' | 'timeline'

type ProfileTab = { key: ProfileTabKey; label: string }

const TABS: (ProfileTab & { cap: Capability })[] = [
  { key: 'overview', label: 'Overview', cap: 'employees.view' },
  { key: 'employment', label: 'Employment', cap: 'employees.view' },
  { key: 'personal', label: 'Personal', cap: 'private.view' },
  { key: 'pay', label: 'Pay', cap: 'compensation.view' },
  { key: 'documents', label: 'Documents', cap: 'documents.view' },
  { key: 'leave', label: 'Leave', cap: 'leave.view' },
  { key: 'reviews', label: 'Reviews', cap: 'reviews.view' },
  { key: 'checklists', label: 'Checklists', cap: 'checklists.view' },
  { key: 'timeline', label: 'Timeline', cap: 'employees.view' },
]

/**
 * The profile tabs this viewer may open for this employee. The timeline holds
 * case notes written about a person, so it is hidden when they look at their own record.
 */
export function visibleTabs(viewer: PeopleViewer, employee: Employee): ProfileTab[] {
  return TABS
    .filter(t => canOnEmployee(viewer, t.cap, employee) && !(t.key === 'timeline' && isSelf(viewer, employee)))
    .map(({ key, label }) => ({ key, label }))
}

/** Maps the `?tab=` search param to a tab the viewer can see; anything unknown or hidden falls back to the overview. */
export function resolveTab(raw: string | string[] | undefined, tabs: ProfileTab[]): ProfileTabKey {
  const wanted = Array.isArray(raw) ? raw[0] : raw
  return tabs.find(t => t.key === wanted)?.key ?? 'overview'
}

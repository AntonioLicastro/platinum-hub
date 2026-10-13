import type { OpenChecklistItem } from './checklist-data'
import { dueDistance } from './checklist-status'
import type { DocumentAlert } from './compliance-data'
import { labelOf, REVIEW_TYPES, type Tone } from './constants'
import { employeeHref, plural } from './dashboard-metrics'
import { displayName, formatDayMonth, formatDays, relativeDays } from './format'
import type { LeaveRequestWithContext } from './leave-data'
import { formatLeaveRange } from './leave-calc'
import { REVIEW_STATUSES, reviewStatus } from './review-status'
import type { ReviewWithEmployee } from './review-data'
import type { Employee } from './types'

// Turns the dashboard's raw lists into the prioritised "Needs attention" groups.
// Order here is the order on screen: documents first, then reviews, probation,
// overdue tasks and leave waiting for the viewer.

const ATTENTION_ROWS_PER_GROUP = 5

export type AttentionTone = Extract<Tone, 'red' | 'amber' | 'sky' | 'gray'>

export type AttentionKind = 'expired' | 'expiring' | 'missing' | 'reviews' | 'probation' | 'tasks' | 'leave'

type AttentionRow = {
  key: string
  name: string
  detail: string
  href: string
  badge?: { label: string; tone: Tone }
}

export type AttentionGroup = {
  kind: AttentionKind
  title: string
  tone: AttentionTone
  /** Everything in the group, of which `rows` shows the first few. */
  total: number
  summary?: string
  rows: AttentionRow[]
  viewAll?: { href: string; label: string }
}

type AttentionInput = {
  today: string
  alerts: DocumentAlert[]
  reviews: ReviewWithEmployee[]
  probation: Employee[]
  overdueTasks: OpenChecklistItem[]
  pendingLeave: LeaveRequestWithContext[]
}

const DOCUMENT_ALERTS_HREF = '/documents?view=alerts'

const peopleIn = (alerts: DocumentAlert[]) => new Set(alerts.map(a => a.employee.id)).size

function documentGroup(kind: 'expired' | 'expiring', alerts: DocumentAlert[]): AttentionGroup | null {
  if (alerts.length === 0) return null
  const expired = kind === 'expired'
  const people = peopleIn(alerts)
  return {
    kind,
    title: expired ? 'Expired documents' : 'Documents expiring within 30 days',
    tone: expired ? 'red' : 'amber',
    total: alerts.length,
    summary: `${people} ${plural(people, 'person', 'people')}`,
    rows: alerts.slice(0, ATTENTION_ROWS_PER_GROUP).map(a => ({
      key: `${a.employee.id}-${a.documentType.id}`,
      name: displayName(a.employee),
      detail: `${a.documentType.name} ${expired ? 'expired' : 'expires'} ${relativeDays(a.expiresOn)}`,
      href: employeeHref(a.employee.id, 'documents'),
    })),
    viewAll: { href: DOCUMENT_ALERTS_HREF, label: `View all ${alerts.length}` },
  }
}

function missingGroup(alerts: DocumentAlert[]): AttentionGroup | null {
  if (alerts.length === 0) return null
  const missingByPerson = new Map<string, { employee: Employee; types: string[] }>()
  for (const alert of alerts) {
    const entry = missingByPerson.get(alert.employee.id)
    if (entry) entry.types.push(alert.documentType.name)
    else missingByPerson.set(alert.employee.id, { employee: alert.employee, types: [alert.documentType.name] })
  }
  const people = [...missingByPerson.values()].sort((a, b) =>
    b.types.length - a.types.length || displayName(a.employee).localeCompare(displayName(b.employee)))

  return {
    kind: 'missing',
    title: 'People missing required documents',
    tone: 'gray',
    total: people.length,
    summary: `${alerts.length} ${plural(alerts.length, 'document', 'documents')} in total`,
    rows: people.slice(0, ATTENTION_ROWS_PER_GROUP).map(({ employee, types }) => ({
      key: employee.id,
      name: displayName(employee),
      detail: types.length > 2 ? `${types.slice(0, 2).join(', ')} and ${types.length - 2} more` : types.join(', '),
      href: employeeHref(employee.id, 'documents'),
      badge: { label: `${types.length} missing`, tone: 'gray' },
    })),
    viewAll: { href: DOCUMENT_ALERTS_HREF, label: `View all ${people.length}` },
  }
}

function reviewGroup(reviews: ReviewWithEmployee[], today: string): AttentionGroup | null {
  // "Scheduled" reviews are further off than the review module's due-soon window, so they are not urgent yet.
  const urgent = reviews.filter(r => r.due_on !== null && reviewStatus(r, today) !== 'scheduled')
  if (urgent.length === 0) return null
  const overdue = urgent.filter(r => reviewStatus(r, today) === 'overdue').length
  return {
    kind: 'reviews',
    title: 'Reviews overdue or due soon',
    tone: overdue > 0 ? 'red' : 'amber',
    total: urgent.length,
    summary: overdue > 0 ? `${overdue} overdue` : undefined,
    rows: urgent.slice(0, ATTENTION_ROWS_PER_GROUP).map(r => {
      const status = REVIEW_STATUSES[reviewStatus(r, today)]
      return {
        key: r.id,
        name: displayName(r.employee),
        detail: `${labelOf(REVIEW_TYPES, r.review_type)} due ${relativeDays(r.due_on)}`,
        href: employeeHref(r.employee_id, 'reviews'),
        badge: status,
      }
    }),
  }
}

function probationGroup(probation: Employee[]): AttentionGroup | null {
  if (probation.length === 0) return null
  return {
    kind: 'probation',
    title: 'Probation ending within 30 days',
    tone: 'sky',
    total: probation.length,
    rows: probation.slice(0, ATTENTION_ROWS_PER_GROUP).map(e => ({
      key: e.id,
      name: displayName(e),
      detail: `Probation ends ${formatDayMonth(e.probation_end_date)}, ${relativeDays(e.probation_end_date)}`,
      href: employeeHref(e.id, 'employment'),
    })),
  }
}

function taskGroup(tasks: OpenChecklistItem[], today: string): AttentionGroup | null {
  if (tasks.length === 0) return null
  return {
    kind: 'tasks',
    title: 'Overdue onboarding and offboarding tasks',
    tone: 'red',
    total: tasks.length,
    rows: tasks.slice(0, ATTENTION_ROWS_PER_GROUP).map(t => ({
      key: t.id,
      name: displayName(t.employee),
      detail: `${t.title}, ${dueDistance(t.due_on, today).toLowerCase()}`,
      href: employeeHref(t.employee.id, 'checklists'),
    })),
    viewAll: { href: '/onboarding', label: `View all ${tasks.length}` },
  }
}

function leaveGroup(requests: LeaveRequestWithContext[]): AttentionGroup | null {
  if (requests.length === 0) return null
  return {
    kind: 'leave',
    title: 'Leave waiting for your decision',
    tone: 'amber',
    total: requests.length,
    rows: requests.slice(0, ATTENTION_ROWS_PER_GROUP).map(r => ({
      key: r.id,
      name: displayName(r.employee),
      detail: `${r.type.name}, ${formatLeaveRange(r.start_date, r.end_date)} (${formatDays(r.days)})`,
      href: '/leave?view=requests',
    })),
    viewAll: { href: '/leave?view=requests', label: `View all ${requests.length}` },
  }
}

export function buildAttentionGroups(input: AttentionInput): AttentionGroup[] {
  const { alerts, today } = input
  return [
    documentGroup('expired', alerts.filter(a => a.state === 'expired')),
    documentGroup('expiring', alerts.filter(a => a.state === 'expiring')),
    missingGroup(alerts.filter(a => a.state === 'missing')),
    reviewGroup(input.reviews, today),
    probationGroup(input.probation),
    taskGroup(input.overdueTasks, today),
    leaveGroup(input.pendingLeave),
  ].filter((group): group is AttentionGroup => group !== null)
}

import { unstable_rethrow } from 'next/navigation'
import { can, canOnEmployee, isHr, type PeopleViewer } from './access'
import { listChecklistProgress, listOpenChecklistItems, type OpenChecklistItem } from './checklist-data'
import { isOverdue } from './checklist-status'
import { alertsFromItems, getComplianceItems, summariseCompliance, type DocumentAlert } from './compliance-data'
import { buildAttentionGroups, type AttentionGroup } from './dashboard-attention'
import {
  breakdown, completenessSummary, headcount, monthMilestones, monthlyFlow, movement, probationEnding, statusSplit,
  typeSplit, whosOff, type BreakdownRow, type CompletenessSummary, type Flow, type Headcount, type Milestones,
  type Movement, type OffDay, type SplitSegment,
} from './dashboard-metrics'
import { createAdminClient, fetchAllPages } from './db'
import { addDays, todayIso } from './format'
import { employeesInScope, listApprovedLeaveBetween, listPendingLeaveFor, listPublicHolidays } from './leave-data'
import { listUpcomingReviews, type ReviewWithEmployee } from './review-data'
import type { Employee, EmployeePrivate } from './types'

// Everything the dashboard shows, gathered in one parallel pass. Each source is
// loaded through the scoped helper that owns it, so a manager only ever receives
// their own people. A source that fails (or that the viewer may not use) becomes
// a marked section instead of an empty list, so the page never claims "all clear"
// about data it could not read.

export type Section<T> = { status: 'ok'; data: T } | { status: 'error' } | { status: 'hidden' }

type DocumentsOverview = {
  expired: number
  expiring: number
  /** Required documents with nothing acceptable on file. */
  missing: number
  /** Required document slots across everyone in view; zero until mandatory document types exist. */
  required: number
  /** Share of required slots that are in date, 0-100. */
  inDatePercent: number
}

type OnboardingOverview = {
  openOnboarding: number
  overdueOnboarding: number
  /** People with an onboarding checklist still in progress. */
  peopleOnboarding: number
}

/** `failed` marks a source that could not be read: the list is incomplete, which the card must never present as "all clear". */
export type AttentionNotice = { text: string; href?: string; action?: string; failed?: boolean }

export type DashboardData = {
  today: string
  totalPeople: number
  headcount: Headcount
  movement: Movement
  byArea: BreakdownRow[]
  byTitle: BreakdownRow[]
  statuses: SplitSegment[]
  types: SplitSegment[]
  flow: Flow
  milestones: Milestones
  documents: Section<DocumentsOverview>
  pendingLeave: Section<number>
  onboarding: Section<OnboardingOverview>
  whosOff: Section<OffDay[]>
  attention: { groups: AttentionGroup[]; notices: AttentionNotice[] }
  completeness: Section<CompletenessSummary>
}

const WHOS_OFF_DAYS = 8
const PROBATION_WINDOW_DAYS = 30
const AREA_LIMIT = 10
const TITLE_LIMIT = 8
const LOWEST_COMPLETENESS = 5
const COMMON_GAPS = 4

async function load<T>(allowed: boolean, what: string, run: () => Promise<T>): Promise<Section<T>> {
  if (!allowed) return { status: 'hidden' }
  try {
    return { status: 'ok', data: await run() }
  } catch (error) {
    unstable_rethrow(error)
    console.error(`Dashboard: could not load ${what}`, error)
    return { status: 'error' }
  }
}

async function loadDocuments(viewer: PeopleViewer, employees: Employee[]): Promise<{ overview: DocumentsOverview; alerts: DocumentAlert[] }> {
  const eligible = employees.filter(e => e.employment_status !== 'leaver' && canOnEmployee(viewer, 'documents.view', e))
  const items = await getComplianceItems(eligible)
  const alerts = alertsFromItems(eligible, items, 30)
  const summary = summariseCompliance([...items.values()].flat())
  return {
    alerts,
    overview: {
      expired: alerts.filter(a => a.state === 'expired').length,
      expiring: alerts.filter(a => a.state === 'expiring').length,
      missing: alerts.filter(a => a.state === 'missing').length,
      required: summary.required,
      inDatePercent: summary.score,
    },
  }
}

async function loadChecklists(viewer: PeopleViewer, today: string): Promise<{ overview: OnboardingOverview; overdueTasks: OpenChecklistItem[] }> {
  const [items, progress] = await Promise.all([listOpenChecklistItems(viewer), listChecklistProgress(viewer)])
  const open = items.filter(i => canOnEmployee(viewer, 'checklists.view', i.employee))
  const overdueTasks = open.filter(i => isOverdue(i, today))
  const onboarding = open.filter(i => i.checklist.kind === 'onboarding')
  const onboardingPeople = new Set(
    progress.filter(p => p.checklist.kind === 'onboarding' && canOnEmployee(viewer, 'checklists.view', p.employee)).map(p => p.employee.id)
  )
  return {
    overdueTasks,
    overview: {
      openOnboarding: onboarding.length,
      overdueOnboarding: onboarding.filter(i => isOverdue(i, today)).length,
      peopleOnboarding: onboardingPeople.size,
    },
  }
}

// Personal details feed the completeness score only. They stay on the server:
// the page receives percentages and field names, never values.
async function loadPersonalDetails(): Promise<Map<string, EmployeePrivate> | null> {
  const admin = createAdminClient()
  const { data, error } = await fetchAllPages<EmployeePrivate>((from, to) =>
    admin.from('hr_employee_private').select('*').order('employee_id').range(from, to).returns<EmployeePrivate[]>()
  )
  if (error) {
    console.error('Dashboard: could not load personal details for completeness', error.message)
    return null
  }
  return new Map(data.map(row => [row.employee_id, row]))
}

export async function loadDashboard(viewer: PeopleViewer): Promise<DashboardData> {
  const today = todayIso()
  // Shared with the leave loaders, which ask for the same people.
  const employeesPromise = employeesInScope(viewer)

  const [employees, documents, pendingLeave, whosOffSection, reviews, checklists, completeness] = await Promise.all([
    employeesPromise,
    load(can(viewer, 'documents.view'), 'documents', async () => loadDocuments(viewer, await employeesPromise)),
    load(can(viewer, 'leave.approve'), 'pending leave', () => listPendingLeaveFor(viewer)),
    load(can(viewer, 'leave.view'), "who's off", async () => {
      const last = addDays(today, WHOS_OFF_DAYS - 1)
      const [requests, holidays] = await Promise.all([listApprovedLeaveBetween(viewer, today, last), listPublicHolidays(today, last)])
      return whosOff(requests, holidays, today, WHOS_OFF_DAYS)
    }),
    load(can(viewer, 'reviews.view'), 'reviews', async (): Promise<ReviewWithEmployee[]> =>
      (await listUpcomingReviews(viewer, 30)).filter(r => canOnEmployee(viewer, 'reviews.view', r.employee))
    ),
    load(can(viewer, 'checklists.view'), 'checklists', () => loadChecklists(viewer, today)),
    // HR only: personal details are never fetched for anyone else.
    load(isHr(viewer) && can(viewer, 'private.view'), 'data completeness', async () => {
      const [people, personal] = await Promise.all([employeesPromise, loadPersonalDetails()])
      return completenessSummary(people.filter(e => e.employment_status !== 'leaver'), personal, LOWEST_COMPLETENESS, COMMON_GAPS)
    }),
  ])

  const current = employees.filter(e => e.employment_status !== 'leaver')
  const groups = buildAttentionGroups({
    today,
    alerts: documents.status === 'ok' ? documents.data.alerts : [],
    reviews: reviews.status === 'ok' ? reviews.data : [],
    probation: probationEnding(current, today, PROBATION_WINDOW_DAYS),
    overdueTasks: checklists.status === 'ok' ? checklists.data.overdueTasks : [],
    pendingLeave: pendingLeave.status === 'ok' ? pendingLeave.data : [],
  })

  const notices: AttentionNotice[] = []
  const failed = [
    documents.status === 'error' && 'document checks',
    reviews.status === 'error' && 'reviews',
    checklists.status === 'error' && 'onboarding tasks',
    pendingLeave.status === 'error' && 'leave requests',
  ].filter((name): name is string => name !== false)
  if (failed.length > 0) {
    notices.push({ text: `We couldn't load ${failed.join(', ')} just now, so this list may be incomplete. Try refreshing the page.`, failed: true })
  }
  if (documents.status === 'ok' && documents.data.overview.required === 0 && current.length > 0) {
    notices.push(can(viewer, 'settings.manage')
      ? { text: "Document checks can't flag anything yet because no mandatory document types are set up.", href: '/settings/document-types', action: 'Set up document types' }
      : { text: "Document checks can't flag anything yet because no mandatory document types are set up. Ask HR to add them." })
  }

  return {
    today,
    totalPeople: employees.length,
    headcount: headcount(employees),
    movement: movement(employees, today),
    byArea: breakdown(current, e => e.area, {
      limit: AREA_LIMIT, unrecordedLabel: 'No area recorded', otherLabel: n => `Other areas (${n})`,
    }),
    byTitle: breakdown(current, e => e.job_title, {
      limit: TITLE_LIMIT, unrecordedLabel: 'No job title recorded', otherLabel: n => `Other job titles (${n})`,
    }),
    statuses: statusSplit(current),
    types: typeSplit(current),
    flow: monthlyFlow(employees, today),
    milestones: monthMilestones(current, today),
    documents: documents.status === 'ok' ? { status: 'ok', data: documents.data.overview } : documents,
    pendingLeave: pendingLeave.status === 'ok' ? { status: 'ok', data: pendingLeave.data.length } : pendingLeave,
    onboarding: checklists.status === 'ok' ? { status: 'ok', data: checklists.data.overview } : checklists,
    whosOff: whosOffSection,
    attention: { groups, notices },
    completeness,
  }
}

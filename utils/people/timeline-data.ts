import { canOnEmployee, isHr, isSelf, type PeopleViewer } from './access'
import { REVIEW_TYPES, labelOf } from './constants'
import { createAdminClient, fetchAllPages } from './db'
import { emailNameMap } from './employees-data'
import { formatDate, formatDays, todayIso } from './format'
import type { Employee, EmployeeEvent, EventType, EventVisibility, LeaveRequest, LeaveType, Review } from './types'

// Builds the merged employee timeline: stored notes (hr_events) plus read-only
// entries derived from the employee record, leave and reviews. Everything the
// viewer may not see is filtered out HERE, in the queries, so it is never loaded.

/** 'hr' sees everything; 'manager' sees only manager-visible notes and non-sensitive automatic entries. */
type TimelineLevel = 'hr' | 'manager'

export type TimelineCategory = EventType | 'leave' | 'review'

export type TimelineEntry = {
  key: string
  category: TimelineCategory
  date: string
  title: string
  details: string | null
  /** null for automatic entries derived from other records. */
  visibility: EventVisibility | null
  /** Display name (or email) of the person who wrote a stored note. */
  author: string | null
  /** Set only for stored notes, so HR can delete them. */
  eventId: string | null
}

type Timeline = {
  level: TimelineLevel
  entries: TimelineEntry[]
  /** True when a query failed, so an empty list must not be read as "nothing recorded". */
  incomplete: boolean
}

function timelineLevel(viewer: PeopleViewer, employee: Employee): TimelineLevel | null {
  // An employee never sees case notes about themselves; HR on their own record still can.
  if (isSelf(viewer, employee) && !isHr(viewer)) return null
  if (canOnEmployee(viewer, 'events.view_hr', employee)) return 'hr'
  if (canOnEmployee(viewer, 'events.view_manager', employee)) return 'manager'
  return null
}

/** Null when the viewer may not see this employee's timeline at all. */
export async function loadTimeline(viewer: PeopleViewer, employee: Employee): Promise<Timeline | null> {
  const level = timelineLevel(viewer, employee)
  if (!level) return null

  const admin = createAdminClient()
  const withLeave = canOnEmployee(viewer, 'leave.view', employee)
  const withReviews = canOnEmployee(viewer, 'reviews.view', employee)

  const [eventsResult, leaveTypesResult, reviewsResult] = await Promise.all([
    fetchAllPages<EmployeeEvent>((from, to) => {
      const query = admin.from('hr_events').select('*').eq('employee_id', employee.id)
      return (level === 'hr' ? query : query.eq('visibility', 'manager'))
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
        .returns<EmployeeEvent[]>()
    }),
    withLeave
      ? admin.from('hr_leave_types').select('*').returns<LeaveType[]>()
      : Promise.resolve({ data: [] as LeaveType[], error: null }),
    withReviews
      ? fetchAllPages<Review>((from, to) =>
          admin
            .from('hr_reviews')
            .select('*')
            .eq('employee_id', employee.id)
            .not('completed_on', 'is', null)
            .order('completed_on', { ascending: false })
            .order('id')
            .range(from, to)
            .returns<Review[]>()
        )
      : Promise.resolve({ data: [] as Review[], error: null }),
  ])

  // Managers never see sick or statutory leave: it can reveal health or family circumstances.
  const leaveTypes = new Map<number, LeaveType>()
  for (const type of leaveTypesResult.data ?? []) {
    if (level === 'hr' || type.category === 'annual' || type.category === 'other') leaveTypes.set(type.id, type)
  }
  const leaveResult = leaveTypes.size === 0
    ? { data: [] as LeaveRequest[], error: null }
    : await fetchAllPages<LeaveRequest>((from, to) =>
        admin
          .from('hr_leave_requests')
          .select('*')
          .eq('employee_id', employee.id)
          .eq('status', 'approved')
          .in('leave_type_id', [...leaveTypes.keys()])
          .order('start_date', { ascending: false })
          .order('id')
          .range(from, to)
          .returns<LeaveRequest[]>()
      )

  const failure = eventsResult.error ?? leaveTypesResult.error ?? reviewsResult.error ?? leaveResult.error
  if (failure) console.error('loadTimeline failed', failure.message)

  const events = eventsResult.data
  const reviews = reviewsResult.data
  const names = await emailNameMap([...events.map(e => e.created_by), ...reviews.map(r => r.reviewer_email)])
  const nameOf = (email: string | null) => (email ? names.get(email.toLowerCase()) ?? email : null)

  const entries: TimelineEntry[] = events.map(e => ({
    key: `event-${e.id}`,
    category: e.event_type,
    date: e.occurred_on,
    title: e.title,
    details: e.details,
    visibility: e.visibility,
    author: nameOf(e.created_by),
    eventId: e.id,
  }))

  const automatic = (key: string, category: TimelineCategory, date: string, title: string, details: string | null): TimelineEntry => ({
    key, category, date, title, details, visibility: null, author: null, eventId: null,
  })
  const hasEvent = (type: EventType, date: string) => events.some(e => e.event_type === type && e.occurred_on === date)
  const today = todayIso()

  if (employee.start_date && !hasEvent('joined', employee.start_date)) {
    entries.push(automatic('start', 'joined', employee.start_date, 'Joined Platinum', employee.job_title ? `Started as ${employee.job_title}` : null))
  }
  if (employee.probation_end_date) {
    const title = employee.probation_end_date > today ? 'Probation period ends' : 'Probation period ended'
    entries.push(automatic('probation-end', 'probation', employee.probation_end_date, title, null))
  }
  if (employee.end_date && !hasEvent('leaver', employee.end_date)) {
    const title = employee.end_date > today ? 'Leaving Platinum' : 'Left Platinum'
    entries.push(automatic('end', 'leaver', employee.end_date, title, null))
  }

  for (const request of leaveResult.data) {
    const type = leaveTypes.get(request.leave_type_id)
    if (!type) continue
    const range = request.start_date === request.end_date
      ? formatDate(request.start_date)
      : `${formatDate(request.start_date)} to ${formatDate(request.end_date)}`
    entries.push(automatic(`leave-${request.id}`, 'leave', request.start_date, type.name, `${formatDays(request.days)} · ${range}`))
  }

  for (const review of reviews) {
    if (!review.completed_on) continue
    const details = [
      review.outcome ? `Outcome: ${review.outcome}` : null,
      review.reviewer_email ? `Reviewer: ${nameOf(review.reviewer_email)}` : null,
    ].filter(Boolean).join(' · ')
    entries.push(automatic(
      `review-${review.id}`, 'review', review.completed_on, `${labelOf(REVIEW_TYPES, review.review_type)} completed`, details || null,
    ))
  }

  // Stable sort: notes keep their created_at order within a day, automatic entries follow them.
  entries.sort((a, b) => b.date.localeCompare(a.date))
  return { level, entries, incomplete: failure !== null }
}

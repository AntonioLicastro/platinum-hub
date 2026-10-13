import { REVIEW_TYPES, labelOf } from './constants'
import { daysBetween, displayName } from './format'
import { emptyResult } from './report-core'
import { plural } from './report-format'
import type { Cell, ReportResult } from './report-types'
import type { ReviewWithEmployee } from './review-data'

// Overdue and upcoming reviews by type. The loader supplies the reviews
// (incomplete, with a due date, leavers excluded, already limited to the
// viewer's scope); this only groups and counts them.

/** How far ahead the report looks. */
export const REVIEW_HORIZON_DAYS = 90

/** Reviews due within this many days are "coming up"; later ones are "further out". */
const SOON_DAYS = 30

type Counts = { overdue: number; soon: number; later: number }

const when = (days: number): string =>
  days < 0 ? `Overdue by ${plural(-days, 'day', 'days')}` : days === 0 ? 'Due today' : `Due in ${plural(days, 'day', 'days')}`

export function buildReviews(reviews: readonly ReviewWithEmployee[], today: string): ReportResult {
  const dated = reviews.flatMap(review => (review.due_on ? [{ review, dueOn: review.due_on, days: daysBetween(review.due_on, today) }] : []))
  if (dated.length === 0) {
    return emptyResult(
      'reviews', 'No reviews overdue or coming up',
      `Nothing is overdue or due in the next ${REVIEW_HORIZON_DAYS} days. Schedule probation reviews, appraisals and supervisions on an employee’s profile and they appear here.`,
    )
  }

  const counts = new Map<string, Counts>()
  const people = new Set<string>()
  let overdue = 0
  let soon = 0
  let oldest = dated[0]
  for (const entry of dated) {
    const row = counts.get(entry.review.review_type) ?? { overdue: 0, soon: 0, later: 0 }
    if (entry.days < 0) {
      row.overdue += 1
      overdue += 1
      if (entry.days < oldest.days) oldest = entry
    } else if (entry.days <= SOON_DAYS) {
      row.soon += 1
      soon += 1
    } else {
      row.later += 1
    }
    counts.set(entry.review.review_type, row)
    people.add(entry.review.employee_id)
  }

  const typeRows = REVIEW_TYPES.flatMap(t => {
    const c = counts.get(t.value)
    return c ? [{ label: t.label, ...c, total: c.overdue + c.soon + c.later }] : []
  })
  const sorted = [...dated].sort((a, b) =>
    a.dueOn.localeCompare(b.dueOn) || displayName(a.review.employee).localeCompare(displayName(b.review.employee)))

  return {
    id: 'reviews',
    empty: null,
    notices: [],
    stats: [
      { label: 'Overdue', value: String(overdue), tone: overdue > 0 ? 'red' : 'green', icon: 'alert', hint: overdue > 0 ? 'Past their due date' : 'Nothing is past due' },
      { label: `Due in ${SOON_DAYS} days`, value: String(soon), tone: soon > 0 ? 'amber' : 'green', icon: 'clock', hint: 'Due today or in the next month' },
      {
        label: 'Oldest overdue',
        value: overdue > 0 ? plural(-oldest.days, 'day', 'days') : 'None',
        tone: overdue > 0 ? 'red' : 'green',
        icon: 'alert',
        hint: overdue > 0 ? labelOf(REVIEW_TYPES, oldest.review.review_type) : `${plural(people.size, 'person', 'people')} with reviews coming up`,
      },
    ],
    charts: [
      {
        kind: 'stacked',
        title: 'Reviews by type',
        description: `Outstanding reviews that are overdue or due in the next ${REVIEW_HORIZON_DAYS} days.`,
        segments: [
          { name: 'Overdue', tone: 'red' }, { name: `Due in ${SOON_DAYS} days`, tone: 'amber' },
          { name: `Due in ${SOON_DAYS + 1} to ${REVIEW_HORIZON_DAYS} days`, tone: 'sky' },
        ],
        rows: typeRows.map(r => ({ label: r.label, values: [r.overdue, r.soon, r.later] })),
      },
    ],
    tables: [
      {
        id: 'by-type',
        title: 'Reviews by type',
        columns: [
          { label: 'Review type' }, { label: 'Overdue', kind: 'integer' }, { label: `Due in ${SOON_DAYS} days`, kind: 'integer' },
          { label: `Due in ${SOON_DAYS + 1} to ${REVIEW_HORIZON_DAYS} days`, kind: 'integer' }, { label: 'Total', kind: 'integer' },
        ],
        rows: [
          ...typeRows.map((r): Cell[] => [r.label, r.overdue, r.soon, r.later, r.total]),
          ['All reviews', overdue, soon, dated.length - overdue - soon, dated.length],
        ],
        emptyText: 'No reviews outstanding.',
        hasTotalRow: true,
      },
      {
        id: 'to-do',
        title: 'Reviews to action',
        description: 'Most overdue first.',
        columns: [
          { label: 'Employee' }, { label: 'Area' }, { label: 'Review' }, { label: 'Due', kind: 'date' }, { label: 'When' }, { label: 'Reviewer' },
        ],
        rows: sorted.map(({ review, dueOn, days }) => [
          displayName(review.employee), review.employee.area, labelOf(REVIEW_TYPES, review.review_type), dueOn, when(days), review.reviewer_email,
        ]),
        rowHrefs: sorted.map(({ review }) => `/employees/${review.employee_id}`),
        emptyText: 'No reviews outstanding.',
        displayLimit: 25,
      },
    ],
    method: [
      `Counts reviews that are not yet marked complete and are overdue or due within ${REVIEW_HORIZON_DAYS} days. Leavers are not included.`,
      'Reviews without a due date are not shown, because they cannot be called late or upcoming.',
    ],
  }
}

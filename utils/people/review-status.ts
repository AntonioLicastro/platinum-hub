import type { Tone } from './constants'
import { daysBetween, todayIso } from './format'
import type { Review } from './types'

// Pure helpers shared by the reviews tab and its server actions (no server-only imports).

/** Stored as free text in hr_reviews.outcome; the form only offers these. */
export const REVIEW_OUTCOMES = ['Satisfactory', 'Needs improvement', 'Extended', 'Passed', 'Not passed', 'N/A'] as const

/** A review due within this many days is flagged as "due soon". */
const REVIEW_DUE_SOON_DAYS = 14

type ReviewStatus = 'overdue' | 'due_soon' | 'scheduled' | 'completed'

export const REVIEW_STATUSES: Record<ReviewStatus, { label: string; tone: Tone }> = {
  overdue: { label: 'Overdue', tone: 'red' },
  due_soon: { label: 'Due soon', tone: 'amber' },
  scheduled: { label: 'Scheduled', tone: 'sky' },
  completed: { label: 'Completed', tone: 'green' },
}

export function reviewStatus(review: Pick<Review, 'due_on' | 'completed_on'>, today: string = todayIso()): ReviewStatus {
  if (review.completed_on) return 'completed'
  if (!review.due_on) return 'scheduled'
  const days = daysBetween(review.due_on, today)
  if (days < 0) return 'overdue'
  return days <= REVIEW_DUE_SOON_DAYS ? 'due_soon' : 'scheduled'
}

export function outcomeTone(outcome: string | null): Tone {
  switch (outcome) {
    case 'Satisfactory':
    case 'Passed':
      return 'green'
    case 'Needs improvement':
    case 'Extended':
      return 'amber'
    case 'Not passed':
      return 'red'
    default:
      return 'gray'
  }
}

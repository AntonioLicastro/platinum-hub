'use server'

import { revalidatePath } from 'next/cache'
import { authorizeEmployee, canOnEmployee, inScope, type PeopleViewer } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { REVIEW_TYPES, labelOf } from '@/utils/people/constants'
import { createAdminClient, withRetry } from '@/utils/people/db'
import { addDays, formatDate, todayIso } from '@/utils/people/format'
import { REVIEW_OUTCOMES } from '@/utils/people/review-status'
import { EARLIEST_DATE, TEXT_MAX, isUuid } from '@/utils/people/timeline-input'
import type { ActionState, Employee, Review, ReviewType } from '@/utils/people/types'
import { isIsoDate, oneOf, optEmail, optStr, str } from '@/utils/people/validate'

const REVIEW_TYPE_VALUES = REVIEW_TYPES.map(t => t.value)
/** Furthest ahead a review may be scheduled. */
const MAX_AHEAD_DAYS = 5 * 366

const TRY_AGAIN = 'Something went wrong. Please try again.'
const DENIED_REVIEW = 'That review no longer exists'

function refresh(employeeId: string) {
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/')
  revalidatePath('/reports')
}

function checkDueDate(value: string): string | null {
  if (!isIsoDate(value)) return 'Enter the date the review is due'
  if (value < EARLIEST_DATE) return 'That date is too far in the past'
  if (value > addDays(todayIso(), MAX_AHEAD_DAYS)) return 'That date is too far ahead'
  return null
}

/** A reviewer must be a current employee the viewer can see, and not the person being reviewed. */
async function resolveReviewer(
  viewer: PeopleViewer, employee: Pick<Employee, 'email'>, email: string | null,
): Promise<{ email: string | null } | { error: string }> {
  if (!email) return { email: null }
  if (email === employee.email) return { error: 'Choose someone other than the person being reviewed' }
  const admin = createAdminClient()
  const { data, error } = await withRetry(() => admin
    .from('hr_employees')
    .select('id, email, area, manager_email, employment_status')
    .eq('email', email)
    .maybeSingle<Pick<Employee, 'id' | 'email' | 'area' | 'manager_email' | 'employment_status'>>())
  if (error) return { error: TRY_AGAIN }
  if (!data || data.employment_status === 'leaver' || !inScope(viewer, data)) return { error: 'Choose a reviewer from the list' }
  return { email: data.email }
}

type NewReview = { employeeId: string; reviewType: ReviewType; dueOn: string; reviewerEmail: string | null }

/** Inserts a scheduled review unless the same type is already scheduled for that date. */
async function createScheduledReview(viewer: PeopleViewer, input: NewReview): Promise<'created' | 'duplicate' | 'failed'> {
  const admin = createAdminClient()
  const { data: existing, error: lookupError } = await admin
    .from('hr_reviews')
    .select('id')
    .eq('employee_id', input.employeeId)
    .eq('review_type', input.reviewType)
    .eq('due_on', input.dueOn)
    .is('completed_on', null)
    .limit(1)
  if (lookupError) {
    console.error('createScheduledReview lookup failed', lookupError.message)
    return 'failed'
  }
  if (existing.length > 0) return 'duplicate'

  const { data, error } = await admin
    .from('hr_reviews')
    .insert({
      employee_id: input.employeeId,
      review_type: input.reviewType,
      due_on: input.dueOn,
      reviewer_email: input.reviewerEmail,
      created_by: viewer.email,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    console.error('createScheduledReview failed', error?.message)
    return 'failed'
  }

  await logAudit(viewer, {
    action: 'review.schedule',
    entity: 'hr_reviews',
    entityId: data.id,
    employeeId: input.employeeId,
    detail: { review_type: input.reviewType },
  })
  return 'created'
}

export async function scheduleReview(employeeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeEmployee('reviews.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const reviewType = oneOf(str(formData, 'review_type'), REVIEW_TYPE_VALUES)
  if (!reviewType) return { error: 'Choose a review type' }
  const dueOn = str(formData, 'due_on')
  const dueError = checkDueDate(dueOn)
  if (dueError) return { error: dueError }
  const reviewer = await resolveReviewer(viewer, employee, optEmail(formData, 'reviewer_email'))
  if ('error' in reviewer) return { error: reviewer.error }

  const result = await createScheduledReview(viewer, { employeeId: employee.id, reviewType, dueOn, reviewerEmail: reviewer.email })
  if (result === 'duplicate') return { error: `A ${labelOf(REVIEW_TYPES, reviewType).toLowerCase()} is already scheduled for that date` }
  if (result === 'failed') return { error: 'Could not schedule the review. Please try again.' }
  refresh(employee.id)
  return { error: null, ok: true, message: `Scheduled for ${formatDate(dueOn)}` }
}

/** One-click suggestion: a probation review on the recorded probation end date, with the line manager as reviewer. */
export async function scheduleProbationReview(employeeId: string): Promise<ActionState> {
  const auth = await authorizeEmployee('reviews.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  if (!employee.probation_end_date) return { error: 'No probation end date is recorded for this employee' }
  if (employee.employment_status === 'leaver') return { error: 'This employee has left' }

  const { data: existing, error: lookupError } = await createAdminClient()
    .from('hr_reviews')
    .select('id')
    .eq('employee_id', employee.id)
    .eq('review_type', 'probation')
    .limit(1)
  if (lookupError) {
    console.error('scheduleProbationReview lookup failed', lookupError.message)
    return { error: 'Could not schedule the review. Please try again.' }
  }
  if (existing.length > 0) return { error: 'A probation review already exists' }

  const result = await createScheduledReview(viewer, {
    employeeId: employee.id,
    reviewType: 'probation',
    dueOn: employee.probation_end_date,
    reviewerEmail: employee.manager_email,
  })
  if (result === 'failed') return { error: 'Could not schedule the review. Please try again.' }
  refresh(employee.id)
  return { error: null, ok: true, message: `Probation review scheduled for ${formatDate(employee.probation_end_date)}` }
}

/** Marks a scheduled review done and, when asked, schedules the next one of the same type. */
export async function completeReview(employeeId: string, reviewId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(reviewId)) return { error: DENIED_REVIEW }
  const auth = await authorizeEmployee('reviews.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const today = todayIso()
  const completedOn = str(formData, 'completed_on')
  if (!isIsoDate(completedOn)) return { error: 'Enter the date the review took place' }
  if (completedOn < EARLIEST_DATE) return { error: 'That date is too far in the past' }
  if (completedOn > today) return { error: 'The review date cannot be in the future' }

  const outcomeText = str(formData, 'outcome')
  const outcome = outcomeText ? oneOf(outcomeText, REVIEW_OUTCOMES) : null
  if (outcomeText && !outcome) return { error: 'Choose an outcome from the list' }

  const summary = optStr(formData, 'summary')
  if (summary && summary.length > TEXT_MAX) return { error: `The summary must be ${TEXT_MAX} characters or fewer` }

  const nextDueOn = str(formData, 'next_due_on')
  if (nextDueOn) {
    const nextError = checkDueDate(nextDueOn)
    if (nextError) return { error: nextError }
    if (nextDueOn <= completedOn) return { error: 'The next review must be due after this one took place' }
  }

  const admin = createAdminClient()
  const { data: review, error: reviewError } = await withRetry(() => admin
    .from('hr_reviews')
    .select('*')
    .eq('id', reviewId)
    .eq('employee_id', employee.id)
    .maybeSingle<Review>())
  if (reviewError) return { error: TRY_AGAIN }
  if (!review) return { error: DENIED_REVIEW }
  if (review.completed_on) return { error: 'This review has already been completed' }

  // The completed_on guard stops a double submit from completing it twice.
  const { data: updated, error } = await admin
    .from('hr_reviews')
    .update({ completed_on: completedOn, outcome, summary, next_due_on: nextDueOn || null })
    .eq('id', review.id)
    .is('completed_on', null)
    .select('id')
  if (error) {
    console.error('completeReview failed', error.message)
    return { error: 'Could not complete the review. Please try again.' }
  }
  if (updated.length === 0) return { error: 'This review has already been completed' }

  let next: 'created' | 'duplicate' | 'failed' | null = null
  if (nextDueOn) {
    next = await createScheduledReview(viewer, {
      employeeId: employee.id,
      reviewType: review.review_type,
      dueOn: nextDueOn,
      reviewerEmail: review.reviewer_email,
    })
  }

  await logAudit(viewer, {
    action: 'review.complete',
    entity: 'hr_reviews',
    entityId: review.id,
    employeeId: employee.id,
    detail: { review_type: review.review_type, has_outcome: outcome !== null, has_summary: summary !== null, next_scheduled: next === 'created' },
  })
  refresh(employee.id)

  if (next === 'failed') {
    return { error: null, ok: true, message: 'Review completed, but the next one could not be scheduled. Please schedule it manually.' }
  }
  return {
    error: null,
    ok: true,
    message: nextDueOn ? `Review completed. Next one due ${formatDate(nextDueOn)}.` : 'Review completed',
  }
}

/** Changes the due date and reviewer of a review that has not happened yet. */
export async function rescheduleReview(employeeId: string, reviewId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(reviewId)) return { error: DENIED_REVIEW }
  const auth = await authorizeEmployee('reviews.manage', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth

  const dueOn = str(formData, 'due_on')
  const dueError = checkDueDate(dueOn)
  if (dueError) return { error: dueError }

  const admin = createAdminClient()
  const { data: review, error: reviewError } = await withRetry(() => admin
    .from('hr_reviews')
    .select('id, review_type, completed_on, reviewer_email')
    .eq('id', reviewId)
    .eq('employee_id', employee.id)
    .maybeSingle<Pick<Review, 'id' | 'review_type' | 'completed_on' | 'reviewer_email'>>())
  if (reviewError) return { error: TRY_AGAIN }
  if (!review) return { error: DENIED_REVIEW }
  if (review.completed_on) return { error: 'A completed review cannot be rescheduled' }

  // Keeping the existing reviewer is always allowed, even if they have since left or are outside the viewer's scope.
  const requested = optEmail(formData, 'reviewer_email')
  const reviewer = requested !== null && requested === review.reviewer_email
    ? { email: requested }
    : await resolveReviewer(viewer, employee, requested)
  if ('error' in reviewer) return { error: reviewer.error }

  const { data: clash, error: clashError } = await admin
    .from('hr_reviews')
    .select('id')
    .eq('employee_id', employee.id)
    .eq('review_type', review.review_type)
    .eq('due_on', dueOn)
    .is('completed_on', null)
    .neq('id', review.id)
    .limit(1)
  if (clashError) {
    console.error('rescheduleReview lookup failed', clashError.message)
    return { error: 'Could not update the review. Please try again.' }
  }
  if (clash.length > 0) return { error: 'Another review of this type is already scheduled for that date' }

  const { data: updated, error } = await admin
    .from('hr_reviews')
    .update({ due_on: dueOn, reviewer_email: reviewer.email })
    .eq('id', review.id)
    .is('completed_on', null)
    .select('id')
  if (error) {
    console.error('rescheduleReview failed', error.message)
    return { error: 'Could not update the review. Please try again.' }
  }
  if (updated.length === 0) return { error: 'A completed review cannot be rescheduled' }

  await logAudit(viewer, {
    action: 'review.update',
    entity: 'hr_reviews',
    entityId: review.id,
    employeeId: employee.id,
    detail: { review_type: review.review_type, fields: ['due_on', 'reviewer_email'] },
  })
  refresh(employee.id)
  return { error: null, ok: true, message: `Moved to ${formatDate(dueOn)}` }
}

/** HR only. Removes a review (scheduled or completed) entered in error. */
export async function deleteReview(employeeId: string, reviewId: string): Promise<ActionState> {
  if (!isUuid(reviewId)) return { error: DENIED_REVIEW }
  const auth = await authorizeEmployee('employees.edit', employeeId)
  if (!auth.ok) return { error: auth.error }
  const { viewer, employee } = auth
  // reviews.manage is refused on one's own record (a second person has to do it), and so is deleting.
  if (!canOnEmployee(viewer, 'reviews.manage', employee)) return { error: 'Another HR colleague needs to delete reviews on your own record' }

  const { data, error } = await createAdminClient()
    .from('hr_reviews')
    .delete()
    .eq('id', reviewId)
    .eq('employee_id', employee.id)
    .select('review_type, completed_on')
    .returns<Pick<Review, 'review_type' | 'completed_on'>[]>()
  if (error) {
    console.error('deleteReview failed', error.message)
    return { error: 'Could not delete the review. Please try again.' }
  }
  if (data.length === 0) return { error: DENIED_REVIEW }

  await logAudit(viewer, {
    action: 'review.delete',
    entity: 'hr_reviews',
    entityId: reviewId,
    employeeId: employee.id,
    detail: { review_type: data[0].review_type, was_completed: data[0].completed_on !== null },
  })
  refresh(employee.id)
  return { error: null, ok: true, message: 'Review deleted' }
}

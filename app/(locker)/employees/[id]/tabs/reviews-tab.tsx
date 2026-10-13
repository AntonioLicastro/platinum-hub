import { CalendarPlus, ClipboardList, Lock, Plus, Sparkles, TriangleAlert } from 'lucide-react'
import { canOnEmployee, isSelf } from '@/utils/people/access'
import { REVIEW_TYPES } from '@/utils/people/constants'
import { fetchAllPages, createAdminClient } from '@/utils/people/db'
import { emailNameMap, isCurrent, listEmployees } from '@/utils/people/employees-data'
import { formatDate, fullName, todayIso } from '@/utils/people/format'
import { reviewStatus } from '@/utils/people/review-status'
import { EARLIEST_DATE } from '@/utils/people/timeline-input'
import type { Employee, Review } from '@/utils/people/types'
import { scheduleProbationReview, scheduleReview } from '../../reviews-actions'
import { ReviewCard, ReviewerSelect, type ReviewerOption } from '../../_timeline/review-card'
import { ActionButton, ActionForm } from '../../../_components/action-form'
import { Badge, Card, CardHeader, EmptyState, Field, FormGrid, inputClass } from '../../../_components/ui'
import type { TabProps } from './types'

/** Reviews with no due date sort after dated ones. */
function byDueDate(a: Review, b: Review): number {
  if (a.due_on === b.due_on) return a.created_at.localeCompare(b.created_at)
  if (!a.due_on) return 1
  if (!b.due_on) return -1
  return a.due_on.localeCompare(b.due_on)
}

export default async function ReviewsTab({ viewer, employee }: TabProps) {
  if (!canOnEmployee(viewer, 'reviews.view', employee)) {
    return (
      <Card>
        <EmptyState icon={Lock} title="Reviews are not available" body="You do not have access to this employee’s reviews." />
      </Card>
    )
  }
  const canManage = canOnEmployee(viewer, 'reviews.manage', employee)
  const canDelete = canManage && canOnEmployee(viewer, 'employees.edit', employee)
  const viewingSelf = isSelf(viewer, employee)
  const today = todayIso()
  const admin = createAdminClient()

  // listEmployees throws on a database error. The reviews themselves can still be shown without the reviewer
  // list, and every reviewer already on a review stays selectable (see ReviewCard), so degrade instead of blanking the page.
  const loadPeople = async (): Promise<{ people: Employee[]; failed: boolean }> => {
    if (!canManage) return { people: [], failed: false }
    try {
      return { people: await listEmployees(viewer), failed: false }
    } catch {
      return { people: [], failed: true }
    }
  }

  const [reviewsResult, { people, failed: peopleFailed }] = await Promise.all([
    fetchAllPages<Review>((from, to) =>
      admin
        .from('hr_reviews')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at')
        .order('id')
        .range(from, to)
        .returns<Review[]>()
    ),
    loadPeople(),
  ])
  if (reviewsResult.error) console.error('ReviewsTab failed', reviewsResult.error.message)
  const reviews = reviewsResult.data

  const names = await emailNameMap(reviews.map(r => r.reviewer_email))
  const reviewers: ReviewerOption[] = people
    .filter(p => isCurrent(p) && p.id !== employee.id)
    .map(p => ({ email: p.email, name: fullName(p) || p.email }))

  const open = reviews.filter(r => !r.completed_on)
  const dueNow = open.filter(r => {
    const status = reviewStatus(r, today)
    return status === 'overdue' || status === 'due_soon'
  }).sort(byDueDate)
  const scheduled = open.filter(r => reviewStatus(r, today) === 'scheduled').sort(byDueDate)
  const completed = reviews
    .filter(r => r.completed_on)
    .sort((a, b) => (b.completed_on ?? '').localeCompare(a.completed_on ?? '') || b.created_at.localeCompare(a.created_at))
  const overdueCount = dueNow.filter(r => reviewStatus(r, today) === 'overdue').length

  const suggestProbation = canManage
    && employee.probation_end_date !== null
    && employee.employment_status !== 'leaver'
    && !reviews.some(r => r.review_type === 'probation')

  const sections = [
    { key: 'due', title: 'Due & overdue', empty: 'Nothing is due in the next two weeks.', items: dueNow },
    { key: 'scheduled', title: 'Scheduled', empty: 'No other reviews are scheduled.', items: scheduled },
    { key: 'completed', title: 'Completed', empty: 'No reviews have been completed yet.', items: completed },
  ]

  const cardFor = (review: Review) => (
    <ReviewCard
      key={review.id}
      review={review}
      employeeId={employee.id}
      today={today}
      reviewerName={review.reviewer_email ? names.get(review.reviewer_email.toLowerCase()) ?? null : null}
      canManage={canManage}
      canDelete={canDelete}
      reviewers={reviewers}
    />
  )

  return (
    <div className="space-y-6">
      {suggestProbation && employee.probation_end_date && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Probation ends on {formatDate(employee.probation_end_date)}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                No probation review is scheduled yet. This adds one for that date
                {employee.manager_email ? ', with the line manager as reviewer.' : '.'}
              </p>
            </div>
          </div>
          <ActionButton
            action={scheduleProbationReview.bind(null, employee.id)}
            label={`Schedule probation review for ${formatDate(employee.probation_end_date)}`}
            pendingLabel="Scheduling…"
            variant="primary"
            size="md"
            icon={<CalendarPlus size={16} />}
          />
        </div>
      )}

      {canManage && (
        <Card>
          <details open={reviews.length === 0} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-base font-semibold text-slate-900">Schedule a review</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  Probation reviews, appraisals, supervisions, spot checks and more.
                </span>
              </span>
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">
                <Plus size={14} /> New review
              </span>
            </summary>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <ActionForm
                action={scheduleReview.bind(null, employee.id)}
                submitLabel="Schedule review"
                pendingLabel="Scheduling…"
                resetOnSuccess
              >
                <FormGrid>
                  <Field label="Review type" htmlFor="schedule-type" required>
                    <select id="schedule-type" name="review_type" className={inputClass}>
                      {REVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Due on" htmlFor="schedule-due" required>
                    <input id="schedule-due" name="due_on" type="date" required min={EARLIEST_DATE} className={inputClass} />
                  </Field>
                  <Field label="Reviewer" htmlFor="schedule-reviewer" wide hint="Optional. Who will carry out the review.">
                    <ReviewerSelect
                      id="schedule-reviewer"
                      options={reviewers}
                      value={reviewers.some(r => r.email === viewer.email) ? viewer.email : null}
                    />
                  </Field>
                </FormGrid>
              </ActionForm>
            </div>
          </details>
        </Card>
      )}

      <Card>
        <CardHeader
          icon={ClipboardList}
          title="Reviews"
          description={
            viewingSelf && !canManage
              ? 'Your reviews, supervisions and appraisals. Your manager or HR schedules and records them.'
              : 'Probation reviews, appraisals, supervisions and spot checks.'
          }
          actions={overdueCount > 0 ? <Badge tone="red" dot>{overdueCount} overdue</Badge> : undefined}
        />

        {peopleFailed && (
          <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            <TriangleAlert size={16} className="shrink-0" /> The list of reviewers could not be loaded, so new reviewers cannot be chosen. Refresh the page to try again.
          </p>
        )}

        {reviewsResult.error && (
          <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            <TriangleAlert size={16} className="shrink-0" /> Reviews could not be loaded. Refresh the page to try again.
          </p>
        )}

        {reviews.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No reviews recorded yet"
            body={
              canManage
                ? 'Use the form above to schedule the first one. Completed reviews also appear on the timeline automatically.'
                : 'Nothing has been scheduled for this employee yet.'
            }
          />
        ) : (
          <div className="space-y-8">
            {sections.map(section => (
              <section key={section.key} aria-labelledby={`reviews-${section.key}`}>
                <h3 id={`reviews-${section.key}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {section.title}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                    {section.items.length}
                  </span>
                </h3>
                {section.items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm italic text-slate-400">{section.empty}</p>
                ) : (
                  <ul className="space-y-3">{section.items.map(cardFor)}</ul>
                )}
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

import { CalendarClock, ChevronRight, CircleCheck, Trash2, TriangleAlert } from 'lucide-react'
import { ActionButton, ActionForm } from '../../_components/action-form'
import { Badge, Field, FormGrid, NotRecorded, inputClass } from '../../_components/ui'
import { REVIEW_TYPES, labelOf } from '@/utils/people/constants'
import { daysBetween, formatDate, relativeDays } from '@/utils/people/format'
import { REVIEW_OUTCOMES, REVIEW_STATUSES, outcomeTone, reviewStatus } from '@/utils/people/review-status'
import { EARLIEST_DATE, TEXT_MAX } from '@/utils/people/timeline-input'
import type { Review } from '@/utils/people/types'
import { completeReview, deleteReview, rescheduleReview } from '../reviews-actions'
import { DOT_CLASS } from './timeline-meta'

export type ReviewerOption = { email: string; name: string }

/** Select of current employees; `value` is the reviewer to preselect. */
export function ReviewerSelect({ id, options, value }: { id: string; options: ReviewerOption[]; value: string | null }) {
  return (
    <select id={id} name="reviewer_email" defaultValue={value ?? ''} className={inputClass}>
      <option value="">No reviewer yet</option>
      {options.map(o => <option key={o.email} value={o.email}>{o.name}</option>)}
    </select>
  )
}

type Props = {
  review: Review
  employeeId: string
  today: string
  reviewerName: string | null
  canManage: boolean
  canDelete: boolean
  reviewers: ReviewerOption[]
}

const STATUS_ICONS = {
  overdue: TriangleAlert,
  due_soon: CalendarClock,
  scheduled: CalendarClock,
  completed: CircleCheck,
}

function dueLine(dueOn: string | null, today: string): string | null {
  if (!dueOn) return null
  const days = daysBetween(dueOn, today)
  if (days < 0) return `Due ${formatDate(dueOn)} · ${-days} ${days === -1 ? 'day' : 'days'} overdue`
  return `Due ${formatDate(dueOn)} · ${relativeDays(dueOn)}`
}

export function ReviewCard({ review, employeeId, today, reviewerName, canManage, canDelete, reviewers }: Props) {
  const status = reviewStatus(review, today)
  const meta = REVIEW_STATUSES[status]
  const Icon = STATUS_ICONS[status]
  const completed = status === 'completed'
  const label = labelOf(REVIEW_TYPES, review.review_type)
  const subtitle = completed
    ? `Completed ${formatDate(review.completed_on)}${review.due_on ? ` · was due ${formatDate(review.due_on)}` : ''}`
    : dueLine(review.due_on, today)

  // Keep the current reviewer selectable even if they have since left, so rescheduling never silently clears them.
  const reviewerOptions = review.reviewer_email && !reviewers.some(r => r.email === review.reviewer_email)
    ? [{ email: review.reviewer_email, name: reviewerName ?? review.reviewer_email }, ...reviewers]
    : reviewers

  return (
    <li>
      <article className={`rounded-2xl border bg-white p-4 shadow-sm ${status === 'overdue' ? 'border-red-200' : 'border-slate-200/80'}`}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${DOT_CLASS[meta.tone]}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{subtitle ?? <NotRecorded label="No due date set" />}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {completed && review.outcome && <Badge tone={outcomeTone(review.outcome)}>{review.outcome}</Badge>}
                <Badge tone={meta.tone} dot>{meta.label}</Badge>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Reviewer: {reviewerName ?? review.reviewer_email ?? <NotRecorded label="not set" />}
            </p>

            {completed && (
              <div className="mt-3 space-y-2">
                {review.summary
                  ? <p className="whitespace-pre-line break-words text-sm text-slate-700">{review.summary}</p>
                  : <p><NotRecorded label="No summary recorded" /></p>}
                {!review.outcome && <p className="text-xs"><NotRecorded label="Outcome not recorded" /></p>}
                {review.next_due_on && (
                  <p className="text-xs text-slate-500">Next review due {formatDate(review.next_due_on)}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {(canManage && !completed) || canDelete ? (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {canManage && !completed && (
              <>
                <Panel title="Mark as complete">
                  <ActionForm
                    action={completeReview.bind(null, employeeId, review.id)}
                    submitLabel="Save as completed"
                    pendingLabel="Saving…"
                    submitVariant="success"
                  >
                    <FormGrid>
                      <Field label="Date held" htmlFor={`${review.id}-completed_on`} required>
                        <input
                          id={`${review.id}-completed_on`} name="completed_on" type="date" required
                          defaultValue={today} min={EARLIEST_DATE} max={today} className={inputClass}
                        />
                      </Field>
                      <Field label="Outcome" htmlFor={`${review.id}-outcome`}>
                        <select id={`${review.id}-outcome`} name="outcome" defaultValue="" className={inputClass}>
                          <option value="">Not recorded</option>
                          {REVIEW_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </Field>
                      <Field label="Summary" htmlFor={`${review.id}-summary`} wide hint="Optional. Key points discussed and anything agreed.">
                        <textarea id={`${review.id}-summary`} name="summary" rows={4} maxLength={TEXT_MAX} className={inputClass} />
                      </Field>
                      <Field
                        label="Next review due" htmlFor={`${review.id}-next_due_on`} wide
                        hint={`Optional. Fill this in to schedule the next ${label.toLowerCase()} automatically.`}
                      >
                        <input id={`${review.id}-next_due_on`} name="next_due_on" type="date" min={EARLIEST_DATE} className={inputClass} />
                      </Field>
                    </FormGrid>
                  </ActionForm>
                </Panel>
                <Panel title="Change date or reviewer">
                  <ActionForm
                    action={rescheduleReview.bind(null, employeeId, review.id)}
                    submitLabel="Save changes"
                    submitVariant="primary"
                  >
                    <FormGrid>
                      <Field label="Due on" htmlFor={`${review.id}-due_on`} required>
                        <input
                          id={`${review.id}-due_on`} name="due_on" type="date" required
                          defaultValue={review.due_on ?? ''} min={EARLIEST_DATE} className={inputClass}
                        />
                      </Field>
                      <Field label="Reviewer" htmlFor={`${review.id}-reviewer`}>
                        <ReviewerSelect id={`${review.id}-reviewer`} options={reviewerOptions} value={review.reviewer_email} />
                      </Field>
                    </FormGrid>
                  </ActionForm>
                </Panel>
              </>
            )}
            {canDelete && (
              <ActionButton
                action={deleteReview.bind(null, employeeId, review.id)}
                label="Delete review"
                pendingLabel="Deleting…"
                variant="ghost"
                icon={<Trash2 size={14} />}
                confirm={`Delete this ${label.toLowerCase()}? This cannot be undone.`}
              />
            )}
          </div>
        ) : null}
      </article>
    </li>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#323398] hover:bg-slate-100/70 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="transition-transform group-open:rotate-90" aria-hidden="true" />
        {title}
      </summary>
      <div className="border-t border-slate-200 bg-white p-4">{children}</div>
    </details>
  )
}

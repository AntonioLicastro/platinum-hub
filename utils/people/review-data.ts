import { createAdminClient, fetchAllPages } from './db'
import { inScope, type PeopleViewer } from './access'
import { addDays, todayIso } from './format'
import type { Employee, Review } from './types'

export type ReviewWithEmployee = Review & { employee: Employee }

type ReviewRow = Review & { hr_employees: Employee }

/**
 * Incomplete reviews due within `withinDays` (or already overdue), for the
 * viewer's scope, soonest first. Leavers are excluded. One joined query for
 * everybody; inScope() then narrows it to the viewer's rows, so a manager
 * never receives another area's reviews.
 */
export async function listUpcomingReviews(viewer: PeopleViewer, withinDays = 30): Promise<ReviewWithEmployee[]> {
  const cutoff = addDays(todayIso(), withinDays)
  const admin = createAdminClient()
  const { data, error } = await fetchAllPages<ReviewRow>((from, to) =>
    admin
      .from('hr_reviews')
      .select('*, hr_employees!inner(*)')
      .is('completed_on', null)
      .lte('due_on', cutoff)
      .neq('hr_employees.employment_status', 'leaver')
      .order('due_on')
      .order('id')
      .range(from, to)
      .returns<ReviewRow[]>()
  )
  if (error) {
    console.error('listUpcomingReviews failed', error.message)
    throw new Error('Could not load reviews. Please try again.')
  }

  const reviews: ReviewWithEmployee[] = []
  for (const { hr_employees: employee, ...review } of data) {
    if (inScope(viewer, employee)) reviews.push({ ...review, employee })
  }
  return reviews
}

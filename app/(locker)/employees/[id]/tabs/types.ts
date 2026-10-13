import type { PeopleViewer } from '@/utils/people/access'
import type { Employee } from '@/utils/people/types'

/**
 * Props every profile tab component receives from app/people/employees/[id]/page.tsx.
 * Each tab is an async SERVER component in its own file, default-exported:
 *   tabs/overview-tab.tsx   (employees.view)    summary, key dates, data-completeness
 *   tabs/employment-tab.tsx (employees.view)    job, area, manager, contract, probation
 *   tabs/personal-tab.tsx   (private.view)      contact, address, DOB, PPS, emergency contacts
 *   tabs/pay-tab.tsx        (compensation.view) pay history
 *   tabs/documents-tab.tsx  (documents.view)    compliance documents
 *   tabs/leave-tab.tsx      (leave.view)        entitlements, balances, requests
 *   tabs/reviews-tab.tsx    (reviews.view)      probation / appraisal / supervision
 *   tabs/checklists-tab.tsx (checklists.view)   onboarding / offboarding
 *   tabs/timeline-tab.tsx   (employees.view)    events & case notes
 * The shell has already authorised the viewer for this employee; a tab must
 * still check any extra capability it needs (e.g. private.view) via canOnEmployee().
 */
export type TabProps = {
  viewer: PeopleViewer
  employee: Employee
  searchParams: Record<string, string | string[] | undefined>
}

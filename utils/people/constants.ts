import type {
  ChecklistKind, DocumentCategory, EmploymentStatus, EmploymentType, EventType, LeaveStatus, OwnerRole, ReviewType,
} from './types'

/** Visual tone used by <Badge>; the actual classes live in app/people/_components/ui.tsx. */
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'sky' | 'pink' | 'gray'

export const EMPLOYMENT_STATUSES: { value: EmploymentStatus; label: string; tone: Tone }[] = [
  { value: 'pre_start', label: 'Pre-start', tone: 'sky' },
  { value: 'active', label: 'Active', tone: 'green' },
  { value: 'on_leave', label: 'On leave', tone: 'amber' },
  { value: 'suspended', label: 'Suspended', tone: 'red' },
  { value: 'leaver', label: 'Leaver', tone: 'gray' },
]

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'fixed_term', label: 'Fixed term' },
  { value: 'part_time', label: 'Part time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
  { value: 'agency', label: 'Agency' },
]

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'vetting', label: 'Vetting' },
  { value: 'right_to_work', label: 'Right to work' },
  { value: 'training', label: 'Training' },
  { value: 'licence', label: 'Licences & insurance' },
  { value: 'contract', label: 'Contracts' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'other', label: 'Other' },
]

export const REVIEW_TYPES: { value: ReviewType; label: string }[] = [
  { value: 'probation', label: 'Probation review' },
  { value: 'annual_appraisal', label: 'Annual appraisal' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'spot_check', label: 'Spot check' },
  { value: 'return_to_work', label: 'Return to work' },
  { value: 'exit_interview', label: 'Exit interview' },
  { value: 'other', label: 'Other' },
]

export const EVENT_TYPES: { value: EventType; label: string; tone: Tone; hrOnlyByDefault: boolean }[] = [
  { value: 'joined', label: 'Joined', tone: 'green', hrOnlyByDefault: false },
  { value: 'role_change', label: 'Role change', tone: 'blue', hrOnlyByDefault: false },
  { value: 'area_change', label: 'Area change', tone: 'blue', hrOnlyByDefault: false },
  { value: 'pay_change', label: 'Pay change', tone: 'purple', hrOnlyByDefault: true },
  { value: 'probation', label: 'Probation', tone: 'sky', hrOnlyByDefault: false },
  { value: 'commendation', label: 'Commendation', tone: 'green', hrOnlyByDefault: false },
  { value: 'warning', label: 'Warning', tone: 'amber', hrOnlyByDefault: true },
  { value: 'disciplinary', label: 'Disciplinary', tone: 'red', hrOnlyByDefault: true },
  { value: 'grievance', label: 'Grievance', tone: 'red', hrOnlyByDefault: true },
  { value: 'absence', label: 'Absence', tone: 'amber', hrOnlyByDefault: true },
  { value: 'training', label: 'Training', tone: 'sky', hrOnlyByDefault: false },
  { value: 'note', label: 'Note', tone: 'gray', hrOnlyByDefault: true },
  { value: 'leaver', label: 'Leaver', tone: 'gray', hrOnlyByDefault: false },
  { value: 'other', label: 'Other', tone: 'gray', hrOnlyByDefault: true },
]

export const LEAVE_STATUSES: { value: LeaveStatus; label: string; tone: Tone }[] = [
  { value: 'pending', label: 'Pending', tone: 'amber' },
  { value: 'approved', label: 'Approved', tone: 'green' },
  { value: 'rejected', label: 'Rejected', tone: 'red' },
  { value: 'cancelled', label: 'Cancelled', tone: 'gray' },
]

export const OWNER_ROLES: { value: OwnerRole; label: string }[] = [
  { value: 'hr', label: 'HR' },
  { value: 'manager', label: 'Line manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'it', label: 'IT' },
  { value: 'finance', label: 'Finance' },
]

export const CHECKLIST_KINDS: { value: ChecklistKind; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'offboarding', label: 'Offboarding' },
]

export const PAY_BASES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Annual salary' },
] as const

export const COUNTIES = [
  'Carlow', 'Cavan', 'Clare', 'Cork', 'Donegal', 'Dublin', 'Galway', 'Kerry', 'Kildare', 'Kilkenny', 'Laois',
  'Leitrim', 'Limerick', 'Longford', 'Louth', 'Mayo', 'Meath', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo',
  'Tipperary', 'Waterford', 'Westmeath', 'Wexford', 'Wicklow',
]

export function labelOf<T extends string>(list: { value: T; label: string }[], value: T | null | undefined): string {
  if (!value) return ''
  return list.find(o => o.value === value)?.label ?? value
}

/** Number of days before an expiry that a document is flagged "expiring soon" when its type has no setting. */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30

/** Maximum upload size for HR documents (bytes). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const HR_DOCUMENTS_BUCKET = 'hr-documents'

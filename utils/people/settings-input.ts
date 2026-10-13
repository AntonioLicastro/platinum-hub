import type { Tone } from './constants'
import type { LeaveCategory } from './types'

// Constants shared by the Settings pages and their server actions. Pure data
// (no server-only imports) so client components can use it too.

export const COMPANY_EMAIL_DOMAIN = '@platinumhomecare.ie'

export const NAME_MAX = 120
export const DESCRIPTION_MAX = 500
export const NOTE_MAX = 300
export const EMAIL_MAX = 254

// ---- Access ---------------------------------------------------------------

export type AccessRoleValue = 'hr_admin' | 'hr' | 'manager'

type AccessRoleOption = {
  value: AccessRoleValue
  label: string
  tone: Tone
  summary: string
  /** Plain-English bullets shown next to the role picker. */
  points: string[]
}

export const ACCESS_ROLES: AccessRoleOption[] = [
  {
    value: 'hr_admin',
    label: 'HR admin',
    tone: 'purple',
    summary: 'Everything HR can do, plus control of who has access.',
    points: [
      'Sees and edits every employee record, including personal details, PPS numbers and pay',
      'Manages document types, leave types, holidays, checklist templates and imports',
      'Grants and revokes HR Locker access, and reads the audit log',
    ],
  },
  {
    value: 'hr',
    label: 'HR',
    tone: 'blue',
    summary: 'Full access to every employee record, but not to access settings.',
    points: [
      'Sees and edits every employee record, including personal details, PPS numbers, pay and confidential notes',
      'Manages documents, leave, reviews, onboarding and the settings behind them',
      'Cannot grant access to others or read the audit log',
    ],
  },
  {
    value: 'manager',
    label: 'Manager',
    tone: 'green',
    summary: 'Sees only their own areas and direct reports, never personal or pay details.',
    points: [
      'Sees names, job titles, compliance status, leave and reviews for people in the areas ticked, plus their direct reports',
      'Approves leave, runs reviews, adds notes that managers can see and works through onboarding checklists',
      'Never sees personal details, PPS numbers, pay or HR-only notes',
    ],
  },
]

export const ACCESS_ROLE_VALUES = ACCESS_ROLES.map(r => r.value)

// ---- Leave types ----------------------------------------------------------

export const LEAVE_CATEGORIES: { value: LeaveCategory; label: string; blurb: string }[] = [
  { value: 'annual', label: 'Annual leave', blurb: 'Holiday entitlement and days in lieu' },
  { value: 'sick', label: 'Sick leave', blurb: 'Absence through illness' },
  { value: 'statutory', label: 'Statutory leave', blurb: 'Leave set by law, such as maternity or parental leave' },
  { value: 'other', label: 'Other leave', blurb: 'Company-policy leave such as compassionate or study leave' },
]

export const LEAVE_CATEGORY_VALUES = LEAVE_CATEGORIES.map(c => c.value)

export const LEAVE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,29}$/
export const LEAVE_CODE_MAX = 30
export const MAX_ENTITLEMENT_DAYS = 366

/** Colours offered for a leave type. Includes every colour the seeded leave types use. */
export const LEAVE_SWATCHES: { value: string; name: string }[] = [
  { value: '#323398', name: 'Indigo' },
  { value: '#6366f1', name: 'Periwinkle' },
  { value: '#8b5cf6', name: 'Purple' },
  { value: '#d946ef', name: 'Fuchsia' },
  { value: '#ec4899', name: 'Pink' },
  { value: '#f43f5e', name: 'Rose' },
  { value: '#ef4444', name: 'Red' },
  { value: '#f97316', name: 'Orange' },
  { value: '#eab308', name: 'Yellow' },
  { value: '#84cc16', name: 'Lime' },
  { value: '#179048', name: 'Green' },
  { value: '#14b8a6', name: 'Teal' },
  { value: '#0d9488', name: 'Deep teal' },
  { value: '#06b6d4', name: 'Cyan' },
  { value: '#0ea5e9', name: 'Sky' },
  { value: '#64748b', name: 'Slate' },
  { value: '#94a3b8', name: 'Grey' },
]

// ---- Document types -------------------------------------------------------

export const MAX_VALIDITY_MONTHS = 240
export const MAX_REMINDER_DAYS = 365
export const DEFAULT_REMINDER_DAYS = 30
export const DEFAULT_SORT_ORDER = 100
export const MAX_SORT_ORDER = 9999

/** One-line summary of when a document type expires, for lists. */
export function describeExpiry(type: { requires_expiry: boolean; default_validity_months: number | null; reminder_days: number }): string {
  if (!type.requires_expiry) return 'Does not expire'
  const validity = type.default_validity_months
    ? `Valid ${type.default_validity_months} ${type.default_validity_months === 1 ? 'month' : 'months'}`
    : 'Expiry date set per document'
  return `${validity}, reminder ${type.reminder_days} days before`
}

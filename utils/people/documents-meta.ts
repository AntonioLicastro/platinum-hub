import type { ComplianceState } from './compliance-data'
import { DOCUMENT_CATEGORIES, type Tone } from './constants'
import type { DocumentStatus, DocumentType } from './types'

// Labels and tones shared by the compliance page, the employee Documents tab and
// the upload forms. Pure (no server imports) so client components can use it.

/** The slice of a document type the browser needs to render the upload form. */
export type DocumentTypeOption = Pick<DocumentType, 'id' | 'name' | 'category' | 'requires_expiry' | 'default_validity_months'>

export const COMPLIANCE_STATE_TONE: Record<ComplianceState, Tone> = {
  valid: 'green',
  expiring: 'amber',
  expired: 'red',
  pending: 'sky',
  rejected: 'red',
  missing: 'gray',
}

export const DOCUMENT_STATUSES: { value: DocumentStatus; label: string; tone: Tone }[] = [
  { value: 'pending', label: 'Awaiting check', tone: 'sky' },
  { value: 'verified', label: 'Verified', tone: 'green' },
  { value: 'rejected', label: 'Rejected', tone: 'red' },
]

/** "3 days", "5 months", "2 years" - a rough size for a gap between two dates. */
function span(days: number): string {
  if (days < 60) return `${days} ${days === 1 ? 'day' : 'days'}`
  if (days < 730) return `${Math.round(days / 30.4)} months`
  return `${Math.round(days / 365)} years`
}

/** "today", "in 5 months", "3 days ago" for a number of days from now (negative = past). */
export function relativeSpan(days: number): string {
  if (days === 0) return 'today'
  return days > 0 ? `in ${span(days)}` : `${span(-days)} ago`
}

/** Chip text. `compact` is for the matrix, where only a few characters fit. */
export function stateLabel(state: ComplianceState, daysToExpiry: number | null, compact = false): string {
  switch (state) {
    case 'valid': return 'Valid'
    case 'expiring':
      if (daysToExpiry === null) return 'Expiring'
      if (compact) return `${daysToExpiry}d`
      return daysToExpiry === 0 ? 'Expires today' : `Expires ${relativeSpan(daysToExpiry)}`
    case 'expired':
      if (compact || daysToExpiry === null) return 'Expired'
      return `Expired ${relativeSpan(daysToExpiry)}`
    case 'pending': return compact ? 'Pending' : 'Awaiting check'
    case 'rejected': return 'Rejected'
    case 'missing': return compact ? 'Missing' : 'Not on file'
  }
}

/** Document types grouped under their category heading, in the order the categories are defined. */
export function groupTypesByCategory(types: DocumentTypeOption[]): { value: string; label: string; types: DocumentTypeOption[] }[] {
  return DOCUMENT_CATEGORIES
    .map(c => ({ value: c.value, label: c.label, types: types.filter(t => t.category === c.value) }))
    .filter(g => g.types.length > 0)
}

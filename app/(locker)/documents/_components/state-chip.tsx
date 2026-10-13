import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Hourglass, XCircle, type LucideIcon } from 'lucide-react'
import type { ComplianceState } from '@/utils/people/compliance-data'
import { COMPLIANCE_STATE_TONE, stateLabel } from '@/utils/people/documents-meta'
import { Badge } from '../../_components/ui'

const ICONS: Record<ComplianceState, LucideIcon> = {
  valid: CheckCircle2,
  expiring: Clock3,
  expired: AlertTriangle,
  pending: Hourglass,
  rejected: XCircle,
  missing: CircleDashed,
}

/**
 * Coloured state chip. The icon and the words carry the meaning as well as the
 * colour, so it still reads for people who can't tell the shades apart.
 */
export function StateChip({ state, daysToExpiry, compact = false }: {
  state: ComplianceState
  daysToExpiry: number | null
  compact?: boolean
}) {
  const Icon = ICONS[state]
  const label = stateLabel(state, daysToExpiry, compact)
  // "Missing" is the absence of a document, so it gets an empty, dashed outline rather than a fill.
  if (state === 'missing') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-500">
        <Icon size={12} aria-hidden="true" /> {label}
      </span>
    )
  }
  return (
    <Badge tone={COMPLIANCE_STATE_TONE[state]}>
      <Icon size={12} aria-hidden="true" /> {label}
    </Badge>
  )
}

import { UserRound } from 'lucide-react'
import { OWNER_ROLES, labelOf } from '@/utils/people/constants'
import { ITEM_STATES, type ItemState } from '@/utils/people/checklist-status'
import type { OwnerRole } from '@/utils/people/types'
import { Badge } from '../../_components/ui'

/** Who is responsible for a task. */
export function OwnerChip({ role }: { role: OwnerRole }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      <UserRound size={12} aria-hidden="true" />
      {labelOf(OWNER_ROLES, role)}
    </span>
  )
}

/** Overdue, due soon or done. Tasks that are simply upcoming carry no chip, so the ones that need attention stand out. */
export function StateChip({ state }: { state: ItemState }) {
  if (state !== 'overdue' && state !== 'due_soon' && state !== 'done') return null
  const { label, tone } = ITEM_STATES[state]
  return <Badge tone={tone} dot>{label}</Badge>
}

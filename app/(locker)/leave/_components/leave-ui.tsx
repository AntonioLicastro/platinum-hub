import type { CSSProperties } from 'react'
import { LEAVE_STATUSES } from '@/utils/people/constants'
import { Badge } from '../../_components/ui'
import type { Employee, LeaveStatus, LeaveType } from '@/utils/people/types'

// Small presentational pieces shared by the leave page, request form and profile tab.

const HEX = /^#[0-9a-f]{6}$/i

/** Leave type colours come from the database; only plain hex is ever put into a style. */
export function safeColor(color: string): string {
  return HEX.test(color) ? color : '#64748b'
}

/** Soft tint of a type colour, for chip backgrounds. */
function tint(color: string, alphaHex = '26'): string {
  return `${safeColor(color)}${alphaHex}`
}

export function TypeChip({ type }: { type: Pick<LeaveType, 'name' | 'color'> }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-slate-800">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: safeColor(type.color) }} />
      <span className="truncate">{type.name}</span>
    </span>
  )
}

export function StatusBadge({ status }: { status: LeaveStatus }) {
  const meta = LEAVE_STATUSES.find(s => s.value === status)
  return <Badge tone={meta?.tone ?? 'gray'} dot>{meta?.label ?? status}</Badge>
}

/** Approved leave is a solid tinted block; pending leave is striped with a dashed outline. */
export function chipStyle(color: string, pending: boolean): CSSProperties {
  const c = safeColor(color)
  return pending
    ? {
        border: `1px dashed ${c}`,
        backgroundImage: `repeating-linear-gradient(135deg, ${tint(c, '30')} 0 4px, transparent 4px 8px)`,
      }
    : { backgroundColor: tint(c), borderLeft: `3px solid ${c}` }
}

/** "Jane D." for tight spaces such as calendar cells. */
export function shortName(e: Pick<Employee, 'first_name' | 'last_name' | 'preferred_name' | 'email'>): string {
  const first = e.preferred_name?.trim() || e.first_name.trim()
  const last = e.last_name.trim()
  if (!first) return e.email.split('@')[0]
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
}

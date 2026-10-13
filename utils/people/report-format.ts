import { formatDate } from './format'
import type { Cell, ColumnKind } from './report-types'

// Number and cell formatting shared by the report calculations and the page.
// Irish (en-IE) conventions throughout.

const NUMBER_FORMATS = new Map<number, Intl.NumberFormat>()

/** 1,234 or 12.5: at most `maxDecimals` decimals, none when the number is whole. */
export function formatNumber(n: number, maxDecimals = 1): string {
  let format = NUMBER_FORMATS.get(maxDecimals)
  if (!format) {
    format = new Intl.NumberFormat('en-IE', { maximumFractionDigits: maxDecimals })
    NUMBER_FORMATS.set(maxDecimals, format)
  }
  return format.format(n)
}

export const formatPercent = (n: number): string => `${formatNumber(n)}%`

/** "2 yrs 3 mos", "5 mos", "Under a month": how long, given a number of months. */
export function formatMonths(months: number): string {
  const total = Math.round(months)
  if (total < 1) return 'Under a month'
  const years = Math.floor(total / 12)
  const rest = total % 12
  const parts: string[] = []
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`)
  if (rest) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mos'}`)
  return parts.join(' ')
}

export const plural = (n: number, one: string, many: string): string => `${formatNumber(n)} ${n === 1 ? one : many}`

/** A signed whole number: +3, −2 (with a real minus sign), 0. */
export function formatSigned(n: number): string {
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n), 0)}`
}

/** What a table cell shows on screen. Empty cells are the caller's job (they render a dash). */
export function formatCell(kind: ColumnKind | undefined, cell: Exclude<Cell, null>): string {
  if (typeof cell === 'string') return kind === 'date' ? formatDate(cell) : cell
  switch (kind) {
    case 'percent': return formatPercent(cell)
    case 'months': return formatMonths(cell)
    case 'change': return formatSigned(cell)
    case 'decimal': return formatNumber(cell, 1)
    default: return formatNumber(cell, 2)
  }
}

import type { YearPerson } from '@/utils/people/leave-year'

const INK = '#0f172a'

// Cell width decides the size: month cards are containers, so a chip grows when the
// calendar has room (phone, tablet) and stays compact in the three-across desktop grid.
const SIZES = {
  calendar: 'size-[18px] text-[8.5px] @min-[310px]:size-5 @min-[310px]:text-[9px] @min-[340px]:size-[22px] @min-[340px]:text-[10px]',
  panel: 'size-[22px] text-[10px]',
} as const

/**
 * A person's initials in their colour. Approved leave is a solid disc; leave still
 * waiting for approval is outlined with a dashed ring; a half day carries a "½".
 * With `decorative` the chip is hidden from assistive tech (the name sits beside it).
 */
export function PersonChip({ person, size, pending = false, half = false, detail, decorative = false }: {
  person: YearPerson
  size: keyof typeof SIZES
  pending?: boolean
  half?: boolean
  /** What the chip means, e.g. "Annual leave, half day". */
  detail?: string
  decorative?: boolean
}) {
  const { fill, ink } = person.color
  const label = detail ? `${person.name}: ${detail}` : person.name
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label, title: label })}
      className={`relative inline-flex shrink-0 select-none items-center justify-center rounded-full pt-px font-bold leading-none tracking-tight ${SIZES[size]} ${pending ? 'border-[1.5px] border-dashed' : ''}`}
      style={pending ? { backgroundColor: `${fill}26`, borderColor: fill, color: INK } : { backgroundColor: fill, color: ink }}
    >
      {person.initials}
      {half && (
        <span aria-hidden="true" className="absolute -bottom-1 -right-1 flex size-2.5 items-center justify-center rounded-full bg-white text-[7px] font-bold text-slate-800 ring-1 ring-slate-400">
          ½
        </span>
      )}
    </span>
  )
}

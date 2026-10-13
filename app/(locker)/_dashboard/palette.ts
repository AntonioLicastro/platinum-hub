// Chart colours. Every set was checked for colour-blind separation between all
// pairs of colours on white, and no chart relies on colour alone: each one also
// prints its labels and counts. A colour belongs to its category, not to its rank.

export const BAR_COLOUR = '#323398'
export const OTHER_COLOUR = '#94a3b8'

/** Hatching for "not recorded": reads as a gap in the data, never as a category. */
export const UNRECORDED_FILL = 'repeating-linear-gradient(45deg, #cbd5e1 0, #cbd5e1 3px, #f1f5f9 3px, #f1f5f9 6px)'

export const STATUS_COLOURS: Record<string, string> = {
  active: '#179048',
  pre_start: '#2a8fd6',
  on_leave: '#eda100',
  suspended: '#c2459a',
}

export const TYPE_COLOURS: Record<string, string> = {
  permanent: '#4a4dc9',
  fixed_term: '#2a8fd6',
  part_time: '#1baf7a',
  casual: '#a8643a',
  contract: '#c2459a',
  agency: '#eda100',
}

export const STARTERS_COLOUR = '#179048'
export const LEAVERS_COLOUR = '#4a4dc9'

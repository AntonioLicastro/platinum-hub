import type { Employee } from './types'

// Pure helpers for the Leave "Year" view: a stable colour per person, initials,
// short names that stay unique. No server
// imports, so they are safe to use from any component.

type NameParts = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'preferred_name' | 'email'>

// ---- Colours ---------------------------------------------------------------

// Okabe-Ito and Paul Tol "muted" hues: chosen to stay apart under the common
// kinds of colour blindness. Colour is still never the only signal (initials,
// the panel and tooltips carry the name).
const PALETTE_FILLS = [
  '#0072B2', '#D55E00', '#009E73', '#E69F00', '#CC79A7', '#56B4E9',
  '#332288', '#882255', '#DDCC77', '#8C510A', '#AA4499', '#117733',
] as const

const WHITE = '#ffffff'
const NEAR_BLACK = '#0f172a'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export type PersonColor = { fill: string; ink: string }

/** Initials sit on the fill in whichever of white / near-black reads better. */
export const PERSON_PALETTE: readonly PersonColor[] = PALETTE_FILLS.map(fill => ({
  fill,
  ink: contrastRatio(fill, WHITE) >= contrastRatio(fill, NEAR_BLACK) ? WHITE : NEAR_BLACK,
}))

/** The same person always gets the same colour: FNV-1a hash of the employee id. */
export function personColor(employeeId: string): PersonColor {
  const id = employeeId.toLowerCase()
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return PERSON_PALETTE[(hash >>> 0) % PERSON_PALETTE.length]
}

// ---- Names -----------------------------------------------------------------

const LETTER = /[A-Za-zÀ-ÖØ-öø-ɏ]/

const firstNameOf = (e: NameParts) => e.preferred_name?.trim() || e.first_name.trim() || e.email.split('@')[0]

/** "Aoife Murphy": the name people use (preferred first name), for tooltips and screen readers. */
export function plainName(e: NameParts): string {
  return `${firstNameOf(e)} ${e.last_name.trim()}`.trim()
}

/** "AM": first letter of the first and last name. */
export function chipInitials(e: NameParts): string {
  const letter = (s: string) => LETTER.exec(s)?.[0].toUpperCase() ?? ''
  return letter(firstNameOf(e)) + letter(e.last_name) || '?'
}

/**
 * "Alison B" for everyone, growing the surname ("Alison Br" / "Alison By") only
 * for people who would otherwise share a label. Worked out over the viewer's
 * whole scope, so a person's label doesn't change when a filter is applied.
 */
export function shortLabels(people: NameParts[]): Map<string, string> {
  const labelAt = (p: NameParts, n: number) => {
    const last = p.last_name.trim()
    return last ? `${firstNameOf(p)} ${last.slice(0, n)}` : firstNameOf(p)
  }
  const labels = new Map<string, string>()
  let todo = people
  for (let n = 1; todo.length > 0; n++) {
    const buckets = new Map<string, NameParts[]>()
    for (const p of todo) {
      const key = labelAt(p, n).toLowerCase()
      const bucket = buckets.get(key)
      if (bucket) bucket.push(p)
      else buckets.set(key, [p])
    }
    todo = []
    for (const bucket of buckets.values()) {
      // Identical names (or surnames fully spelled out) can't be told apart any further.
      if (bucket.length === 1 || bucket.every(p => p.last_name.trim().length <= n)) {
        for (const p of bucket) labels.set(p.id, labelAt(p, n))
      } else {
        todo.push(...bucket)
      }
    }
  }
  return labels
}

/** Day totals for the panel: "7d", "7.5d", "0d". */
export function formatDayTotal(days: number): string {
  return `${Math.round(days * 100) / 100}d`
}

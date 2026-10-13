import { addDays } from './format'
import { EARLIEST_DATE } from './timeline-input'
import { isIsoDate } from './validate'
import type { ChecklistKind } from './types'

// Limits and option shapes shared by the checklist server actions and their
// forms. Pure module: safe to import from client components.

export const ITEM_TITLE_MAX = 200
export const ITEM_TEXT_MAX = 1000
export const NOTE_MAX = 2000
export const TEMPLATE_NAME_MAX = 120
export const TEMPLATE_DESCRIPTION_MAX = 500

/** Furthest a template task may be timed before or after the day a checklist starts. */
export const MAX_OFFSET_DAYS = 730
/** Furthest ahead of today a checklist start day or task due date may be. */
const MAX_AHEAD_DAYS = 2 * 366

/** An employee the start form may offer. Directory-level data only. */
export type StartEmployeeOption = {
  id: string
  name: string
  jobTitle: string | null
  startDate: string | null
  endDate: string | null
}

/** An active template as the start form needs it, with the spread of its due dates. */
export type StartTemplateOption = {
  id: number
  name: string
  kind: ChecklistKind
  appliesTo: string[]
  itemCount: number
  minOffset: number | null
  maxOffset: number | null
}

/**
 * The template to preselect: one that lists the employee's job title, else the
 * kind's general template (no titles listed), else the first of that kind.
 */
export function suggestTemplate<T extends { kind: ChecklistKind; appliesTo: string[] }>(
  templates: T[], kind: ChecklistKind, jobTitle: string | null | undefined,
): T | null {
  const ofKind = templates.filter(t => t.kind === kind)
  const title = jobTitle?.trim().toLowerCase()
  const byTitle = title ? ofKind.find(t => t.appliesTo.some(a => a.trim().toLowerCase() === title)) : undefined
  return byTitle ?? ofKind.find(t => t.appliesTo.length === 0) ?? ofKind[0] ?? null
}

/** Returns a message about a date entered in a form (`label` names it, e.g. "due date"), or null when it is acceptable. */
export function checkDate(value: string, today: string, label: string): string | null {
  if (!isIsoDate(value)) return `Enter a valid ${label}`
  if (value < EARLIEST_DATE) return `The ${label} is too far in the past`
  if (value > addDays(today, MAX_AHEAD_DAYS)) return `The ${label} is too far ahead`
  return null
}

import type { Tone } from './constants'
import { daysBetween, relativeDays } from './format'
import type { ChecklistItem } from './types'

// Pure helpers for checklist tasks: due-date state, ordering, grouping and
// progress. No server imports, so client components can use them too.

/** An open task is flagged "due soon" this many days before its due date. */
const DUE_SOON_DAYS = 3

export type ItemState = 'done' | 'overdue' | 'due_soon' | 'upcoming' | 'no_date'

export const ITEM_STATES: Record<ItemState, { label: string; tone: Tone }> = {
  done: { label: 'Done', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  due_soon: { label: 'Due soon', tone: 'amber' },
  upcoming: { label: 'Upcoming', tone: 'gray' },
  no_date: { label: 'No due date', tone: 'gray' },
}

type Stateful = Pick<ChecklistItem, 'completed_at' | 'due_on'>
type Orderable = Pick<ChecklistItem, 'due_on' | 'sort_order'>

export function itemState(item: Stateful, today: string): ItemState {
  if (item.completed_at) return 'done'
  if (!item.due_on) return 'no_date'
  const days = daysBetween(item.due_on, today)
  if (days < 0) return 'overdue'
  return days <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming'
}

export function isOverdue(item: Stateful, today: string): boolean {
  return itemState(item, today) === 'overdue'
}

/** Earliest due date first, tasks without a date last, ties in template order. */
export function compareByDue(a: Orderable, b: Orderable): number {
  if (a.due_on !== b.due_on) {
    if (!a.due_on) return 1
    if (!b.due_on) return -1
    return a.due_on.localeCompare(b.due_on)
  }
  return a.sort_order - b.sort_order
}

/** "In 5 days", "Today", "3 days overdue". Empty string when there is no due date. */
export function dueDistance(dueOn: string | null, today: string): string {
  if (!dueOn) return ''
  const days = daysBetween(dueOn, today)
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`
  return days === 0 ? 'Due today' : `Due ${relativeDays(dueOn)}`
}

/** How a template task is timed relative to the day the checklist starts. */
export function describeOffset(days: number): string {
  if (days === 0) return 'On the start day'
  const n = Math.abs(days)
  return `${n} ${n === 1 ? 'day' : 'days'} ${days < 0 ? 'before' : 'after'} start`
}

type DueGroup<T> = { dueOn: string | null; items: T[] }

/** Tasks grouped by exact due date, earliest first, undated tasks in a final group. */
export function groupByDueDate<T extends Orderable>(items: T[]): DueGroup<T>[] {
  const groups: DueGroup<T>[] = []
  for (const item of [...items].sort(compareByDue)) {
    const last = groups[groups.length - 1]
    if (last && last.dueOn === item.due_on) last.items.push(item)
    else groups.push({ dueOn: item.due_on, items: [item] })
  }
  return groups
}

type Progress = { total: number; done: number; overdue: number; percent: number }

export function summarise(items: Stateful[], today: string): Progress {
  const total = items.length
  const done = items.filter(i => i.completed_at).length
  const overdue = items.filter(i => isOverdue(i, today)).length
  return { total, done, overdue, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

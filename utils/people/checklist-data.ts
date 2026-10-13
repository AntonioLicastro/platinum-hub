import { cache } from 'react'
import { inScope, type PeopleViewer } from './access'
import { compareByDue, isOverdue } from './checklist-status'
import { createAdminClient, fetchAllPages, fetchByIds } from './db'
import { displayName, todayIso } from './format'
import type { Checklist, ChecklistItem, Employee } from './types'

// Loaders for the onboarding module. The hr_checklist* tables are service-role
// only, so scoping every employee with inScope() here is the access control.
//
// Every query goes through fetchAllPages / fetchByIds, which retry transient
// failures (withRetry) page by page. If a query still fails the loader THROWS:
// returning what loaded would show "nothing pending, all caught up" during an
// outage. The dashboard and My space turn the throw into an "unavailable"
// notice for that one card; other pages fall to the error boundary.

export type OpenChecklistItem = ChecklistItem & { checklist: Checklist; employee: Employee }

export type ChecklistProgress = { employee: Employee; checklist: Checklist; done: number; total: number; overdue: number }

export type ChecklistWithItems = { checklist: Checklist; items: ChecklistItem[] }

function loadFailed(what: string, error: { message: string }): never {
  console.error(`${what} failed`, error.message)
  throw new Error('Could not load checklists. Please try again.')
}

/** Checklist ids per request to the items table; keeps the `in` list well inside URL limits. */
const ITEM_CHUNK = 50

async function fetchItems(checklistIds: string[]): Promise<ChecklistItem[]> {
  const admin = createAdminClient()
  const chunks: string[][] = []
  for (let i = 0; i < checklistIds.length; i += ITEM_CHUNK) chunks.push(checklistIds.slice(i, i + ITEM_CHUNK))
  const pages = await Promise.all(chunks.map(chunk =>
    // A chunk can hold more than PostgREST's 1000-row cap, so page within it.
    fetchAllPages<ChecklistItem>((from, to) =>
      admin
        .from('hr_checklist_items')
        .select('*')
        .in('checklist_id', chunk)
        .order('sort_order')
        .order('id')
        .range(from, to)
        .returns<ChecklistItem[]>()
    )
  ))
  const items: ChecklistItem[] = []
  for (const page of pages) {
    if (page.error) loadFailed('fetchItems', page.error)
    items.push(...page.data)
  }
  return items
}

function groupByChecklist(items: ChecklistItem[]): Map<string, ChecklistItem[]> {
  const grouped = new Map<string, ChecklistItem[]>()
  for (const item of items) {
    const list = grouped.get(item.checklist_id)
    if (list) list.push(item)
    else grouped.set(item.checklist_id, [item])
  }
  return grouped
}

async function fetchEmployees(ids: string[]): Promise<Map<string, Employee>> {
  const { data, error } = await fetchByIds<Employee>(ids, chunk =>
    createAdminClient().from('hr_employees').select('*').in('id', chunk).returns<Employee[]>()
  )
  if (error) loadFailed('fetchEmployees', error)
  return new Map(data.map(e => [e.id, e]))
}

type InProgress = { employee: Employee; checklist: Checklist; items: ChecklistItem[] }

/**
 * Every in-progress checklist in the viewer's scope with its tasks. A leaver
 * only keeps their offboarding checklists; onboarding for someone who has left
 * is noise. Shared by the two public loaders so a page that wants both pays once.
 */
const loadInProgress = cache(async (viewer: PeopleViewer): Promise<InProgress[]> => {
  const admin = createAdminClient()
  const { data: checklists, error } = await fetchAllPages<Checklist>((from, to) =>
    admin
      .from('hr_checklists')
      .select('*')
      .is('completed_at', null)
      .order('created_at')
      .order('id')
      .range(from, to)
      .returns<Checklist[]>()
  )
  if (error) loadFailed('loadInProgress', error)
  if (checklists.length === 0) return []

  const employees = await fetchEmployees([...new Set(checklists.map(c => c.employee_id))])
  const visible = checklists.flatMap(checklist => {
    const employee = employees.get(checklist.employee_id)
    if (!employee || !inScope(viewer, employee)) return []
    if (employee.employment_status === 'leaver' && checklist.kind !== 'offboarding') return []
    return [{ employee, checklist }]
  })
  if (visible.length === 0) return []

  const items = await fetchItems(visible.map(v => v.checklist.id))
  const byChecklist = groupByChecklist(items)
  return visible.map(v => ({ ...v, items: byChecklist.get(v.checklist.id) ?? [] }))
})

/** Incomplete items on in-progress checklists for the viewer's scope, overdue first. */
export async function listOpenChecklistItems(viewer: PeopleViewer): Promise<OpenChecklistItem[]> {
  const open = (await loadInProgress(viewer)).flatMap(({ employee, checklist, items }) =>
    items.filter(i => !i.completed_at).map(item => ({ ...item, checklist, employee }))
  )
  return open.sort((a, b) =>
    compareByDue(a, b) || displayName(a.employee).localeCompare(displayName(b.employee)) || a.id.localeCompare(b.id)
  )
}

/** One row per in-progress checklist for the viewer's scope, those with overdue tasks first. */
export async function listChecklistProgress(viewer: PeopleViewer): Promise<ChecklistProgress[]> {
  const today = todayIso()
  const rows = (await loadInProgress(viewer)).map(({ employee, checklist, items }) => ({
    employee,
    checklist,
    done: items.filter(i => i.completed_at).length,
    total: items.length,
    overdue: items.filter(i => isOverdue(i, today)).length,
  }))
  return rows.sort((a, b) =>
    b.overdue - a.overdue ||
    a.checklist.started_on.localeCompare(b.checklist.started_on) ||
    displayName(a.employee).localeCompare(displayName(b.employee))
  )
}

/** Checklists finished on or after `sinceIso` for people in the viewer's scope, latest first. */
export async function listCompletedSince(viewer: PeopleViewer, sinceIso: string): Promise<{ employee: Employee; checklist: Checklist }[]> {
  const admin = createAdminClient()
  const { data: checklists, error } = await fetchAllPages<Checklist>((from, to) =>
    admin
      .from('hr_checklists')
      .select('*')
      .gte('completed_at', sinceIso)
      .order('completed_at', { ascending: false })
      .order('id')
      .range(from, to)
      .returns<Checklist[]>()
  )
  if (error) loadFailed('listCompletedSince', error)
  if (checklists.length === 0) return []

  const employees = await fetchEmployees([...new Set(checklists.map(c => c.employee_id))])
  return checklists.flatMap(checklist => {
    const employee = employees.get(checklist.employee_id)
    return employee && inScope(viewer, employee) ? [{ employee, checklist }] : []
  })
}

/**
 * One employee's checklists with their tasks, in progress first. The caller
 * must already have authorised the viewer for this employee.
 */
export async function listEmployeeChecklists(employeeId: string): Promise<ChecklistWithItems[]> {
  const { data: checklists, error } = await fetchAllPages<Checklist>((from, to) =>
    createAdminClient()
      .from('hr_checklists')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
      .returns<Checklist[]>()
  )
  if (error) loadFailed('listEmployeeChecklists', error)
  if (checklists.length === 0) return []

  const items = await fetchItems(checklists.map(c => c.id))
  const byChecklist = groupByChecklist(items)
  const rows = checklists.map(checklist => ({ checklist, items: byChecklist.get(checklist.id) ?? [] }))
  // In progress first (newest first), then finished ones by when they finished.
  return rows.sort((a, b) => {
    const aDone = a.checklist.completed_at
    const bDone = b.checklist.completed_at
    if (!aDone && !bDone) return b.checklist.created_at.localeCompare(a.checklist.created_at)
    if (!aDone) return -1
    if (!bDone) return 1
    return bDone.localeCompare(aDone)
  })
}

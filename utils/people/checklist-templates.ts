import { createAdminClient, fetchAllPages, withRetry } from './db'
import type { StartTemplateOption } from './checklist-input'
import type { Checklist, ChecklistTemplate, ChecklistTemplateItem } from './types'

// Loaders for checklist templates (Settings > Checklist templates and the
// start-a-checklist form). Callers must already have checked the viewer's
// capability: settings.manage for the editor, checklists.manage for starting.
//
// A failed query throws instead of returning an empty list: "No templates yet"
// invites someone to create duplicates, and a missing template reads as a 404.
// The pages fall to the error boundary; the start form degrades on its own.

function loadFailed(what: string, error: { message: string }): never {
  console.error(`${what} failed`, error.message)
  throw new Error('Could not load checklist templates. Please try again.')
}

export type TemplateSummary = ChecklistTemplate & { itemCount: number }

export type TemplateUsage = { total: number; inProgress: number }

async function fetchTemplateItems(): Promise<Pick<ChecklistTemplateItem, 'template_id' | 'due_offset_days'>[]> {
  const { data, error } = await fetchAllPages<Pick<ChecklistTemplateItem, 'template_id' | 'due_offset_days'>>((from, to) =>
    createAdminClient()
      .from('hr_checklist_template_items')
      .select('template_id, due_offset_days')
      .order('id')
      .range(from, to)
      .returns<Pick<ChecklistTemplateItem, 'template_id' | 'due_offset_days'>[]>()
  )
  if (error) loadFailed('fetchTemplateItems', error)
  return data
}

async function fetchTemplates(activeOnly: boolean): Promise<ChecklistTemplate[]> {
  const { data, error } = await withRetry(() => {
    const query = createAdminClient().from('hr_checklist_templates').select('*')
    return (activeOnly ? query.eq('active', true) : query)
      .order('kind')
      .order('name')
      .order('id')
      .returns<ChecklistTemplate[]>()
  })
  if (error) loadFailed('fetchTemplates', error)
  return data ?? []
}

/** Every template, active or not, with its task count. */
export async function listTemplates(): Promise<TemplateSummary[]> {
  const [templates, items] = await Promise.all([fetchTemplates(false), fetchTemplateItems()])
  const counts = new Map<number, number>()
  for (const item of items) counts.set(item.template_id, (counts.get(item.template_id) ?? 0) + 1)
  return templates.map(t => ({ ...t, itemCount: counts.get(t.id) ?? 0 }))
}

/** Active templates in the shape the start form needs. */
export async function listStartableTemplates(): Promise<StartTemplateOption[]> {
  const [templates, items] = await Promise.all([fetchTemplates(true), fetchTemplateItems()])
  const offsets = new Map<number, number[]>()
  for (const item of items) {
    const list = offsets.get(item.template_id)
    if (list) list.push(item.due_offset_days)
    else offsets.set(item.template_id, [item.due_offset_days])
  }
  return templates.map(t => {
    const list = offsets.get(t.id) ?? []
    return {
      id: t.id,
      name: t.name,
      kind: t.kind,
      appliesTo: t.applies_to_titles,
      itemCount: list.length,
      minOffset: list.length > 0 ? Math.min(...list) : null,
      maxOffset: list.length > 0 ? Math.max(...list) : null,
    }
  })
}

export async function getTemplate(id: number): Promise<{ template: ChecklistTemplate; items: ChecklistTemplateItem[] } | null> {
  const admin = createAdminClient()
  const [{ data: template, error }, { data: items, error: itemsError }] = await Promise.all([
    withRetry(() => admin.from('hr_checklist_templates').select('*').eq('id', id).maybeSingle<ChecklistTemplate>()),
    withRetry(() =>
      admin
        .from('hr_checklist_template_items')
        .select('*')
        .eq('template_id', id)
        .order('sort_order')
        .order('id')
        .returns<ChecklistTemplateItem[]>()
    ),
  ])
  // Not "no such template": the page would answer 404 for one that exists.
  if (error) loadFailed('getTemplate', error)
  if (itemsError) loadFailed('getTemplate items', itemsError)
  return template ? { template, items: items ?? [] } : null
}

/** How many checklists were started from each template, and how many are still running. */
export async function listTemplateUsage(): Promise<Map<number, TemplateUsage>> {
  const { data, error } = await fetchAllPages<Pick<Checklist, 'template_id' | 'completed_at'>>((from, to) =>
    createAdminClient()
      .from('hr_checklists')
      .select('template_id, completed_at')
      .not('template_id', 'is', null)
      .order('id')
      .range(from, to)
      .returns<Pick<Checklist, 'template_id' | 'completed_at'>[]>()
  )
  if (error) loadFailed('listTemplateUsage', error)
  const usage = new Map<number, TemplateUsage>()
  for (const row of data) {
    if (row.template_id === null) continue
    const current = usage.get(row.template_id) ?? { total: 0, inProgress: 0 }
    current.total += 1
    if (!row.completed_at) current.inProgress += 1
    usage.set(row.template_id, current)
  }
  return usage
}

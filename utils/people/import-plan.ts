import { AREA_OPTIONS, SENIOR_MANAGEMENT_AREA, TITLE_OPTIONS } from '@/utils/org-options'
import {
  FIELD_BY_KEY, IMPORT_FIELDS, TEMPLATE_EXAMPLE_EMAIL, type ImportField, type ImportFieldKey,
} from './import-fields'
import type { SheetData } from './import-parse'
import type {
  ColumnMapping, ImportCounts, ImportIssue, ImportMode, SampleRow,
} from './import-shared'
import { displayValue, parseFieldValue } from './import-values'
import { splitName } from './format'
import { isEmail } from './validate'

// Decides, row by row, what an import would do: add a person, change some of
// their fields, leave them alone, or reject the row and say why. Pure: the
// preview and the commit both run this same function over the same inputs, so
// what HR is shown is what gets written.

export type StoredRow = Record<string, string | number | null | undefined>
export type ExistingEmployee = StoredRow & { id: string; email: string }

export type PlanContext = {
  employees: ExistingEmployee[]
  /** hr_employee_private rows by employee id (only the columns the import maps). */
  privateRows: Map<string, StoredRow>
  /** Today in Ireland, `YYYY-MM-DD`. */
  today: string
}

export type PlannedRow = {
  row: number
  email: string
  action: 'create' | 'update' | 'unchanged'
  /** Set for update and unchanged rows. */
  employeeId: string | null
  /** Columns to write to hr_employees: everything for a new person, only what changes otherwise. */
  employee: StoredRow
  /** Columns to write to hr_employee_private. */
  private: StoredRow
  hasPrivateRow: boolean
}

export type ImportPlan = {
  /** Rows that can be imported (no errors), in file order. */
  rows: PlannedRow[]
  issues: ImportIssue[]
  counts: ImportCounts
  sampleFields: ImportFieldKey[]
  sample: SampleRow[]
  notes: string[]
}

const SAMPLE_ROWS = 10
const NAMES_IN_NOTE = 5

type Draft = {
  row: number
  emailText: string
  values: Partial<Record<ImportFieldKey, string | number>>
  errors: string[]
  warnings: string[]
}

const EMPLOYEE_FIELDS = IMPORT_FIELDS.filter(f => f.table === 'employee' && f.key !== 'manager')
const PRIVATE_FIELDS = IMPORT_FIELDS.filter(f => f.table === 'private')

const nameKey = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const isBlank = (value: unknown) => value === null || value === undefined || value === ''

/** Maps "dublin" to the spelling already in use ("Dublin"), so a change of case does not create a second area. */
function spellings(values: Iterable<string | number | null | undefined>): Map<string, string> {
  const map = new Map<string, string>()
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && !map.has(nameKey(value))) map.set(nameKey(value), value.trim())
  }
  return map
}

/** What the file wants to store, restricted to the given fields and keyed by database column. */
function wantedColumns(draft: Draft, fields: ImportField[], spelled: Partial<Record<ImportFieldKey, Map<string, string>>>): StoredRow {
  const wanted: StoredRow = {}
  for (const field of fields) {
    const value = draft.values[field.key]
    if (value === undefined || !field.column) continue
    const known = spelled[field.key]
    wanted[field.column] = known && typeof value === 'string' ? (known.get(nameKey(value)) ?? value) : value
  }
  return wanted
}

/** First/last name come from their own columns, or from a single full-name column split at the first space. */
function nameColumns(draft: Draft): StoredRow {
  const { first_name, last_name, full_name } = draft.values
  const parts = first_name !== undefined || last_name !== undefined
    ? { first_name: first_name === undefined ? '' : String(first_name), last_name: last_name === undefined ? '' : String(last_name) }
    : splitName(full_name === undefined ? '' : String(full_name))
  const names: StoredRow = {}
  if (parts.first_name) names.first_name = parts.first_name
  if (parts.last_name) names.last_name = parts.last_name
  return names
}

/** Columns that would change. Fill mode only touches blanks; neither mode ever replaces a value with an empty cell. */
function changedColumns(current: StoredRow | undefined, wanted: StoredRow, mode: ImportMode): StoredRow {
  const changes: StoredRow = {}
  for (const [column, value] of Object.entries(wanted)) {
    const existing = current?.[column]
    const empty = isBlank(existing)
    if (mode === 'fill' && !empty) continue
    const same = typeof value === 'number' ? !empty && Number(existing) === value : existing === value
    if (!same) changes[column] = value
  }
  return changes
}

function listForNote(values: Set<string>): string {
  const all = [...values].sort((a, b) => a.localeCompare(b, 'en-IE'))
  const shown = all.slice(0, NAMES_IN_NOTE).join(', ')
  return all.length > NAMES_IN_NOTE ? `${shown} and ${all.length - NAMES_IN_NOTE} more` : shown
}

export function planImport(sheet: SheetData, mapping: ColumnMapping, mode: ImportMode, ctx: PlanContext): ImportPlan {
  const mapped = mapping.flatMap((key, col) => (key ? [{ col, field: FIELD_BY_KEY[key] }] : []))
  const mappedKeys = new Set(mapped.map(m => m.field.key))
  const sampleFields = IMPORT_FIELDS.filter(f => mappedKeys.has(f.key)).map(f => f.key)
  const privateFields = PRIVATE_FIELDS.filter(f => mappedKeys.has(f.key))

  // ---- Pass 1: read every row on its own ---------------------------------
  const drafts: Draft[] = []
  let skipped = 0
  for (const sheetRow of sheet.rows) {
    const draft: Draft = { row: sheetRow.n, emailText: '', values: {}, errors: [], warnings: [] }
    let anything = false
    let emailBlank = false
    for (const { col, field } of mapped) {
      const text = sheetRow.cells[col] ?? ''
      if (field.key === 'email') {
        draft.emailText = text.slice(0, 80)
        emailBlank = text === ''
      }
      const parsed = parseFieldValue(field, text, ctx.today)
      if (parsed.status === 'blank') continue
      anything = true
      if (parsed.status === 'ok') draft.values[field.key] = parsed.value
      else if (field.lenient) draft.warnings.push(`${parsed.message}, so it was left out`)
      else draft.errors.push(parsed.message)
    }
    // Rows with nothing in any mapped column, and the template's example row, are not people.
    if (!anything || draft.values.email === TEMPLATE_EXAMPLE_EMAIL) {
      skipped++
      continue
    }
    if (emailBlank) draft.errors.push('No work email. Every row needs one so HR Locker knows who it is about')
    drafts.push(draft)
  }

  // ---- Indexes across rows -----------------------------------------------
  const existingByEmail = new Map(ctx.employees.map(e => [e.email, e]))
  const firstRowOfEmail = new Map<string, number>()
  for (const draft of drafts) {
    const email = draft.values.email as string | undefined
    if (!email) continue
    const first = firstRowOfEmail.get(email)
    if (first === undefined) firstRowOfEmail.set(email, draft.row)
    else draft.errors.push(`Same work email as row ${first}. Only the first is used`)
  }

  const knownEmails = new Set(ctx.employees.map(e => e.email))
  const peopleByName = new Map<string, Set<string>>()
  const addPerson = (name: string, email: string) => {
    const key = nameKey(name)
    if (!key) return
    peopleByName.set(key, (peopleByName.get(key) ?? new Set()).add(email))
  }
  for (const e of ctx.employees) addPerson(`${e.first_name ?? ''} ${e.last_name ?? ''}`, e.email)
  for (const draft of drafts) {
    const email = draft.values.email as string | undefined
    if (!email || draft.errors.length > 0) continue
    knownEmails.add(email)
    const names = nameColumns(draft)
    addPerson(`${names.first_name ?? ''} ${names.last_name ?? ''}`, email)
  }

  const employeeNoOwner = new Map<string, string>()
  for (const e of ctx.employees) if (typeof e.employee_no === 'string' && e.employee_no) employeeNoOwner.set(e.employee_no, e.email)

  const spelled = {
    area: spellings([...AREA_OPTIONS, SENIOR_MANAGEMENT_AREA, ...ctx.employees.map(e => e.area)]),
    job_title: spellings([...TITLE_OPTIONS, ...ctx.employees.map(e => e.job_title)]),
  }
  const newAreas = new Set<string>()
  const newTitles = new Set<string>()

  function resolveManager(text: string, self: string): { email: string } | { warning: string } {
    const shown = text.length > 40 ? `${text.slice(0, 37)}…` : text
    let email: string | null = null
    if (text.includes('@')) {
      email = text.replace(/^mailto:/i, '').trim().toLowerCase()
      if (!isEmail(email)) return { warning: `Line manager “${shown}” is not a valid email address, so no manager was set` }
      if (!knownEmails.has(email)) {
        return { warning: `Line manager ${email} is not in HR Locker yet, so no manager was set. Add them first, then import again` }
      }
    } else {
      const reversed = /^([^,]+),([^,]+)$/.exec(text)
      const matches = peopleByName.get(nameKey(text)) ?? (reversed ? peopleByName.get(nameKey(`${reversed[2]} ${reversed[1]}`)) : undefined)
      if (!matches) return { warning: `Line manager “${shown}” was not found. Use their work email instead` }
      if (matches.size > 1) return { warning: `Line manager “${shown}” matches more than one person. Use their work email instead` }
      email = [...matches][0]
    }
    return email === self ? { warning: 'Someone cannot be their own line manager, so no manager was set' } : { email }
  }

  // ---- Pass 2: plan each row -------------------------------------------------
  const rows: PlannedRow[] = []
  const counts: ImportCounts = { created: 0, updated: 0, unchanged: 0, skipped, errors: 0, warnings: 0 }

  for (const draft of drafts) {
    const email = draft.values.email as string | undefined
    if (email && draft.errors.length === 0) {
      const existing = existingByEmail.get(email)
      const names = nameColumns(draft)
      if (!existing && !names.first_name) {
        draft.errors.push('A new person needs a name. Map the First name and Last name columns (or Full name)')
      }

      const wantedEmployee = { ...names, ...wantedColumns(draft, EMPLOYEE_FIELDS, spelled) }
      const wantedPrivate = wantedColumns(draft, privateFields, spelled)

      const managerText = draft.values.manager === undefined ? null : String(draft.values.manager)
      if (managerText) {
        const manager = resolveManager(managerText, email)
        if ('email' in manager) {
          wantedEmployee.manager_email = manager.email
          draft.values.manager = manager.email
        } else {
          draft.warnings.push(manager.warning)
        }
      }

      let employee: StoredRow
      let privateChanges: StoredRow
      if (existing) {
        employee = changedColumns(existing, wantedEmployee, mode)
        privateChanges = changedColumns(ctx.privateRows.get(existing.id), wantedPrivate, mode)
      } else {
        const startsInFuture = typeof wantedEmployee.start_date === 'string' && wantedEmployee.start_date > ctx.today
        employee = {
          first_name: '', last_name: '', employment_status: startsInFuture ? 'pre_start' : 'active', ...wantedEmployee, email,
        }
        privateChanges = wantedPrivate
      }

      // An employee number belongs to one person; a clash would make the database refuse the whole batch.
      const employeeNo = employee.employee_no
      if (typeof employeeNo === 'string') {
        const owner = employeeNoOwner.get(employeeNo)
        if (owner && owner !== email) draft.errors.push(`Employee number ${employeeNo} already belongs to someone else`)
      }

      // The dates a person ends up with must still make sense (this catches day/month mix-ups).
      const finalValue = (column: string) => (employee[column] !== undefined ? employee[column] : existing?.[column])
      const start = finalValue('start_date')
      const end = finalValue('end_date')
      const probation = finalValue('probation_end_date')
      if (typeof start === 'string' && typeof end === 'string' && end < start) draft.errors.push('The end date is before the start date')
      if (typeof start === 'string' && typeof probation === 'string' && probation < start) {
        draft.errors.push('The probation end date is before the start date')
      }

      if (draft.errors.length === 0) {
        if (typeof employeeNo === 'string') employeeNoOwner.set(employeeNo, email)
        if (typeof employee.area === 'string' && !spelled.area.has(nameKey(employee.area))) newAreas.add(employee.area)
        if (typeof employee.job_title === 'string' && !spelled.job_title.has(nameKey(employee.job_title))) newTitles.add(employee.job_title)
        const changed = Object.keys(employee).length > 0 || Object.keys(privateChanges).length > 0
        rows.push({
          row: draft.row,
          email,
          action: !existing ? 'create' : changed ? 'update' : 'unchanged',
          employeeId: existing?.id ?? null,
          employee,
          private: privateChanges,
          hasPrivateRow: !!existing && ctx.privateRows.has(existing.id),
        })
      }
    }
    if (draft.errors.length > 0) counts.errors++
    else if (draft.warnings.length > 0) counts.warnings++
  }
  for (const r of rows) counts[r.action === 'create' ? 'created' : r.action === 'update' ? 'updated' : 'unchanged']++

  const issues: ImportIssue[] = drafts
    .filter(d => d.errors.length > 0 || d.warnings.length > 0)
    .map(d => {
      const names = nameColumns(d)
      return {
        row: d.row,
        email: (d.values.email as string | undefined) ?? d.emailText,
        name: `${names.first_name ?? ''} ${names.last_name ?? ''}`.trim(),
        level: d.errors.length > 0 ? 'error' : 'warning',
        messages: [...d.errors, ...d.warnings],
      }
    })

  const sample: SampleRow[] = drafts.slice(0, SAMPLE_ROWS).map(d => ({
    row: d.row,
    cells: sampleFields.map(key => {
      const value = d.values[key]
      return value === undefined ? '' : displayValue(FIELD_BY_KEY[key], value)
    }),
    level: d.errors.length > 0 ? 'error' : d.warnings.length > 0 ? 'warning' : 'ok',
    messages: [...d.errors, ...d.warnings],
  }))

  const notes: string[] = []
  if (rows.some(r => r.employee.manager_email)) {
    notes.push('People named as a line manager can see their direct reports’ work records in HR Locker (never personal details or pay).')
  }
  if (newAreas.size > 0) {
    notes.push(`New areas in this file: ${listForNote(newAreas)}. Managers see people by the exact area name, so check these are spelled the way you use them.`)
  }
  if (newTitles.size > 0) {
    notes.push(`New job titles in this file: ${listForNote(newTitles)}. Document requirements are matched on the exact job title, so check the spelling.`)
  }

  return { rows, issues, counts, sampleFields, sample, notes }
}

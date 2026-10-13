import type { PeopleViewer } from './access'
import { createAdminClient, fetchAllPages } from './db'
import { IMPORT_FIELDS } from './import-fields'
import type { ExistingEmployee, ImportPlan, PlanContext, PlannedRow, StoredRow } from './import-plan'
import type { ImportCounts, ImportIssue } from './import-shared'
import { todayIso } from './format'

// Reads what HR Locker already holds (so a file can be compared with it) and
// writes an import plan in batches. Server only: uses the service-role client,
// so every caller must have passed authorize('import.run') first.

export const BATCH_SIZE = 200
const CONCURRENCY = 8

const EMPLOYEE_COLUMNS = IMPORT_FIELDS.flatMap(f => (f.table === 'employee' && f.column ? [f.column] : []))

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/** Runs `work` over every item with at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

type DbError = { code?: string; message: string }

/** Logs the real error (never the row values) and returns wording that is safe to show. */
function writeFailure(context: string, error: DbError): string {
  if (error.code === '23505') {
    if (error.message.includes('employee_no')) return 'That employee number is already used by someone else'
    if (error.message.includes('email')) return 'Someone added this person a moment ago. Import again to update them'
    return 'This would duplicate an existing record'
  }
  console.error(`import: ${context} failed`, error.code, error.message)
  return 'Could not be saved. Please try again'
}

/** Everything the planner needs to compare a file with the current records, or null if it could not be read. */
export async function loadPlanContext(privateColumns: string[]): Promise<PlanContext | null> {
  const admin = createAdminClient()
  const employees = await fetchAllPages<ExistingEmployee>((from, to) =>
    admin
      .from('hr_employees')
      .select(`id, ${EMPLOYEE_COLUMNS.join(', ')}`)
      .order('id')
      .range(from, to)
      .returns<ExistingEmployee[]>()
  )
  if (employees.error) {
    console.error('import: loading employees failed', employees.error.message)
    return null
  }

  const privateRows = new Map<string, StoredRow>()
  if (privateColumns.length > 0) {
    const rows = await fetchAllPages<StoredRow & { employee_id: string }>((from, to) =>
      admin
        .from('hr_employee_private')
        .select(`employee_id, ${privateColumns.join(', ')}`)
        .order('employee_id')
        .range(from, to)
        .returns<(StoredRow & { employee_id: string })[]>()
    )
    if (rows.error) {
      console.error('import: loading personal details failed', rows.error.message)
      return null
    }
    for (const row of rows.data) privateRows.set(row.employee_id, row)
  }
  return { employees: employees.data, privateRows, today: todayIso() }
}

const blankColumns = (columns: string[]): StoredRow => Object.fromEntries(columns.map(c => [c, null]))

/**
 * Writes the planned rows in batches of 200 and returns the final counts and
 * issues. A row only counts as saved if its main write worked; if only the
 * personal details failed the row is saved with a warning. Nothing is deleted.
 */
export async function commitPlan(
  viewer: Pick<PeopleViewer, 'email'>,
  plan: ImportPlan,
  privateColumns: string[],
): Promise<{ counts: ImportCounts; issues: ImportIssue[] }> {
  const admin = createAdminClient()
  const counts: ImportCounts = { ...plan.counts }
  const issues = plan.issues.map(i => ({ ...i, messages: [...i.messages] }))
  const issueByRow = new Map(issues.map(i => [i.row, i]))

  function report(row: PlannedRow, level: ImportIssue['level'], message: string) {
    let issue = issueByRow.get(row.row)
    if (!issue) {
      issue = { row: row.row, email: row.email, name: '', level: 'warning', messages: [] }
      issueByRow.set(row.row, issue)
      issues.push(issue)
      counts.warnings++
    }
    issue.messages.push(message)
    if (level === 'error') {
      if (issue.level === 'warning') {
        issue.level = 'error'
        counts.warnings--
        counts.errors++
      }
      counts[row.action === 'create' ? 'created' : 'updated']--
    }
  }

  async function writeNewPeople(rows: PlannedRow[]) {
    const toRow = (r: PlannedRow) => ({
      ...blankColumns(EMPLOYEE_COLUMNS), ...r.employee, source: 'import', created_by: viewer.email, updated_by: viewer.email,
    })
    const ids = new Map<string, string>()
    const bulk = await admin.from('hr_employees').insert(rows.map(toRow)).select('id, email').returns<{ id: string; email: string }[]>()
    if (!bulk.error) {
      for (const saved of bulk.data) ids.set(saved.email, saved.id)
    } else {
      // The whole batch is refused when one row is bad, so retry one at a time to reject only that row.
      await runPool(rows, CONCURRENCY, async r => {
        const one = await admin.from('hr_employees').insert(toRow(r)).select('id').single<{ id: string }>()
        if (one.error) report(r, 'error', writeFailure('add person', one.error))
        else ids.set(r.email, one.data.id)
      })
    }

    const withDetails = rows.filter(r => ids.has(r.email) && Object.keys(r.private).length > 0)
    if (withDetails.length === 0) return
    const toPrivate = (r: PlannedRow) => ({
      ...blankColumns(privateColumns), ...r.private, employee_id: ids.get(r.email), updated_by: viewer.email,
    })
    const detailsFailed = 'Added, but the personal details could not be saved. Import again to add them'
    const bulkDetails = await admin.from('hr_employee_private').insert(withDetails.map(toPrivate))
    if (!bulkDetails.error) return
    console.error('import: personal details batch failed', bulkDetails.error.code, bulkDetails.error.message)
    await runPool(withDetails, CONCURRENCY, async r => {
      const one = await admin.from('hr_employee_private').insert(toPrivate(r))
      if (one.error) {
        console.error('import: personal details failed', one.error.code, one.error.message)
        report(r, 'warning', detailsFailed)
      }
    })
  }

  async function writeChanges(rows: PlannedRow[]) {
    await runPool(rows, CONCURRENCY, async r => {
      if (!r.employeeId) return
      const hasCore = Object.keys(r.employee).length > 0
      if (hasCore) {
        const { error } = await admin.from('hr_employees').update({ ...r.employee, updated_by: viewer.email }).eq('id', r.employeeId)
        if (error) return report(r, 'error', writeFailure('update person', error))
      }
      if (Object.keys(r.private).length === 0) return
      const { error } = r.hasPrivateRow
        ? await admin.from('hr_employee_private').update({ ...r.private, updated_by: viewer.email }).eq('employee_id', r.employeeId)
        : await admin.from('hr_employee_private').insert({ employee_id: r.employeeId, ...r.private, updated_by: viewer.email })
      if (error) {
        console.error('import: personal details update failed', error.code, error.message)
        report(r, hasCore ? 'warning' : 'error', 'Personal details could not be saved. Import again to retry')
      }
    })
  }

  for (const batch of chunk(plan.rows.filter(r => r.action !== 'unchanged'), BATCH_SIZE)) {
    const created = batch.filter(r => r.action === 'create')
    if (created.length > 0) await writeNewPeople(created)
    await writeChanges(batch.filter(r => r.action === 'update'))
  }

  issues.sort((a, b) => a.row - b.row)
  return { counts, issues }
}

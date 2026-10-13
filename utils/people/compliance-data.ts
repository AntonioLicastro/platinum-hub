import { canOnEmployee, type PeopleViewer } from './access'
import { createAdminClient, fetchAllPages, fetchByIds } from './db'
import { daysBetween, expiryState, fullName } from './format'
import type { DocumentType, Employee, EmployeeDocument } from './types'

// Compliance rules live here and nowhere else (dashboard, directory, reports,
// my-space and the Documents tab all read through these functions).
//
// A document type applies to an employee when it is active and either has no
// job-title restriction or lists the employee's title. Only MANDATORY types make
// up the "required" set; optional types are shown on the employee's Documents tab
// but never count as missing. For each (employee, type) slot the current document
// is the non-rejected one that expires last, and its state is worked out from
// that document alone.

export type ComplianceState = 'valid' | 'expiring' | 'expired' | 'pending' | 'rejected' | 'missing'

export type ComplianceItem = {
  documentType: DocumentType
  /** Current document for the slot (rejected one when that is all there is), or null when none is on file. */
  document: EmployeeDocument | null
  state: ComplianceState
  /** Days until expiry (negative = overdue); null when there is no expiry date. */
  daysToExpiry: number | null
}

// ---- Loading ---------------------------------------------------------------

/** Every document type, active or not, in display order. */
export async function listDocumentTypes(): Promise<DocumentType[]> {
  const admin = createAdminClient()
  const { data, error } = await fetchAllPages<DocumentType>((from, to) =>
    admin
      .from('hr_document_types')
      .select('*')
      .order('sort_order')
      .order('name')
      .order('id')
      .range(from, to)
      .returns<DocumentType[]>()
  )
  // A silent empty list would read as "no requirements", so fail loudly instead.
  if (error) {
    console.error('listDocumentTypes failed', error.message)
    throw new Error('Could not load document types')
  }
  return data
}

// The reference number, notes and file details are for HR and the employee only
// (the documents.download capability). Every bulk compliance view (matrix,
// dashboard, reports, directory, a manager's team) needs only status and dates, so
// those queries leave the sensitive columns out and they come back as null: a
// manager's request never loads them, and a template can't show them by mistake.
const STATUS_COLUMNS =
  'id, employee_id, document_type_id, title, issued_on, expires_on, status, verified_by, verified_at, uploaded_by, created_at, updated_at'
type DetailKey = 'file_path' | 'file_name' | 'mime_type' | 'file_size' | 'reference_no' | 'notes'
const NO_DETAILS: Pick<EmployeeDocument, DetailKey> = {
  file_path: null, file_name: null, mime_type: null, file_size: null, reference_no: null, notes: null,
}
type LoadedDocument = Omit<EmployeeDocument, DetailKey> & Partial<Pick<EmployeeDocument, DetailKey>>

async function loadDocumentsByEmployee(employeeIds: string[], includeDetails: boolean): Promise<Map<string, EmployeeDocument[]>> {
  const byEmployee = new Map<string, EmployeeDocument[]>()
  const ids = [...new Set(employeeIds)]
  if (ids.length === 0) return byEmployee
  const admin = createAdminClient()
  // Chunked so the .in() list can't overflow the URL, and paged inside each chunk
  // so a chunk with more than 1000 documents isn't silently truncated.
  const { data, error } = await fetchByIds<LoadedDocument>(ids, chunk =>
    fetchAllPages<LoadedDocument>((from, to) =>
      admin
        .from('hr_documents')
        .select(includeDetails ? '*' : STATUS_COLUMNS)
        .in('employee_id', chunk)
        .order('id')
        .range(from, to)
        .returns<LoadedDocument[]>()
    )
  )
  if (error) {
    console.error('loadDocumentsByEmployee failed', error.message)
    throw new Error('Could not load documents')
  }
  for (const row of data) {
    const doc: EmployeeDocument = { ...NO_DETAILS, ...row }
    const list = byEmployee.get(doc.employee_id)
    if (list) list.push(doc)
    else byEmployee.set(doc.employee_id, [doc])
  }
  return byEmployee
}

/**
 * All of one employee's documents, newest first. The caller must already have
 * authorised access. `includeDetails` loads the reference number, notes and file
 * details: pass true only for a viewer who holds documents.download for this person.
 */
export async function listEmployeeDocuments(employeeId: string, includeDetails: boolean): Promise<EmployeeDocument[]> {
  const docs = (await loadDocumentsByEmployee([employeeId], includeDetails)).get(employeeId) ?? []
  return docs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

// ---- Rules -----------------------------------------------------------------

const normalise = (s: string) => s.trim().toLowerCase()

function typeAppliesTo(type: DocumentType, jobTitle: string | null): boolean {
  if (!type.active) return false
  if (type.applies_to_titles.length === 0) return true
  if (!jobTitle) return false
  const title = normalise(jobTitle)
  return type.applies_to_titles.some(t => normalise(t) === title)
}

// Without an expiry date a document never lapses, so for types that don't
// track expiry it outranks any dated one. For types that do, it ranks last.
const NEVER_EXPIRES = '9999-12-31'

/** Negative when `a` is the better candidate for "current document". */
function compareCandidates(a: EmployeeDocument, b: EmployeeDocument, type: DocumentType): number {
  const missingRank = type.requires_expiry ? '' : NEVER_EXPIRES
  const rankA = a.expires_on ?? missingRank
  const rankB = b.expires_on ?? missingRank
  if (rankA !== rankB) return rankA < rankB ? 1 : -1
  // Same expiry: a checked document beats one still waiting, then the newest upload wins.
  if ((a.status === 'verified') !== (b.status === 'verified')) return a.status === 'verified' ? -1 : 1
  return Date.parse(b.created_at) - Date.parse(a.created_at)
}

function resolveSlot(type: DocumentType, docs: EmployeeDocument[]): ComplianceItem {
  const live = docs.filter(d => d.status !== 'rejected')
  if (live.length === 0) {
    const newestRejected = docs.reduce<EmployeeDocument | null>(
      (best, d) => (!best || Date.parse(d.created_at) > Date.parse(best.created_at) ? d : best),
      null
    )
    return { documentType: type, document: newestRejected, state: newestRejected ? 'rejected' : 'missing', daysToExpiry: null }
  }

  const document = live.reduce((best, d) => (compareCandidates(d, best, type) < 0 ? d : best))
  const daysToExpiry = document.expires_on ? daysBetween(document.expires_on) : null
  const expiry = expiryState(document.expires_on, type.reminder_days)

  let state: ComplianceState
  if (type.requires_expiry && expiry === 'none') state = 'pending' // HR still has to fill in the expiry date
  else if (expiry === 'expired') state = 'expired'
  else if (document.status === 'pending') state = 'pending'
  else state = expiry === 'expiring' ? 'expiring' : 'valid'

  return { documentType: type, document, state, daysToExpiry }
}

/**
 * One slot per applicable type. `types` should already be in display order.
 * Pass includeOptional to also get the non-mandatory types (the Documents tab does).
 */
export function buildComplianceItems(
  employee: Pick<Employee, 'job_title'>,
  types: DocumentType[],
  docs: EmployeeDocument[],
  includeOptional = false,
): ComplianceItem[] {
  const byType = new Map<number, EmployeeDocument[]>()
  for (const doc of docs) {
    if (doc.document_type_id === null) continue
    const list = byType.get(doc.document_type_id)
    if (list) list.push(doc)
    else byType.set(doc.document_type_id, [doc])
  }
  return types
    .filter(t => typeAppliesTo(t, employee.job_title) && (includeOptional || t.mandatory))
    .map(t => resolveSlot(t, byType.get(t.id) ?? []))
}

// ---- Public API ------------------------------------------------------------

/** Required (mandatory + applicable to the employee's job title) document slots and their state. */
export async function getEmployeeCompliance(employee: Employee): Promise<ComplianceItem[]> {
  const [types, docs] = await Promise.all([listDocumentTypes(), loadDocumentsByEmployee([employee.id], false)])
  return buildComplianceItems(employee, types, docs.get(employee.id) ?? [])
}

/** Required slots for many employees at once, keyed by employee id. Two query sets in total, however many people. */
export async function getComplianceItems(employees: Employee[]): Promise<Map<string, ComplianceItem[]>> {
  const items = new Map<string, ComplianceItem[]>()
  if (employees.length === 0) return items
  const [types, docs] = await Promise.all([listDocumentTypes(), loadDocumentsByEmployee(employees.map(e => e.id), false)])
  for (const employee of employees) {
    items.set(employee.id, buildComplianceItems(employee, types, docs.get(employee.id) ?? []))
  }
  return items
}

export type ComplianceSummary = {
  required: number
  valid: number
  expiring: number
  expired: number
  pending: number
  missing: number
  /** 0-100: share of required items that are valid or expiring-but-still-valid. */
  score: number
}

export function summariseCompliance(items: ComplianceItem[]): ComplianceSummary {
  const summary: ComplianceSummary = { required: items.length, valid: 0, expiring: 0, expired: 0, pending: 0, missing: 0, score: 100 }
  for (const item of items) {
    // A rejected document leaves nothing acceptable on file, which is the same as missing.
    if (item.state === 'rejected') summary.missing += 1
    else summary[item.state] += 1
  }
  if (summary.required > 0) summary.score = Math.round(((summary.valid + summary.expiring) / summary.required) * 100)
  return summary
}

/** Per-employee summary keyed by employee id. Efficient for the whole workforce (no N+1). */
export async function getComplianceSummary(employees: Employee[]): Promise<Map<string, ComplianceSummary>> {
  const items = await getComplianceItems(employees)
  return new Map([...items].map(([id, list]) => [id, summariseCompliance(list)]))
}

export type DocumentAlert = {
  employee: Employee
  documentType: DocumentType
  document: EmployeeDocument | null
  state: 'expiring' | 'expired' | 'missing'
  expiresOn: string | null
}

/**
 * Turns already-loaded slots into alerts, most urgent first: expired (longest
 * overdue first), then expiring within `withinDays` (soonest first), then
 * missing or rejected. Dates decide expired/expiring whatever the review
 * status; a document still awaiting a check is not "missing".
 */
export function alertsFromItems(
  employees: Employee[],
  itemsByEmployee: Map<string, ComplianceItem[]>,
  withinDays: number,
): DocumentAlert[] {
  const expired: DocumentAlert[] = []
  const expiring: DocumentAlert[] = []
  const missing: DocumentAlert[] = []

  for (const employee of employees) {
    for (const item of itemsByEmployee.get(employee.id) ?? []) {
      const base = { employee, documentType: item.documentType, document: item.document }
      if (item.state === 'missing' || item.state === 'rejected') {
        missing.push({ ...base, state: 'missing', expiresOn: null })
      } else if (item.document?.expires_on && item.daysToExpiry !== null) {
        const expiresOn = item.document.expires_on
        if (item.daysToExpiry < 0) expired.push({ ...base, state: 'expired', expiresOn })
        else if (item.daysToExpiry <= withinDays) expiring.push({ ...base, state: 'expiring', expiresOn })
      }
    }
  }

  const byExpiry = (a: DocumentAlert, b: DocumentAlert) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '')
  const byPerson = (a: DocumentAlert, b: DocumentAlert) =>
    fullName(a.employee).localeCompare(fullName(b.employee)) || a.documentType.sort_order - b.documentType.sort_order
  return [...expired.sort(byExpiry), ...expiring.sort(byExpiry), ...missing.sort(byPerson)]
}

/** Expired, expiring within `withinDays`, and missing required documents, soonest/most urgent first. Leavers are excluded. */
export async function listDocumentAlerts(viewer: PeopleViewer, employees: Employee[], withinDays = 30): Promise<DocumentAlert[]> {
  const eligible = employees.filter(e => e.employment_status !== 'leaver' && canOnEmployee(viewer, 'documents.view', e))
  return alertsFromItems(eligible, await getComplianceItems(eligible), withinDays)
}

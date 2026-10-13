import { summariseCompliance, type ComplianceItem } from './compliance-data'
import { DOCUMENT_CATEGORIES, labelOf } from './constants'
import { displayName } from './format'
import { emptyResult, percentOf } from './report-core'
import { formatPercent, plural } from './report-format'
import type { Cell, ReportResult } from './report-types'
import type { DocumentType, Employee } from './types'

// Compliance by document type. The states come from compliance-data (the one
// place the rules live), computed for everybody in two query sets by the
// loader, so the report agrees with the Compliance page and the directory.

type Slot = { employee: Employee; item: ComplianceItem }

const ISSUE_ORDER = { expired: 0, expiring: 1, missing: 2, rejected: 2, valid: 3, pending: 3 } as const

const ISSUE_LABELS: Partial<Record<ComplianceItem['state'], string>> = {
  expired: 'Expired', expiring: 'Expiring soon', missing: 'Missing', rejected: 'Rejected, needs replacing',
}

const scoreTone = (score: number) => (score >= 90 ? 'green' : score >= 70 ? 'amber' : 'red')

/** `employees` are the current staff the viewer may see documents for; `itemsByEmployee` their required slots. */
export function buildCompliance(employees: readonly Employee[], itemsByEmployee: ReadonlyMap<string, ComplianceItem[]>): ReportResult {
  if (employees.length === 0) {
    return emptyResult('compliance', 'No current staff to check yet', 'Reports fill in as employee records and start dates are added.')
  }
  const slots: Slot[] = employees.flatMap(employee => (itemsByEmployee.get(employee.id) ?? []).map(item => ({ employee, item })))
  if (slots.length === 0) {
    return emptyResult(
      'compliance', 'No required documents set up yet',
      'Compliance is tracked against the document types marked as required. Set some up, and make sure people have the job titles they apply to.',
    )
  }

  const byType = new Map<number, { type: DocumentType; items: ComplianceItem[] }>()
  for (const { item } of slots) {
    const entry = byType.get(item.documentType.id) ?? { type: item.documentType, items: [] }
    entry.items.push(item)
    byType.set(item.documentType.id, entry)
  }
  const types = [...byType.values()]
    .sort((a, b) => a.type.sort_order - b.type.sort_order || a.type.name.localeCompare(b.type.name))
    .map(({ type, items }) => ({ type, summary: summariseCompliance(items) }))
  const overall = summariseCompliance(slots.map(s => s.item))

  const attention = slots
    .filter(s => ISSUE_LABELS[s.item.state] !== undefined)
    .sort((a, b) =>
      ISSUE_ORDER[a.item.state] - ISSUE_ORDER[b.item.state]
      || (a.item.document?.expires_on ?? '').localeCompare(b.item.document?.expires_on ?? '')
      || displayName(a.employee).localeCompare(displayName(b.employee))
      || a.item.documentType.sort_order - b.item.documentType.sort_order)

  return {
    id: 'compliance',
    empty: null,
    notices: [],
    stats: [
      {
        label: 'Compliance score', value: `${overall.score}%`, tone: scoreTone(overall.score), icon: 'document',
        hint: `${overall.valid + overall.expiring} of ${plural(overall.required, 'required document', 'required documents')} in date`,
      },
      { label: 'Expired', value: String(overall.expired), tone: overall.expired > 0 ? 'red' : 'green', icon: 'alert', hint: `${overall.expiring} more expiring soon` },
      {
        label: 'Missing', value: String(overall.missing), tone: overall.missing > 0 ? 'amber' : 'green', icon: 'document',
        hint: `${plural(overall.pending, 'document is', 'documents are')} awaiting a check`,
      },
    ],
    charts: [
      {
        kind: 'stacked',
        title: 'Where each required document stands',
        description: 'Current staff, one bar per required document type.',
        segments: [
          { name: 'Valid', tone: 'green' }, { name: 'Expiring soon', tone: 'amber' }, { name: 'Expired', tone: 'red' },
          { name: 'Awaiting check', tone: 'sky' }, { name: 'Missing', tone: 'gray' },
        ],
        rows: types.map(({ type, summary }) => ({
          label: type.name, values: [summary.valid, summary.expiring, summary.expired, summary.pending, summary.missing],
        })),
      },
    ],
    tables: [
      {
        id: 'by-type',
        title: 'Compliance by document type',
        columns: [
          { label: 'Document' }, { label: 'Category' }, { label: 'Required for', kind: 'integer' }, { label: 'Valid', kind: 'integer' },
          { label: 'Expiring soon', kind: 'integer' }, { label: 'Expired', kind: 'integer' }, { label: 'Awaiting check', kind: 'integer' },
          { label: 'Missing or rejected', kind: 'integer' }, { label: 'In date (%)', kind: 'percent' },
        ],
        rows: [
          ...types.map(({ type, summary }): Cell[] => [
            type.name, labelOf(DOCUMENT_CATEGORIES, type.category), summary.required, summary.valid, summary.expiring,
            summary.expired, summary.pending, summary.missing, summary.score,
          ]),
          ['All required documents', null, overall.required, overall.valid, overall.expiring, overall.expired, overall.pending, overall.missing, overall.score],
        ],
        emptyText: 'No required documents yet.',
        hasTotalRow: true,
      },
      {
        id: 'attention',
        title: 'Documents that need attention',
        description: 'Expired first, then expiring soonest, then missing. Open a name to fix it.',
        columns: [
          { label: 'Employee' }, { label: 'Area' }, { label: 'Document' }, { label: 'Issue' }, { label: 'Expiry date', kind: 'date' },
        ],
        rows: attention.map(({ employee, item }) => [
          displayName(employee), employee.area, item.documentType.name, ISSUE_LABELS[item.state] ?? '', item.document?.expires_on ?? null,
        ]),
        rowHrefs: attention.map(({ employee }) => `/employees/${employee.id}`),
        emptyText: 'Every required document is in date or awaiting a check.',
        displayLimit: 25,
      },
    ],
    method: [
      'A document type counts when it is active, marked as required, and applies to the person’s job title. Leavers are not included.',
      'Valid means in date and checked. Expiring soon is within that document type’s reminder window. Awaiting check means uploaded but not yet verified, or missing its expiry date.',
      `Missing includes rejected documents, which leave nothing acceptable on file. “In date” is valid plus expiring soon, as a share of what is required (${formatPercent(percentOf(overall.valid + overall.expiring, overall.required) ?? 0)} overall).`,
    ],
  }
}

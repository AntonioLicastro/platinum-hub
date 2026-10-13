import type { ImportFieldKey } from './import-fields'

// Limits and response shapes shared by the import route and the browser wizard.
// No server-only imports: client components use this file.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
export const IMPORT_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const

export type ImportMode = 'fill' | 'overwrite'
export const IMPORT_MODES: readonly ImportMode[] = ['fill', 'overwrite']

/** One entry per spreadsheet column, in order: the field it feeds, or null to ignore the column. */
export type ColumnMapping = (ImportFieldKey | null)[]

type IssueLevel = 'error' | 'warning'

/** A problem with one spreadsheet row. `row` is the row number as shown in Excel (the heading row is row 1). */
export type ImportIssue = {
  row: number
  email: string
  name: string
  level: IssueLevel
  messages: string[]
}

export type ImportCounts = {
  /** People added (preview: that would be added). */
  created: number
  /** Existing people with at least one value changed. */
  updated: number
  /** Existing people whose record already matches the file. */
  unchanged: number
  /** Rows with nothing in any mapped column. */
  skipped: number
  /** Rows that cannot be imported until fixed. */
  errors: number
  /** Rows imported with something to double-check. */
  warnings: number
}

export type SampleRow = {
  row: number
  /** Display text, one entry per `sampleFields` column. PPS numbers are masked. */
  cells: string[]
  level: 'ok' | IssueLevel
  messages: string[]
}

export type PreviewData = {
  fileName: string
  sheetName: string | null
  sheetCount: number
  headers: string[]
  /** A few example values per column (PPS-like values masked) to help choose the right field. */
  columnSamples: string[][]
  /** What the headings matched automatically. */
  suggested: ColumnMapping
  /** The mapping this preview was built with. */
  mapping: ColumnMapping
  totalRows: number
  counts: ImportCounts
  sampleFields: ImportFieldKey[]
  sample: SampleRow[]
  /** The first problems found; `issueTotal` is how many rows have one. */
  issues: ImportIssue[]
  issueTotal: number
  notes: string[]
}

export type CommitData = {
  counts: ImportCounts
  issues: ImportIssue[]
}

export type ImportResponse<T> = ({ ok: true } & T) | { ok: false; error: string }

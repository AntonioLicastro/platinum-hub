import type { Tone } from './constants'

// Plain, serialisable shapes produced by the report calculations. The Reports
// page renders them as stats, charts and tables, and the CSV export writes the
// very same tables, so the two can never disagree.

export type ReportId = 'workforce' | 'movement' | 'turnover' | 'tenure' | 'leave' | 'compliance' | 'reviews'

/** One table cell: text, a number, or null for "not recorded". */
export type Cell = string | number | null

/**
 * How a cell is shown on screen. The CSV always carries the raw value, so put
 * the unit in the column label ("Turnover (%)", "Average tenure (months)").
 */
export type ColumnKind = 'text' | 'integer' | 'decimal' | 'change' | 'percent' | 'months' | 'date'

type ReportColumn = { label: string; kind?: ColumnKind }

export type ReportTable = {
  /** Stable key for the page. */
  id: string
  title: string
  description?: string
  columns: ReportColumn[]
  rows: Cell[][]
  /** Shown instead of the table while there are no rows. */
  emptyText: string
  /** The page shows this many rows and points at the CSV for the rest; the CSV always has them all. */
  displayLimit?: number
  /** The last row is a total and is styled as one. */
  hasTotalRow?: boolean
  /** Same length as rows: a link for the row's first cell (an employee profile), or null. */
  rowHrefs?: (string | null)[]
}

export type StatIcon = 'people' | 'trend' | 'starter' | 'leaver' | 'percent' | 'clock' | 'leave' | 'sick' | 'document' | 'alert'

type StatSpec = { label: string; value: string; hint?: string; tone: Tone; icon: StatIcon }

export type BarItem = {
  label: string
  value: number
  /** Text shown instead of the plain number (for example "12.5%"). */
  display?: string
  note?: string
  tone?: Tone
  /** A validated `#rrggbb` colour, used instead of `tone` (leave types carry their own). */
  color?: string
}

export type ChartSpec =
  | { kind: 'line'; title: string; description?: string; points: { label: string; value: number }[] }
  | { kind: 'bars'; title: string; description?: string; items: BarItem[] }
  | { kind: 'columns'; title: string; description?: string; categories: string[]; series: { name: string; tone: Tone; values: number[] }[] }
  | { kind: 'stacked'; title: string; description?: string; segments: { name: string; tone: Tone }[]; rows: { label: string; values: number[] }[] }

export type ReportResult = {
  id: ReportId
  /** Set when there is nothing to report on yet; the page shows an inviting empty state instead. */
  empty: { title: string; body: string } | null
  /** Data-quality caveats ("12 people have no start date"), shown above the numbers and written into the CSV. */
  notices: string[]
  stats: StatSpec[]
  charts: ChartSpec[]
  tables: ReportTable[]
  /** Plain-English "how this is calculated" bullets. */
  method: string[]
}

/** The filters every report understands. `area` is '' (everyone), AREA_NONE or one of the offered area names. */
export type ReportFilters = { area: string; year: number }

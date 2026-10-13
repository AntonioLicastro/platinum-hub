import { csvCell } from './format'
import type { Cell, ReportResult } from './report-types'

// The CSV for a report: a few lines saying what it is, any data-quality notes,
// then every table (all rows, whatever the page shows) one after another with a
// blank line between. Written from the same ReportResult the page renders.

/** Numbers are written as they are (a leading minus is not a formula); text goes through csvCell. */
function csvValue(cell: Cell): string {
  if (cell === null) return ''
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : ''
  return csvCell(cell)
}

const line = (cells: readonly Cell[]): string => cells.map(csvValue).join(',')

export function reportToCsv(title: string, generatedOn: string, scope: readonly [string, string][], result: ReportResult): string {
  const lines: string[] = [
    line(['Report', title]),
    line(['Generated', generatedOn]),
    ...scope.map(([name, value]) => line([name, value])),
    ...result.notices.map(note => line(['Note', note])),
  ]
  for (const table of result.tables) {
    lines.push('', line([table.title]), line(table.columns.map(c => c.label)), ...table.rows.map(line))
  }
  // The BOM makes Excel read the file as UTF-8, so accents and the euro sign survive.
  return `﻿${lines.join('\r\n')}\r\n`
}

import { csvCell } from './format'
import { IMPORT_FIELDS } from './import-fields'
import type { ImportIssue } from './import-shared'

// CSV text for the import template and the problem report. Cells go through
// csvCell, which neutralises spreadsheet formula injection. The BOM makes Excel
// read the file as UTF-8, so Irish names keep their accents.

const BOM = '﻿'
const row = (cells: unknown[]) => cells.map(csvCell).join(',')

/** Headings are the field labels, followed by one clearly marked example row (which an import skips). */
export function templateCsv(): string {
  const fields = IMPORT_FIELDS.filter(f => f.example !== null)
  return `${BOM}${[row(fields.map(f => f.label)), row(fields.map(f => f.example))].join('\r\n')}\r\n`
}

/** One line per row that was rejected or needs a look, with the row number as Excel shows it. */
export function problemReportCsv(issues: ImportIssue[]): string {
  const lines = [row(['Row in your file', 'Work email', 'Name', 'Result', 'What to fix'])]
  for (const issue of issues) {
    const result = issue.level === 'error' ? 'Not imported' : 'Imported, please check'
    lines.push(row([issue.row, issue.email, issue.name, result, issue.messages.join('. ')]))
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}

import Link from 'next/link'
import { formatCell } from '@/utils/people/report-format'
import type { ColumnKind, ReportTable } from '@/utils/people/report-types'
import { tableClass, TableCard, tdClass, thClass } from '../../_components/ui'

const NUMERIC: ReadonlySet<ColumnKind | undefined> = new Set<ColumnKind>(['integer', 'decimal', 'change', 'percent', 'months'])

/** A report table: the first column is the row header, numbers line up on the right, and the page never shows more than its limit. */
export function DataTable({ table }: { table: ReportTable }) {
  const total = table.rows.length
  const shown = table.displayLimit ? table.rows.slice(0, table.displayLimit) : table.rows
  const headingId = `${table.id}-heading`

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3">
        <h2 id={headingId} className="text-base font-semibold text-slate-900">{table.title}</h2>
        {table.description && <p className="mt-0.5 text-sm text-slate-500">{table.description}</p>}
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center text-sm text-slate-500">
          {table.emptyText}
        </div>
      ) : (
        <>
          <TableCard>
            <table className={tableClass}>
              <caption className="sr-only">{table.title}</caption>
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  {table.columns.map(column => (
                    <th key={column.label} scope="col" className={`${thClass} ${NUMERIC.has(column.kind) ? 'text-right' : ''}`}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((row, r) => {
                  const isTotal = table.hasTotalRow === true && r === total - 1
                  const href = table.rowHrefs?.[r] ?? null
                  return (
                    <tr key={r} className={isTotal ? 'bg-slate-50 font-semibold text-slate-900' : 'transition-colors hover:bg-slate-50/60'}>
                      {row.map((cell, c) => {
                        const column = table.columns[c]
                        const text = cell === null ? null : formatCell(column?.kind, cell)
                        const content = text === null
                          ? <><span aria-hidden="true" className="text-slate-300">–</span><span className="sr-only">Not available</span></>
                          : href && c === 0
                            ? <Link href={href} className="font-medium text-[#323398] hover:underline">{text}</Link>
                            : text
                        if (c === 0) return <th key={c} scope="row" className={`${tdClass} text-left font-medium text-slate-900`}>{content}</th>
                        return (
                          <td key={c} className={`${tdClass} ${NUMERIC.has(column?.kind) ? 'text-right tabular-nums' : ''} ${isTotal ? 'font-semibold text-slate-900' : ''}`}>
                            {content}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableCard>
          {shown.length < total && (
            <p className="mt-2 text-xs text-slate-500">Showing the first {shown.length} of {total}. Download the CSV for the full list.</p>
          )}
        </>
      )}
    </section>
  )
}

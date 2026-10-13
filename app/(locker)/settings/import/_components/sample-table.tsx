import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { FIELD_BY_KEY, type ImportFieldKey } from '@/utils/people/import-fields'
import type { SampleRow } from '@/utils/people/import-shared'
import { TableCard, tableClass, tdClass, thClass } from '../../../_components/ui'

const ROW_TINT = { ok: '', warning: 'bg-amber-50/60', error: 'bg-red-50/60' } as const

function Status({ row }: { row: SampleRow }) {
  if (row.level === 'ok') {
    return <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={14} aria-hidden="true" /> Looks good</span>
  }
  const Icon = row.level === 'error' ? XCircle : AlertTriangle
  return (
    <div className={row.level === 'error' ? 'text-red-700' : 'text-amber-800'}>
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Icon size={14} aria-hidden="true" /> {row.level === 'error' ? 'Will not import' : 'Check this'}
      </span>
      <ul className="mt-1 space-y-0.5 text-xs">
        {row.messages.map(message => <li key={message}>{message}</li>)}
      </ul>
    </div>
  )
}

/** The first rows exactly as they will be saved: dates tidied, contract types translated, PPS masked. */
export function SampleTable({ fields, rows }: { fields: ImportFieldKey[]; rows: SampleRow[] }) {
  return (
    <TableCard>
      <table className={tableClass}>
        <thead className="border-b border-slate-100 bg-slate-50/70">
          <tr>
            <th scope="col" className={thClass}>Row</th>
            {fields.map(key => (
              <th key={key} scope="col" className={thClass}>{FIELD_BY_KEY[key].label.replace(/\s*\(.*\)$/, '')}</th>
            ))}
            <th scope="col" className={thClass}>Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(row => (
            <tr key={row.row} className={ROW_TINT[row.level]}>
              <td className={`${tdClass} tabular-nums text-slate-500`}>{row.row}</td>
              {row.cells.map((cell, i) => (
                <td key={fields[i]} className={`${tdClass} min-w-28`}>{cell || <span className="text-slate-300" aria-label="Empty">—</span>}</td>
              ))}
              <td className={`${tdClass} min-w-48`}><Status row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

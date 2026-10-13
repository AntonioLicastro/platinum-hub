import Link from 'next/link'
import type { ComplianceItem } from '@/utils/people/compliance-data'
import { stateLabel } from '@/utils/people/documents-meta'
import { displayName } from '@/utils/people/format'
import type { DocumentType, Employee } from '@/utils/people/types'
import { Avatar, TableCard } from '../../_components/ui'
import { StateChip } from './state-chip'

type MatrixRow = { employee: Employee; items: ComplianceItem[] }

const headCell = 'border-b border-slate-200 bg-slate-50 px-3 py-3 text-center align-bottom text-xs font-semibold leading-snug text-slate-500'

/**
 * People down the side, mandatory document types across the top. Each cell links
 * to that person's Documents tab. Types that don't apply to someone's job title
 * are left blank.
 */
export function ComplianceMatrix({ types, rows }: { types: DocumentType[]; rows: MatrixRow[] }) {
  return (
    <TableCard>
      <table className="w-full min-w-max border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">Required documents for each person. Select a cell to open that person&apos;s documents.</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-slate-500">
              Employee
            </th>
            {types.map(type => (
              <th key={type.id} scope="col" className={`${headCell} min-w-30 max-w-36`}>{type.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ employee, items }) => {
            const name = displayName(employee)
            const href = `/employees/${employee.id}?tab=documents`
            const byType = new Map(items.map(item => [item.documentType.id, item]))
            return (
              <tr key={employee.id} className="group">
                <th scope="row" className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-3 text-left font-normal group-hover:bg-slate-50">
                  <Link href={href} prefetch={false} className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
                    <Avatar name={name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {[employee.job_title, employee.area].filter(Boolean).join(' · ') || 'No role or area recorded'}
                      </span>
                    </span>
                  </Link>
                </th>
                {types.map(type => {
                  const item = byType.get(type.id)
                  return (
                    <td key={type.id} className="border-b border-slate-100 px-3 py-3 text-center group-hover:bg-slate-50">
                      {item ? (
                        <Link
                          href={href}
                          prefetch={false}
                          title={`${type.name}: ${stateLabel(item.state, item.daysToExpiry)}`}
                          aria-label={`${name}, ${type.name}: ${stateLabel(item.state, item.daysToExpiry)}`}
                          className="inline-block rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
                        >
                          <StateChip state={item.state} daysToExpiry={item.daysToExpiry} compact />
                        </Link>
                      ) : (
                        <span className="sr-only">{type.name} does not apply</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableCard>
  )
}

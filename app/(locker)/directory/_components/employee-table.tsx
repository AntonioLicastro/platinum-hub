import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, labelOf } from '@/utils/people/constants'
import { profileCompleteness } from '@/utils/people/completeness'
import { completenessTone, tenureText } from '@/utils/people/directory-format'
import { directoryHref, type DirectoryFilters, type DirectorySort } from '@/utils/people/directory-query'
import { displayName, formatDate } from '@/utils/people/format'
import type { Employee } from '@/utils/people/types'
import { Avatar, Badge, NotRecorded, ProgressBar, tableClass, tdClass, thClass } from '../../_components/ui'

type Direction = 'ascending' | 'descending'

/** A column header that is also a link: first click applies `first`, the next click flips to `second`. */
function SortTh({ label, first, second, firstDirection, filters }: {
  label: string
  first: DirectorySort
  second: DirectorySort
  firstDirection: Direction
  filters: DirectoryFilters
}) {
  const direction: Direction | null =
    filters.sort === first ? firstDirection
      : filters.sort === second ? (firstDirection === 'ascending' ? 'descending' : 'ascending')
        : null
  const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown
  return (
    <th scope="col" aria-sort={direction ?? 'none'} className={thClass}>
      <Link
        href={directoryHref(filters, { sort: filters.sort === first ? second : first })}
        className={`inline-flex items-center gap-1.5 rounded transition hover:text-[#323398] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
          direction ? 'text-[#323398]' : ''
        }`}
      >
        {label}
        <Icon size={13} aria-hidden="true" className={direction ? '' : 'text-slate-300'} />
      </Link>
    </th>
  )
}

function EmployeeRow({ employee: e, managerLabels }: { employee: Employee; managerLabels: Map<string, string> }) {
  const name = displayName(e)
  const status = EMPLOYMENT_STATUSES.find(s => s.value === e.employment_status)
  const { percent } = profileCompleteness(e)
  const managerEmail = e.manager_email?.trim().toLowerCase() ?? ''
  const typeLabel = labelOf(EMPLOYMENT_TYPES, e.employment_type)
  const service = tenureText(e)

  return (
    <tr className="relative transition hover:bg-slate-50/80">
      <td className={tdClass}>
        <div className="flex items-center gap-3">
          <Avatar name={name} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/employees/${e.id}`}
              className="block truncate font-medium text-slate-900 after:absolute after:inset-0 after:content-[''] hover:text-[#323398] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#323398]/40"
            >
              {name}
            </Link>
            <span className="block truncate text-xs text-slate-500">{e.email}</span>
          </div>
        </div>
      </td>
      <td className={tdClass}>{e.job_title?.trim() || <NotRecorded label="Not set" />}</td>
      <td className={tdClass}>{e.area?.trim() || <NotRecorded label="Not set" />}</td>
      <td className={tdClass}>{status && <Badge tone={status.tone} dot>{status.label}</Badge>}</td>
      <td className={`${tdClass} whitespace-nowrap`}>{typeLabel || <NotRecorded label="Not set" />}</td>
      <td className={tdClass}>{managerEmail ? (managerLabels.get(managerEmail) ?? managerEmail) : <NotRecorded label="Not set" />}</td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {e.start_date ? (
          <>
            <span className="block">{formatDate(e.start_date)}</span>
            {service && <span className="block text-xs text-slate-500">{service}</span>}
          </>
        ) : <NotRecorded label="Not set" />}
      </td>
      <td className={tdClass}>
        <div className="flex w-28 items-center gap-2">
          <div className="min-w-0 flex-1">
            <ProgressBar value={percent} tone={completenessTone(percent)} label={`${name}: profile ${percent}% complete`} />
          </div>
          <span className="w-9 text-right text-xs font-medium tabular-nums text-slate-600">{percent}%</span>
        </div>
      </td>
    </tr>
  )
}

/**
 * The scroll container is the table's own (not the page's), because a sticky
 * header only sticks inside the element that scrolls; it is capped to the screen
 * height so the header stays in view while reading a long page of people.
 */
export function EmployeeTable({ employees, filters, managerLabels }: {
  employees: Employee[]
  filters: DirectoryFilters
  managerLabels: Map<string, string>
}) {
  return (
    <div className="max-h-[75vh] overflow-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <table className={`${tableClass} min-w-[56rem]`}>
        <caption className="sr-only">People directory</caption>
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
          <tr>
            <SortTh label="Name" first="name" second="name_desc" firstDirection="ascending" filters={filters} />
            <SortTh label="Job title" first="title" second="title_desc" firstDirection="ascending" filters={filters} />
            <SortTh label="Area" first="area" second="area_desc" firstDirection="ascending" filters={filters} />
            <th scope="col" className={thClass}>Status</th>
            <th scope="col" className={thClass}>Type</th>
            <th scope="col" className={thClass}>Line manager</th>
            <SortTh label="Started" first="newest" second="oldest" firstDirection="descending" filters={filters} />
            <th scope="col" className={thClass}>Profile</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map(employee => <EmployeeRow key={employee.id} employee={employee} managerLabels={managerLabels} />)}
        </tbody>
      </table>
    </div>
  )
}

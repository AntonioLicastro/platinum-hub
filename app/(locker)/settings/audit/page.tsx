import Link from 'next/link'
import { ChevronLeft, ChevronRight, ScrollText, Search } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { formatDateTime } from '@/utils/people/format'
import {
  AUDIT_PAGE_SIZE, EMPLOYEE_MATCH_LIMIT, auditHref, hasAuditFilters, loadAuditPage, parseAuditFilters, type AuditFilters, type AuditPage, type AuditRow,
} from '@/utils/people/settings-audit'
import { AUDIT_ACTION_GROUPS, describeAction } from '@/utils/people/settings-audit-labels'
import {
  Badge, Card, EmptyState, Field, PageHeader, TableCard, buttonClass, inputClass, tableClass, tdClass, thClass,
} from '../../_components/ui'
import { Callout } from '../_components/callout'

const number = new Intl.NumberFormat('en-IE')

function FilterForm({ filters }: { filters: AuditFilters }) {
  return (
    <Card className="mb-6">
      {/* Remounts when the filters change so the boxes always show what is applied. */}
      <form key={JSON.stringify(filters)} method="get" action="/settings/audit" role="search" aria-label="Filter the audit log">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Who did it" htmlFor="audit-actor" hint="Part of their email address.">
            <input id="audit-actor" name="actor" type="text" maxLength={100} defaultValue={filters.actor} autoComplete="off" className={inputClass} />
          </Field>
          <Field label="What happened" htmlFor="audit-action">
            <select id="audit-action" name="action" defaultValue={filters.action} className={inputClass}>
              <option value="">Anything</option>
              {AUDIT_ACTION_GROUPS.map(group => <option key={group.prefix} value={group.prefix}>{group.label}</option>)}
            </select>
          </Field>
          <Field label="About which employee" htmlFor="audit-employee" hint="Part of their name or email address.">
            <input id="audit-employee" name="employee" type="text" maxLength={100} defaultValue={filters.employee} autoComplete="off" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From" htmlFor="audit-from">
              <input id="audit-from" name="from" type="date" defaultValue={filters.from} className={inputClass} />
            </Field>
            <Field label="To" htmlFor="audit-to">
              <input id="audit-to" name="to" type="date" defaultValue={filters.to} className={inputClass} />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass('primary')}><Search size={16} aria-hidden="true" /> Apply filters</button>
          {hasAuditFilters(filters) && <Link href="/settings/audit" className={buttonClass('ghost')}>Clear filters</Link>}
        </div>
      </form>
    </Card>
  )
}

function Pager({ filters, page, pageCount }: { filters: AuditFilters; page: number; pageCount: number }) {
  const linkClass = `${buttonClass('secondary', 'sm')}`
  const disabledClass = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-300'
  return (
    <nav aria-label="Audit log pages" className="flex items-center gap-2">
      {page > 1
        ? <Link href={auditHref(filters, page - 1)} rel="prev" className={linkClass}><ChevronLeft size={14} aria-hidden="true" /> Newer</Link>
        : <span className={disabledClass} aria-hidden="true"><ChevronLeft size={14} /> Newer</span>}
      <span className="text-xs tabular-nums text-slate-500">Page {number.format(page)} of {number.format(pageCount)}</span>
      {page < pageCount
        ? <Link href={auditHref(filters, page + 1)} rel="next" className={linkClass}>Older <ChevronRight size={14} aria-hidden="true" /></Link>
        : <span className={disabledClass} aria-hidden="true">Older <ChevronRight size={14} /></span>}
    </nav>
  )
}

function EmployeeCell({ row }: { row: AuditRow }) {
  const id = row.entry.employee_id
  if (!id) return <span className="text-slate-300">–</span>
  if (row.employeeDeleted) return <Badge tone="gray">Deleted employee</Badge>
  return (
    <Link href={`/employees/${id}`} className="font-medium text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
      {row.employeeName || 'Unnamed employee'}
    </Link>
  )
}

function DetailCell({ detail }: { detail: AuditRow['entry']['detail'] }) {
  if (!detail || Object.keys(detail).length === 0) return <span className="text-slate-300">–</span>
  return (
    <details className="group max-w-xs">
      <summary className="cursor-pointer text-xs font-medium text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
        <span className="group-open:hidden">Show</span>
        <span className="hidden group-open:inline">Hide</span>
      </summary>
      <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
        {JSON.stringify(detail)}
      </pre>
    </details>
  )
}

function Results({ data, filters }: { data: AuditPage; filters: AuditFilters }) {
  if (data.failed) {
    return (
      <EmptyState
        icon={ScrollText}
        title="The audit log couldn't be loaded"
        body="Something went wrong reading it. Try again in a moment."
        action={<Link href={auditHref(filters, 1)} className={buttonClass('secondary', 'sm')}>Try again</Link>}
      />
    )
  }
  if (data.rows.length === 0) {
    return hasAuditFilters(filters) ? (
      <EmptyState
        icon={ScrollText}
        title="No entries match those filters"
        body="Try a wider date range, or clear a filter."
        action={<Link href="/settings/audit" className={buttonClass('secondary', 'sm')}>Clear filters</Link>}
      />
    ) : (
      <EmptyState
        icon={ScrollText}
        title="Nothing has been recorded yet"
        body="From now on, every change to HR Locker and every look at sensitive information, such as a PPS number, pay or a document download, is listed here."
      />
    )
  }

  const first = (data.page - 1) * AUDIT_PAGE_SIZE + 1
  const last = first + data.rows.length - 1
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500" aria-live="polite">
          Showing {number.format(first)} to {number.format(last)} of {number.format(data.total)} {data.total === 1 ? 'entry' : 'entries'}, newest first.
        </p>
        <Pager filters={filters} page={data.page} pageCount={data.pageCount} />
      </div>
      <TableCard>
        <table className={`${tableClass} min-w-[56rem]`}>
          <caption className="sr-only">Audit log entries, newest first</caption>
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th scope="col" className={thClass}>When</th>
              <th scope="col" className={thClass}>Who</th>
              <th scope="col" className={thClass}>What</th>
              <th scope="col" className={thClass}>About</th>
              <th scope="col" className={thClass}>Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map(row => (
              <tr key={row.entry.id} className="align-top">
                <td className={`${tdClass} whitespace-nowrap text-xs text-slate-500`}>{formatDateTime(row.entry.at)}</td>
                <td className={tdClass}>
                  {row.actorName && <span className="block font-medium text-slate-900">{row.actorName}</span>}
                  <span className="block break-all text-xs text-slate-500">{row.entry.actor_email ?? 'Unknown'}</span>
                </td>
                <td className={tdClass}>
                  <span className="block font-medium text-slate-900">{describeAction(row.entry.action)}</span>
                  <code className="text-xs text-slate-400">{row.entry.action}</code>
                </td>
                <td className={tdClass}><EmployeeCell row={row} /></td>
                <td className={tdClass}><DetailCell detail={row.entry.detail} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      {data.pageCount > 1 && (
        <div className="mt-4 flex justify-end">
          <Pager filters={filters} page={data.page} pageCount={data.pageCount} />
        </div>
      )}
    </>
  )
}

export default async function AuditLogPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('audit.view')
  const { filters, page } = parseAuditFilters(await searchParams)
  const data = await loadAuditPage(filters, page)

  return (
    <>
      <PageHeader
        title="Audit log"
        icon={ScrollText}
        subtitle="Who changed what in HR Locker, and who looked at sensitive information. Entries are read-only."
      />
      <FilterForm filters={filters} />
      {data.employeeMatchCapped && (
        <Callout tone="caution">
          A lot of employees match that search, so only the first {EMPLOYEE_MATCH_LIMIT} are included. Search for a fuller name or an email address to narrow it down.
        </Callout>
      )}
      <Results data={data} filters={filters} />
    </>
  )
}

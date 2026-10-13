import Link from 'next/link'
import { AlertTriangle, CircleDashed, Clock3, FolderCheck, Settings, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { can, canOnEmployee, isHr, requireCapability } from '@/utils/people/access'
import { alertsFromItems, getComplianceItems, listDocumentTypes, summariseCompliance, type ComplianceItem } from '@/utils/people/compliance-data'
import { isCurrent, listEmployees } from '@/utils/people/employees-data'
import { daysBetween, displayName } from '@/utils/people/format'
import { buttonClass, Card, EmptyState, inputClass, LegendDot, PageHeader, Stat, labelClass } from '../_components/ui'
import { AlertsView } from './_components/alerts'
import { ComplianceMatrix } from './_components/matrix'

const PAGE_SIZE = 50
const WINDOWS = [30, 60, 90] as const

type Query = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

function pageHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const qs = search.toString()
  return qs ? `/documents?${qs}` : '/documents'
}

// "Issues" are the states someone has to chase. Pending is already with HR for checking.
const hasIssue = (items: ComplianceItem[]) =>
  items.some(i => i.state === 'expired' || i.state === 'expiring' || i.state === 'missing' || i.state === 'rejected')

export default async function CompliancePage({ searchParams }: { searchParams: Promise<Query> }) {
  const viewer = await requireCapability('documents.view')
  const query = await searchParams

  const view = first(query.view) === 'alerts' ? 'alerts' : 'matrix'
  const windowDays = WINDOWS.find(w => String(w) === first(query.window)) ?? 30
  const search = first(query.q).slice(0, 100)
  const area = first(query.area)
  const title = first(query.title)
  const onlyIssues = first(query.issues) === '1'
  const requestedPage = Math.max(1, Math.floor(Number(first(query.page))) || 1)

  const [employees, types] = await Promise.all([listEmployees(viewer), listDocumentTypes()])
  const people = employees.filter(e => isCurrent(e) && canOnEmployee(viewer, 'documents.view', e))
  const required = types.filter(t => t.active && t.mandatory)
  const scopeLabel = isHr(viewer) ? 'everyone at Platinum Home Care' : 'your team'
  const canEditSettings = can(viewer, 'settings.manage')

  const header = (
    <PageHeader
      title="Compliance"
      icon={FolderCheck}
      subtitle={`Vetting, right to work and training for ${scopeLabel}: who is up to date, what is running out and what is still missing.`}
      actions={canEditSettings && (
        <Link href="/settings/document-types" className={buttonClass('secondary', 'sm')}>
          <Settings size={14} /> Document types
        </Link>
      )}
    />
  )

  if (required.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={FolderCheck}
          title={types.some(t => t.active) ? 'No document types are mandatory yet' : 'No document types are set up yet'}
          body="Compliance tracking starts once you decide which documents everyone must have, such as Garda vetting or manual handling. Until then there is nothing to measure."
          action={canEditSettings
            ? <Link href="/settings/document-types" className={buttonClass('primary')}>Set up document types</Link>
            : <p className="text-sm text-slate-500">Ask HR to choose which document types are mandatory.</p>}
        />
      </>
    )
  }

  if (people.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Users}
          title="No employees to show yet"
          body="Once people are added to the directory, their required documents appear here."
          action={can(viewer, 'employees.edit') ? <Link href="/employees/new" className={buttonClass('primary')}><UserPlus size={16} /> Add an employee</Link> : undefined}
        />
      </>
    )
  }

  const itemsByEmployee = await getComplianceItems(people)

  // Headline numbers always describe everyone in view, whatever the matrix filters are.
  const compliant = people.filter(e => {
    const s = summariseCompliance(itemsByEmployee.get(e.id) ?? [])
    return s.valid + s.expiring === s.required
  }).length
  const alerts = alertsFromItems(people, itemsByEmployee, windowDays)
  const expired = alerts.filter(a => a.state === 'expired')
  const expiringSoon = alerts.filter(a => a.state === 'expiring' && a.expiresOn !== null && daysBetween(a.expiresOn) <= 30)
  const missing = alerts.filter(a => a.state === 'missing')
  const headcount = (list: typeof alerts) => new Set(list.map(a => a.employee.id)).size
  const peopleHint = (n: number, none: string) => (n === 0 ? none : `${n} ${n === 1 ? 'person' : 'people'}`)

  const kpis = (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Fully compliant"
        value={compliant}
        hint={`of ${people.length} ${people.length === 1 ? 'person' : 'people'} (${Math.round((compliant / people.length) * 100)}%). Documents awaiting a check don't count yet.`}
        icon={ShieldCheck}
        tone="green"
        href={pageHref({ view: 'matrix' })}
      />
      <Stat label="Expired" value={expired.length} hint={peopleHint(headcount(expired), 'Nothing overdue')} icon={AlertTriangle} tone="red" href={pageHref({ view: 'alerts' })} />
      <Stat label="Expiring in 30 days" value={expiringSoon.length} hint={peopleHint(headcount(expiringSoon), 'Nothing about to run out')} icon={Clock3} tone="amber" href={pageHref({ view: 'alerts', window: '30' })} />
      <Stat label="Missing" value={missing.length} hint={peopleHint(headcount(missing), 'Nothing required is missing')} icon={CircleDashed} tone="gray" href={pageHref({ view: 'alerts' })} />
    </div>
  )

  const viewTabs = (
    <nav aria-label="Compliance views" className="mb-5 flex gap-1 border-b border-slate-200">
      {([['matrix', 'Matrix'], ['alerts', `Alerts (${alerts.length})`]] as const).map(([key, label]) => (
        <Link
          key={key}
          href={pageHref({ view: key, window: key === 'alerts' && windowDays !== 30 ? String(windowDays) : undefined })}
          prefetch={false}
          aria-current={view === key ? 'page' : undefined}
          className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition focus:outline-none focus-visible:rounded-t-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
            view === key ? 'border-[#323398] text-[#323398]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )

  if (view === 'alerts') {
    return (
      <>
        {header}
        {kpis}
        {viewTabs}
        <AlertsView
          alerts={alerts}
          windowDays={windowDays}
          windows={WINDOWS}
          hrefForWindow={days => pageHref({ view: 'alerts', window: days === 30 ? undefined : String(days) })}
        />
      </>
    )
  }

  const areas = [...new Set(people.map(e => e.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b))
  const titles = [...new Set(people.map(e => e.job_title).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b))
  const needle = search.toLowerCase()
  const matches = people.filter(e => {
    if (area && e.area !== area) return false
    if (title && e.job_title !== title) return false
    if (needle && ![displayName(e), e.email, e.employee_no ?? ''].some(v => v.toLowerCase().includes(needle))) return false
    return !onlyIssues || hasIssue(itemsByEmployee.get(e.id) ?? [])
  })
  const filtered = Boolean(search || area || title || onlyIssues)
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const page = Math.min(requestedPage, pageCount)
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(employee => ({ employee, items: itemsByEmployee.get(employee.id) ?? [] }))
  const filterParams = { view: 'matrix', q: search, area, title, issues: onlyIssues ? '1' : undefined }

  return (
    <>
      {header}
      {kpis}
      {viewTabs}

      <Card className="mb-4">
        <form action="/documents" method="get" role="search" className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <input type="hidden" name="view" value="matrix" />
          <div className="min-w-56 flex-1">
            <label htmlFor="filter-q" className={labelClass}>Search</label>
            <input id="filter-q" name="q" type="search" defaultValue={search} maxLength={100} placeholder="Name, email or employee number" className={inputClass} />
          </div>
          <div className="min-w-40">
            <label htmlFor="filter-area" className={labelClass}>Area</label>
            <select id="filter-area" name="area" defaultValue={area} className={inputClass}>
              <option value="">All areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="min-w-44">
            <label htmlFor="filter-title" className={labelClass}>Job title</label>
            <select id="filter-title" name="title" defaultValue={title} className={inputClass}>
              <option value="">All job titles</option>
              {titles.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" name="issues" value="1" defaultChecked={onlyIssues} className="h-4 w-4 rounded border-slate-300 text-[#323398] focus:ring-[#323398]" />
            Only people with issues
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass('primary')}>Apply</button>
            {filtered && <Link href={pageHref({ view: 'matrix' })} className={buttonClass('ghost')}>Clear</Link>}
          </div>
        </form>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-slate-500" aria-live="polite">
          {matches.length === 0
            ? 'No people match.'
            : `Showing ${(page - 1) * PAGE_SIZE + 1}-${(page - 1) * PAGE_SIZE + rows.length} of ${matches.length} ${matches.length === 1 ? 'person' : 'people'}`}
        </p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Key">
          <li><LegendDot tone="green" label="Valid" /></li>
          <li><LegendDot tone="amber" label="Expiring (days left)" /></li>
          <li><LegendDot tone="red" label="Expired or rejected" /></li>
          <li><LegendDot tone="sky" label="Awaiting check" /></li>
          <li><LegendDot tone="gray" label="Missing" /></li>
        </ul>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={onlyIssues && !search && !area && !title ? ShieldCheck : Users}
          title={onlyIssues && !search && !area && !title ? 'No issues. Everyone is up to date.' : 'No one matches these filters'}
          body={onlyIssues && !search && !area && !title ? 'Every required document is valid, expiring later or waiting for a check.' : 'Try a different search, or clear the filters to see everyone.'}
          action={<Link href={pageHref({ view: 'matrix' })} className={buttonClass('secondary')}>Clear filters</Link>}
        />
      ) : (
        <>
          <ComplianceMatrix types={required} rows={rows} />
          <p className="mt-2 text-xs text-slate-400 sm:hidden">Scroll sideways to see every document.</p>
        </>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1
            ? <Link href={pageHref({ ...filterParams, page: String(page - 1) })} prefetch={false} className={buttonClass('secondary', 'sm')}>Previous</Link>
            : <span />}
          <span className="text-slate-500">Page {page} of {pageCount}</span>
          {page < pageCount
            ? <Link href={pageHref({ ...filterParams, page: String(page + 1) })} prefetch={false} className={buttonClass('secondary', 'sm')}>Next</Link>
            : <span />}
        </nav>
      )}
    </>
  )
}

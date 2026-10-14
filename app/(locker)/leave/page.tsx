import Link from 'next/link'
import { CalendarDays, CalendarPlus, CalendarRange, ClipboardList, Palmtree, Scale } from 'lucide-react'
import { can, isHr, requireCapability } from '@/utils/people/access'
import { todayIso } from '@/utils/people/format'
import { isMonthKey } from '@/utils/people/leave-calc'
import { parseLeaveYear } from '@/utils/people/leave-year'
import { buttonClass, PageHeader } from '../_components/ui'
import BalancesView from './_components/balances-view'
import CalendarView from './_components/calendar-view'
import RequestsView from './_components/requests-view'
import YearView from './_components/year-view'

const VIEWS = ['year', 'requests', 'calendar', 'balances'] as const
type View = (typeof VIEWS)[number]

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function LeavePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireCapability('leave.view')
  const query = await searchParams
  const canManage = can(viewer, 'leave.manage')

  const wanted = first(query.view)
  // Managers and HR open on the year at a glance. Entitlements are HR-only: anyone else asking for balances gets the request queue.
  const defaultView: View = isHr(viewer) || viewer.role === 'manager' ? 'year' : 'requests'
  const asked = VIEWS.find(v => v === wanted)
  const view: View = asked === 'balances' && !canManage ? 'requests' : asked ?? defaultView

  const tabs: { key: View; label: string; icon: typeof ClipboardList }[] = [
    { key: 'year', label: 'Year', icon: CalendarRange },
    { key: 'requests', label: 'Requests', icon: ClipboardList },
    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
    ...(canManage ? [{ key: 'balances' as const, label: 'Balances', icon: Scale }] : []),
  ]

  const today = todayIso()
  const monthParam = first(query.month)
  const month = isMonthKey(monthParam) ? monthParam : today.slice(0, 7)
  const yearParam = Number(first(query.year))
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : Number(today.slice(0, 4))
  const typeParam = Number(first(query.type))
  const search = (first(query.q) ?? '').trim().slice(0, 100)

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Leave"
          subtitle="The year at a glance, requests, who is away, and annual leave balances"
          icon={Palmtree}
          actions={
            (viewer.employeeId || canManage) && (
              <Link href="/leave/request" className={buttonClass('primary')}>
                <CalendarPlus size={16} /> {canManage ? 'Request or record leave' : 'Request leave'}
              </Link>
            )
          }
        />
      </div>

      <nav aria-label="Leave sections" className="-mx-4 mb-6 overflow-x-auto print:hidden border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <Link
                href={`/leave?view=${key}`}
                aria-current={key === view ? 'page' : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-medium transition focus:outline-none focus-visible:rounded-t-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
                  key === view
                    ? 'border-[#323398] text-[#323398]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {view === 'year' && (
        <YearView
          viewer={viewer}
          year={parseLeaveYear(first(query.year), Number(today.slice(0, 4)))}
          showPending={first(query.pending) === '1'}
          allTypes={first(query.all) === '1'}
        />
      )}
      {view === 'requests' && <RequestsView viewer={viewer} />}
      {view === 'calendar' && <CalendarView viewer={viewer} month={month} area={first(query.area) ?? null} />}
      {view === 'balances' && (
        <BalancesView viewer={viewer} year={year} typeId={Number.isInteger(typeParam) && typeParam > 0 ? typeParam : null} query={search} />
      )}
    </>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowRight, CheckCircle2, UserMinus } from 'lucide-react'
import { can, canOnEmployee, requireViewer } from '@/utils/people/access'
import { getEmployee } from '@/utils/people/employees-data'
import { displayName, formatDate } from '@/utils/people/format'
import { getManagerName } from '@/utils/people/profile-data'
import { resolveTab, visibleTabs, type ProfileTabKey } from '@/utils/people/profile-tabs'
import { buttonClass } from '../../_components/ui'
import { ProfileHeader } from '../_components/profile-header'
import { TAB_ICONS } from '../_components/tab-meta'
import ChecklistsTab from './tabs/checklists-tab'
import DocumentsTab from './tabs/documents-tab'
import EmploymentTab from './tabs/employment-tab'
import LeaveTab from './tabs/leave-tab'
import OverviewTab from './tabs/overview-tab'
import PayTab from './tabs/pay-tab'
import PersonalTab from './tabs/personal-tab'
import ReviewsTab from './tabs/reviews-tab'
import TimelineTab from './tabs/timeline-tab'
import type { TabProps } from './tabs/types'

export default async function EmployeePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireViewer()
  const [{ id }, query] = await Promise.all([params, searchParams])

  // getEmployee() applies row scope; out-of-scope and missing look identical on purpose.
  const employee = await getEmployee(viewer, id)
  if (!employee || !canOnEmployee(viewer, 'employees.view', employee)) notFound()

  const tabs = visibleTabs(viewer, employee)
  const active = resolveTab(query.tab, tabs)
  const canEdit = canOnEmployee(viewer, 'employees.edit', employee)
  const canManageChecklists = canOnEmployee(viewer, 'checklists.manage', employee)
  const managerName = await getManagerName(employee.manager_email)

  const isLeaver = employee.employment_status === 'leaver'
  const justCreated = query.created === '1' && canEdit
  const tabProps: TabProps = { viewer, employee, searchParams: query }

  return (
    <>
      <ProfileHeader
        employee={employee}
        managerName={managerName}
        canEdit={canEdit}
        crumbs={[
          can(viewer, 'employees.view')
            ? { label: 'Directory', href: '/directory' }
            : { label: 'My space', href: '/me' },
          { label: displayName(employee) },
        ]}
      />

      {justCreated && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            Employee created. Fill in the rest of their record as it comes in.
          </span>
          {canManageChecklists && (
            <Link href={`/onboarding?start=${employee.id}&kind=onboarding`} className={buttonClass('success', 'sm')}>
              Start onboarding checklist <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}

      {isLeaver && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-sm text-slate-700">
          <span className="flex items-center gap-2">
            <UserMinus size={18} className="shrink-0 text-slate-500" />
            {employee.end_date
              ? <>Left Platinum Home Care on <strong className="font-semibold">{formatDate(employee.end_date)}</strong>.</>
              : 'Recorded as a leaver. No last working day has been entered yet.'}
          </span>
          {canManageChecklists && (
            <Link href={`/onboarding?start=${employee.id}&kind=offboarding`} className={buttonClass('secondary', 'sm')}>
              Start offboarding checklist <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}

      <nav aria-label="Profile sections" className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {tabs.map(tab => {
            const Icon = TAB_ICONS[tab.key]
            const isActive = tab.key === active
            return (
              <li key={tab.key}>
                {/* prefetch off: tabs such as Pay are audited when rendered, so hovering must not render them. */}
                <Link
                  href={`?tab=${tab.key}`}
                  prefetch={false}
                  aria-current={isActive ? 'page' : undefined}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-medium transition focus:outline-none focus-visible:rounded-t-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
                    isActive
                      ? 'border-[#323398] text-[#323398]'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <Suspense key={active} fallback={<TabSkeleton />}>
        <ActiveTab tab={active} {...tabProps} />
      </Suspense>
    </>
  )
}

function ActiveTab({ tab, ...props }: TabProps & { tab: ProfileTabKey }) {
  switch (tab) {
    case 'employment': return <EmploymentTab {...props} />
    case 'personal': return <PersonalTab {...props} />
    case 'pay': return <PayTab {...props} />
    case 'documents': return <DocumentsTab {...props} />
    case 'leave': return <LeaveTab {...props} />
    case 'reviews': return <ReviewsTab {...props} />
    case 'checklists': return <ChecklistsTab {...props} />
    case 'timeline': return <TimelineTab {...props} />
    default: return <OverviewTab {...props} />
  }
}

function TabSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-2" aria-hidden="true">
      <div className="h-56 rounded-2xl bg-slate-200/60" />
      <div className="h-56 rounded-2xl bg-slate-200/60" />
    </div>
  )
}

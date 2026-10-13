import Link from 'next/link'
import { ArrowRight, CalendarDays, FileCheck, GitCompareArrows, Sparkles, UserCheck } from 'lucide-react'
import { Avatar, Badge, Card, CardHeader, DataGrid, DataItem, LegendDot, NotRecorded, ProgressBar } from '../../../_components/ui'
import { TAB_BLURBS, TAB_ICONS } from '../../_components/tab-meta'
import { canOnEmployee, isHr } from '@/utils/people/access'
import { profileCompleteness } from '@/utils/people/completeness'
import { getComplianceSummary, type ComplianceSummary } from '@/utils/people/compliance-data'
import { daysBetween, formatDate, relativeDays, tenure } from '@/utils/people/format'
import { getEasyMileageProfile, getEmployeePrivate, getManagerName, type EasyMileageProfile } from '@/utils/people/profile-data'
import { visibleTabs } from '@/utils/people/profile-tabs'
import type { Employee, EmploymentStatus } from '@/utils/people/types'
import type { TabProps } from './types'

export default async function OverviewTab({ viewer, employee }: TabProps) {
  const canSeePrivate = canOnEmployee(viewer, 'private.view', employee)
  const canSeeDocuments = canOnEmployee(viewer, 'documents.view', employee)
  const canEdit = canOnEmployee(viewer, 'employees.edit', employee)
  const profileId = isHr(viewer) ? employee.profile_id : null

  // Personal details are only fetched for people allowed to see them; managers never trigger that read.
  const [personal, summaries, managerLookup, easyMileage] = await Promise.all([
    canSeePrivate ? getEmployeePrivate(employee.id) : null,
    canSeeDocuments ? getComplianceSummary([employee]) : null,
    getManagerName(employee.manager_email),
    profileId ? getEasyMileageProfile(profileId) : null,
  ])

  const completeness = profileCompleteness(employee, personal && !personal.failed ? personal.data : undefined)
  const managerName = employee.manager_email ? managerLookup ?? employee.manager_email : null
  const otherTabs = visibleTabs(viewer, employee).filter(t => t.key !== 'overview')
  const differences = easyMileage ? easyMileageDifferences(employee, easyMileage) : []

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Key dates" icon={CalendarDays} description="Service, probation and any end date" />
          <DataGrid>
            <DataItem
              label="Start date"
              value={employee.start_date && <>{formatDate(employee.start_date)} <span className="text-slate-500">· {tenure(employee.start_date, employee.end_date)}</span></>}
            />
            <DataItem
              label="Continuous service from"
              value={employee.continuous_service_date && <>{formatDate(employee.continuous_service_date)} <span className="text-slate-500">· {tenure(employee.continuous_service_date, employee.end_date)}</span></>}
            />
            <DataItem
              label="Probation ends"
              value={employee.probation_end_date && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {formatDate(employee.probation_end_date)}
                  {employee.employment_status !== 'leaver' && <ProbationBadge iso={employee.probation_end_date} />}
                </span>
              )}
            />
            <DataItem label="End date" value={endDateValue(employee.end_date, employee.employment_type, employee.employment_status)} />
          </DataGrid>
        </Card>

        <Card>
          <CardHeader title="Line manager" icon={UserCheck} description="Who this person reports to" />
          {managerName && employee.manager_email ? (
            <div className="flex items-center gap-3">
              <Avatar name={managerName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{managerName}</p>
                <a href={`mailto:${employee.manager_email}`} className="block truncate text-sm text-[#323398] hover:underline">{employee.manager_email}</a>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              <NotRecorded label="No line manager recorded yet." />{' '}
              {canEdit && <Link href="?tab=employment" prefetch={false} className="font-medium text-[#323398] hover:underline">Choose one</Link>}
            </p>
          )}
        </Card>

        {otherTabs.length > 0 && (
          <section aria-label="Quick links">
            <ul className="grid gap-3 sm:grid-cols-2">
              {otherTabs.map(tab => {
                const Icon = TAB_ICONS[tab.key]
                return (
                  <li key={tab.key}>
                    <Link
                      href={`?tab=${tab.key}`}
                      prefetch={false}
                      className="group flex h-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-[#323398]/30 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-[#323398]"><Icon size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{tab.label}</span>
                        <span className="block truncate text-xs text-slate-500">{TAB_BLURBS[tab.key]}</span>
                      </span>
                      <ArrowRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#323398]" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Profile completeness" icon={Sparkles} description={`${completeness.total} details we like to hold for every employee`} />
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular-nums text-slate-900">{completeness.percent}%</span>
            <span className="text-xs text-slate-500">{completeness.total - completeness.missing.length} of {completeness.total} recorded</span>
          </div>
          <ProgressBar value={completeness.percent} tone={completeness.percent >= 80 ? 'green' : completeness.percent >= 40 ? 'blue' : 'amber'} label="Profile completeness" />
          {completeness.missing.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-700">Everything we ask for is on file.</p>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {canEdit ? 'Still to add' : 'Missing, ask HR to add'}
              </p>
              <ul className="flex flex-wrap gap-2">
                {completeness.missing.map(m => (
                  <li key={m.key}>
                    <Link
                      href={`?tab=${m.tab}`}
                      prefetch={false}
                      className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-[#323398] hover:bg-indigo-50 hover:text-[#323398] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
                    >
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {canSeePrivate && personal?.failed && (
                <p className="mt-3 text-xs text-amber-700">Personal details could not be loaded, so they are not counted here.</p>
              )}
            </div>
          )}
        </Card>

        {canSeeDocuments && <ComplianceCard summary={summaries?.get(employee.id)} />}

        {differences.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardHeader title="Differs from Easy Mileage" icon={GitCompareArrows} description="Read-only hint for HR. HR Locker never changes the Easy Mileage profile." />
            <dl className="space-y-3 text-sm">
              {differences.map(d => (
                <div key={d.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.label}</dt>
                  <dd className="mt-0.5 text-slate-800">
                    HR record: {d.hr || <NotRecorded label="empty" />}
                    <span className="text-slate-400"> · </span>
                    Easy Mileage: {d.easyMileage || <NotRecorded label="empty" />}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </div>
    </div>
  )
}

function ProbationBadge({ iso }: { iso: string }) {
  const days = daysBetween(iso)
  if (days < 0) return <Badge tone="gray">Ended {relativeDays(iso)}</Badge>
  return <Badge tone={days <= 14 ? 'amber' : 'sky'}>Ends {relativeDays(iso)}</Badge>
}

function endDateValue(endDate: string | null, type: Employee['employment_type'], status: EmploymentStatus) {
  if (endDate) return formatDate(endDate)
  // Permanent staff have no end date, so "not recorded" would be misleading; fixed-term staff should have one.
  if (type === 'fixed_term' || status === 'leaver') return null
  return <span className="text-slate-500">None. Employment is ongoing.</span>
}

function ComplianceCard({ summary }: { summary: ComplianceSummary | undefined }) {
  const empty = !summary || summary.required === 0
  return (
    <Card>
      <CardHeader
        title="Compliance snapshot"
        icon={FileCheck}
        description="Required documents: vetting, right to work, training"
        actions={<Link href="?tab=documents" prefetch={false} className="text-sm font-medium text-[#323398] hover:underline">Open</Link>}
      />
      {empty ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
          No required documents apply yet. Once document types are marked as mandatory, this shows what is valid, expiring or missing.
        </p>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular-nums text-slate-900">{summary.score}%</span>
            <span className="text-xs text-slate-500">{summary.required} required</span>
          </div>
          <ProgressBar value={summary.score} tone={summary.score >= 90 ? 'green' : summary.score >= 60 ? 'amber' : 'red'} label="Compliance score" />
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            <li><LegendDot tone="green" label={`${summary.valid} valid`} /></li>
            <li><LegendDot tone="amber" label={`${summary.expiring} expiring`} /></li>
            <li><LegendDot tone="red" label={`${summary.expired} expired`} /></li>
            <li><LegendDot tone="sky" label={`${summary.pending} awaiting check`} /></li>
            <li><LegendDot tone="gray" label={`${summary.missing} missing`} /></li>
          </ul>
        </>
      )}
    </Card>
  )
}

type Difference = { label: string; hr: string; easyMileage: string }

function easyMileageDifferences(employee: Employee, profile: EasyMileageProfile): Difference[] {
  const pairs: [string, string | null, string | null][] = [
    ['Job title', employee.job_title, profile.title],
    ['Area', employee.area, profile.area],
    ['Payroll number', employee.payroll_no, profile.payroll_no],
  ]
  return pairs
    .map(([label, hr, easyMileage]) => ({ label, hr: hr?.trim() ?? '', easyMileage: easyMileage?.trim() ?? '' }))
    .filter(d => d.hr !== d.easyMileage)
}

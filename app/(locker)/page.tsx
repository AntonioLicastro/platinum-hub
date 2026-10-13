import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import { can, isHr, requireCapability } from '@/utils/people/access'
import { loadDashboard } from '@/utils/people/dashboard-data'
import { EmptyState } from './_components/ui'
import { AttentionCard } from './_dashboard/attention-card'
import { CompletenessCard } from './_dashboard/completeness-card'
import { DashboardHeader } from './_dashboard/header'
import { KpiRow } from './_dashboard/kpi-row'
import { MilestonesCard } from './_dashboard/milestones-card'
import { WelcomeCard } from './_dashboard/welcome-card'
import { WhosOffCard } from './_dashboard/whos-off-card'
import { Workforce } from './_dashboard/workforce'

export const metadata: Metadata = { title: 'Dashboard · HR Locker' }

export default async function DashboardPage() {
  // Employees are sent to their own space by the helper.
  const viewer = await requireCapability('employees.view')
  const data = await loadDashboard(viewer)

  if (data.totalPeople === 0) {
    return (
      <>
        <DashboardHeader viewer={viewer} today={data.today} />
        <div className="space-y-6">
          {isHr(viewer) ? (
            <WelcomeCard viewer={viewer} />
          ) : (
            <EmptyState
              icon={Users}
              title="Nobody in your team yet"
              body="People appear here when HR names you as their line manager or gives you their area. Ask HR if you expected to see someone."
            />
          )}
          <KpiRow data={data} />
        </div>
      </>
    )
  }

  const hr = data.completeness.status !== 'hidden'
  return (
    <>
      <DashboardHeader viewer={viewer} today={data.today} />
      <div className="space-y-6">
        <KpiRow data={data} />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AttentionCard groups={data.attention.groups} notices={data.attention.notices} />
          </div>
          <WhosOffCard section={data.whosOff} />
        </div>

        <Workforce data={data} viewer={viewer} />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <MilestonesCard
            milestones={data.milestones}
            today={data.today}
            missingStartDates={data.flow.missingStartDates}
            wide={!hr}
          />
          <CompletenessCard section={data.completeness} canImport={can(viewer, 'import.run')} />
        </div>
      </div>
    </>
  )
}

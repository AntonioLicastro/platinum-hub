import type { Metadata } from 'next'
import { requireViewer } from '@/utils/people/access'
import { loadMySpace } from '@/utils/people/me-data'
import { PageHeader } from '../_components/ui'
import { ComplianceCard } from './_components/compliance-card'
import { DetailsCard } from './_components/details-card'
import { LeaveCard } from './_components/leave-card'
import { NoRecord } from './_components/no-record'
import { QuickActions } from './_components/quick-actions'
import { TasksCard } from './_components/tasks-card'
import { TeamCard } from './_components/team-card'
import { Unavailable } from './_components/unavailable'
import { WelcomeHeader } from './_components/welcome-header'

export const metadata: Metadata = { title: 'My space · HR Locker' }

export default async function MePage() {
  // Every signed-in company user lands here, so nothing below needs a capability:
  // it is all the viewer's own record, plus a team summary that loadMySpace scopes by role.
  const viewer = await requireViewer()
  const { own: loadedOwn, team } = await loadMySpace(viewer)
  const teamCard = team && <div className="mt-6"><TeamCard team={team} viewer={viewer} /></div>

  // Not "no record": that would tell someone who has one that HR has not set them up.
  if (!loadedOwn.ok) {
    return (
      <>
        <PageHeader title="My space" subtitle="Your leave, documents and details at Platinum Home Care" />
        <Unavailable what="your HR record" />
        {teamCard}
      </>
    )
  }

  const own = loadedOwn.data
  if (!own) {
    return (
      <>
        <NoRecord viewer={viewer} />
        {teamCard}
      </>
    )
  }

  const { employee } = own
  const canRequestLeave = employee.employment_status !== 'leaver'
  return (
    <>
      <WelcomeHeader employee={employee} managerName={own.managerName} />
      <QuickActions employeeId={employee.id} canRequestLeave={canRequestLeave} />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <LeaveCard leave={own.leave} employeeId={employee.id} canRequest={canRequestLeave} />
          <TasksCard tasks={own.tasks} employeeId={employee.id} />
        </div>
        <div className="space-y-6">
          <ComplianceCard compliance={own.compliance} employeeId={employee.id} />
          <DetailsCard employee={employee} details={own.details} />
        </div>
      </div>

      {teamCard}
    </>
  )
}

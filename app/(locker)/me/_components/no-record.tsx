import Link from 'next/link'
import { UserRoundPlus } from 'lucide-react'
import { can, type PeopleViewer } from '@/utils/people/access'
import { HUB_URL } from '@/utils/hub-url'
import { buttonClass, EmptyState, PageHeader } from '../../_components/ui'

export function NoRecord({ viewer }: { viewer: PeopleViewer }) {
  const areas = [
    can(viewer, 'employees.view') && { href: '/', label: 'HR Locker dashboard' },
    can(viewer, 'leave.view') && { href: '/leave', label: 'Leave' },
    can(viewer, 'documents.view') && { href: '/documents', label: 'Compliance' },
  ].filter(area => area !== false)

  return (
    <>
      <PageHeader title="My space" subtitle="Your leave, documents and details at Platinum Home Care" />
      <EmptyState
        icon={UserRoundPlus}
        title="Your HR record hasn't been set up yet"
        body="HR will create it for you. Until then this page stays empty, and it will fill in once your record is ready."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <a href={HUB_URL} className={buttonClass('primary')}>Go to Platinum Hub</a>
            {areas.map(area => (
              <Link key={area.href} href={area.href} className={buttonClass('secondary')}>{area.label}</Link>
            ))}
          </div>
        }
      />
    </>
  )
}

import Link from 'next/link'
import { LayoutDashboard, UserPlus } from 'lucide-react'
import { can, type PeopleViewer } from '@/utils/people/access'
import type { Tone } from '@/utils/people/constants'
import { parseIsoDate } from '@/utils/people/format'
import { Badge, PageHeader, buttonClass } from '../_components/ui'

const ROLES: Record<PeopleViewer['role'], { label: string; tone: Tone }> = {
  hr_admin: { label: 'HR Admin', tone: 'purple' },
  hr: { label: 'HR', tone: 'purple' },
  manager: { label: 'Manager', tone: 'blue' },
  employee: { label: 'Employee', tone: 'gray' },
}

const DUBLIN_HOUR = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Dublin' })

function greeting(now: Date): string {
  const hour = Number(DUBLIN_HOUR.format(now))
  if (hour < 12) return 'Good morning'
  return hour < 18 ? 'Good afternoon' : 'Good evening'
}

// The viewer's name falls back to their email address when no employee record exists.
function firstName(name: string): string {
  if (name.includes('@')) {
    const local = name.split('@')[0].split(/[._-]/)[0]
    return local.charAt(0).toUpperCase() + local.slice(1)
  }
  return name.split(/\s+/)[0]
}

function scopeText(viewer: PeopleViewer): string {
  if (viewer.role !== 'manager') return 'Everyone at Platinum Home Care'
  if (viewer.areas.length === 0) return 'Your direct reports'
  const shown = viewer.areas.slice(0, 3).join(', ')
  const more = viewer.areas.length > 3 ? ` and ${viewer.areas.length - 3} more` : ''
  return `Your team, including ${shown}${more}`
}

export function DashboardHeader({ viewer, today }: { viewer: PeopleViewer; today: string }) {
  const role = ROLES[viewer.role]
  const date = parseIsoDate(today).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return (
    <PageHeader
      icon={LayoutDashboard}
      title={`${greeting(new Date())}, ${firstName(viewer.name)}`}
      subtitle={(
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <time dateTime={today}>{date}</time>
          <Badge tone={role.tone}>{role.label}</Badge>
          <span className="text-slate-500">{scopeText(viewer)}</span>
        </span>
      )}
      actions={can(viewer, 'employees.edit') && (
        <Link href="/employees/new" className={buttonClass('primary')}>
          <UserPlus size={16} aria-hidden="true" /> Add employee
        </Link>
      )}
    />
  )
}

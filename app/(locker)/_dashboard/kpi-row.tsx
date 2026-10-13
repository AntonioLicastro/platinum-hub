import type { ReactNode } from 'react'
import { AlertTriangle, ClipboardList, Palmtree, UserMinus, UserPlus, Users } from 'lucide-react'
import type { Tone } from '@/utils/people/constants'
import type { DashboardData, Section } from '@/utils/people/dashboard-data'
import { plural } from '@/utils/people/dashboard-metrics'
import { formatDate } from '@/utils/people/format'
import { Stat } from '../_components/ui'

// Amber and worded: a grey dash alone could be read as "zero".
const UNAVAILABLE = <span className="font-medium text-amber-800">Couldn&apos;t load this just now</span>

type Tile = { label: string; value: ReactNode; hint: ReactNode; icon: typeof Users; tone: Tone; href: string }

/** A tile for a source that may be hidden from the viewer or fail to load. */
function fromSection<T>(
  section: Section<T>,
  base: Pick<Tile, 'label' | 'icon' | 'href'>,
  ready: (data: T) => Pick<Tile, 'value' | 'hint' | 'tone'>,
): Tile | null {
  if (section.status === 'hidden') return null
  if (section.status === 'error') return { ...base, value: '–', hint: UNAVAILABLE, tone: 'amber' }
  return { ...base, ...ready(section.data) }
}

export function KpiRow({ data }: { data: DashboardData }) {
  const { headcount, movement } = data
  const people = (n: number) => `${n} ${plural(n, 'person', 'people')}`

  const statusNotes = [
    headcount.byStatus.on_leave > 0 && `${headcount.byStatus.on_leave} on leave`,
    headcount.byStatus.suspended > 0 && `${headcount.byStatus.suspended} suspended`,
    headcount.byStatus.pre_start > 0 && `${headcount.byStatus.pre_start} yet to start`,
  ].filter(Boolean)

  const tiles: (Tile | null)[] = [
    {
      label: 'Headcount',
      value: headcount.current,
      hint: statusNotes.length > 0 ? statusNotes.join(' · ') : headcount.current === 0 ? 'Nobody current yet' : 'Everyone is active',
      icon: Users,
      tone: 'blue',
      href: '/directory',
    },
    {
      label: 'New starters',
      value: movement.starters,
      hint: `Last 30 days, since ${formatDate(movement.startersSince)}`,
      icon: UserPlus,
      tone: 'green',
      href: '/directory?sort=newest',
    },
    {
      label: 'Leavers',
      value: movement.leavers,
      hint: movement.leaversWithoutDate > 0
        ? `Last 90 days · ${movement.leaversWithoutDate} more with no leaving date`
        : `Last 90 days, since ${formatDate(movement.leaversSince)}`,
      icon: UserMinus,
      tone: 'gray',
      href: '/directory?status=leaver',
    },
    fromSection(data.pendingLeave, { label: 'Pending leave', icon: Palmtree, href: '/leave?view=requests' }, count => ({
      value: count,
      hint: count === 0 ? 'Nothing waiting for you' : `${count === 1 ? 'Request' : 'Requests'} waiting for your decision`,
      tone: count > 0 ? 'amber' : 'green',
    })),
    fromSection(data.documents, { label: 'Document alerts', icon: AlertTriangle, href: '/documents?view=alerts' }, docs => {
      const total = docs.expired + docs.expiring + docs.missing
      const notes = [
        docs.expired > 0 && `${docs.expired} expired`,
        docs.expiring > 0 && `${docs.expiring} expiring`,
        docs.missing > 0 && `${docs.missing} missing`,
      ].filter(Boolean)
      return {
        value: total,
        hint: docs.required === 0 ? 'No mandatory document types yet' : notes.length > 0 ? notes.join(' · ') : 'All required documents in date',
        tone: docs.expired > 0 ? 'red' : total > 0 ? 'amber' : 'green',
      }
    }),
    fromSection(data.onboarding, { label: 'Open onboarding tasks', icon: ClipboardList, href: '/onboarding' }, tasks => ({
      value: tasks.openOnboarding,
      hint: tasks.peopleOnboarding === 0
        ? 'No onboarding in progress'
        : `${people(tasks.peopleOnboarding)} onboarding${tasks.overdueOnboarding > 0 ? ` · ${tasks.overdueOnboarding} overdue` : ''}`,
      tone: tasks.overdueOnboarding > 0 ? 'red' : 'blue',
    })),
  ]

  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map(tile => tile && <Stat key={tile.label} {...tile} />)}
    </section>
  )
}

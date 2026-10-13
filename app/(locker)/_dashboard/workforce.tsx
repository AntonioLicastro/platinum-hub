import Link from 'next/link'
import { BarChart3, Briefcase, MapPin, TrendingUp, Upload, Users } from 'lucide-react'
import { can, type PeopleViewer } from '@/utils/people/access'
import type { DashboardData } from '@/utils/people/dashboard-data'
import { DIRECTORY_NONE } from '@/utils/people/directory-query'
import type { BreakdownRow } from '@/utils/people/dashboard-metrics'
import { Card, CardHeader, EmptyState, buttonClass } from '../_components/ui'
import { BarList } from './bar-list'
import { FlowChart } from './flow-chart'
import { STATUS_COLOURS, TYPE_COLOURS } from './palette'
import { SplitBar } from './split-bar'

function directoryHref(param: 'area' | 'title') {
  return (row: BreakdownRow) => {
    if (row.kind === 'unrecorded') return `/directory?${param}=${DIRECTORY_NONE}`
    return row.kind === 'value' ? `/directory?${param}=${encodeURIComponent(row.label)}` : undefined
  }
}

function importAction(viewer: PeopleViewer) {
  return can(viewer, 'import.run')
    ? <Link href="/settings/import" className={buttonClass('secondary', 'sm')}><Upload size={14} aria-hidden="true" /> Import from your previous HR system</Link>
    : undefined
}

function BreakdownCard({ viewer, title, description, icon, rows, total, param, emptyTitle, emptyBody }: {
  viewer: PeopleViewer
  title: string
  description: string
  icon: typeof MapPin
  rows: BreakdownRow[]
  total: number
  param: 'area' | 'title'
  emptyTitle: string
  emptyBody: string
}) {
  // Rows exist for unrecorded people too, so "nothing recorded at all" is a single unrecorded row.
  const nothingRecorded = rows.every(r => r.kind === 'unrecorded')
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} />
      {nothingRecorded ? (
        <EmptyState icon={icon} title={emptyTitle} body={emptyBody} action={importAction(viewer)} />
      ) : (
        <BarList label={title} rows={rows} total={total} hrefFor={directoryHref(param)} />
      )}
    </Card>
  )
}

function MixCard({ data }: { data: DashboardData }) {
  const total = data.headcount.current
  const typesRecorded = data.types.some(t => t.key in TYPE_COLOURS)
  return (
    <Card>
      <CardHeader icon={Users} title="Employment mix" description="Status and contract type of current staff" />
      {total === 0 ? (
        <EmptyState icon={Users} title="No current staff yet" body="The mix appears here once people are added." />
      ) : (
        <div className="space-y-6">
          <SplitBar title="Employment status" segments={data.statuses} colours={STATUS_COLOURS} />
          <SplitBar title="Employment type" segments={data.types} colours={TYPE_COLOURS} />
          {!typesRecorded && (
            <p className="text-sm text-slate-500">
              Employment type is not recorded for anyone yet. Set it on each profile (Employment tab) or include it in an import.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function FlowCard({ data, viewer }: { data: DashboardData; viewer: PeopleViewer }) {
  const { flow } = data
  return (
    <Card>
      <CardHeader icon={TrendingUp} title="Starters and leavers" description="Month by month for the last 12 months" />
      {flow.starters === 0 && flow.leavers === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No starts or leavers in the last 12 months"
          body={flow.missingStartDates > 0
            ? `${flow.missingStartDates} current ${flow.missingStartDates === 1 ? 'employee has' : 'employees have'} no start date recorded. Start dates and leaving dates are what fill this chart in.`
            : 'Start dates and leaving dates fill this chart in as people join and leave.'}
          action={importAction(viewer)}
        />
      ) : (
        <FlowChart flow={flow} />
      )}
    </Card>
  )
}

export function Workforce({ data, viewer }: { data: DashboardData; viewer: PeopleViewer }) {
  const total = data.headcount.current
  return (
    <section aria-label="Workforce" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <BreakdownCard
        viewer={viewer}
        title="Headcount by area"
        description="Current staff, biggest area first"
        icon={MapPin}
        rows={data.byArea}
        total={total}
        param="area"
        emptyTitle="No areas recorded yet"
        emptyBody="Once each person has an area, you will see how your team is spread across them."
      />
      <BreakdownCard
        viewer={viewer}
        title="Headcount by job title"
        description="Biggest job titles first, the rest grouped as other"
        icon={Briefcase}
        rows={data.byTitle}
        total={total}
        param="title"
        emptyTitle="No job titles recorded yet"
        emptyBody="Add a job title to each profile to see how many carers, coordinators and managers you have."
      />
      <MixCard data={data} />
      <FlowCard data={data} viewer={viewer} />
    </section>
  )
}

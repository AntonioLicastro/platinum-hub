import { unstable_rethrow } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardCheck, ListChecks, Plus, Settings } from 'lucide-react'
import { can, canOnEmployee, requireCapability } from '@/utils/people/access'
import { canTickItem, isMyTask } from '@/utils/people/checklist-access'
import {
  listChecklistProgress, listCompletedSince, listOpenChecklistItems, type OpenChecklistItem,
} from '@/utils/people/checklist-data'
import type { StartEmployeeOption } from '@/utils/people/checklist-input'
import { isOverdue } from '@/utils/people/checklist-status'
import { listStartableTemplates } from '@/utils/people/checklist-templates'
import { isCurrent, listEmployees } from '@/utils/people/employees-data'
import { displayName, formatDate, todayIso } from '@/utils/people/format'
import type { Loaded } from '@/utils/people/me-data'
import { oneOf } from '@/utils/people/validate'
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Stat, buttonClass } from '../_components/ui'
import { Unavailable } from '../me/_components/unavailable'
import { MyTasks } from './_components/my-tasks'
import { ProgressCard } from './_components/progress-card'
import { StartChecklistForm } from './_components/start-form'

const KIND_FILTERS = ['all', 'onboarding', 'offboarding'] as const
type KindFilter = (typeof KIND_FILTERS)[number]

const FILTER_LABELS: Record<KindFilter, string> = { all: 'All', onboarding: 'Onboarding', offboarding: 'Offboarding' }

/** How many of the viewer's tasks the side panel lists before pointing at the checklists. */
const MY_TASKS_LIMIT = 12
/** How many finished checklists the side panel names. */
const RECENT_LIMIT = 5

type Query = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

/** Secondary data degrades to a visible "couldn't load" note; the checklists themselves throw to the error boundary. */
async function settle<T>(label: string, run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await run() }
  } catch (err) {
    unstable_rethrow(err)
    console.error(`Onboarding: ${label} failed`, err)
    return { ok: false }
  }
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Query> }) {
  const viewer = await requireCapability('checklists.view')
  const query = await searchParams

  const requestedKind = first(query.kind)
  const filter: KindFilter = oneOf(requestedKind, KIND_FILTERS) ?? 'all'
  const startId = first(query.start)
  const canManage = can(viewer, 'checklists.manage')
  const today = todayIso()
  const monthStart = `${today.slice(0, 7)}-01`

  // The in-progress checklists and their tasks are the page: if they cannot be read the
  // loaders throw and the error boundary says so, rather than showing "no checklists".
  const [progressAll, openAll, completedAll, startData] = await Promise.all([
    listChecklistProgress(viewer),
    listOpenChecklistItems(viewer),
    settle('finished checklists', () => listCompletedSince(viewer, monthStart)),
    canManage
      ? settle('start form', async () => {
          const [people, startable] = await Promise.all([listEmployees(viewer), listStartableTemplates()])
          return { people, startable }
        })
      : Promise.resolve({ ok: true as const, data: { people: [], startable: [] } }),
  ])
  const employees = startData.ok ? startData.data.people : []
  const templates = startData.ok ? startData.data.startable : []

  const matches = (kind: string) => filter === 'all' || kind === filter
  const progress = progressAll.filter(p => matches(p.checklist.kind))
  const open = openAll.filter(i => matches(i.checklist.kind))
  const completed = completedAll.ok ? completedAll.data.filter(c => matches(c.checklist.kind)) : []

  // `open` is already sorted by due date, so the first task seen per checklist is its next one.
  const nextByChecklist = new Map<string, OpenChecklistItem>()
  for (const item of open) if (!nextByChecklist.has(item.checklist_id)) nextByChecklist.set(item.checklist_id, item)

  const tasksDone = progress.reduce((sum, p) => sum + p.done, 0)
  const tasksTotal = progress.reduce((sum, p) => sum + p.total, 0)
  const overdue = open.filter(i => isOverdue(i, today))
  const overduePeople = new Set(overdue.map(i => i.employee.id)).size
  const myTasks = open.filter(i => isMyTask(viewer, i.employee, i.owner_role) && canTickItem(viewer, i.employee, i.owner_role))

  // Current staff, plus the person a profile banner sent us here for (a leaver being offboarded).
  const startable = employees.filter(e => (isCurrent(e) || e.id === startId) && canOnEmployee(viewer, 'checklists.manage', e))
  const startOptions: StartEmployeeOption[] = startable.map(e => ({
    id: e.id,
    name: displayName(e),
    jobTitle: e.job_title,
    startDate: e.start_date,
    endDate: e.end_date,
  }))
  const preselected = startable.find(e => e.id === startId)
  const initialKind = requestedKind === 'offboarding' || (requestedKind !== 'onboarding' && preselected?.employment_status === 'leaver')
    ? 'offboarding'
    : 'onboarding'

  const filterHref = (kind: KindFilter) => (kind === 'all' ? '/onboarding' : `/onboarding?kind=${kind}`)
  const filterLabel = filter === 'all' ? '' : `${FILTER_LABELS[filter].toLowerCase()} `

  return (
    <>
      <PageHeader
        title="Onboarding"
        icon={ClipboardCheck}
        subtitle="Starter and leaver checklists: what is done, what is due and who needs to act."
        actions={can(viewer, 'settings.manage') && (
          <Link href="/settings/checklists" className={buttonClass('secondary', 'sm')}>
            <Settings size={14} aria-hidden="true" /> Checklist templates
          </Link>
        )}
      />

      <nav aria-label="Checklist type" className="mb-5 flex gap-1 border-b border-slate-200">
        {KIND_FILTERS.map(kind => (
          <Link
            key={kind}
            href={filterHref(kind)}
            aria-current={filter === kind ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition focus:outline-none focus-visible:rounded-t-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20 ${
              filter === kind ? 'border-[#323398] text-[#323398]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            {FILTER_LABELS[kind]}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="In progress"
          value={progress.length}
          hint={progress.length === 0 ? 'No checklists running' : `${tasksDone} of ${tasksTotal} tasks done`}
          icon={ListChecks}
          tone="blue"
        />
        <Stat
          label="Overdue tasks"
          value={overdue.length}
          hint={overdue.length === 0 ? 'Nothing overdue' : `Across ${overduePeople} ${overduePeople === 1 ? 'person' : 'people'}`}
          icon={AlertTriangle}
          tone={overdue.length === 0 ? 'gray' : 'red'}
        />
        <Stat
          label="Completed this month"
          value={completedAll.ok ? completed.length : '–'}
          hint={completedAll.ok ? `Finished since ${formatDate(monthStart)}` : <span className="font-medium text-amber-800">Couldn&apos;t load this just now</span>}
          icon={CheckCircle2}
          tone={completedAll.ok ? 'green' : 'amber'}
        />
      </div>

      {canManage && (
        <div id="start-checklist" className="mb-6 scroll-mt-24">
          <Card>
            <details open={startId !== '' || progressAll.length === 0} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-base font-semibold text-slate-900">Start a checklist</span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    Pick a person and a template. Every task is created with its owner and due date.
                  </span>
                </span>
                <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">
                  <Plus size={14} aria-hidden="true" /> New checklist
                </span>
              </summary>
              <div className="mt-5 border-t border-slate-100 pt-5">
                {!startData.ok ? (
                  <Unavailable what="the people and templates for starting a checklist" />
                ) : startOptions.length === 0 ? (
                  <p className="text-sm italic text-slate-500">
                    There is nobody to start a checklist for yet. Add employees to the directory first.
                  </p>
                ) : (
                  <StartChecklistForm
                    idPrefix="page-start"
                    employees={startOptions}
                    templates={templates}
                    today={today}
                    initialEmployeeId={preselected?.id ?? null}
                    initialKind={initialKind}
                    templatesHref={can(viewer, 'settings.manage') ? '/settings/checklists' : undefined}
                  />
                )}
              </div>
            </details>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="in-progress-heading" className="lg:col-span-2">
          <h2 id="in-progress-heading" className="mb-3 text-base font-semibold text-slate-900">In progress</h2>
          {progress.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={`No ${filterLabel}checklists in progress`}
              body="Onboarding checklists make sure every new starter has their contract, vetting, payroll and training sorted before they meet a client. Offboarding checklists do the same when someone leaves."
              action={canManage
                ? <a href="#start-checklist" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" /> Start a checklist</a>
                : <p className="text-sm text-slate-500">HR or the line manager will start one when someone joins or leaves.</p>}
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {progress.map(row => (
                <ProgressCard key={row.checklist.id} row={row} next={nextByChecklist.get(row.checklist.id) ?? null} today={today} />
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <MyTasks items={myTasks} limit={MY_TASKS_LIMIT} today={today} />

          <Card>
            <CardHeader icon={CheckCircle2} title="Finished this month" />
            {!completedAll.ok ? (
              <Unavailable what="this month's finished checklists" />
            ) : completed.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm italic text-slate-500">
                No {filterLabel}checklists have been completed this month yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {completed.slice(0, RECENT_LIMIT).map(({ employee, checklist }) => (
                  <li key={checklist.id}>
                    <Link
                      href={`/employees/${employee.id}?tab=checklists`}
                      prefetch={false}
                      className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
                    >
                      <Avatar name={displayName(employee)} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{displayName(employee)}</span>
                        <span className="block truncate text-xs text-slate-500">{checklist.name}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {completed.length > RECENT_LIMIT && (
              <p className="mt-3 text-xs text-slate-500">and {completed.length - RECENT_LIMIT} more</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

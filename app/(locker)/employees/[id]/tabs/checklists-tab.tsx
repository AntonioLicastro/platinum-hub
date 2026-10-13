import { ClipboardCheck, Lock, Plus } from 'lucide-react'
import { can, canOnEmployee, isHr, isSelf } from '@/utils/people/access'
import { listEmployeeChecklists } from '@/utils/people/checklist-data'
import { listStartableTemplates } from '@/utils/people/checklist-templates'
import { emailNameMap } from '@/utils/people/employees-data'
import { displayName, todayIso } from '@/utils/people/format'
import { ChecklistCard, type ChecklistContext } from '../../../onboarding/_components/checklist-card'
import { StartChecklistForm } from '../../../onboarding/_components/start-form'
import { Card, CardHeader, EmptyState } from '../../../_components/ui'
import type { TabProps } from './types'

export default async function ChecklistsTab({ viewer, employee }: TabProps) {
  if (!canOnEmployee(viewer, 'checklists.view', employee)) {
    return (
      <Card>
        <EmptyState icon={Lock} title="Checklists are not available" body="You do not have access to this employee’s checklists." />
      </Card>
    )
  }
  const canManage = canOnEmployee(viewer, 'checklists.manage', employee)
  const viewingSelf = isSelf(viewer, employee)
  const today = todayIso()

  const [checklists, templates] = await Promise.all([
    listEmployeeChecklists(employee.id),
    canManage ? listStartableTemplates() : Promise.resolve([]),
  ])
  const names = await emailNameMap(checklists.flatMap(c => c.items.map(i => i.completed_by)))
  const ctx: ChecklistContext = { viewer, employee, names, today, canManage, isHrUser: isHr(viewer) }
  const isLeaver = employee.employment_status === 'leaver'

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <details open={checklists.length === 0} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-base font-semibold text-slate-900">Start a checklist</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  Onboard a new starter or offboard a leaver. Every task gets an owner and a due date.
                </span>
              </span>
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">
                <Plus size={14} aria-hidden="true" /> New checklist
              </span>
            </summary>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <StartChecklistForm
                idPrefix="tab-start"
                employees={[{
                  id: employee.id,
                  name: displayName(employee),
                  jobTitle: employee.job_title,
                  startDate: employee.start_date,
                  endDate: employee.end_date,
                }]}
                templates={templates}
                today={today}
                initialEmployeeId={employee.id}
                initialKind={isLeaver ? 'offboarding' : 'onboarding'}
                lockEmployee
                templatesHref={can(viewer, 'settings.manage') ? '/settings/checklists' : undefined}
              />
            </div>
          </details>
        </Card>
      )}

      {checklists.length === 0 ? (
        <Card>
          <CardHeader icon={ClipboardCheck} title="Checklists" />
          <EmptyState
            icon={ClipboardCheck}
            title="No checklists yet"
            body={
              <>
                Checklists keep a starter or a leaver on track: contract signed, vetting received, payroll set up,
                equipment returned. Each task has an owner and a due date, and ticking them off here keeps a record of who did what.
                {canManage
                  ? ' Use “Start a checklist” above to create the first one.'
                  : viewingSelf
                    ? ' Your onboarding tasks will appear here once HR starts your checklist.'
                    : ' Ask HR or the line manager to start one.'}
              </>
            }
          />
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {viewingSelf && !canManage
              ? 'Tick off the tasks marked Employee as you finish them. HR and your manager look after the rest.'
              : 'Tasks are grouped by due date. Tick one off when it is done; HR and the line manager can tick off anything.'}
          </p>
          <div className="space-y-4">
            {checklists.map(entry => <ChecklistCard key={entry.checklist.id} entry={entry} ctx={ctx} />)}
          </div>
        </>
      )}
    </div>
  )
}

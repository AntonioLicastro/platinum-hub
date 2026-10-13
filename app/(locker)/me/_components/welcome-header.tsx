import { EMPLOYMENT_STATUSES } from '@/utils/people/constants'
import { displayName, todayIso } from '@/utils/people/format'
import { firstNameOf, greeting, tenureLabel } from '@/utils/people/me-format'
import type { Employee } from '@/utils/people/types'
import { Avatar, Badge, DataItem } from '../../_components/ui'

export function WelcomeHeader({ employee, managerName }: { employee: Employee; managerName: string | null }) {
  const status = EMPLOYMENT_STATUSES.find(s => s.value === employee.employment_status)
  const notStarted = employee.start_date !== null && employee.start_date > todayIso()

  return (
    <section
      aria-labelledby="me-heading"
      className="rounded-2xl border border-[#323398]/15 bg-gradient-to-br from-[#323398]/5 via-white to-[#179048]/5 p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-4">
        <Avatar name={displayName(employee)} size="lg" />
        <div className="min-w-0">
          <h1 id="me-heading" className="break-words text-2xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {firstNameOf(employee)}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Your leave, documents and details at Platinum Home Care, all in one place.
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <DataItem label="Name" value={displayName(employee)} />
        <DataItem label="Job title" value={employee.job_title} />
        <DataItem label="Area" value={employee.area} />
        <DataItem label="Line manager" value={managerName ?? employee.manager_email} />
        <DataItem label={notStarted ? 'Start date' : 'Time with us'} value={tenureLabel(employee)} />
        <DataItem
          label="Status"
          value={<Badge tone={status?.tone ?? 'gray'} dot>{status?.label ?? employee.employment_status}</Badge>}
        />
      </dl>
    </section>
  )
}

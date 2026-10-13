import Link from 'next/link'
import { CalendarDays, Mail, Phone } from 'lucide-react'
import { EMPLOYMENT_STATUSES } from '@/utils/people/constants'
import { profileCompleteness } from '@/utils/people/completeness'
import { completenessTone, serviceSummary } from '@/utils/people/directory-format'
import { displayName } from '@/utils/people/format'
import type { Employee } from '@/utils/people/types'
import { Avatar, Badge, NotRecorded, ProgressBar } from '../../_components/ui'

// The whole card is clickable through the name link's stretched ::after; the
// email and phone links sit above it (relative z-10) so they still work.
const STRETCH = "after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-none focus-visible:after:ring-4 focus-visible:after:ring-[#323398]/30"

function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : null
}

function EmployeeCard({ employee: e }: { employee: Employee }) {
  const name = displayName(e)
  const status = EMPLOYMENT_STATUSES.find(s => s.value === e.employment_status)
  const { percent } = profileCompleteness(e)
  const service = serviceSummary(e)
  const phone = e.work_phone?.trim() ?? ''
  const phoneHref = phone ? telHref(phone) : null

  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl border border-slate-200/80 p-5 shadow-sm transition hover:border-[#323398]/30 hover:shadow-md ${
        e.employment_status === 'leaver' ? 'bg-slate-50' : 'bg-white'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-900">
            <Link href={`/employees/${e.id}`} className={STRETCH}>{name}</Link>
          </h2>
          <p className="mt-0.5 truncate text-sm text-slate-600">{e.job_title?.trim() || <NotRecorded label="No job title yet" />}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {e.area?.trim() ? <Badge tone="blue">{e.area.trim()}</Badge> : <NotRecorded label="No area yet" />}
            {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex min-w-0 items-center gap-2.5">
          <Mail size={15} aria-hidden="true" className="shrink-0 text-slate-400" />
          <span className="sr-only">Email</span>
          <a href={`mailto:${e.email}`} className="relative z-10 truncate text-slate-700 hover:text-[#323398] hover:underline">{e.email}</a>
        </li>
        <li className="flex min-w-0 items-center gap-2.5">
          <Phone size={15} aria-hidden="true" className="shrink-0 text-slate-400" />
          <span className="sr-only">Work phone</span>
          {phone
            ? phoneHref
              ? <a href={phoneHref} className="relative z-10 truncate text-slate-700 hover:text-[#323398] hover:underline">{phone}</a>
              : <span className="truncate text-slate-700">{phone}</span>
            : <NotRecorded label="No work phone yet" />}
        </li>
        <li className="flex min-w-0 items-center gap-2.5">
          <CalendarDays size={15} aria-hidden="true" className="shrink-0 text-slate-400" />
          <span className="sr-only">Length of service</span>
          {service ? <span className="truncate text-slate-700">{service}</span> : <NotRecorded label="Start date not recorded yet" />}
        </li>
      </ul>

      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>Profile completeness</span>
          <span className="font-medium tabular-nums text-slate-700">{percent}%</span>
        </div>
        <ProgressBar value={percent} tone={completenessTone(percent)} label={`${name}: profile ${percent}% complete`} />
      </div>
    </article>
  )
}

export function EmployeeCards({ employees }: { employees: Employee[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {employees.map(employee => (
        <li key={employee.id}><EmployeeCard employee={employee} /></li>
      ))}
    </ul>
  )
}

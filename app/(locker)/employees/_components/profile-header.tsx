import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarCheck, ChevronRight, LogOut, Mail, Pencil, Phone, UserCheck, type LucideIcon } from 'lucide-react'
import { Avatar, Badge, buttonClass, NotRecorded } from '../../_components/ui'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, labelOf } from '@/utils/people/constants'
import { displayName, formatDate, tenure } from '@/utils/people/format'
import type { Employee } from '@/utils/people/types'

type HeaderCrumb = { label: string; href?: string }

/** The banner at the top of an employee profile: who they are and the facts people look up most. */
export function ProfileHeader({ employee, managerName, canEdit, crumbs }: {
  employee: Employee
  managerName: string | null
  canEdit: boolean
  crumbs: HeaderCrumb[]
}) {
  const name = displayName(employee)
  const status = EMPLOYMENT_STATUSES.find(s => s.value === employee.employment_status)
  const isLeaver = employee.employment_status === 'leaver'

  return (
    <header className="mb-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {c.href ? <Link href={c.href} className="hover:text-[#323398] hover:underline">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            {i < crumbs.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
          </span>
        ))}
      </nav>

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="h-20 bg-gradient-to-r from-[#323398]/90 via-[#323398]/70 to-[#179048]/80 sm:h-24" aria-hidden="true" />
        <div className="px-5 pb-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
              {/* Only the avatar overlaps the banner; the text sits on the white card so it is always readable. */}
              <span className="-mt-10 w-fit shrink-0 rounded-full ring-4 ring-white sm:-mt-12"><Avatar name={name} size="xl" /></span>
              <div className="min-w-0 sm:pt-3">
                <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900">{name}</h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  {employee.job_title || <NotRecorded label="Job title not recorded yet" />}
                  {employee.area && <span className="text-slate-400"> · </span>}
                  {employee.area}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
                  {employee.employment_type
                    ? <Badge tone="blue">{labelOf(EMPLOYMENT_TYPES, employee.employment_type)}</Badge>
                    : <span className="text-xs italic text-slate-400">Employment type not recorded</span>}
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 sm:pt-3">
                <Link href="?tab=employment" prefetch={false} className={buttonClass('secondary', 'sm')}>
                  <Pencil size={14} /> Edit details
                </Link>
                {!isLeaver && (
                  <Link href="?tab=personal#record-leaver" prefetch={false} className={buttonClass('ghost', 'sm')}>
                    <LogOut size={14} /> Record leaver
                  </Link>
                )}
              </div>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact icon={Mail} label="Work email">
              <a href={`mailto:${employee.email}`} className="break-all text-[#323398] hover:underline">{employee.email}</a>
            </Fact>
            <Fact icon={Phone} label="Work phone">
              {employee.work_phone
                ? <a href={`tel:${employee.work_phone.replace(/[^\d+]/g, '')}`} className="text-[#323398] hover:underline">{employee.work_phone}</a>
                : <NotRecorded />}
            </Fact>
            <Fact icon={CalendarCheck} label="Started">
              {employee.start_date
                ? <>{formatDate(employee.start_date)} <span className="text-slate-500">· {tenure(employee.start_date, employee.end_date)}</span></>
                : <NotRecorded />}
            </Fact>
            <Fact icon={UserCheck} label="Line manager">
              {managerName ?? (employee.manager_email || <NotRecorded />)}
            </Fact>
          </dl>
        </div>
      </div>
    </header>
  )
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
      </div>
    </div>
  )
}

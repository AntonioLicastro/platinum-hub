import Link from 'next/link'
import { ArrowRight, IdCard, Lock } from 'lucide-react'
import type { Completeness } from '@/utils/people/completeness'
import { EMPLOYMENT_TYPES, labelOf } from '@/utils/people/constants'
import { formatDate } from '@/utils/people/format'
import type { MyDetails } from '@/utils/people/me-data'
import { pluralise } from '@/utils/people/me-format'
import type { Employee } from '@/utils/people/types'
import { Card, CardHeader, DataGrid, DataItem, ProgressBar } from '../../_components/ui'
import { Unavailable } from './unavailable'

const MISSING_SHOWN = 8

export function DetailsCard({ employee, details }: { employee: Employee; details: MyDetails }) {
  const { contact, completeness } = details
  const profileHref = `/employees/${employee.id}`
  const hours = employee.contract_hours_per_week

  return (
    <Card>
      <CardHeader icon={IdCard} title="My details" description="What HR has on record for you" />

      <DataGrid>
        <DataItem label="Employee number" value={employee.employee_no} />
        <DataItem label="Start date" value={formatDate(employee.start_date)} />
        <DataItem label="Employment type" value={labelOf(EMPLOYMENT_TYPES, employee.employment_type)} />
        <DataItem label="Contracted hours" value={hours === null ? null : `${hours} ${pluralise(hours, 'hour')} a week`} />
        <DataItem label="Base location" value={employee.base_location} />
        <DataItem label="Work phone" value={employee.work_phone} />
        <DataItem label="Work email" value={employee.email} wide />
      </DataGrid>

      <section aria-labelledby="me-contact-heading" className="mt-6 border-t border-slate-100 pt-5">
        <h3 id="me-contact-heading" className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Lock size={13} aria-hidden="true" /> Your personal contact details
        </h3>
        {contact.ok ? (
          <DataGrid>
            <DataItem label="Mobile" value={contact.data.mobile && <Masked value={contact.data.mobile} />} />
            <DataItem label="Personal email" value={contact.data.personalEmail && <Masked value={contact.data.personalEmail} />} />
            <DataItem label="County" value={contact.data.county} />
          </DataGrid>
        ) : (
          <Unavailable what="your contact details" />
        )}
        <p className="mt-3 text-xs text-slate-500">
          Only part of your mobile and email is shown here, in case someone is looking over your shoulder.{' '}
          <Link href={`${profileHref}?tab=personal`} prefetch={false} className="font-medium text-[#323398] hover:underline">
            See everything on your profile
          </Link>
        </p>
      </section>

      <p className="mt-5 text-sm text-slate-600">
        Spot something wrong? <span className="font-medium text-slate-800">Tell HR</span> and they will put it right.
      </p>

      <section aria-labelledby="me-complete-heading" className="mt-5 rounded-xl bg-slate-50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="me-complete-heading" className="text-sm font-semibold text-slate-900">Help HR keep your details up to date</h3>
          {completeness.ok && <span className="text-sm font-semibold tabular-nums text-slate-700">{completeness.data.percent}%</span>}
        </div>
        {completeness.ok ? <CompletenessBody completeness={completeness.data} /> : <div className="mt-3"><Unavailable what="how complete your record is" /></div>}
      </section>

      <Link
        href={profileHref}
        prefetch={false}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#323398] hover:underline focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        View my full profile <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </Card>
  )
}

function CompletenessBody({ completeness }: { completeness: Completeness }) {
  return (
    <>
      <div className="mt-2">
        <ProgressBar
          value={completeness.percent}
          tone={completeness.percent >= 80 ? 'green' : 'amber'}
          label="How much of your record is filled in"
        />
      </div>
      {completeness.missing.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Everything HR looks for is on your record. Thank you.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-600">
            These are not on your record yet. If you can, let HR know so they can add them:
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {completeness.missing.slice(0, MISSING_SHOWN).map(field => (
              <li key={field.key} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                {field.label}
              </li>
            ))}
            {completeness.missing.length > MISSING_SHOWN && (
              <li className="px-1 py-1 text-xs text-slate-500">and {completeness.missing.length - MISSING_SHOWN} more</li>
            )}
          </ul>
        </>
      )}
    </>
  )
}

/** Masked text is read out as "hidden" rather than as a string of bullet characters. */
function Masked({ value }: { value: string }) {
  return (
    <>
      <span aria-hidden="true" className="font-mono tracking-wide">{value}</span>
      <span className="sr-only">Hidden for your privacy</span>
    </>
  )
}

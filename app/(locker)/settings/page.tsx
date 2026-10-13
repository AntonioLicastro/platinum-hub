import Link from 'next/link'
import {
  ArrowRight, CalendarDays, CheckCircle2, Circle, FileCheck2, ListChecks, PartyPopper, ScrollText, Settings, ShieldCheck,
  Upload, type LucideIcon,
} from 'lucide-react'
import { can, requireCapability } from '@/utils/people/access'
import { todayIso } from '@/utils/people/format'
import { loadOverviewCounts, type OverviewCounts } from '@/utils/people/settings-overview'
import { Card, CardHeader, PageHeader, ProgressBar, buttonClass } from '../_components/ui'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type Step = {
  title: string
  detail: string
  /** null when the count could not be read. */
  done: boolean | null
  href: string | null
  cta: string
}

/** The sentence under a step: what is in place, what is missing, or that the count could not be read. */
function describe(count: number | null, whenDone: (n: number) => string, whenMissing: string): string {
  if (count === null) return "Couldn't check this just now. Refresh the page to try again."
  return count > 0 ? whenDone(count) : whenMissing
}

function setupSteps(c: OverviewCounts, year: number, canManageAccess: boolean): Step[] {
  const has = (n: number | null) => (n === null ? null : n > 0)
  return [
    {
      title: 'Employees are in HR Locker',
      done: has(c.employees),
      detail: describe(
        c.employees,
        n => `${plural(n, 'employee record is', 'employee records are')} in HR Locker.`,
        'No employee records yet. Import your staff list to get started.',
      ),
      href: c.employees ? '/directory' : '/settings/import',
      cta: c.employees ? 'View directory' : 'Import employees',
    },
    {
      title: 'Mandatory documents are marked',
      done: has(c.mandatoryDocumentTypes),
      detail: describe(
        c.mandatoryDocumentTypes,
        n => `${plural(n, 'document type is', 'document types are')} mandatory, so Compliance can show who is missing them.`,
        "No document type is marked mandatory yet, so Compliance can't show who is missing anything.",
      ),
      href: '/settings/document-types',
      cta: 'Review document types',
    },
    {
      title: `Leave entitlements are set for ${year}`,
      done: has(c.entitlementsThisYear),
      detail: describe(
        c.entitlementsThisYear,
        n => `${plural(n, 'entitlement is', 'entitlements are')} recorded for ${year}.`,
        `No leave entitlements are recorded for ${year} yet, so balances can't be worked out.`,
      ),
      href: '/leave',
      cta: 'Set entitlements',
    },
    {
      title: `Public holidays for ${year + 1} are on the list`,
      done: has(c.holidaysNextYear),
      detail: describe(
        c.holidaysNextYear,
        n => `${plural(n, 'holiday is', 'holidays are')} recorded for ${year + 1}.`,
        `No public holidays for ${year + 1} yet. Leave requests would count them as working days.`,
      ),
      href: `/settings/holidays?year=${year + 1}`,
      cta: `Add ${year + 1} holidays`,
    },
    {
      title: 'Managers have been given access',
      done: has(c.managerRows),
      detail: describe(
        c.managerRows,
        n => `${plural(n, 'manager has', 'managers have')} been given access to their areas.`,
        canManageAccess
          ? 'No area managers have access yet. Line managers already see their direct reports; add area managers if you need them.'
          : 'No area managers have access yet. Ask an HR admin to give them access.',
      ),
      href: canManageAccess ? '/settings/access' : null,
      cta: 'Give access',
    },
  ]
}

function StepRow({ step }: { step: Step }) {
  return (
    <li className="flex items-start gap-3 py-3.5">
      {step.done ? (
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#179048]" aria-hidden="true" />
      ) : (
        <Circle size={20} className="mt-0.5 shrink-0 text-slate-300" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          {step.title}
          <span className="sr-only">{step.done === null ? ' (could not be checked)' : step.done ? ' (done)' : ' (not done yet)'}</span>
        </p>
        <p className="mt-0.5 text-sm text-slate-500">{step.detail}</p>
      </div>
      {step.href && !step.done && (
        <Link href={step.href} className={`${buttonClass('secondary', 'sm')} shrink-0`}>{step.cta}</Link>
      )}
      {step.href && step.done && (
        <Link href={step.href} className="shrink-0 text-xs font-medium text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
          {step.cta}
        </Link>
      )}
    </li>
  )
}

type Area = { href: string; icon: LucideIcon; title: string; blurb: string; stat: string }

function AreaCard({ area }: { area: Area }) {
  const Icon = area.icon
  return (
    <li>
      <Link
        href={area.href}
        className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-[#323398]/30 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#323398]/10 text-[#323398]">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="mt-4 block text-base font-semibold text-slate-900">{area.title}</span>
        <span className="mt-1 block text-sm text-slate-500">{area.blurb}</span>
        <span className="mt-auto flex items-center justify-between pt-4 text-sm font-medium text-slate-700">
          {area.stat}
          <ArrowRight size={16} aria-hidden="true" className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#323398]" />
        </span>
      </Link>
    </li>
  )
}

export default async function SettingsPage() {
  const viewer = await requireCapability('settings.manage')
  const canManageAccess = can(viewer, 'access.manage')
  const canViewAudit = can(viewer, 'audit.view')
  const year = Number(todayIso().slice(0, 4))
  const counts = await loadOverviewCounts({ year, includeAccess: canManageAccess, includeAudit: canViewAudit })

  const stat = (n: number | null, one: string, many: string) => (n === null ? "Couldn't check" : plural(n, one, many))
  const areas: Area[] = []
  if (canManageAccess) {
    areas.push({
      href: '/settings/access', icon: ShieldCheck, title: 'Access',
      blurb: 'Who can open HR Locker beyond their own record, and what they can see.',
      stat: stat(counts.accessRows, 'person with access', 'people with access'),
    })
  }
  areas.push(
    {
      href: '/settings/document-types', icon: FileCheck2, title: 'Document types',
      blurb: 'The documents you keep for each employee, which are mandatory and when they expire.',
      stat: stat(counts.documentTypes, 'document type', 'document types'),
    },
    {
      href: '/settings/leave-types', icon: CalendarDays, title: 'Leave types',
      blurb: 'The kinds of leave people can take and how each one works.',
      stat: stat(counts.leaveTypes, 'leave type', 'leave types'),
    },
    {
      href: '/settings/holidays', icon: PartyPopper, title: 'Public holidays',
      blurb: 'The days leave requests skip when counting working days.',
      stat: counts.holidaysThisYear === null ? "Couldn't check" : `${plural(counts.holidaysThisYear, 'holiday', 'holidays')} in ${year}`,
    },
    {
      href: '/settings/checklists', icon: ListChecks, title: 'Checklist templates',
      blurb: 'The standard steps for getting someone started or sending them off.',
      stat: stat(counts.checklistTemplates, 'template', 'templates'),
    },
    {
      href: '/settings/import', icon: Upload, title: 'Import & sync',
      blurb: 'Bring in employees from a spreadsheet or keep records in step with the rest of the app.',
      stat: stat(counts.employees, 'employee record', 'employee records'),
    },
  )
  if (canViewAudit) {
    areas.push({
      href: '/settings/audit', icon: ScrollText, title: 'Audit log',
      blurb: 'Who changed what, and who looked at sensitive information.',
      stat: counts.auditLastWeek === null ? "Couldn't check" : `${plural(counts.auditLastWeek, 'entry', 'entries')} this week`,
    })
  }

  const steps = setupSteps(counts, year, canManageAccess)
  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length

  return (
    <>
      <PageHeader
        title="Settings"
        icon={Settings}
        subtitle="The building blocks behind HR Locker: who has access, which documents to keep and how leave works."
      />

      <Card className="mb-8">
        <CardHeader
          title="Setting up HR Locker"
          description={
            allDone
              ? 'Everything on the list is in place. Come back at the start of each year to check the new holidays and entitlements.'
              : 'A few things to put in place so the rest of HR Locker has what it needs.'
          }
          actions={<span className="text-sm font-medium tabular-nums text-slate-600">{doneCount} of {steps.length} done</span>}
        />
        <ProgressBar value={(doneCount / steps.length) * 100} label="Setup progress" />
        <ul className="mt-2 divide-y divide-slate-100">
          {steps.map(step => <StepRow key={step.title} step={step} />)}
        </ul>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Manage</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map(area => <AreaCard key={area.href} area={area} />)}
      </ul>
    </>
  )
}

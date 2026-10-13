import Link from 'next/link'
import { ArrowRight, FileCheck2, RefreshCw, Rocket, Upload, UserCog } from 'lucide-react'
import { can, type Capability, type PeopleViewer } from '@/utils/people/access'
import { Card, buttonClass } from '../_components/ui'

type Step = { title: string; body: string; href: string; cap: Capability; icon: typeof Upload }

const STEPS: Step[] = [
  {
    title: 'Sync from the Platinum directory',
    body: 'Bring across everyone who already has a Platinum account, so nobody is typed in twice.',
    href: '/settings/import',
    cap: 'import.run',
    icon: RefreshCw,
  },
  {
    title: 'Import from your previous HR system',
    body: 'Upload an export from your previous HR system to fill in start dates, job titles and contact details in one go.',
    href: '/settings/import',
    cap: 'import.run',
    icon: Upload,
  },
  {
    title: 'Add your document types',
    body: 'Decide what everyone must have on file, such as Garda vetting or manual handling, and when each one expires.',
    href: '/settings/document-types',
    cap: 'settings.manage',
    icon: FileCheck2,
  },
  {
    title: 'Invite your managers',
    body: 'Give line managers a view of their own team, with leave, reviews and documents but never pay or personal details.',
    href: '/settings/access',
    cap: 'access.manage',
    icon: UserCog,
  },
]

const stepClass = 'flex h-full gap-4 rounded-2xl border border-slate-200 bg-white p-4'

export function WelcomeCard({ viewer }: { viewer: PeopleViewer }) {
  return (
    <Card className="border-[#323398]/20 bg-gradient-to-br from-[#323398]/5 via-white to-[#179048]/5">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#323398] text-white shadow-sm">
          <Rocket size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Welcome to HR Locker</h2>
          <p className="mt-0.5 max-w-xl text-sm text-slate-600">
            There is nobody here yet, which is exactly what we expect on day one. Four short steps get your team in,
            and this page fills itself in as you go.
          </p>
        </div>
      </div>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const allowed = can(viewer, step.cap)
          const body = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#323398]/10 text-sm font-semibold text-[#323398]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon size={16} className="shrink-0 text-[#323398]" aria-hidden="true" /> {step.title}
                </span>
                <span className="mt-1 block text-sm text-slate-500">{step.body}</span>
              </span>
            </>
          )
          return (
            <li key={step.title}>
              {allowed ? (
                <Link
                  href={step.href}
                  className={`${stepClass} group transition hover:border-[#323398]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15`}
                >
                  {body}
                  <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-[#323398]" aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <div className={stepClass}>{body}</div>
                  <p className="mt-1.5 px-1 text-xs text-slate-500">Ask an HR admin to do this one.</p>
                </>
              )}
            </li>
          )
        })}
      </ol>

      {can(viewer, 'import.run') && (
        <div className="mt-5">
          <Link href="/settings/import" className={buttonClass('primary')}>
            <Upload size={16} aria-hidden="true" /> Start with the import
          </Link>
        </div>
      )}
    </Card>
  )
}

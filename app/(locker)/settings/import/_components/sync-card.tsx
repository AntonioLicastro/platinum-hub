import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import type { SyncPerson, SyncPlan } from '@/utils/people/import-sync'
import { ActionForm } from '../../../_components/action-form'
import { Card, CardHeader } from '../../../_components/ui'
import { syncFromDirectory } from '../actions'

const NAMES_SHOWN = 8

function SyncGroup({ title, hint, people, detail }: {
  title: string
  hint: string
  people: SyncPerson[]
  detail?: (person: SyncPerson) => string | null
}) {
  const hidden = people.length - NAMES_SHOWN
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className="text-2xl font-semibold leading-none tabular-nums text-slate-900">{people.length}</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      {people.length === 0 ? (
        <p className="mt-3 text-xs italic text-slate-400">Nothing to do here</p>
      ) : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer rounded text-xs font-medium text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
            Show who
          </summary>
          <ul className="mt-2 space-y-1">
            {people.slice(0, NAMES_SHOWN).map(person => (
              <li key={person.email} className="min-w-0 text-slate-700">
                <span className="font-medium">{person.name}</span>
                {detail?.(person) && <span className="text-xs text-slate-500"> · {detail(person)}</span>}
              </li>
            ))}
            {hidden > 0 && <li className="text-xs text-slate-500">and {hidden} more</li>}
          </ul>
        </details>
      )}
    </div>
  )
}

export function SyncCard({ plan }: { plan: SyncPlan | null }) {
  const pending = plan ? plan.fromRoster.length + plan.fromAccounts.length + plan.toLink.length + plan.toFill.length : 0
  const fieldsFor = plan ? new Map(plan.toFill.map(p => [p.email, p.fields.join(', ')])) : new Map<string, string>()

  return (
    <Card>
      <CardHeader
        icon={RefreshCw}
        title="Sync from the Platinum directory"
        description="Keeps HR Locker in step with the staff roster and everyone who has signed up to the apps. It only ever adds people, links them to their account and fills blank fields."
      />

      {!plan && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          The directory could not be read just now, so there is no preview. Refresh the page in a moment.
        </p>
      )}

      {plan && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SyncGroup title="New from the staff roster" hint="On the roster but not in HR Locker yet." people={plan.fromRoster} />
            <SyncGroup title="New from app accounts" hint="Signed up with a company email, not in HR Locker yet." people={plan.fromAccounts} />
            <SyncGroup title="Ready to link" hint="In HR Locker, but not yet linked to their app account." people={plan.toLink} />
            <SyncGroup
              title="Blanks to fill"
              hint="Area, job title or payroll number their profile can fill."
              people={plan.toFill}
              detail={person => fieldsFor.get(person.email) ?? null}
            />
          </div>
          <p className={`mt-4 flex items-center gap-2 text-sm ${pending === 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
            {pending === 0 && <CheckCircle2 size={16} className="shrink-0" />}
            {pending === 0
              ? 'Everything is in sync. Running it again is harmless.'
              : 'Anything HR has already entered is left exactly as it is. People with a non-company email who are not on the roster are skipped.'}
          </p>
        </>
      )}

      <ActionForm action={syncFromDirectory} submitLabel="Sync now" pendingLabel="Syncing…" className="mt-2">
        <p className="text-sm text-slate-500">Safe to run as often as you like. It never changes the roster or anyone’s app profile.</p>
      </ActionForm>
    </Card>
  )
}

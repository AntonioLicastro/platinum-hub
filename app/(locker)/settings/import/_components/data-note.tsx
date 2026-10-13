import { ClipboardList, History, Lock, ShieldCheck } from 'lucide-react'
import type { ComponentType } from 'react'
import { Card } from '../../../_components/ui'

const POINTS: { icon: ComponentType<{ size?: number; className?: string }>; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Nothing is overwritten unless you choose',
    body: 'By default only empty fields are filled in. Replacing existing values is an explicit choice, and an empty cell never wipes out a value.',
  },
  {
    icon: Lock,
    title: 'Personal details stay with HR',
    body: 'PPS numbers, dates of birth and addresses are visible to HR only. Managers never see them.',
  },
  {
    icon: ClipboardList,
    title: 'Every import is recorded',
    body: 'The audit log notes who imported, when, which file and how many people. It never records the details themselves.',
  },
  {
    icon: History,
    title: 'Imports only add and update',
    body: 'Nobody is ever deleted. Review the result in the Directory, and fix anything on the person’s own page.',
  },
]

export function DataNote() {
  return (
    <Card className="bg-gradient-to-br from-indigo-50/70 to-white">
      <h2 className="text-base font-semibold text-slate-900">What happens to my data?</h2>
      <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#323398] shadow-sm ring-1 ring-slate-200">
              <Icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

import Link from 'next/link'
import { ArrowRight, CheckCircle2, ChevronDown, FolderCheck, TriangleAlert } from 'lucide-react'
import type { ComplianceItem } from '@/utils/people/compliance-data'
import type { Loaded } from '@/utils/people/me-data'
import { actionLabel, complianceNote, needsAction, pluralise, sortByUrgency } from '@/utils/people/me-format'
import { Card, CardHeader, ProgressBar } from '../../_components/ui'
import { StateChip } from '../../documents/_components/state-chip'
import { Unavailable } from './unavailable'

export function ComplianceCard({ compliance, employeeId }: { compliance: Loaded<ComplianceItem[]>; employeeId: string }) {
  const documentsHref = `/employees/${employeeId}?tab=documents`

  return (
    <Card>
      <CardHeader icon={FolderCheck} title="My compliance" description="The documents we need to hold on file for you" />
      {compliance.ok
        ? <ComplianceBody items={compliance.data} documentsHref={documentsHref} />
        : <Unavailable what="your documents" />}
    </Card>
  )
}

function ComplianceBody({ items, documentsHref }: { items: ComplianceItem[]; documentsHref: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
        <span className="block font-medium text-slate-700">No documents are required of you yet</span>
        When HR decides which documents you need, such as vetting or training certificates, they are listed here.
      </p>
    )
  }

  const sorted = sortByUrgency(items)
  const todo = sorted.filter(i => needsAction(i.state))
  const waiting = sorted.filter(i => i.state === 'pending')
  const inOrder = sorted.filter(i => i.state === 'valid')

  return (
    <div className="space-y-4">
      {todo.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-600/20">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">You&apos;re all up to date</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              {waiting.length > 0
                ? `HR is still checking ${waiting.length} ${pluralise(waiting.length, 'document')}. There is nothing for you to do.`
                : 'Every document we need is on file and in date. Thank you.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/25">
          <TriangleAlert size={22} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {todo.length} {pluralise(todo.length, 'document needs', 'documents need')} your attention
            </p>
            <p className="mt-0.5 text-sm text-amber-800">Upload what is listed below and HR will check it for you.</p>
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs text-slate-500">{inOrder.length} of {items.length} up to date</p>
        <ProgressBar value={(inOrder.length / items.length) * 100} tone={todo.length === 0 ? 'green' : 'amber'} label="Required documents up to date" />
      </div>

      {todo.length > 0 && (
        <ul className="divide-y divide-slate-100" aria-label="Documents that need your attention">
          {todo.map(item => <DocumentRow key={item.documentType.id} item={item} documentsHref={documentsHref} />)}
        </ul>
      )}

      {waiting.length > 0 && (
        <ul className="divide-y divide-slate-100" aria-label="Documents with HR">
          {waiting.map(item => <DocumentRow key={item.documentType.id} item={item} documentsHref={documentsHref} />)}
        </ul>
      )}

      {inOrder.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="transition group-open:rotate-180" aria-hidden="true" />
            {inOrder.length} {pluralise(inOrder.length, 'document is', 'documents are')} in order
          </summary>
          <ul className="divide-y divide-slate-100">
            {inOrder.map(item => <DocumentRow key={item.documentType.id} item={item} documentsHref={documentsHref} />)}
          </ul>
        </details>
      )}

      <Link
        href={documentsHref}
        prefetch={false}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#323398] hover:underline focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20"
      >
        Open my documents <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}

function DocumentRow({ item, documentsHref }: { item: ComplianceItem; documentsHref: string }) {
  const note = complianceNote(item)
  const action = actionLabel(item.state)
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-slate-900">{item.documentType.name}</p>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
        <StateChip state={item.state} daysToExpiry={item.daysToExpiry} />
      </div>
      {action && (
        <Link
          href={documentsHref}
          prefetch={false}
          className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#323398] hover:underline focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-[#323398]/20"
        >
          {action} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </li>
  )
}

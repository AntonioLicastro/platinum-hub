import Link from 'next/link'
import { BellRing, CalendarClock, CheckCircle2, ChevronRight, CircleDashed, ClipboardCheck, Clock3, FileX2, Hourglass, Info, ListChecks, TriangleAlert } from 'lucide-react'
import type { AttentionGroup, AttentionKind, AttentionTone } from '@/utils/people/dashboard-attention'
import type { AttentionNotice } from '@/utils/people/dashboard-data'
import { Avatar, Badge, Card, CardHeader } from '../_components/ui'

const ICONS: Record<AttentionKind, typeof BellRing> = {
  expired: FileX2,
  expiring: Clock3,
  missing: CircleDashed,
  reviews: ClipboardCheck,
  probation: Hourglass,
  tasks: ListChecks,
  leave: CalendarClock,
}

const CHIP: Record<AttentionTone, string> = {
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  gray: 'bg-slate-100 text-slate-500',
}

const rowClass =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/15'

function Group({ group }: { group: AttentionGroup }) {
  const Icon = ICONS[group.kind]
  const hidden = group.total - group.rows.length
  return (
    <section aria-label={group.title} className="border-t border-slate-100 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-1.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CHIP[group.tone]}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
        <Badge tone={group.tone}>{group.total}</Badge>
        {group.summary && <span className="text-xs text-slate-500">{group.summary}</span>}
        {group.viewAll && (
          <Link href={group.viewAll.href} className="ml-auto text-xs font-medium text-[#323398] hover:underline">
            {group.viewAll.label}
          </Link>
        )}
      </div>
      <ul className="px-2">
        {group.rows.map(row => (
          <li key={row.key}>
            <Link href={row.href} className={rowClass}>
              <Avatar name={row.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                <span className="block break-words text-sm text-slate-500">{row.detail}</span>
              </span>
              {row.badge && <Badge tone={row.badge.tone}>{row.badge.label}</Badge>}
              <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && !group.viewAll && (
        <p className="px-5 pt-1.5 text-xs text-slate-500">and {hidden} more not shown here</p>
      )}
    </section>
  )
}

function AllClear({ provisional }: { provisional: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
        <CheckCircle2 size={24} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-slate-800">{provisional ? 'Nothing flagged so far' : "You're all caught up"}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {provisional
          ? 'Nothing needs attention in what we could check. See the note below for what we could not.'
          : 'No expired documents, overdue reviews or tasks, or leave waiting for your decision right now.'}
      </p>
    </div>
  )
}

/** Shown instead of the green all-clear when a source failed: an empty list then proves nothing. */
function CouldNotCheck() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
        <TriangleAlert size={24} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-slate-800">We can&apos;t tell what needs attention</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">
        Some checks did not load, so an empty list here would not mean everything is fine. Refresh the page to try again.
      </p>
    </div>
  )
}

function Notice({ notice }: { notice: AttentionNotice }) {
  const Icon = notice.failed ? TriangleAlert : Info
  return (
    <div
      role={notice.failed ? 'alert' : undefined}
      className={`flex items-start gap-2.5 border-t px-5 py-3 text-sm text-amber-900 ${notice.failed ? 'border-amber-200 bg-amber-100/70' : 'border-slate-100 bg-amber-50/50'}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      <p className={notice.failed ? 'font-medium' : undefined}>
        {notice.text}
        {notice.href && notice.action && (
          <> <Link href={notice.href} className="font-medium text-[#323398] underline underline-offset-2">{notice.action}</Link></>
        )}
      </p>
    </div>
  )
}

export function AttentionCard({ groups, notices }: { groups: AttentionGroup[]; notices: AttentionNotice[] }) {
  // A failed source goes above the list: below a long list it would be scrolled past.
  const failures = notices.filter(n => n.failed)
  const others = notices.filter(n => !n.failed)
  return (
    <Card padded={false}>
      <div className="p-5 pb-3">
        <CardHeader
          icon={BellRing}
          title="Needs attention"
          description="The most urgent things first. Select a row to deal with it."
        />
      </div>
      {failures.map(notice => <Notice key={notice.text} notice={notice} />)}
      {groups.length === 0
        ? (failures.length > 0 ? <CouldNotCheck /> : <AllClear provisional={others.length > 0} />)
        : groups.map(group => <Group key={group.kind} group={group} />)}
      {others.map(notice => <Notice key={notice.text} notice={notice} />)}
    </Card>
  )
}

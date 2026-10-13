import Link from 'next/link'
import { CalendarPlus, LayoutGrid, Upload, UserRound, type LucideIcon } from 'lucide-react'
import { HUB_URL } from '@/utils/hub-url'

type Action = { href: string; label: string; hint: string; icon: LucideIcon; prefetch?: false }

export function QuickActions({ employeeId, canRequestLeave }: { employeeId: string; canRequestLeave: boolean }) {
  // Profile links are not prefetched: opening a profile tab is audited on the server when it renders.
  const actions: Action[] = [
    ...(canRequestLeave
      ? [{ href: '/leave/request', label: 'Request leave', hint: 'Book some time off', icon: CalendarPlus }]
      : []),
    { href: `/employees/${employeeId}`, label: 'View my profile', hint: 'Everything on your record', icon: UserRound, prefetch: false },
    { href: `/employees/${employeeId}?tab=documents`, label: 'Upload a document', hint: 'Certificates, ID, vetting', icon: Upload, prefetch: false },
    { href: HUB_URL, label: 'Platinum Hub', hint: 'All your apps', icon: LayoutGrid },
  ]

  return (
    <nav aria-label="Quick actions" className="mt-6">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map(({ href, label, hint, icon: Icon, prefetch }) => (
          <li key={label}>
            <Link
              href={href}
              prefetch={prefetch}
              className="group flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-[#323398]/30 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#323398]/10 text-[#323398] transition group-hover:bg-[#323398] group-hover:text-white">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

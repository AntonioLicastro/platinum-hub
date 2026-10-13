'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, CalendarDays, ClipboardCheck, FolderCheck, LayoutDashboard, LogOut, Settings, UserCircle, Users,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export type NavIcon = 'dashboard' | 'directory' | 'compliance' | 'leave' | 'onboarding' | 'reports' | 'settings' | 'me'
export type NavItem = { href: string; label: string; icon: NavIcon }

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, directory: Users, compliance: FolderCheck, leave: CalendarDays,
  onboarding: ClipboardCheck, reports: BarChart3, settings: Settings, me: UserCircle,
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="HR Locker" className="flex flex-col gap-1">
      {items.map(item => {
        const Icon = ICONS[item.icon]
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active ? 'bg-[#323398] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon size={18} className={active ? 'text-white' : 'text-slate-400 group-hover:text-[#323398]'} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Horizontally scrollable nav for small screens. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="HR Locker" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none]">
      {items.map(item => {
        const Icon = ICONS[item.icon]
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition ${
              active ? 'bg-[#323398] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            <Icon size={16} /> {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function SignOutButton() {
  const handleLogout = async () => {
    await createClient().auth.signOut()
    // Full reload (not router.push) so no signed-in React state or cached HR data survives.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login'
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
    >
      <LogOut size={16} /> Sign out
    </button>
  )
}

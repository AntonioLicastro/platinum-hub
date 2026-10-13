'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays, FileCheck2, LayoutGrid, ListChecks, PartyPopper, ScrollText, ShieldCheck, Upload,
  type LucideIcon,
} from 'lucide-react'

export type SettingsNavIcon = 'overview' | 'access' | 'documents' | 'leave' | 'holidays' | 'checklists' | 'import' | 'audit'
export type SettingsNavItem = { href: string; label: string; icon: SettingsNavIcon }

const ICONS: Record<SettingsNavIcon, LucideIcon> = {
  overview: LayoutGrid, access: ShieldCheck, documents: FileCheck2, leave: CalendarDays,
  holidays: PartyPopper, checklists: ListChecks, import: Upload, audit: ScrollText,
}

const ROOT = '/settings'

function isActive(pathname: string, href: string): boolean {
  if (href === ROOT) return pathname === ROOT
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Chips that scroll sideways on phones, a vertical list from lg up. */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Settings"
      className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:sticky lg:top-8 lg:mx-0 lg:mb-0 lg:flex-col lg:gap-1 lg:self-start lg:overflow-visible lg:px-0 lg:pb-0 [scrollbar-width:none]"
    >
      {items.map(item => {
        const Icon = ICONS[item.icon]
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 lg:rounded-xl lg:px-3 lg:py-2.5 ${
              active
                ? 'bg-[#323398] text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900 lg:bg-transparent lg:ring-0 lg:hover:bg-slate-100'
            }`}
          >
            <Icon size={16} aria-hidden="true" className={active ? 'text-white' : 'text-slate-400'} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

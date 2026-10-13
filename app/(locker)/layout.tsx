import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, unstable_rethrow } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { HUB_URL } from '@/utils/hub-url'
import { can, getViewer, type PeopleViewer } from '@/utils/people/access'
import { Avatar } from './_components/ui'
import { MobileNav, SidebarNav, SignOutButton, type NavItem } from './_components/nav-links'

export const metadata: Metadata = {
  title: 'HR Locker · Platinum Home Care',
  description: 'Employee records, compliance documents, leave and onboarding',
  // HR data: keep it out of search engines and link previews.
  robots: { index: false, follow: false },
}

const ROLE_LABEL: Record<PeopleViewer['role'], string> = {
  hr_admin: 'HR Admin', hr: 'HR', manager: 'Manager', employee: 'Employee',
}

function navFor(viewer: PeopleViewer): NavItem[] {
  const items: NavItem[] = []
  if (can(viewer, 'employees.view')) items.push({ href: '/', label: 'Dashboard', icon: 'dashboard' })
  if (can(viewer, 'employees.view')) items.push({ href: '/directory', label: 'Directory', icon: 'directory' })
  if (can(viewer, 'documents.view')) items.push({ href: '/documents', label: 'Compliance', icon: 'compliance' })
  if (can(viewer, 'leave.view')) items.push({ href: '/leave', label: 'Leave', icon: 'leave' })
  if (can(viewer, 'checklists.view')) items.push({ href: '/onboarding', label: 'Onboarding', icon: 'onboarding' })
  if (can(viewer, 'reports.view')) items.push({ href: '/reports', label: 'Reports', icon: 'reports' })
  items.push({ href: '/me', label: 'My space', icon: 'me' })
  if (can(viewer, 'settings.manage')) items.push({ href: '/settings', label: 'Settings', icon: 'settings' })
  return items
}

export default async function PeopleLayout({ children }: { children: React.ReactNode }) {
  // getViewer() throws when the database cannot be reached (it never guesses a
  // role). An error boundary cannot catch its own layout, so show the page here.
  let viewer: PeopleViewer | null
  try {
    viewer = await getViewer()
  } catch (err) {
    // Framework signals (dynamic rendering, redirects) must reach Next, not the fallback UI.
    unstable_rethrow(err)
    console.error('HR Locker layout: could not load the viewer', err)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><AlertCircle size={24} /></span>
          <h1 className="text-lg font-semibold text-slate-900">HR Locker couldn&apos;t load</h1>
          <p className="mt-2 text-sm text-slate-500">
            This is usually a brief problem reaching the database. Nothing has been changed. Please try again in a moment.
          </p>
          <Link href="/" prefetch={false} className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#323398] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#282a7a]">Try again</Link>
        </div>
      </div>
    )
  }
  // No HR Locker access: signed-out people go to sign-in; anyone already signed in (a
  // Fleet-only account, or someone it has not been switched on for) goes back to Platinum Hub.
  if (!viewer) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    redirect(user ? HUB_URL : '/login')
  }
  const items = navFor(viewer)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 pb-4 pt-6">
          <Link href={can(viewer, 'employees.view') ? '/' : '/me'} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#323398] to-[#179048] text-lg font-bold text-white shadow-sm">
              H
            </span>
            <span>
              <span className="block text-base font-semibold leading-tight text-slate-900">HR Locker</span>
              <span className="block text-xs text-slate-500">Platinum Home Care</span>
            </span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <SidebarNav items={items} />
        </div>
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <Avatar name={viewer.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{viewer.name}</p>
              <p className="truncate text-xs text-slate-500">{ROLE_LABEL[viewer.role]}</p>
            </div>
          </div>
          <a href={HUB_URL} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
            <ArrowLeft size={16} /> Platinum Hub
          </a>
          <SignOutButton />
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <Link href={can(viewer, 'employees.view') ? '/' : '/me'} className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#323398] to-[#179048] text-sm font-bold text-white">H</span>
              <span className="text-base font-semibold">HR Locker</span>
            </Link>
            <div className="flex items-center gap-1">
              <a href={HUB_URL} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">Platinum Hub</a>
              <div className="w-24"><SignOutButton /></div>
            </div>
          </div>
          <MobileNav items={items} />
        </div>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  )
}

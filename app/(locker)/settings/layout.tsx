import { can, requireCapability } from '@/utils/people/access'
import { SettingsNav, type SettingsNavItem } from './_components/settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Layouts are not re-run on every client navigation, so each page and action checks its own capability too.
  const viewer = await requireCapability('settings.manage')

  const items: SettingsNavItem[] = [{ href: '/settings', label: 'Overview', icon: 'overview' }]
  if (can(viewer, 'access.manage')) items.push({ href: '/settings/access', label: 'Access', icon: 'access' })
  items.push(
    { href: '/settings/document-types', label: 'Document types', icon: 'documents' },
    { href: '/settings/leave-types', label: 'Leave types', icon: 'leave' },
    { href: '/settings/holidays', label: 'Public holidays', icon: 'holidays' },
    { href: '/settings/checklists', label: 'Checklist templates', icon: 'checklists' },
    { href: '/settings/import', label: 'Import & sync', icon: 'import' },
  )
  if (can(viewer, 'audit.view')) items.push({ href: '/settings/audit', label: 'Audit log', icon: 'audit' })

  return (
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      <SettingsNav items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

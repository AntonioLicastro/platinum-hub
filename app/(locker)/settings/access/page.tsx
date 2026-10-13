import Link from 'next/link'
import { Pencil, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { listBootstrapAdmins, requireCapability } from '@/utils/people/access'
import { emailNameMap } from '@/utils/people/employees-data'
import { formatDateTime } from '@/utils/people/format'
import { listAccessRows, listLineManagers, type AccessListRow } from '@/utils/people/settings-access'
import { ACCESS_ROLES, COMPANY_EMAIL_DOMAIN } from '@/utils/people/settings-input'
import { ActionButton } from '../../_components/action-form'
import {
  Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, TableCard, buttonClass, tableClass, tdClass, thClass,
} from '../../_components/ui'
import { Callout } from '../_components/callout'
import { AccessForm } from './_components/access-form'
import { revokeAccess, saveAccess } from './actions'

const BASE = '/settings/access'

function AreaChips({ row }: { row: AccessListRow }) {
  if (row.role !== 'manager') return <span className="text-xs text-slate-500">Everyone</span>
  if (row.areas.length === 0) return <span className="text-xs text-slate-500">Direct reports only</span>
  return (
    <span className="flex flex-wrap gap-1">
      {row.areas.map(area => <span key={area} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{area}</span>)}
    </span>
  )
}

export default async function AccessPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireCapability('access.manage')
  const query = await searchParams
  const [rows, lineManagers] = await Promise.all([listAccessRows(), listLineManagers()])
  const names = await emailNameMap([...rows.map(r => r.email), ...rows.map(r => r.granted_by)])

  const editParam = (Array.isArray(query.edit) ? query.edit[0] : query.edit)?.toLowerCase().trim()
  // Nobody changes their own role from here, so their row can't be opened for editing either. A grant to a
  // non-company address can only be removed: saving it again would be refused.
  const editing = editParam && editParam !== viewer.email ? rows.find(r => r.email === editParam && !r.cannotSignIn) : undefined
  const editingName = editing ? names.get(editing.email) ?? editing.email : ''

  const withRows = new Set(rows.map(r => r.email))
  const automaticManagers = lineManagers.filter(m => !withRows.has(m.email))
  const workingManagers = automaticManagers.filter(m => m.canSignIn)
  const blockedManagers = automaticManagers.length - workingManagers.length
  const leaverRows = rows.filter(r => r.leaver).length
  const roleOf = (role: AccessListRow['role']) => ACCESS_ROLES.find(r => r.value === role) ?? ACCESS_ROLES[0]

  return (
    <>
      <PageHeader
        title="Access"
        icon={ShieldCheck}
        subtitle="Choose who can open HR Locker beyond their own record, and what they can see."
      />

      <Callout>
        These accounts are always HR admins and don&apos;t appear in the list below: <strong>{listBootstrapAdmins().join(', ')}</strong>. Anyone named as a line manager on an
        employee record automatically gets manager access to their direct reports, so you only need to add area managers and HR colleagues.
        Everyone with a company email can always see their own record in My space. HR Locker sign-in is limited to <strong>{COMPANY_EMAIL_DOMAIN}</strong> addresses.
        Access given to anyone else, or to someone who has left, does nothing.
      </Callout>

      {leaverRows > 0 && (
        <Callout tone="caution">
          {leaverRows === 1 ? '1 person below has' : `${leaverRows} people below have`} left Platinum Home Care but still {leaverRows === 1 ? 'holds' : 'hold'} access.
          HR Locker ignores it, so it does nothing. Remove it to keep this list accurate.
        </Callout>
      )}

      <Card className="mb-8">
        {editing ? (
          <>
            <CardHeader icon={Pencil} title={`Change access for ${editingName}`} description="The new role applies the next time they open a page." />
            <AccessForm
              key={editing.email}
              action={saveAccess}
              row={editing}
              idPrefix="edit-access"
              submitLabel="Save changes"
              redirectTo={BASE}
              footer={<Link href={BASE} className={buttonClass('ghost')}>Cancel</Link>}
            />
          </>
        ) : (
          <>
            <CardHeader icon={UserPlus} title="Give someone access" description="They sign in with their usual company account." />
            <AccessForm action={saveAccess} idPrefix="new-access" submitLabel="Give access" resetOnSuccess />
          </>
        )}
      </Card>

      <section aria-labelledby="access-list-heading" className="mb-8">
        <h2 id="access-list-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          People with access
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{rows.length}</span>
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nobody has been given access yet"
            body="Line managers can already see their direct reports. Use the form above to add HR colleagues and the managers who look after whole areas."
          />
        ) : (
          <TableCard>
            <table className={`${tableClass} min-w-[44rem]`}>
              <caption className="sr-only">People with HR Locker access</caption>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th scope="col" className={thClass}>Person</th>
                  <th scope="col" className={thClass}>Role</th>
                  <th scope="col" className={thClass}>Sees</th>
                  <th scope="col" className={thClass}>Given by</th>
                  <th scope="col" className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const name = names.get(row.email)
                  const role = roleOf(row.role)
                  const isYou = row.email === viewer.email
                  const grantedBy = row.granted_by ? names.get(row.granted_by) ?? row.granted_by : null
                  return (
                    <tr key={row.email}>
                      <td className={tdClass}>
                        <div className="flex items-center gap-3">
                          <Avatar name={name ?? row.email} size="sm" />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                              <span className="break-all">{name ?? row.email}</span>
                              {isYou && <Badge tone="gray">You</Badge>}
                              {row.leaver && <Badge tone="amber">Leaver - access is ignored</Badge>}
                              {row.cannotSignIn && <Badge tone="red">Cannot sign in - not a company email</Badge>}
                            </p>
                            {name && <p className="break-all text-xs text-slate-500">{row.email}</p>}
                            {row.note && <p className="mt-0.5 text-xs italic text-slate-500">{row.note}</p>}
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}><Badge tone={role.tone}>{role.label}</Badge></td>
                      <td className={tdClass}><AreaChips row={row} /></td>
                      <td className={`${tdClass} text-xs text-slate-500`}>
                        {grantedBy && <span className="block break-all">{grantedBy}</span>}
                        <span className="block whitespace-nowrap">{formatDateTime(row.created_at)}</span>
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {isYou ? (
                          <span className="text-xs text-slate-400">Ask another HR admin to change your access</span>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {!row.cannotSignIn && (
                              <Link href={`${BASE}?edit=${encodeURIComponent(row.email)}`} className={buttonClass('secondary', 'sm')}>
                                <Pencil size={14} aria-hidden="true" /> Change
                              </Link>
                            )}
                            <ActionButton
                              action={revokeAccess.bind(null, row.email)}
                              label="Remove"
                              pendingLabel="Removing…"
                              variant="ghost"
                              icon={<Trash2 size={14} />}
                              confirm={row.cannotSignIn
                                ? `Remove ${row.email}'s access to HR Locker?`
                                : `Remove ${name ?? row.email}'s access to HR Locker? They will still be able to see their own record.`}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableCard>
        )}
      </section>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
            <span className="flex items-start gap-2.5">
              <Users size={18} className="mt-0.5 shrink-0 text-[#323398]" aria-hidden="true" />
              <span>
                <span className="block text-base font-semibold text-slate-900">Line managers with automatic access</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  {automaticManagers.length === 0
                    ? 'Nobody is named as a line manager yet. Set a line manager on an employee record and they appear here.'
                    : workingManagers.length === 0
                      ? 'Nobody named as a line manager can sign in to HR Locker yet, because they do not have a company email address.'
                      : `${workingManagers.length} ${workingManagers.length === 1 ? 'person has' : 'people have'} manager access to their direct reports because an employee record names them as line manager.`}
                  {blockedManagers > 0 && workingManagers.length > 0 && (
                    <> {blockedManagers} more {blockedManagers === 1 ? 'is' : 'are'} named but cannot sign in, because their email is not a {COMPANY_EMAIL_DOMAIN} address.</>
                  )}
                </span>
              </span>
            </span>
            {automaticManagers.length > 0 && (
              <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">Show list</span>
            )}
          </summary>
          {automaticManagers.length > 0 && (
            <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
              {automaticManagers.map(manager => (
                <li key={manager.email} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={manager.name ?? manager.email} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{manager.name ?? manager.email}</span>
                      {manager.name && <span className="block break-all text-xs text-slate-500">{manager.email}</span>}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {!manager.canSignIn && <Badge tone="red">No access - not a company email</Badge>}
                    {manager.reports} {manager.reports === 1 ? 'direct report' : 'direct reports'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </Card>
    </>
  )
}

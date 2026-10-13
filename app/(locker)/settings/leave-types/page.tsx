import Link from 'next/link'
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { formatDays } from '@/utils/people/format'
import { listLeaveTypes, type LeaveTypeRow } from '@/utils/people/settings-catalog'
import { LEAVE_CATEGORIES } from '@/utils/people/settings-input'
import { ActionButton } from '../../_components/action-form'
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonClass } from '../../_components/ui'
import { ActiveSwitch } from '../_components/active-switch'
import { Callout } from '../_components/callout'
import { LeaveTypeForm } from './_components/leave-type-form'
import { createLeaveType, deleteLeaveType, setLeaveTypeActive, updateLeaveType } from './actions'

const BASE = '/settings/leave-types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function usageText(type: LeaveTypeRow): string {
  const parts: string[] = []
  if (type.requests > 0) parts.push(plural(type.requests, 'request', 'requests'))
  if (type.entitlements > 0) parts.push(plural(type.entitlements, 'entitlement', 'entitlements'))
  return parts.length > 0 ? parts.join(', ') : 'Not used yet'
}

function TypeRow({ type }: { type: LeaveTypeRow }) {
  const inUse = type.requests > 0 || type.entitlements > 0
  return (
    <li className={`flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between ${type.active ? '' : 'bg-slate-50/70'}`}>
      <div className="flex min-w-0 gap-3">
        <span aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              <Link href={`${BASE}?edit=${type.id}`} className="rounded hover:text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
                {type.name}
              </Link>
            </h3>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{type.code}</code>
            <Badge tone={type.paid ? 'green' : 'gray'}>{type.paid ? 'Paid' : 'Unpaid'}</Badge>
            {type.uses_balance && <Badge tone="blue">Uses a balance</Badge>}
            {!type.active && <Badge tone="gray">Inactive</Badge>}
          </div>
          {type.statutory_note
            ? <p className="mt-1 text-sm text-slate-600">{type.statutory_note}</p>
            : <p className="mt-1 text-sm italic text-slate-400">No note recorded yet</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{type.requires_approval ? 'Needs approval' : 'Recorded without approval'}</span>
            <span>
              {type.default_entitlement_days === null ? 'No default entitlement' : `Default ${formatDays(type.default_entitlement_days)} a year`}
            </span>
            <span>{usageText(type)}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:shrink-0 lg:justify-end">
        <ActiveSwitch action={setLeaveTypeActive.bind(null, type.id, !type.active)} active={type.active} name={type.name} />
        <Link href={`${BASE}?edit=${type.id}`} className={buttonClass('secondary', 'sm')}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </Link>
        {inUse ? (
          <span className="max-w-40 text-xs text-slate-400">In use, so deactivate it rather than delete it.</span>
        ) : (
          <ActionButton
            action={deleteLeaveType.bind(null, type.id)}
            label="Delete"
            pendingLabel="Deleting…"
            variant="ghost"
            icon={<Trash2 size={14} />}
            confirm={`Delete “${type.name}”? This cannot be undone.`}
          />
        )}
      </div>
    </li>
  )
}

export default async function LeaveTypesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('settings.manage')
  const [query, types] = await Promise.all([searchParams, listLeaveTypes()])
  const editParam = Array.isArray(query.edit) ? query.edit[0] : query.edit
  const editing = editParam && /^\d{1,9}$/.test(editParam) ? types.find(t => t.id === Number(editParam)) : undefined
  const inactive = types.filter(t => !t.active).length

  return (
    <>
      <PageHeader
        title="Leave types"
        icon={CalendarDays}
        subtitle="The kinds of leave employees can request or have recorded, and how each one works."
      />

      <Callout tone="caution">
        The notes on statutory leave types are guidance only. Check entitlements and pay rules against current legislation and
        Platinum&apos;s own policies before relying on them.
      </Callout>

      {editing ? (
        <Card className="mb-8">
          <CardHeader title={`Edit “${editing.name}”`} description="Changes apply to new requests. Leave already requested or approved is kept as it is." />
          <LeaveTypeForm
            key={editing.id}
            action={updateLeaveType.bind(null, editing.id)}
            type={editing}
            idPrefix="edit-leave-type"
            submitLabel="Save changes"
            redirectTo={BASE}
            footer={<Link href={BASE} className={buttonClass('ghost')}>Cancel</Link>}
          />
        </Card>
      ) : (
        <Card className="mb-8">
          <details open={types.length === 0} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-base font-semibold text-slate-900">Add a leave type</span>
                <span className="mt-0.5 block text-sm text-slate-500">For example a company-specific type of leave.</span>
              </span>
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">
                <Plus size={14} aria-hidden="true" /> New leave type
              </span>
            </summary>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <LeaveTypeForm action={createLeaveType} idPrefix="new-leave-type" submitLabel="Add leave type" resetOnSuccess />
            </div>
          </details>
        </Card>
      )}

      {types.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No leave types yet"
          body="Add the kinds of leave your team can take, such as annual leave, sick leave and parental leave. Mark the ones that draw down a yearly entitlement as using a balance."
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {plural(types.length, 'leave type', 'leave types')}{inactive > 0 ? `, ${inactive} inactive` : ''}.
          </p>
          <div className="space-y-8">
            {LEAVE_CATEGORIES.map(category => {
              const ofCategory = types.filter(t => t.category === category.value)
              if (ofCategory.length === 0) return null
              return (
                <section key={category.value} aria-labelledby={`category-${category.value}`}>
                  <h2 id={`category-${category.value}`} className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {category.label}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{ofCategory.length}</span>
                  </h2>
                  <p className="mb-3 text-xs text-slate-500">{category.blurb}</p>
                  <Card padded={false}>
                    <ul className="divide-y divide-slate-100">
                      {ofCategory.map(type => <TypeRow key={type.id} type={type} />)}
                    </ul>
                  </Card>
                </section>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

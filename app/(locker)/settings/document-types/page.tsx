import Link from 'next/link'
import { FileCheck2, Pencil, Plus, Trash2 } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { DOCUMENT_CATEGORIES } from '@/utils/people/constants'
import { listDocumentTypes, type DocumentTypeRow } from '@/utils/people/settings-catalog'
import { describeExpiry } from '@/utils/people/settings-input'
import { ActionButton } from '../../_components/action-form'
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonClass } from '../../_components/ui'
import { ActiveSwitch } from '../_components/active-switch'
import { Callout } from '../_components/callout'
import { TypeForm } from './_components/type-form'
import { createDocumentType, deleteDocumentType, setDocumentTypeActive, updateDocumentType } from './actions'

const BASE = '/settings/document-types'
/** Job titles named on a row before the rest collapse into a count. */
const TITLES_SHOWN = 3

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function AppliesTo({ titles }: { titles: string[] }) {
  if (titles.length === 0) return <span>Everyone</span>
  const shown = titles.slice(0, TITLES_SHOWN)
  const hidden = titles.length - shown.length
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map(t => <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{t}</span>)}
      {hidden > 0 && <span>and {hidden} more</span>}
    </span>
  )
}

function TypeRow({ type }: { type: DocumentTypeRow }) {
  return (
    <li className={`flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between ${type.active ? '' : 'bg-slate-50/70'}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            <Link href={`${BASE}?edit=${type.id}`} className="rounded hover:text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
              {type.name}
            </Link>
          </h3>
          {type.mandatory && <Badge tone="blue">Mandatory</Badge>}
          {type.requires_expiry && <Badge tone="sky">Expires</Badge>}
          {!type.active && <Badge tone="gray">Inactive</Badge>}
        </div>
        {type.description
          ? <p className="mt-1 text-sm text-slate-600">{type.description}</p>
          : <p className="mt-1 text-sm italic text-slate-400">No description yet</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{describeExpiry(type)}</span>
          <span className="inline-flex flex-wrap items-center gap-1.5">For: <AppliesTo titles={type.applies_to_titles} /></span>
          <span>{type.documents === 0 ? 'None on file yet' : `${plural(type.documents, 'document', 'documents')} on file`}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:shrink-0 lg:justify-end">
        <ActiveSwitch action={setDocumentTypeActive.bind(null, type.id, !type.active)} active={type.active} name={type.name} />
        <Link href={`${BASE}?edit=${type.id}`} className={buttonClass('secondary', 'sm')}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </Link>
        {type.documents === 0 ? (
          <ActionButton
            action={deleteDocumentType.bind(null, type.id)}
            label="Delete"
            pendingLabel="Deleting…"
            variant="ghost"
            icon={<Trash2 size={14} />}
            confirm={`Delete “${type.name}”? This cannot be undone.`}
          />
        ) : (
          <span className="max-w-40 text-xs text-slate-400">In use, so deactivate it rather than delete it.</span>
        )}
      </div>
    </li>
  )
}

export default async function DocumentTypesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('settings.manage')
  const [query, types] = await Promise.all([searchParams, listDocumentTypes()])
  const editParam = Array.isArray(query.edit) ? query.edit[0] : query.edit
  const editing = editParam && /^\d{1,9}$/.test(editParam) ? types.find(t => t.id === Number(editParam)) : undefined
  const mandatory = types.filter(t => t.mandatory && t.active).length
  const inactive = types.filter(t => !t.active).length

  return (
    <>
      <PageHeader
        title="Document types"
        icon={FileCheck2}
        subtitle="The documents you keep for each employee: which are mandatory, which expire, and who they apply to."
      />

      <Callout tone="caution">
        The document types and renewal periods that came with HR Locker, such as the Garda vetting interval and training renewals, are
        starting points. Confirm each one against Platinum&apos;s own policy and any commissioning or HIQA requirements before relying on it.
      </Callout>

      {editing ? (
        <Card className="mb-8">
          <CardHeader title={`Edit “${editing.name}”`} description="Changes apply to checks from now on. Documents already filed are kept." />
          <TypeForm
            key={editing.id}
            action={updateDocumentType.bind(null, editing.id)}
            type={editing}
            idPrefix="edit-type"
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
                <span className="block text-base font-semibold text-slate-900">Add a document type</span>
                <span className="mt-0.5 block text-sm text-slate-500">For example a new training course or a licence your team needs to hold.</span>
              </span>
              <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm group-open:hidden">
                <Plus size={14} aria-hidden="true" /> New document type
              </span>
            </summary>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <TypeForm action={createDocumentType} idPrefix="new-type" submitLabel="Add document type" resetOnSuccess />
            </div>
          </details>
        </Card>
      )}

      {types.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No document types yet"
          body="Add the documents you need to keep for each employee, such as Garda vetting, right to work and mandatory training. Mark the ones every employee must have as mandatory."
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {plural(types.length, 'document type', 'document types')}, {mandatory} mandatory{inactive > 0 ? `, ${inactive} inactive` : ''}.
          </p>
          <div className="space-y-8">
            {DOCUMENT_CATEGORIES.map(category => {
              const ofCategory = types.filter(t => t.category === category.value)
              if (ofCategory.length === 0) return null
              return (
                <section key={category.value} aria-labelledby={`category-${category.value}`}>
                  <h2 id={`category-${category.value}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {category.label}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{ofCategory.length}</span>
                  </h2>
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

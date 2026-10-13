import { Download } from 'lucide-react'
import type { ComplianceItem } from '@/utils/people/compliance-data'
import { relativeSpan, type DocumentTypeOption } from '@/utils/people/documents-meta'
import { formatDate } from '@/utils/people/format'
import { Badge, NotRecorded } from '../../_components/ui'
import { InlineUpload } from './document-uploader'
import { StateChip } from './state-chip'

function Detail({ item, canDownload }: { item: ComplianceItem; canDownload: boolean }) {
  const { document: doc, documentType: type, state, daysToExpiry } = item
  const optional = !type.mandatory
  if (state === 'missing') return <NotRecorded label={optional ? 'Not provided. Add it if it applies.' : 'Nothing on file yet'} />
  if (state === 'rejected') return <span className="text-red-600">The last upload was rejected. Add a replacement.</span>
  if (!doc) return null

  const parts: React.ReactNode[] = []
  if (doc.expires_on && daysToExpiry !== null) {
    parts.push(<span key="expiry">{daysToExpiry < 0 ? 'Expired' : 'Expires'} {formatDate(doc.expires_on)} <span className="text-slate-400">({relativeSpan(daysToExpiry)})</span></span>)
  } else if (type.requires_expiry) {
    parts.push(<span key="expiry" className="text-amber-700">Expiry date still needed</span>)
  } else {
    parts.push(<span key="expiry">No expiry date</span>)
  }
  if (canDownload && doc.reference_no) parts.push(<span key="ref">Ref {doc.reference_no}</span>)
  return (
    <>
      {parts.map((part, i) => <span key={i}>{i > 0 && <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>}{part}</span>)}
    </>
  )
}

/**
 * One document type for one person: its state, the key date and an Add / Replace
 * button. A flex-wrap row so the upload form opens on its own line underneath.
 */
export function RequiredRow({ item, employeeId, typeOptions, canAdd, canVerify, canDownload }: {
  item: ComplianceItem
  employeeId: string
  typeOptions: DocumentTypeOption[]
  canAdd: boolean
  canVerify: boolean
  /** documents.download for this person: the file link and reference number are not shown to anyone else. */
  canDownload: boolean
}) {
  const { documentType: type, document: doc, state } = item
  const hasCurrentFile = Boolean(doc?.file_path) && state !== 'rejected'
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
          {type.name}
          {!type.mandatory && <Badge tone="gray">Optional</Badge>}
        </p>
        <p className="mt-0.5 text-sm text-slate-500"><Detail item={item} canDownload={canDownload} /></p>
      </div>
      <StateChip state={state} daysToExpiry={item.daysToExpiry} />
      {canDownload && hasCurrentFile && doc && (
        <a
          href={`/api/document?id=${doc.id}`}
          aria-label={`Download ${type.name}`}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/50"
        >
          <Download size={16} />
        </a>
      )}
      {canAdd && (
        <InlineUpload
          employeeId={employeeId}
          types={typeOptions}
          typeId={type.id}
          canVerify={canVerify}
          replace={Boolean(doc) && state !== 'rejected'}
        />
      )}
    </li>
  )
}

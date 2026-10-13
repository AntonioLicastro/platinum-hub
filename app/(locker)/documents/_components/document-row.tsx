import { Ban, Check, Download, FileText, Pencil, Trash2 } from 'lucide-react'
import { DOCUMENT_STATUSES, relativeSpan, type DocumentTypeOption } from '@/utils/people/documents-meta'
import { formatBytes } from '@/utils/people/documents-file'
import { daysBetween, expiryState, formatDate, formatDateTime } from '@/utils/people/format'
import { DEFAULT_EXPIRY_WARNING_DAYS } from '@/utils/people/constants'
import type { EmployeeDocument } from '@/utils/people/types'
import { ActionButton, ActionForm } from '../../_components/action-form'
import { Badge, DataGrid, DataItem, buttonClass } from '../../_components/ui'
import { deleteDocument, rejectDocument, updateDocument, verifyDocument } from '../actions'
import { DocumentFields } from './document-fields'
import { AttachFile } from './document-uploader'

type Props = {
  doc: EmployeeDocument
  employeeId: string
  typeName: string | null
  /** Warn this many days before expiry (the type's reminder_days). */
  reminderDays: number | null
  /** A newer document for the same requirement has replaced this one. */
  superseded: boolean
  canManage: boolean
  canAttach: boolean
  /**
   * documents.download for this person (HR and the employee themself). Managers see
   * status and dates only: no file, file name, reference number or notes.
   */
  canDownload: boolean
  uploadedByName: string | null
  reviewedByName: string | null
  /** Types offered when editing: the active ones plus this record's own type. */
  editTypes: DocumentTypeOption[]
}

export function DocumentRow({
  doc, employeeId, typeName, reminderDays, superseded, canManage, canAttach, canDownload, uploadedByName, reviewedByName, editTypes,
}: Props) {
  const status = DOCUMENT_STATUSES.find(s => s.value === doc.status)
  const expiry = superseded || doc.status === 'rejected' ? 'none' : expiryState(doc.expires_on, reminderDays ?? DEFAULT_EXPIRY_WARNING_DAYS)
  const requiresExpiry = editTypes.find(t => t.id === doc.document_type_id)?.requires_expiry ?? false
  const reviewed = doc.status !== 'pending' && doc.verified_at
    ? `${doc.status === 'verified' ? 'Verified' : 'Rejected'} by ${reviewedByName ?? doc.verified_by ?? 'unknown'} on ${formatDateTime(doc.verified_at)}`
    : null
  // A type that tracks expiry but has no date yet is "not recorded"; anything else with no date simply doesn't expire.
  const expires = doc.expires_on
    ? <>{formatDate(doc.expires_on)} <span className="text-slate-400">({relativeSpan(daysBetween(doc.expires_on))})</span></>
    : requiresExpiry ? null : 'No expiry date'

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText size={18} /></span>
          <div className="min-w-0">
            <p className="break-words font-medium text-slate-900">{doc.title}</p>
            <p className="break-words text-sm text-slate-500">
              {typeName ?? 'Other document'}
              {canDownload && doc.reference_no && <> <span className="text-slate-300" aria-hidden="true">·</span> Ref {doc.reference_no}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
          {superseded && <Badge tone="gray">Superseded</Badge>}
          {expiry === 'expired' && <Badge tone="red">Expired</Badge>}
          {expiry === 'expiring' && <Badge tone="amber">Expiring soon</Badge>}
        </div>
      </div>

      <div className="mt-3 pl-12">
        <DataGrid cols={3}>
          <DataItem label="Issued" value={doc.issued_on ? formatDate(doc.issued_on) : null} />
          <DataItem label="Expires" value={expires} />
          {canDownload && (
            <DataItem
              label="File"
              value={doc.file_path ? <>{doc.file_name ?? 'File'}{doc.file_size ? <span className="text-slate-400"> ({formatBytes(doc.file_size)})</span> : null}</> : null}
            />
          )}
          <DataItem label="Added" value={`${uploadedByName ?? doc.uploaded_by ?? 'Unknown'} on ${formatDateTime(doc.created_at)}`} />
          <DataItem label="Review" value={reviewed} />
          {canDownload && <DataItem label="Notes" value={doc.notes} />}
        </DataGrid>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canDownload && doc.file_path && (
            <a href={`/api/document?id=${doc.id}`} className={buttonClass('secondary', 'sm')}>
              <Download size={14} /> Download
            </a>
          )}
          {/* File details are only loaded for viewers who can download, so "no file_path" means "no file" only for them. */}
          {canDownload && canAttach && !doc.file_path && <AttachFile employeeId={employeeId} documentId={doc.id} />}
          {canManage && doc.status !== 'verified' && (
            <ActionButton
              action={verifyDocument.bind(null, employeeId, doc.id)}
              label="Verify"
              pendingLabel="Verifying…"
              variant="success"
              icon={<Check size={14} />}
            />
          )}
          {canManage && doc.status !== 'rejected' && (
            <ActionButton
              action={rejectDocument.bind(null, employeeId, doc.id)}
              label="Reject"
              pendingLabel="Rejecting…"
              confirm="Reject this document? It will stop counting towards compliance."
              icon={<Ban size={14} />}
            />
          )}
          {canManage && (
            <ActionButton
              action={deleteDocument.bind(null, employeeId, doc.id)}
              label="Delete"
              pendingLabel="Deleting…"
              confirm="Delete this document? The record and its file are removed permanently."
              variant="danger"
              icon={<Trash2 size={14} />}
            />
          )}
        </div>

        {canManage && (
          <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 open:bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:text-[#323398] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
              <Pencil size={14} /> Edit details
            </summary>
            <div className="border-t border-slate-200 p-4">
              <ActionForm action={updateDocument.bind(null, employeeId, doc.id)} submitLabel="Save changes">
                <DocumentFields
                  key={doc.updated_at}
                  types={editTypes}
                  defaults={{
                    documentTypeId: doc.document_type_id,
                    title: doc.title,
                    referenceNo: doc.reference_no ?? '',
                    issuedOn: doc.issued_on ?? '',
                    expiresOn: doc.expires_on ?? '',
                    notes: doc.notes ?? '',
                  }}
                />
              </ActionForm>
            </div>
          </details>
        )}
      </div>
    </li>
  )
}

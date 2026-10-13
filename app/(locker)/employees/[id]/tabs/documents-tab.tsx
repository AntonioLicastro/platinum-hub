import Link from 'next/link'
import { FileText, FolderCheck, Info, Upload } from 'lucide-react'
import { can, canOnEmployee, isHr, isSelf } from '@/utils/people/access'
import { buildComplianceItems, listDocumentTypes, listEmployeeDocuments, summariseCompliance } from '@/utils/people/compliance-data'
import type { DocumentTypeOption } from '@/utils/people/documents-meta'
import { emailNameMap } from '@/utils/people/employees-data'
import { Card, CardHeader, EmptyState, ProgressBar, buttonClass } from '../../../_components/ui'
import { DocumentRow } from '../../../documents/_components/document-row'
import { UploadDocumentForm } from '../../../documents/_components/document-uploader'
import { RequiredRow } from '../../../documents/_components/required-row'
import type { TabProps } from './types'

const toOption = ({ id, name, category, requires_expiry, default_validity_months }: DocumentTypeOption): DocumentTypeOption =>
  ({ id, name, category, requires_expiry, default_validity_months })

export default async function DocumentsTab({ viewer, employee }: TabProps) {
  if (!canOnEmployee(viewer, 'documents.view', employee)) {
    return <Card><EmptyState icon={FileText} title="You can't see these documents" body="Ask HR if you need access to this person's records." /></Card>
  }
  const canManage = canOnEmployee(viewer, 'documents.manage', employee)
  // Managers see compliance status only. The stored files, reference numbers and
  // notes are for HR and the employee themself, so for anyone else they are never loaded.
  const canDownload = canOnEmployee(viewer, 'documents.download', employee)
  const ownRecord = isSelf(viewer, employee)
  const canAdd = canManage || ownRecord
  const canEditSettings = can(viewer, 'settings.manage')

  const [types, docs] = await Promise.all([listDocumentTypes(), listEmployeeDocuments(employee.id, canDownload)])
  const activeTypes = types.filter(t => t.active)
  const typeById = new Map(types.map(t => [t.id, t]))
  const typeOptions = activeTypes.map(toOption)

  const slots = buildComplianceItems(employee, activeTypes, docs, true)
  const required = slots.filter(s => s.documentType.mandatory)
  const optional = slots.filter(s => !s.documentType.mandatory)
  const summary = summariseCompliance(required)

  // Older copies of a requirement that a newer document has replaced.
  const currentByType = new Map(slots.flatMap(s => (s.document ? [[s.documentType.id, s.document.id] as const] : [])))
  const isSuperseded = (docTypeId: number | null, docId: string, rejected: boolean) =>
    !rejected && docTypeId !== null && currentByType.has(docTypeId) && currentByType.get(docTypeId) !== docId

  const names = await emailNameMap(docs.flatMap(d => [d.uploaded_by, d.verified_by]))
  const nameOf = (email: string | null) => (email ? names.get(email.toLowerCase()) ?? null : null)

  const settingsLink = canEditSettings && (
    <Link href="/settings/document-types" className="font-medium text-[#323398] hover:underline">Document types settings</Link>
  )

  return (
    <div className="space-y-6">
      {ownRecord && !canManage && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Info size={18} className="mt-0.5 shrink-0 text-sky-600" />
          {isHr(viewer)
            ? 'Add your documents here. Another member of HR has to check each one: nobody can verify their own documents.'
            : 'Add your documents here. HR checks each one before it counts as verified.'}
        </p>
      )}
      {!canAdd && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
          {canDownload
            ? 'You can see which documents are on file and when they expire. HR adds, checks and removes documents.'
            : 'You can see which documents are on file, their status and when they expire. HR holds the files and checks them.'}
        </p>
      )}

      <Card>
        <CardHeader
          icon={FolderCheck}
          title="Required documents"
          description={
            required.length > 0
              ? `${summary.valid + summary.expiring} of ${required.length} in order${employee.job_title ? ` for ${employee.job_title}` : ''}`
              : 'What this person must have on file'
          }
        />
        {activeTypes.length === 0 ? (
          <EmptyState
            icon={FolderCheck}
            title="No document types are set up yet"
            body="Once HR lists the documents the company needs, such as Garda vetting and training certificates, each one gets a row here."
            action={settingsLink || undefined}
          />
        ) : (
          <>
            {required.length > 0 ? (
              <>
                <ProgressBar value={summary.score} tone={summary.score >= 90 ? 'green' : summary.score >= 60 ? 'amber' : 'red'} label="Required documents in order" />
                <ul className="mt-2 divide-y divide-slate-100">
                  {required.map(item => (
                    <RequiredRow key={item.documentType.id} item={item} employeeId={employee.id} typeOptions={typeOptions} canAdd={canAdd} canVerify={canManage} canDownload={canDownload} />
                  ))}
                </ul>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
                No mandatory documents apply to {employee.job_title ?? 'this role'} yet.{settingsLink && <> Choose them in {settingsLink}.</>}
              </p>
            )}
            {optional.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional for this role</h3>
                <ul className="divide-y divide-slate-100">
                  {optional.map(item => (
                    <RequiredRow key={item.documentType.id} item={item} employeeId={employee.id} typeOptions={typeOptions} canAdd={canAdd} canVerify={canManage} canDownload={canDownload} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardHeader
            icon={FileText}
            title="All documents"
            description={docs.length > 0 ? `${docs.length} on file, newest first` : 'Everything uploaded or recorded for this person'}
            actions={canAdd && docs.length > 0 ? <a href="#add-document" className={buttonClass('secondary', 'sm')}><Upload size={14} /> Add document</a> : undefined}
          />
        </div>
        {docs.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={FileText}
              title="No documents on file yet"
              body={canAdd
                ? 'Add a record now, even before you have the file. You can attach the evidence later.'
                : 'Nothing has been uploaded or recorded for this person yet.'}
              action={canAdd ? <a href="#add-document" className={buttonClass('primary')}><Upload size={16} /> Add the first document</a> : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {docs.map(doc => {
              const type = doc.document_type_id === null ? undefined : typeById.get(doc.document_type_id)
              // A record can still point at a type that has since been switched off; keep it selectable on that record.
              const editTypes = type && !type.active ? [...typeOptions, toOption(type)] : typeOptions
              return (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  employeeId={employee.id}
                  typeName={type?.name ?? null}
                  reminderDays={type?.reminder_days ?? null}
                  superseded={isSuperseded(doc.document_type_id, doc.id, doc.status === 'rejected')}
                  canManage={canManage}
                  canAttach={canManage || (ownRecord && doc.status !== 'verified')}
                  canDownload={canDownload}
                  uploadedByName={nameOf(doc.uploaded_by)}
                  reviewedByName={nameOf(doc.verified_by)}
                  editTypes={editTypes}
                />
              )
            })}
          </ul>
        )}
      </Card>

      {canAdd && (
        <div id="add-document" className="scroll-mt-24">
          <Card>
            <CardHeader
              icon={Upload}
              title="Add a document or record"
              description="Save the details now and attach the file when you have it, or do both in one go."
            />
            <UploadDocumentForm employeeId={employee.id} types={typeOptions} canVerify={canManage} />
          </Card>
        </div>
      )}
    </div>
  )
}

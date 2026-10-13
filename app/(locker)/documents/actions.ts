'use server'

import { revalidatePath } from 'next/cache'
import { authorizeEmployee, type PeopleViewer } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { listDocumentTypes } from '@/utils/people/compliance-data'
import { createAdminClient, withRetry } from '@/utils/people/db'
import { isUuid, parseDocumentFields } from '@/utils/people/documents-input'
import { removeStoredFile } from '@/utils/people/documents-storage'
import type { ActionState, EmployeeDocument } from '@/utils/people/types'

// Verify / reject / delete / edit a document record. Every action re-checks
// documents.manage for the employee that owns the document, looking the owner up
// server-side: the ids in the arguments are only used to find the row, never
// trusted to say who it belongs to. Logs carry document / employee ids only: a
// stored file's path embeds the employee's name, so it is never logged.

type Found = { ok: true; viewer: PeopleViewer; doc: EmployeeDocument } | { ok: false; error: string }

async function authorizeDocument(employeeId: string, documentId: string): Promise<Found> {
  if (!isUuid(employeeId) || !isUuid(documentId)) return { ok: false, error: 'Document not found' }
  const auth = await authorizeEmployee('documents.manage', employeeId)
  if (!auth.ok) return auth
  const admin = createAdminClient()
  const { data: doc, error } = await withRetry(() => admin
    .from('hr_documents')
    .select('*')
    .eq('id', documentId)
    .eq('employee_id', auth.employee.id)
    .maybeSingle<EmployeeDocument>())
  // A database error is not "no such document": say so, so nobody retries a delete that never ran.
  if (error) {
    console.error('document lookup failed', { documentId, employeeId: auth.employee.id }, error.message)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
  if (!doc) return { ok: false, error: 'Document not found' }
  return { ok: true, viewer: auth.viewer, doc }
}

function refresh(employeeId: string) {
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/documents')
}

async function review(employeeId: string, documentId: string, status: 'verified' | 'rejected'): Promise<ActionState> {
  const found = await authorizeDocument(employeeId, documentId)
  if (!found.ok) return { error: found.error }
  const { viewer, doc } = found
  if (doc.status === status) return { error: null, ok: true }

  const admin = createAdminClient()
  if (status === 'verified' && doc.document_type_id !== null) {
    const typeId = doc.document_type_id
    const { data: type, error: typeError } = await withRetry(() => admin.from('hr_document_types').select('requires_expiry').eq('id', typeId).maybeSingle())
    if (typeError) {
      console.error('review document: type lookup failed', { documentId: doc.id }, typeError.message)
      return { error: 'Something went wrong. Please try again.' }
    }
    if (type?.requires_expiry && !doc.expires_on) {
      return { error: 'Add the expiry date (Edit details) before verifying this document.' }
    }
  }

  // verified_by / verified_at record who made the decision, whichever way it went.
  const { error } = await admin
    .from('hr_documents')
    .update({ status, verified_by: viewer.email, verified_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) {
    console.error('review document failed', { documentId: doc.id, employeeId: doc.employee_id }, error.message)
    return { error: 'Could not update the document. Please try again.' }
  }

  await logAudit(viewer, {
    action: status === 'verified' ? 'document.verify' : 'document.reject',
    entity: 'hr_documents',
    entityId: doc.id,
    employeeId: doc.employee_id,
  })
  refresh(doc.employee_id)
  return { error: null, ok: true }
}

export async function verifyDocument(employeeId: string, documentId: string): Promise<ActionState> {
  return review(employeeId, documentId, 'verified')
}

export async function rejectDocument(employeeId: string, documentId: string): Promise<ActionState> {
  return review(employeeId, documentId, 'rejected')
}

export async function deleteDocument(employeeId: string, documentId: string): Promise<ActionState> {
  const found = await authorizeDocument(employeeId, documentId)
  if (!found.ok) return { error: found.error }
  const { viewer, doc } = found

  // The stored file goes first and the row only once the file is really gone. The
  // other way round, a failed removal would leave a person's scan in the bucket
  // with no record saying where it is. If the row delete then fails, running the
  // delete again is safe: a file that is already gone counts as removed.
  if (doc.file_path) {
    const removed = await removeStoredFile(doc.file_path)
    if (!removed.ok) {
      console.error('document file removal failed', { documentId: doc.id, employeeId: doc.employee_id }, removed.reason)
      return { error: 'The stored file could not be removed, so the document was not deleted. Please try again.' }
    }
  }

  const admin = createAdminClient()
  const { error } = await withRetry(() => admin.from('hr_documents').delete().eq('id', doc.id))
  if (error) {
    console.error('delete document failed', { documentId: doc.id, employeeId: doc.employee_id }, error.message)
    return {
      error: doc.file_path
        ? 'The file was removed but the record could not be deleted. Please press Delete again.'
        : 'Could not delete the document. Please try again.',
    }
  }

  await logAudit(viewer, {
    action: 'document.delete',
    entity: 'hr_documents',
    entityId: doc.id,
    employeeId: doc.employee_id,
    detail: { hadFile: Boolean(doc.file_path) },
  })
  refresh(doc.employee_id)
  return { error: null, ok: true }
}

const EDITABLE = ['document_type_id', 'title', 'reference_no', 'issued_on', 'expires_on', 'notes'] as const

/** Edits the descriptive fields of a record (not the file). Bind employeeId and documentId on the server. */
export async function updateDocument(
  employeeId: string,
  documentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const found = await authorizeDocument(employeeId, documentId)
  if (!found.ok) return { error: found.error }
  const { viewer, doc } = found

  // A type that has since been switched off stays selectable on the records that already use it.
  const types = (await listDocumentTypes()).filter(t => t.active || t.id === doc.document_type_id)
  const parsed = parseDocumentFields(formData, types)
  if (!parsed.ok) return { error: parsed.error }

  const next = {
    document_type_id: parsed.value.documentTypeId,
    title: parsed.value.title,
    reference_no: parsed.value.referenceNo,
    issued_on: parsed.value.issuedOn,
    expires_on: parsed.value.expiresOn,
    notes: parsed.value.notes,
  }
  const changed = EDITABLE.filter(key => doc[key] !== next[key])
  if (changed.length === 0) return { error: null, ok: true, message: 'No changes to save' }

  const { error } = await createAdminClient().from('hr_documents').update(next).eq('id', doc.id)
  if (error) {
    console.error('update document failed', { documentId: doc.id, employeeId: doc.employee_id }, error.message)
    return { error: 'Could not save the changes. Please try again.' }
  }

  await logAudit(viewer, {
    action: 'document.update',
    entity: 'hr_documents',
    entityId: doc.id,
    employeeId: doc.employee_id,
    detail: { fields: changed },
  })
  refresh(doc.employee_id)
  return { error: null, ok: true, message: 'Document updated' }
}

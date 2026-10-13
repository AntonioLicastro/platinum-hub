import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { canOnEmployee, getViewer, inScope, isSelf, type PeopleViewer } from '@/utils/people/access'
import { AUDIT_UNAVAILABLE, auditBeforeRead, logAudit } from '@/utils/people/audit'
import { listDocumentTypes } from '@/utils/people/compliance-data'
import { HR_DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from '@/utils/people/constants'
import { createAdminClient, withRetry } from '@/utils/people/db'
import { formatBytes, inspectDocumentFile } from '@/utils/people/documents-file'
import { isUuid, parseDocumentFields } from '@/utils/people/documents-input'
import { describeStorageError, removeStoredFile } from '@/utils/people/documents-storage'
import { bool, str } from '@/utils/people/validate'
import { isRateLimited } from '@/utils/rate-limit'
import type { Employee, EmployeeDocument } from '@/utils/people/types'

type Scope = Pick<Employee, 'id' | 'area' | 'manager_email'>
type Admin = ReturnType<typeof createAdminClient>

// Room for the other form fields on top of the file itself.
const FORM_OVERHEAD_BYTES = 256 * 1024

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

const TRY_AGAIN = 'Something went wrong. Please try again.'

// Logs in this file carry document / employee ids and error codes only. A stored
// file's path embeds the employee id and the original file name, so it is never logged.

/** A database error is not "not found": answer honestly instead of letting it pass for a missing record. */
function lookupFailed(what: string, ids: Record<string, string>, message: string) {
  console.error(`${what} lookup failed`, ids, message)
  return fail(TRY_AGAIN, 500)
}

// getViewer() and the loaders throw on a database error rather than guess at an
// answer; turn that into a JSON error the page can show instead of a bare 500.
async function guarded(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler()
  } catch (err) {
    console.error('document route failed', err instanceof Error ? err.message : 'unknown error')
    return fail(TRY_AGAIN, 500)
  }
}

function refresh(employeeId: string) {
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/documents')
}

type StoredFile = { path: string; fileName: string; mime: string; size: number }

async function storeFile(admin: Admin, employeeId: string, file: { fileName: string; mime: string; bytes: Uint8Array }): Promise<StoredFile | null> {
  const path = `${employeeId}/${crypto.randomUUID()}-${file.fileName}`
  const { error } = await admin.storage.from(HR_DOCUMENTS_BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: false })
  if (error) {
    console.error('document upload failed', { employeeId }, describeStorageError(error, path))
    return null
  }
  return { path, fileName: file.fileName, mime: file.mime, size: file.bytes.byteLength }
}

// The file sits under the employee's id in the bucket, so the employee id is enough to find a leftover.
async function discardFile(employeeId: string, path: string) {
  const removed = await removeStoredFile(path)
  if (!removed.ok) console.error('orphaned document file after failed save', { employeeId }, removed.reason)
}

/**
 * Uploads a file or records a document for an employee.
 * Multipart fields: employeeId, then either documentId (attach a file to an
 * existing record) or documentTypeId/title/referenceNo/issuedOn/expiresOn/notes
 * (a new record, file optional). Anyone may add to their OWN record, HR included,
 * and it always starts as 'pending': documents.manage is denied on one's own
 * record, so nobody verifies their own documents. documents.manage holders (HR,
 * for someone else) may also tick `verified`.
 */
export async function POST(request: NextRequest) {
  return guarded(() => upload(request))
}

async function upload(request: NextRequest) {
  const viewer = await getViewer()
  if (!viewer) return fail('Not authenticated', 401)
  if (isRateLimited(`people-doc-upload:${viewer.userId}`, 20)) {
    return fail('Too many uploads in a short time. Wait a minute and try again.', 429)
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES + FORM_OVERHEAD_BYTES) {
    return fail(`That file is too large. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`, 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('The upload could not be read. Please try again.', 400)
  }

  const employeeId = str(form, 'employeeId')
  if (!isUuid(employeeId)) return fail('Employee not found', 404)
  const admin = createAdminClient()
  const { data: employee, error: employeeError } = await withRetry(() =>
    admin.from('hr_employees').select('id, area, manager_email').eq('id', employeeId).maybeSingle<Scope>())
  if (employeeError) return lookupFailed('employee', { employeeId }, employeeError.message)
  // Missing and out-of-scope look the same so scope can't be probed.
  if (!employee || !inScope(viewer, employee)) return fail('Employee not found', 404)
  const canManage = canOnEmployee(viewer, 'documents.manage', employee)
  if (!canManage && !isSelf(viewer, employee)) return fail('You do not have permission to add documents for this person.', 403)

  const rawFile = form.get('file')
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null
  let upload: { fileName: string; mime: string; bytes: Uint8Array } | null = null
  if (file) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      return fail(`That file is too large. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`, 413)
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspected = inspectDocumentFile(file.name, file.type, bytes)
    if (!inspected.ok) return fail(inspected.error, 400)
    upload = { fileName: inspected.fileName, mime: inspected.mime, bytes }
  }

  const documentId = str(form, 'documentId')
  return documentId
    ? attachFile({ admin, viewer, employee, canManage, documentId, upload })
    : createRecord({ admin, viewer, employee, canManage, upload, form })
}

type Context = {
  admin: Admin
  viewer: PeopleViewer
  employee: Scope
  canManage: boolean
  upload: { fileName: string; mime: string; bytes: Uint8Array } | null
}

async function attachFile({ admin, viewer, employee, canManage, upload, documentId }: Context & { documentId: string }) {
  if (!isUuid(documentId)) return fail('Document not found', 404)
  if (!upload) return fail('Choose a file to attach.', 400)

  const { data: existing, error: existingError } = await withRetry(() => admin
    .from('hr_documents')
    .select('id, status, file_path')
    .eq('id', documentId)
    .eq('employee_id', employee.id)
    .maybeSingle<Pick<EmployeeDocument, 'id' | 'status' | 'file_path'>>())
  if (existingError) return lookupFailed('document', { documentId, employeeId: employee.id }, existingError.message)
  if (!existing) return fail('Document not found', 404)
  if (existing.file_path) return fail('This record already has a file. Add a new document to replace it.', 409)
  if (!canManage && existing.status === 'verified') {
    return fail('A verified record cannot be changed. Ask HR to add the file.', 403)
  }

  const stored = await storeFile(admin, employee.id, upload)
  if (!stored) return fail('The file could not be stored. Please try again.', 500)

  // Whoever is not HR is adding evidence to something HR has not signed off, so it goes back for checking.
  const { data: updated, error } = await admin
    .from('hr_documents')
    .update({
      file_path: stored.path,
      file_name: stored.fileName,
      mime_type: stored.mime,
      file_size: stored.size,
      uploaded_by: viewer.email,
      ...(canManage ? {} : { status: 'pending', verified_by: null, verified_at: null }),
    })
    .eq('id', existing.id)
    .eq('employee_id', employee.id)
    .is('file_path', null)
    .select('id')
  if (error || !updated || updated.length === 0) {
    if (error) console.error('attach document file failed', { documentId: existing.id, employeeId: employee.id }, error.message)
    await discardFile(employee.id, stored.path)
    return error
      ? fail('The file was uploaded but the record could not be updated. Please try again.', 500)
      : fail('This record already has a file. Add a new document to replace it.', 409)
  }

  await logAudit(viewer, {
    action: 'document.upload',
    entity: 'hr_documents',
    entityId: existing.id,
    employeeId: employee.id,
    detail: { attachedToExisting: true, sizeBytes: stored.size },
  })
  refresh(employee.id)
  return NextResponse.json({ id: existing.id })
}

async function createRecord({ admin, viewer, employee, canManage, upload, form }: Context & { form: FormData }) {
  const types = (await listDocumentTypes()).filter(t => t.active)
  const parsed = parseDocumentFields(form, types)
  if (!parsed.ok) return fail(parsed.error, 400)
  const fields = parsed.value

  const verified = canManage && bool(form, 'verified')
  const stored = upload ? await storeFile(admin, employee.id, upload) : null
  if (upload && !stored) return fail('The file could not be stored. Please try again.', 500)

  const { data: created, error } = await admin
    .from('hr_documents')
    .insert({
      employee_id: employee.id,
      document_type_id: fields.documentTypeId,
      title: fields.title,
      file_path: stored?.path ?? null,
      file_name: stored?.fileName ?? null,
      mime_type: stored?.mime ?? null,
      file_size: stored?.size ?? null,
      reference_no: fields.referenceNo,
      issued_on: fields.issuedOn,
      expires_on: fields.expiresOn,
      status: verified ? 'verified' : 'pending',
      verified_by: verified ? viewer.email : null,
      verified_at: verified ? new Date().toISOString() : null,
      notes: fields.notes,
      uploaded_by: viewer.email,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !created) {
    console.error('insert document failed', { employeeId: employee.id }, error?.message)
    if (stored) await discardFile(employee.id, stored.path)
    return fail('The document could not be saved. Please try again.', 500)
  }

  await logAudit(viewer, {
    action: 'document.upload',
    entity: 'hr_documents',
    entityId: created.id,
    employeeId: employee.id,
    detail: {
      documentTypeId: fields.documentTypeId,
      hasFile: Boolean(stored),
      sizeBytes: stored?.size ?? null,
      status: verified ? 'verified' : 'pending',
    },
  })
  refresh(employee.id)
  return NextResponse.json({ id: created.id }, { status: 201 })
}

/**
 * GET ?id=<document uuid>: audited, short-lived redirect to the file. The storage path is never exposed.
 * Needs documents.download (HR and the employee themself). Managers see compliance
 * status but never the stored file, and get the same 404 as for a missing document.
 */
export async function GET(request: NextRequest) {
  return guarded(() => download(request))
}

async function download(request: NextRequest) {
  const viewer = await getViewer()
  if (!viewer) return fail('Not authenticated', 401)
  if (isRateLimited(`people-doc-download:${viewer.userId}`, 60)) {
    return fail('Too many downloads in a short time. Wait a minute and try again.', 429)
  }

  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!isUuid(id)) return fail('Document not found', 404)

  const admin = createAdminClient()
  const { data: doc, error: docError } = await withRetry(() => admin
    .from('hr_documents')
    .select('id, employee_id, file_path, file_name')
    .eq('id', id)
    .maybeSingle<Pick<EmployeeDocument, 'id' | 'employee_id' | 'file_path' | 'file_name'>>())
  if (docError) return lookupFailed('document', { documentId: id }, docError.message)
  let employee: Scope | null = null
  if (doc) {
    const result = await withRetry(() =>
      admin.from('hr_employees').select('id, area, manager_email').eq('id', doc.employee_id).maybeSingle<Scope>())
    if (result.error) return lookupFailed('employee', { documentId: id, employeeId: doc.employee_id }, result.error.message)
    employee = result.data
  }
  // Same answer for "no such document" and "not yours to open".
  if (!doc || !employee || !canOnEmployee(viewer, 'documents.download', employee)) return fail('Document not found', 404)
  const path = doc.file_path
  if (!path) return fail('No file has been attached to this record yet.', 404)

  // No file leaves without a trace: if the audit row can't be written, nothing is served.
  const audited = await auditBeforeRead(viewer, { action: 'document.download', entity: 'hr_documents', entityId: doc.id, employeeId: doc.employee_id })
  if (!audited) return fail(AUDIT_UNAVAILABLE, 503)

  const { data: signed, error } = await withRetry(() => admin.storage
    .from(HR_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60, { download: doc.file_name ?? true }))
  if (error || !signed?.signedUrl) {
    console.error('document signed url failed', { documentId: doc.id, employeeId: doc.employee_id }, error ? describeStorageError(error, path) : 'no url returned')
    return fail('The file could not be retrieved. Please try again.', 502)
  }

  return NextResponse.redirect(signed.signedUrl, 302)
}

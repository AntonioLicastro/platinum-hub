'use client'

import { useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2, Paperclip, Plus, RefreshCw } from 'lucide-react'
import { MAX_DOCUMENT_BYTES } from '@/utils/people/constants'
import { DOCUMENT_ACCEPT, DOCUMENT_FORMATS_LABEL, formatBytes, hasAllowedExtension } from '@/utils/people/documents-file'
import type { DocumentTypeOption } from '@/utils/people/documents-meta'
import { buttonClass, Field } from '../../_components/ui'
import { DocumentFields } from './document-fields'

// These forms POST multipart data to /api/document (a server action can't
// take files this large), then refresh the page. The route re-checks everything.

type SendResult = { ok: true } | { ok: false; error: string }

async function sendDocument(body: FormData): Promise<SendResult> {
  try {
    const res = await fetch('/api/document', { method: 'POST', body })
    if (res.ok) return { ok: true }
    const payload = (await res.json().catch(() => null)) as { error?: string } | null
    if (payload?.error) return { ok: false, error: payload.error }
    if (res.status === 413) return { ok: false, error: `That file is too large. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.` }
    return { ok: false, error: `The upload failed (error ${res.status}). Please try again.` }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}

/** A problem with the chosen file that can be spotted before uploading, or null. */
function fileProblem(value: FormDataEntryValue | null): string | null {
  if (!(value instanceof File) || value.size === 0) return null
  if (!hasAllowedExtension(value.name)) {
    return `That file type is not accepted. Use ${DOCUMENT_FORMATS_LABEL}.`
  }
  if (value.size > MAX_DOCUMENT_BYTES) return `That file is ${formatBytes(value.size)}. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`
  return null
}

const fileInputClass =
  'block w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-sm text-slate-600 shadow-sm transition ' +
  'file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-slate-700 ' +
  'hover:file:bg-slate-200 focus:border-[#323398] focus:outline-none focus:ring-4 focus:ring-[#323398]/10'

function Progress({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-2">
      <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> {label}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-full animate-pulse rounded-full bg-[#323398]/50" />
      </div>
    </div>
  )
}

function Feedback({ error, message }: { error: string | null; message: string | null }) {
  return (
    <div aria-live="polite" className="text-sm">
      {error && <span className="inline-flex items-start gap-1.5 text-red-600"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}</span>}
      {!error && message && <span className="inline-flex items-start gap-1.5 text-emerald-600"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {message}</span>}
    </div>
  )
}

/** Records a document, with or without the file. `lockedTypeId` fixes the type. */
export function UploadDocumentForm({ employeeId, types, lockedTypeId, canVerify, onDone, submitLabel = 'Save document' }: {
  employeeId: string
  types: DocumentTypeOption[]
  lockedTypeId?: number
  /** Shows the "mark as verified" box; the server ignores it for anyone without documents.manage. */
  canVerify: boolean
  onDone?: () => void
  submitLabel?: string
}) {
  const uid = useId()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Bumping the key remounts the fields, which clears them after a save.
  const [formKey, setFormKey] = useState(0)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const body = new FormData(event.currentTarget)
    body.set('employeeId', employeeId)
    const chosen = body.get('file')
    const problem = fileProblem(chosen)
    if (problem) {
      setError(problem)
      return
    }
    const withFile = chosen instanceof File && chosen.size > 0
    setError(null)
    setMessage(null)
    setUploading(withFile)
    setPending(true)
    const result = await sendDocument(body)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(withFile ? 'Saved. The file is uploaded.' : 'Saved without a file. You can attach it later.')
    setFormKey(k => k + 1)
    router.refresh()
    onDone?.()
  }

  return (
    <form onSubmit={onSubmit} aria-busy={pending}>
      <fieldset disabled={pending} className="min-w-0 space-y-4" key={formKey}>
        <DocumentFields types={types} lockedTypeId={lockedTypeId} />
        <Field
          label="File"
          htmlFor={`${uid}-file`}
          hint={`${DOCUMENT_FORMATS_LABEL}, up to ${formatBytes(MAX_DOCUMENT_BYTES)}. Optional: save the record now and attach the evidence later.`}
        >
          <input id={`${uid}-file`} name="file" type="file" accept={DOCUMENT_ACCEPT} className={fileInputClass} />
        </Field>
        {canVerify && (
          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <input type="checkbox" name="verified" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#323398] focus:ring-[#323398]" />
            <span>
              <span className="font-medium">Mark as verified</span>
              <span className="block text-xs text-slate-500">Tick this once you have checked the original. Otherwise it stays as awaiting check.</span>
            </span>
          </label>
        )}
      </fieldset>
      <div className="mt-5 space-y-3">
        {pending && <Progress label={uploading ? 'Uploading the file. Larger files can take a moment.' : 'Saving.'} />}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass('primary')}>
            {pending && <Loader2 size={16} className="animate-spin" />}
            {pending ? 'Saving…' : submitLabel}
          </button>
          <Feedback error={error} message={message} />
        </div>
      </div>
    </form>
  )
}

/**
 * Add / Replace button that opens the upload form under a row of "required documents".
 * Render it as a child of a flex-wrap row: the open form takes the full width of the next line.
 */
export function InlineUpload({ employeeId, types, typeId, canVerify, replace }: {
  employeeId: string
  types: DocumentTypeOption[]
  typeId: number
  canVerify: boolean
  replace: boolean
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const Icon = replace ? RefreshCw : Plus
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={buttonClass(replace ? 'secondary' : 'primary', 'sm')}
      >
        {!open && <Icon size={14} />}
        {open ? 'Cancel' : replace ? 'Replace' : 'Add'}
      </button>
      {open && (
        <div id={panelId} className="basis-full rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <UploadDocumentForm
            employeeId={employeeId}
            types={types}
            lockedTypeId={typeId}
            canVerify={canVerify}
            onDone={() => setOpen(false)}
            submitLabel={replace ? 'Save replacement' : 'Save document'}
          />
        </div>
      )}
    </>
  )
}

/** Adds the missing file to a record that was saved without one. */
export function AttachFile({ employeeId, documentId }: { employeeId: string; documentId: string }) {
  const uid = useId()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const body = new FormData(event.currentTarget)
    body.set('employeeId', employeeId)
    body.set('documentId', documentId)
    const chosen = body.get('file')
    if (!(chosen instanceof File) || chosen.size === 0) {
      setError('Choose a file first.')
      return
    }
    const problem = fileProblem(chosen)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setPending(true)
    const result = await sendDocument(body)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={uid} className={buttonClass('secondary', 'sm')}>
        <Paperclip size={14} /> {open ? 'Cancel' : 'Attach file'}
      </button>
      {open && (
        <form id={uid} onSubmit={onSubmit} aria-busy={pending} className="basis-full rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <label htmlFor={`${uid}-file`} className="sr-only">File to attach</label>
          <input id={`${uid}-file`} name="file" type="file" accept={DOCUMENT_ACCEPT} disabled={pending} className={fileInputClass} />
          <p className="mt-1.5 text-xs text-slate-500">{DOCUMENT_FORMATS_LABEL}, up to {formatBytes(MAX_DOCUMENT_BYTES)}.</p>
          <div className="mt-3 space-y-3">
            {pending && <Progress label="Uploading the file." />}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
                {pending && <Loader2 size={14} className="animate-spin" />}
                {pending ? 'Uploading…' : 'Upload'}
              </button>
              <Feedback error={error} message={null} />
            </div>
          </div>
        </form>
      )}
    </>
  )
}

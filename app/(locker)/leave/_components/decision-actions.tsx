'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { ActionButton } from '../../_components/action-form'
import { buttonClass, inputClass, labelClass } from '../../_components/ui'
import { decideLeave } from '../actions'

/** Approve with one click; reject asks for a note first so the employee knows why. */
export function DecisionActions({ requestId, employeeName }: { requestId: string; employeeName: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const noteId = `reject-note-${requestId}`

  const reject = () => {
    setError(null)
    startTransition(async () => {
      const result = await decideLeave(requestId, 'rejected', note)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  if (!rejecting) {
    return (
      <div className="flex flex-wrap items-start gap-2">
        <ActionButton
          action={() => decideLeave(requestId, 'approved', '')}
          label={<>Approve<span className="sr-only"> leave for {employeeName}</span></>}
          pendingLabel="Approving…"
          variant="success"
          icon={<Check size={14} />}
        />
        <button type="button" onClick={() => setRejecting(true)} className={buttonClass('secondary', 'sm')}>
          <X size={14} /> Reject<span className="sr-only"> leave for {employeeName}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg">
      <label htmlFor={noteId} className={labelClass}>Why isn&apos;t this approved?</label>
      <textarea
        id={noteId}
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        className={inputClass}
        placeholder="A short note that goes back to the employee"
        autoFocus
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={reject} disabled={pending || note.trim() === ''} className={buttonClass('danger', 'sm')}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          {pending ? 'Rejecting…' : 'Confirm rejection'}
        </button>
        <button type="button" onClick={() => { setRejecting(false); setError(null) }} disabled={pending} className={buttonClass('ghost', 'sm')}>
          Back
        </button>
        <span role="alert" className="text-xs text-red-600">{error}</span>
      </div>
    </div>
  )
}

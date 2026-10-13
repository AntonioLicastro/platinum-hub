'use client'

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { buttonClass } from './ui'
import type { ActionState } from '@/utils/people/types'

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>

const INITIAL: ActionState = { error: null }

/**
 * <form> wired to a server action with pending state and inline error /
 * success messages. The server action must have the signature
 * `(prev: ActionState, formData: FormData) => Promise<ActionState>`; bind any
 * extra arguments (e.g. `updateEmployee.bind(null, employeeId)`) on the server
 * before passing it in.
 *
 * It submits through onSubmit rather than `<form action>`: React 19 resets
 * every `<form action>` once its action finishes, success or not, which would
 * wipe a long form over one validation error. Here the form is only cleared on
 * success, and only when `resetOnSuccess` is set.
 *
 *   <ActionForm action={save} submitLabel="Save changes">
 *     <input name="job_title" />
 *   </ActionForm>
 */
export function ActionForm({
  action, children, submitLabel = 'Save', pendingLabel, resetOnSuccess = false, refreshOnSuccess = true,
  redirectTo, className = '', footer, hideSubmit = false, submitVariant = 'primary',
}: {
  action: FormAction
  children: ReactNode
  submitLabel?: string
  pendingLabel?: string
  resetOnSuccess?: boolean
  refreshOnSuccess?: boolean
  /** Navigate here after a successful submit (e.g. the list page after editing). */
  redirectTo?: string
  className?: string
  /** Extra content rendered next to the submit button. */
  footer?: ReactNode
  hideSubmit?: boolean
  submitVariant?: 'primary' | 'success' | 'danger' | 'secondary'
}) {
  const [state, setState] = useState<ActionState>(INITIAL)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const previous = state
    startTransition(async () => {
      let result: ActionState
      try {
        result = await action(previous, formData)
      } catch (err) {
        // A server action that redirect()s rejects with a framework signal that
        // must reach Next's boundary, so only swallow genuine failures.
        if (isRedirectLike(err)) throw err
        console.error('Form action failed', err)
        result = { error: 'Something went wrong. Please try again.' }
      }
      setState(result)
      if (!result.ok) return
      if (resetOnSuccess) formRef.current?.reset()
      if (redirectTo) router.push(redirectTo)
      else if (refreshOnSuccess) router.refresh()
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      {children}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!hideSubmit && (
          <button type="submit" disabled={pending} className={buttonClass(submitVariant)}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {pending ? (pendingLabel ?? 'Saving…') : submitLabel}
          </button>
        )}
        {footer}
        <div aria-live="polite" className="text-sm">
          {state.error && (
            <span className="inline-flex items-center gap-1.5 text-red-600"><AlertCircle size={16} aria-hidden="true" /> {state.error}</span>
          )}
          {!state.error && state.ok && (
            <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 size={16} aria-hidden="true" /> {state.message ?? 'Saved'}</span>
          )}
        </div>
      </div>
    </form>
  )
}

/** next/navigation's redirect() and notFound() throw errors tagged with a digest that Next must see. */
function isRedirectLike(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK') || digest === 'NEXT_NOT_FOUND')
}

/**
 * Button that runs a server action (no form fields), with an optional
 * confirm() prompt, pending spinner and inline error. Use for approve /
 * reject / tick-off / delete buttons.
 */
export function ActionButton({
  action, label, pendingLabel, confirm, variant = 'secondary', size = 'sm', icon, className = '',
}: {
  action: () => Promise<ActionState>
  label: ReactNode
  pendingLabel?: string
  confirm?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md'
  icon?: ReactNode
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const run = () => {
    if (confirm && !window.confirm(confirm)) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      let result: ActionState
      try {
        result = await action()
      } catch (err) {
        if (isRedirectLike(err)) throw err
        console.error('Button action failed', err)
        result = { error: 'Something went wrong. Please try again.' }
      }
      if (result.error) setError(result.error)
      else {
        setMessage(result.message ?? null)
        router.refresh()
      }
    })
  }

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button type="button" onClick={run} disabled={pending} className={buttonClass(variant, size)}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : icon}
        {pending ? (pendingLabel ?? 'Working…') : label}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      {!error && message && <span role="status" className="text-xs text-emerald-600">{message}</span>}
    </span>
  )
}

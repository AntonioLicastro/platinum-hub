'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import type { ActionState } from '@/utils/people/types'

type Props = {
  /** toggleChecklistItem bound on the server to the employee, task and the state to move to. */
  action: () => Promise<ActionState>
  done: boolean
  /** The task title, used as the accessible name. */
  title: string
  /** Set when the viewer may see the task but not tick it. */
  disabledReason?: string
}

/** Round tick box for a checklist task. Moves to the new state straight away and settles once the server confirms. */
export function TickButton({ action, done, title, disabledReason }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const shown = pending ? !done : done

  const run = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) setError(result.error)
        else router.refresh()
      } catch (err) {
        // An action that throws (for example the database is briefly unreachable) would otherwise
        // reach the error boundary and replace the whole page.
        console.error('Task update failed', err)
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={shown}
        aria-label={title}
        aria-busy={pending}
        title={disabledReason}
        disabled={pending || disabledReason !== undefined}
        onClick={run}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 disabled:cursor-not-allowed ${
          shown
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-slate-300 bg-white text-transparent hover:border-[#323398] hover:text-[#323398]/40'
        } ${disabledReason !== undefined && !shown ? 'opacity-60 hover:border-slate-300 hover:text-transparent' : ''}`}
      >
        {pending
          ? <Loader2 size={14} className={`animate-spin ${shown ? 'text-white' : 'text-slate-500'}`} aria-hidden="true" />
          : <Check size={14} strokeWidth={3} aria-hidden="true" />}
      </button>
      {error && <span role="alert" className="max-w-48 text-xs text-red-600">{error}</span>}
    </span>
  )
}

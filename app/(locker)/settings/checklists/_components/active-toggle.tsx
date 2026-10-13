'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionState } from '@/utils/people/types'

type Props = {
  /** setTemplateActive bound on the server to the template and the state to move to. */
  action: () => Promise<ActionState>
  active: boolean
  /** Names the template for screen readers. */
  templateName: string
}

/** On/off switch for whether a template is offered when starting a checklist. */
export function ActiveToggle({ action, active, templateName }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const shown = pending ? !active : active

  const run = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.error) setError(result.error)
        else router.refresh()
      } catch (err) {
        // A thrown action would otherwise reach the error boundary and replace the whole page.
        console.error('Template update failed', err)
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-label={`${templateName} is ${active ? 'active' : 'inactive'}`}
          aria-busy={pending}
          disabled={pending}
          onClick={run}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 disabled:cursor-wait ${
            shown ? 'bg-[#179048]' : 'bg-slate-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${shown ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
        <span className="text-xs font-medium text-slate-600" aria-hidden="true">{shown ? 'Active' : 'Inactive'}</span>
      </span>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

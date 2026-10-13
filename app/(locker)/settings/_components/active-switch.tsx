'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionState } from '@/utils/people/types'

/** On/off switch that runs a server action bound to the item and the state to move to. */
export function ActiveSwitch({ action, active, name }: {
  action: () => Promise<ActionState>
  active: boolean
  /** Names the item for screen readers. */
  name: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const shown = pending ? !active : active

  const run = () => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-label={`${name} is ${active ? 'active' : 'inactive'}`}
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
        <span className="w-14 text-xs font-medium text-slate-600" aria-hidden="true">{shown ? 'Active' : 'Inactive'}</span>
      </span>
      {error && <span role="alert" className="max-w-56 text-xs text-red-600">{error}</span>}
    </span>
  )
}

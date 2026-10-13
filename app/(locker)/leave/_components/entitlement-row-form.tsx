'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import type { ActionState } from '@/utils/people/types'
import { buttonClass, inputClass } from '../../_components/ui'

const INITIAL: ActionState = { error: null }

/**
 * Compact inline form for one person's entitlement and carried-over days.
 * The server action reads `entitlement_<typeId>` and `carried_<typeId>`.
 */
export function EntitlementRowForm({ action, employeeName, typeId, entitlement, carriedOver, defaultDays }: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  employeeName: string
  typeId: number
  /** Saved values; null when nothing is recorded yet. */
  entitlement: number | null
  carriedOver: number | null
  /** The type's default, shown as the placeholder. */
  defaultDays: number | null
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const router = useRouter()

  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])

  const small = `${inputClass} w-24! px-2.5! py-1.5!`
  return (
    // Remounts when the saved figures change so the fields always show what is stored.
    <form key={`${entitlement}|${carriedOver}`} action={formAction} className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name={`entitlement_${typeId}`} type="number" inputMode="decimal" min={0} max={366} step={0.5}
          defaultValue={entitlement ?? ''} placeholder={defaultDays !== null ? String(defaultDays) : 'Days'}
          aria-label={`Entitlement in days for ${employeeName}`} className={small}
        />
        <input
          name={`carried_${typeId}`} type="number" inputMode="decimal" min={0} max={366} step={0.5}
          defaultValue={carriedOver ?? ''} placeholder="Carried"
          aria-label={`Days carried over for ${employeeName}`} className={small}
        />
        <button type="submit" disabled={pending} className={buttonClass('secondary', 'sm')}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save<span className="sr-only"> for {employeeName}</span>
        </button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs">
        {state.error && <span className="text-red-600">{state.error}</span>}
        {!state.error && state.ok && <span className="text-emerald-600">{state.message ?? 'Saved'}</span>}
      </p>
    </form>
  )
}

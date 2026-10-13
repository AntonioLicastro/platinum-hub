'use client'

import { useEffect, useState, useTransition } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { buttonClass } from '../../_components/ui'
import { revealPps } from '../actions'

const HIDE_AFTER_MS = 30_000

/**
 * Shows the masked PPS number (already masked on the server) with a Reveal
 * button. The real value only crosses the wire when someone clicks, is audited
 * server-side, and hides itself again after 30 seconds.
 */
export function RevealPps({ employeeId, masked }: { employeeId: string; masked: string }) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!revealed) return
    const timer = setTimeout(() => setRevealed(null), HIDE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [revealed])

  const reveal = () => {
    setError(null)
    startTransition(async () => {
      // The action throws when the viewer's access cannot be checked; show that here instead of blanking the page.
      try {
        const result = await revealPps(employeeId)
        if (result.ok) setRevealed(result.pps)
        else setError(result.error)
      } catch (err) {
        console.error('revealPps failed', err)
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-sm tracking-wider text-slate-900" aria-live="polite">
        {revealed ?? masked}
      </span>
      {revealed ? (
        <button type="button" onClick={() => setRevealed(null)} className={buttonClass('secondary', 'sm')}>
          <EyeOff size={14} /> Hide
        </button>
      ) : (
        <button type="button" onClick={reveal} disabled={pending} className={buttonClass('secondary', 'sm')}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          Reveal
        </button>
      )}
      {revealed && <span className="text-xs text-slate-500">Hides again in 30 seconds. This view is logged.</span>}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

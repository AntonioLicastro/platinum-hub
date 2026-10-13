import type { ReactNode } from 'react'
import { Info, TriangleAlert } from 'lucide-react'

/** A short boxed note: blue for helpful context, amber for "check this before relying on it". */
export function Callout({ tone = 'info', children }: { tone?: 'info' | 'caution'; children: ReactNode }) {
  const Icon = tone === 'caution' ? TriangleAlert : Info
  const colours = tone === 'caution'
    ? 'bg-amber-50 text-amber-900 ring-amber-200/80'
    : 'bg-sky-50 text-sky-900 ring-sky-200/70'
  return (
    <p className={`mb-6 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${colours}`}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

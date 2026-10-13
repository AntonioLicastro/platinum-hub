import { CircleAlert } from 'lucide-react'

/** Shown in place of a card's content when its data could not be read; never passed off as "nothing yet". */
export function Unavailable({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      <span>We couldn&apos;t load {what} just now. Please refresh the page in a moment.</span>
    </p>
  )
}

import { PageHeader } from '../_components/ui'

// Shown while a report is being worked out; the compliance and leave reports read a lot of rows.
export default function ReportsLoading() {
  return (
    <div role="status" aria-live="polite">
      <PageHeader title="Reports" subtitle="Working out the figures…" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-2xl bg-slate-200/70" aria-hidden="true" />
      <span className="sr-only">Loading the report</span>
    </div>
  )
}

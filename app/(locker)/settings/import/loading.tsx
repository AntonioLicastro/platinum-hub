import { PageHeader } from '../../_components/ui'

// Shown while the directory is read to work out what a sync would change.
export default function ImportLoading() {
  return (
    <div role="status" aria-live="polite">
      <PageHeader title="Import and sync" subtitle="Reading the directory…" />
      <div className="space-y-6" aria-hidden="true">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
      <span className="sr-only">Loading import and sync</span>
    </div>
  )
}

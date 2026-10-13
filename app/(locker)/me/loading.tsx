// Shown while My space loads; several cards read from the database at once.
export default function MeLoading() {
  return (
    <div role="status" aria-live="polite">
      <div className="h-52 animate-pulse rounded-2xl bg-slate-200/70" aria-hidden="true" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden="true">
        {[0, 1].map(i => <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-200/70" />)}
      </div>
      <span className="sr-only">Loading your space</span>
    </div>
  )
}

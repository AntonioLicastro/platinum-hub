import type { ImportCounts } from '@/utils/people/import-shared'

type Tile = { key: keyof ImportCounts; preview: string; result: string; hint: string; accent: string }

const TILES: Tile[] = [
  { key: 'created', preview: 'New people', result: 'Added', hint: 'Not in HR Locker yet', accent: 'text-emerald-700' },
  { key: 'updated', preview: 'To update', result: 'Updated', hint: 'Existing, with new details', accent: 'text-[#323398]' },
  { key: 'unchanged', preview: 'Already up to date', result: 'Already up to date', hint: 'Nothing to change', accent: 'text-slate-700' },
  { key: 'errors', preview: 'Need fixing', result: 'Not imported', hint: 'Left out until fixed', accent: 'text-red-700' },
  { key: 'warnings', preview: 'To double-check', result: 'Imported, please check', hint: 'Saved, with something to look at', accent: 'text-amber-700' },
  { key: 'skipped', preview: 'Empty rows', result: 'Empty rows', hint: 'Nothing in the matched columns', accent: 'text-slate-500' },
]

export function SummaryTiles({ counts, variant }: { counts: ImportCounts; variant: 'preview' | 'result' }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {TILES.map(tile => (
        <div key={tile.key} className={`rounded-xl border border-slate-200 bg-white p-4 ${counts[tile.key] === 0 ? 'opacity-60' : ''}`}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{variant === 'preview' ? tile.preview : tile.result}</dt>
          <dd className={`mt-1.5 text-2xl font-semibold leading-none tabular-nums ${tile.accent}`}>{counts[tile.key]}</dd>
          <dd className="mt-1.5 text-xs text-slate-500">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  )
}

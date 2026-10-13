'use client'

import { useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Info, Loader2 } from 'lucide-react'
import { problemReportCsv } from '@/utils/people/import-csv'
import type { ColumnMapping, ImportMode, PreviewData } from '@/utils/people/import-shared'
import { buttonClass } from '../../../_components/ui'
import { downloadCsv } from './download'
import { IssueList } from './issue-list'
import { MappingList } from './mapping-list'
import { ModePicker } from './mode-picker'
import { SampleTable } from './sample-table'
import { SummaryTiles } from './summary-tiles'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IE')} ${n === 1 ? one : many}`

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
    </div>
  )
}

export function ReviewStep({ preview, mapping, mode, refreshing, importing, error, onMapping, onMode, onImport, onBack }: {
  preview: PreviewData
  mapping: ColumnMapping
  mode: ImportMode
  refreshing: boolean
  importing: boolean
  error: string | null
  onMapping: (column: number, key: ColumnMapping[number]) => void
  onMode: (mode: ImportMode) => void
  onImport: () => void
  onBack: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const { counts } = preview
  const emailMapped = mapping.includes('email')
  const toWrite = counts.created + counts.updated
  const ready = toWrite + counts.unchanged
  const needsConfirm = mode === 'overwrite' && toWrite > 0
  const busy = refreshing || importing
  const canImport = emailMapped && toWrite > 0 && !busy && (!needsConfirm || confirmed)
  const fileLabel = preview.sheetName ? `Sheet “${preview.sheetName}”` : 'Text file'

  // Changing what will be written means the overwrite warning must be acknowledged again.
  const changeMapping = (column: number, key: ColumnMapping[number]) => {
    setConfirmed(false)
    onMapping(column, key)
  }
  const changeMode = (next: ImportMode) => {
    setConfirmed(false)
    onMode(next)
  }

  const announcement = refreshing
    ? 'Updating the preview.'
    : emailMapped
      ? `Preview ready: ${counts.created} new, ${counts.updated} to update, ${counts.errors} need fixing.`
      : 'Choose the work email column to see a preview.'

  return (
    <div className="space-y-8">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet size={20} className="shrink-0 text-[#323398]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{preview.fileName}</p>
            <p className="text-xs text-slate-500">
              {fileLabel} · {plural(preview.totalRows, 'row', 'rows')}
              {preview.sheetCount > 1 && ` · only the first of ${preview.sheetCount} sheets is read`}
            </p>
          </div>
        </div>
        <button type="button" onClick={onBack} disabled={importing} className={buttonClass('ghost', 'sm')}>
          <ArrowLeft size={14} /> Choose a different file
        </button>
      </div>

      <section aria-label="Match your columns">
        <SectionTitle
          title="1. Match your columns"
          hint="We matched what we could from your headings. Change any menu that looks wrong, or ignore columns you do not need."
        />
        {!emailMapped && (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Choose which column holds the work email. It is how HR Locker knows who each row is about, so nothing can be imported without it.
          </p>
        )}
        <MappingList
          headers={preview.headers}
          samples={preview.columnSamples}
          mapping={mapping}
          suggested={preview.suggested}
          disabled={importing}
          onChange={changeMapping}
        />
      </section>

      <section aria-label="People already in HR Locker" className="space-y-3">
        <SectionTitle title="2. Choose what happens to people already here" />
        <ModePicker mode={mode} onChange={changeMode} disabled={importing} />
      </section>

      {emailMapped && (
        <section aria-label="Check the result" aria-busy={refreshing}>
          <SectionTitle
            title="3. Check the result"
            hint="Dates are read day first, so 05/01/2024 is 5 January. Check the dates below are the way round you expect."
          />
          <div className={refreshing ? 'opacity-60 transition' : 'transition'}>
            <p className="mb-3 text-sm text-slate-700">
              <strong className="font-semibold text-slate-900">{ready.toLocaleString('en-IE')}</strong> of {preview.totalRows.toLocaleString('en-IE')} rows are ready to import
              {counts.errors > 0 && <>, and <strong className="font-semibold text-red-700">{counts.errors.toLocaleString('en-IE')}</strong> {counts.errors === 1 ? 'has' : 'have'} a problem to fix</>}.
            </p>
            <SummaryTiles counts={counts} variant="preview" />

            {preview.notes.length > 0 && (
              <ul className="mt-4 space-y-2">
                {preview.notes.map(note => (
                  <li key={note} className="flex items-start gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {note}
                  </li>
                ))}
              </ul>
            )}

            {preview.sample.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-slate-700">
                  The first {preview.sample.length} {preview.sample.length === 1 ? 'row' : 'rows'}, as they will be saved
                </p>
                <SampleTable fields={preview.sampleFields} rows={preview.sample} />
              </div>
            )}

            {preview.issueTotal > 0 && (
              <details className="mt-5 rounded-2xl" open={counts.errors > 0}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 rounded text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
                  <AlertCircle size={16} className="text-amber-600" aria-hidden="true" />
                  {plural(preview.issueTotal, 'row needs', 'rows need')} a look
                  <span className="text-xs font-normal text-slate-500">
                    Rows that need fixing are left out; the rest import fine. You can fix the file and import again, which is safe.
                  </span>
                </summary>
                <div className="mt-3">
                  <IssueList issues={preview.issues} total={preview.issueTotal} />
                  {preview.issues.length === preview.issueTotal && (
                    <button
                      type="button"
                      onClick={() => downloadCsv('platinum-people-import-problems.csv', problemReportCsv(preview.issues))}
                      className={`${buttonClass('secondary', 'sm')} mt-3`}
                    >
                      Download this list (CSV)
                    </button>
                  )}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Import">
        <h3 className="text-sm font-semibold text-slate-900">4. Import</h3>
        {needsConfirm && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#323398]"
            />
            I understand this replaces existing values for the people and columns above. Empty cells will not clear anything.
          </label>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onImport} disabled={!canImport} className={buttonClass('success')}>
            {importing && <Loader2 size={16} className="animate-spin" />}
            {importing ? 'Importing…' : toWrite > 0 ? `Import ${plural(toWrite, 'person', 'people')}` : 'Nothing to import'}
          </button>
          {importing && <span className="text-sm text-slate-600">Keep this page open. Large files can take a minute.</span>}
          {!importing && emailMapped && toWrite === 0 && !refreshing && (
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" />
              {counts.unchanged > 0 ? 'Everyone in this file is already up to date.' : 'No rows can be imported yet.'}
            </span>
          )}
          {refreshing && <span className="text-sm text-slate-500">Updating the preview…</span>}
        </div>
        {importing && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Importing" aria-busy="true">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#179048]" />
          </div>
        )}
        <div aria-live="polite">
          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

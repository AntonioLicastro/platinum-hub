'use client'

import { useState, type DragEvent } from 'react'
import { AlertCircle, CloudUpload, Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { formatBytes } from '@/utils/people/documents-file'
import { IMPORT_EXTENSIONS, MAX_IMPORT_BYTES, type ImportMode } from '@/utils/people/import-shared'
import { buttonClass } from '../../../_components/ui'
import { ModePicker } from './mode-picker'

const ACCEPT = IMPORT_EXTENSIONS.join(',')

export function FileStep({ file, mode, checking, error, onFile, onMode, onCheck }: {
  file: File | null
  mode: ImportMode
  checking: boolean
  error: string | null
  onFile: (file: File | null) => void
  onMode: (mode: ImportMode) => void
  onCheck: () => void
}) {
  const [dragging, setDragging] = useState(false)

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    onFile(event.dataTransfer.files[0] ?? null)
  }

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor="import-file"
          onDragOver={event => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus-within:ring-4 focus-within:ring-[#323398]/20 ${
            dragging ? 'border-[#323398] bg-indigo-50' : 'border-slate-300 bg-slate-50/60 hover:border-[#323398]/50 hover:bg-indigo-50/40'
          }`}
        >
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#323398] shadow-sm ring-1 ring-slate-200">
            {file ? <FileSpreadsheet size={22} /> : <CloudUpload size={22} />}
          </span>
          <span className="break-all text-sm font-semibold text-slate-900">{file ? file.name : 'Choose an export from your previous HR system or a spreadsheet'}</span>
          <span className="mt-1 text-sm text-slate-500">
            {file ? `${formatBytes(file.size)}. Choose another file to replace it.` : `Click to browse or drag a file here. Accepts ${IMPORT_EXTENSIONS.join(', ')} files up to ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`}
          </span>
          <input
            id="import-file"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={event => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="mt-2 text-sm text-slate-500">
          No file yet?{' '}
          <a href="/api/import/template" download className="inline-flex items-center gap-1 font-medium text-[#323398] hover:underline">
            <Download size={14} aria-hidden="true" /> Download the template
          </a>{' '}
          to see every column HR Locker understands.
        </p>
      </div>

      <ModePicker mode={mode} onChange={onMode} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onCheck} disabled={!file || checking} className={buttonClass('primary')}>
          {checking && <Loader2 size={16} className="animate-spin" />}
          {checking ? 'Reading your file…' : 'Check my file'}
        </button>
        <span className="text-sm text-slate-500">Nothing is saved yet. You will see a preview first.</span>
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    </div>
  )
}

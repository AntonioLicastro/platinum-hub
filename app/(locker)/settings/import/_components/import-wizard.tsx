'use client'

import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { formatBytes } from '@/utils/people/documents-file'
import {
  IMPORT_EXTENSIONS, MAX_IMPORT_BYTES,
  type ColumnMapping, type CommitData, type ImportMode, type ImportResponse, type PreviewData,
} from '@/utils/people/import-shared'
import { Card, CardHeader } from '../../../_components/ui'
import { FileStep } from './file-step'
import { ResultStep } from './result-step'
import { ReviewStep } from './review-step'

type Phase = 'choose' | 'review' | 'done'

const STEPS = ['Choose a file', 'Check your columns', 'Import']
const REFRESH_DELAY_MS = 350
const NETWORK_ERROR = 'We could not reach the server. Check your connection and try again.'

function fileProblem(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!IMPORT_EXTENSIONS.some(ext => name.endsWith(ext))) return `Choose a ${IMPORT_EXTENSIONS.join(', ')} file.`
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_IMPORT_BYTES) return `That file is too large. The limit is ${formatBytes(MAX_IMPORT_BYTES)}.`
  return null
}

/** Sends the file to the import route. Resolves to null when the request was cancelled in favour of a newer one. */
async function send<T extends object>(
  step: 'preview' | 'commit', file: File, mode: ImportMode, mapping: ColumnMapping | null, signal?: AbortSignal,
): Promise<ImportResponse<T> | null> {
  const body = new FormData()
  body.set('step', step)
  body.set('mode', mode)
  body.set('file', file)
  if (mapping) body.set('mapping', JSON.stringify(mapping))
  try {
    const response = await fetch('/api/import', { method: 'POST', body, signal })
    const json: unknown = await response.json().catch(() => null)
    if (json && typeof json === 'object' && 'ok' in json) return json as ImportResponse<T>
    return { ok: false, error: 'Something went wrong. Please try again.' }
  } catch {
    return signal?.aborted ? null : { ok: false, error: NETWORK_ERROR }
  }
}

function Stepper({ done }: { done: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === done ? 'step' : undefined} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              i < done ? 'bg-emerald-500 text-white' : i === done ? 'bg-[#323398] text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {i < done ? <Check size={14} aria-label="Done" /> : i + 1}
          </span>
          <span className={i === done ? 'font-medium text-slate-900' : 'hidden text-slate-500 sm:inline'}>{label}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-200 sm:w-10" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}

export function ImportWizard() {
  const [phase, setPhase] = useState<Phase>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>('fill')
  const [mapping, setMapping] = useState<ColumnMapping>([])
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult] = useState<CommitData | null>(null)
  const [busy, setBusy] = useState<'idle' | 'checking' | 'refreshing' | 'importing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controller = useRef<AbortController | null>(null)

  function cancelPending() {
    if (timer.current) clearTimeout(timer.current)
    controller.current?.abort()
  }

  function chooseFile(next: File | null) {
    setFile(next)
    setError(next ? fileProblem(next) : null)
  }

  async function check() {
    if (!file) return
    const problem = fileProblem(file)
    if (problem) return setError(problem)
    setError(null)
    setBusy('checking')
    const response = await send<PreviewData>('preview', file, mode, null)
    setBusy('idle')
    if (!response) return
    if (!response.ok) return setError(response.error)
    setPreview(response)
    setMapping(response.mapping)
    setPhase('review')
  }

  /** Re-reads the file with the latest choices, a moment after the last change so quick edits make one request. */
  function refresh(nextMapping: ColumnMapping, nextMode: ImportMode) {
    if (!file) return
    cancelPending()
    setBusy('refreshing')
    timer.current = setTimeout(async () => {
      const current = new AbortController()
      controller.current = current
      const response = await send<PreviewData>('preview', file, nextMode, nextMapping, current.signal)
      if (!response) return
      setBusy('idle')
      if (response.ok) {
        setPreview(response)
        setError(null)
      } else {
        setError(response.error)
      }
    }, REFRESH_DELAY_MS)
  }

  function changeMapping(column: number, key: ColumnMapping[number]) {
    // A field can feed only one column, so choosing it here frees it from wherever it was.
    const next = mapping.map((existing, i) => (i === column ? key : existing === key ? null : existing))
    setMapping(next)
    refresh(next, mode)
  }

  function changeMode(next: ImportMode) {
    setMode(next)
    if (phase === 'review') refresh(mapping, next)
  }

  async function importNow() {
    if (!file) return
    cancelPending()
    setError(null)
    setBusy('importing')
    const response = await send<CommitData>('commit', file, mode, mapping)
    setBusy('idle')
    if (!response) return
    if (!response.ok) return setError(response.error)
    setResult(response)
    setPhase('done')
  }

  function startOver() {
    cancelPending()
    setPhase('choose')
    setFile(null)
    setMode('fill')
    setMapping([])
    setPreview(null)
    setResult(null)
    setBusy('idle')
    setError(null)
  }

  const stepsDone = phase === 'choose' ? 0 : phase === 'review' ? (busy === 'importing' ? 2 : 1) : 3

  return (
    <Card>
      <CardHeader
        title="Import from your previous HR system or a spreadsheet"
        description="Bring people in from an export of your previous HR system or any .csv / Excel file. You will check everything before anything is saved."
      />
      <Stepper done={stepsDone} />
      {phase === 'choose' && (
        <FileStep file={file} mode={mode} checking={busy === 'checking'} error={error} onFile={chooseFile} onMode={changeMode} onCheck={check} />
      )}
      {phase === 'review' && preview && file && (
        <ReviewStep
          preview={preview}
          mapping={mapping}
          mode={mode}
          refreshing={busy === 'refreshing'}
          importing={busy === 'importing'}
          error={error}
          onMapping={changeMapping}
          onMode={changeMode}
          onImport={importNow}
          onBack={startOver}
        />
      )}
      {phase === 'done' && result && <ResultStep result={result} fileName={file?.name ?? 'your file'} onAnother={startOver} />}
    </Card>
  )
}

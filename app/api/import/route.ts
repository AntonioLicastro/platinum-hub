import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { can, getViewer } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { maskPps } from '@/utils/people/format'
import { commitPlan, loadPlanContext } from '@/utils/people/import-db'
import { FIELD_BY_KEY, autoMapHeadings, isImportFieldKey, isPrivateField, type ImportFieldKey } from '@/utils/people/import-fields'
import { parseSheetFile, type SheetData } from '@/utils/people/import-parse'
import { planImport, type ImportPlan } from '@/utils/people/import-plan'
import {
  IMPORT_MODES, MAX_IMPORT_BYTES,
  type ColumnMapping, type CommitData, type ImportCounts, type ImportResponse, type PreviewData,
} from '@/utils/people/import-shared'
import { isPps, normalisePps, oneOf, str } from '@/utils/people/validate'
import { isRateLimited } from '@/utils/rate-limit'

// An import of a few thousand rows makes a batch of database calls; allow for that.
export const maxDuration = 60

// Room for the other form fields (mapping, mode) on top of the file itself.
const FORM_OVERHEAD_BYTES = 64 * 1024
const MAX_PREVIEW_ISSUES = 200
const SAMPLES_PER_COLUMN = 3

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error } satisfies ImportResponse<never>, { status })
const succeed = <T extends object>(data: T) => NextResponse.json({ ok: true, ...data } satisfies ImportResponse<T>)

/** The mapping the browser sends is untrusted: every entry must be a real field, used at most once. */
function parseMapping(text: string, columns: number): ColumnMapping | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(value) || value.length > columns) return null
  const mapping: ColumnMapping = Array.from({ length: columns }, () => null)
  const used = new Set<ImportFieldKey>()
  for (const [i, entry] of value.entries()) {
    if (entry === null || entry === '') continue
    if (!isImportFieldKey(entry) || used.has(entry)) return null
    used.add(entry)
    mapping[i] = entry
  }
  return mapping
}

/** A few example values per column to help pick the right field; anything shaped like a PPS number is masked. */
function columnSamples(sheet: SheetData): string[][] {
  return sheet.headers.map((_, col) => {
    const samples: string[] = []
    for (const row of sheet.rows) {
      const text = row.cells[col]
      if (!text) continue
      const shown = isPps(text) ? maskPps(normalisePps(text)) : text.length > 40 ? `${text.slice(0, 37)}…` : text
      if (samples.includes(shown)) continue
      samples.push(shown)
      if (samples.length === SAMPLES_PER_COLUMN) break
    }
    return samples
  })
}

const NO_COUNTS: ImportCounts = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, warnings: 0 }

const plainFileName = (name: string) => [...name].filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').slice(0, 120)

/**
 * POST /api/import (multipart): step=preview|commit, file, mode, mapping (JSON array, one entry per column).
 * The file is read and checked again on every request, so what is written is exactly what the preview showed;
 * nothing from the browser is trusted beyond the mapping, which is validated here.
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer()
  if (!viewer) return fail('Not authenticated', 401)
  if (!can(viewer, 'import.run')) return fail('You do not have permission to import people', 403)
  // This route changes data on the strength of the session cookie, so refuse requests a browser sent from another site.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return fail('This request came from another website.', 403)

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES + FORM_OVERHEAD_BYTES) {
    return fail('That file is too large. The limit is 5 MB.', 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('The upload could not be read. Please try again.', 400)
  }

  const step = str(form, 'step')
  if (step !== 'preview' && step !== 'commit') return fail('Unknown step', 400)
  if (isRateLimited(`people-import-${step}:${viewer.userId}`, step === 'commit' ? 4 : 20)) {
    return fail('Too many attempts in a short time. Wait a minute and try again.', 429)
  }
  const mode = oneOf(str(form, 'mode'), IMPORT_MODES) ?? 'fill'

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return fail('Choose a file to import.', 400)
  if (file.size > MAX_IMPORT_BYTES) return fail('That file is too large. The limit is 5 MB.', 413)

  const parsed = parseSheetFile(file.name, new Uint8Array(await file.arrayBuffer()))
  if (!parsed.ok) return fail(parsed.error, 400)
  const { sheet } = parsed

  const suggested = autoMapHeadings(sheet.headers)
  const mappingText = str(form, 'mapping')
  const mapping = mappingText ? parseMapping(mappingText, sheet.headers.length) : suggested
  if (!mapping) return fail('The column choices could not be read. Please check them and try again.', 400)

  const mappedKeys = mapping.filter((key): key is ImportFieldKey => key !== null)
  const privateColumns = mappedKeys.flatMap(key => {
    const field = FIELD_BY_KEY[key]
    return isPrivateField(field) && field.column ? [field.column] : []
  })
  if (privateColumns.length > 0 && !can(viewer, 'private.edit')) {
    return fail('You do not have permission to import personal details. Leave those columns out and try again.', 403)
  }
  const emailMapped = mappedKeys.includes('email')

  const fileName = plainFileName(file.name)
  const previewOf = (plan: ImportPlan | null): PreviewData => ({
    fileName,
    sheetName: sheet.sheetName,
    sheetCount: sheet.sheetCount,
    headers: sheet.headers,
    columnSamples: columnSamples(sheet),
    suggested,
    mapping,
    totalRows: sheet.rows.length,
    counts: plan?.counts ?? NO_COUNTS,
    sampleFields: plan?.sampleFields ?? [],
    sample: plan?.sample ?? [],
    issues: plan?.issues.slice(0, MAX_PREVIEW_ISSUES) ?? [],
    issueTotal: plan?.issues.length ?? 0,
    notes: plan?.notes ?? [],
  })

  // Until the email column is chosen there is nothing to plan, but the column menus still need the file's headings.
  if (step === 'preview' && !emailMapped) return succeed<PreviewData>(previewOf(null))
  if (!emailMapped) return fail('Choose which column holds the work email first.', 400)
  if (!can(viewer, 'employees.edit')) return fail('You do not have permission to add or change employees', 403)

  const context = await loadPlanContext(privateColumns)
  if (!context) return fail('The current people records could not be read. Please try again in a moment.', 500)
  const plan = planImport(sheet, mapping, mode, context)
  if (step === 'preview') return succeed<PreviewData>(previewOf(plan))

  const result = await commitPlan(viewer, plan, privateColumns)
  await logAudit(viewer, {
    action: 'import.commit',
    entity: 'hr_employees',
    // Counts, the file name and which columns were used: never the values.
    detail: { file: fileName, mode, rows: sheet.rows.length, fields: mappedKeys, ...result.counts },
  })
  revalidatePath('/')
  revalidatePath('/directory')
  revalidatePath('/settings/import')
  return succeed<CommitData>(result)
}

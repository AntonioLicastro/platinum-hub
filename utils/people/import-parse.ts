import { inflateRawSync } from 'node:zlib'
import * as XLSX from 'xlsx'
import { IMPORT_EXTENSIONS, MAX_IMPORT_ROWS } from './import-shared'

// Reads an uploaded .csv / .xlsx / .xls into plain text cells. Only HR with
// import.run reaches this, but xlsx 0.18 has known weaknesses with hostile
// files, so: the file type is checked by its first bytes (not its name), a zip
// is really inflated under size caps (checkZip) before the reader ever sees it,
// formulas and styles are never read, and the sheet is capped before any cell is touched.

type SheetRow = { n: number; cells: string[] }

export type SheetData = {
  sheetName: string | null
  sheetCount: number
  headers: string[]
  /** Data rows only (blank rows removed). `n` is the row number as shown in Excel, where the heading row is 1. */
  rows: SheetRow[]
}

type ParseOutcome = { ok: true; sheet: SheetData } | { ok: false; error: string }

const MAX_COLUMNS = 100
const MAX_CELL_CHARS = 2000
// Blank lines count towards the row numbers, so allow for plenty on top of the people.
const MAX_SHEET_ROWS = MAX_IMPORT_ROWS * 2 + 100
// A real workbook is a few hundred KB of XML at most; these leave plenty of room and stop a zip bomb.
const MAX_ENTRY_BYTES = 25 * 1024 * 1024
const MAX_EXPANDED_BYTES = 80 * 1024 * 1024
const MAX_ZIP_ENTRIES = 1000

const UNREADABLE =
  'We could not read that file. If it is password-protected, remove the password. Otherwise open it in Excel and save it as .xlsx or .csv, then try again.'
const EXPANDS_TOO_MUCH =
  'That spreadsheet contains far more data than it appears to, so it was not opened. Open it in Excel, save it as a new .xlsx or .csv, and try again.'

const fail = (error: string): ParseOutcome => ({ ok: false, error })
const tooManyRows = () =>
  fail(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString('en-IE')} people. Split it into smaller files and import them one at a time.`)

function hasImportExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return IMPORT_EXTENSIONS.some(ext => lower.endsWith(ext))
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b)
const isZip = (bytes: Uint8Array) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
const isOleDocument = (bytes: Uint8Array) => startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

type ZipCheck = { ok: true } | { ok: false; reason: string; tooBig: boolean }

const EOCD_SIGNATURE = 0x06054b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50
const LOCAL_HEADER_SIGNATURE = 0x04034b50
// General-purpose flag bits for encryption (traditional, strong, masked header); the reader refuses these too.
const ENCRYPTED_FLAGS = 0x2041

/**
 * Dry-runs how xlsx (SheetJS 0.18) will read this zip, but inflates every entry
 * under a size cap, so a zip bomb is refused BEFORE xlsx ever sees it. The sizes
 * a zip declares cannot be trusted: xlsx inflates the real stream, so this does too.
 *
 * It follows xlsx's own walk exactly (same end-of-central-directory record, same
 * entry count, local headers located from the central directory), because any
 * difference would let a hostile file show this check one set of entries and xlsx
 * another. Anything odd (zip64, several disks, disagreeing counts, offsets outside
 * the file, encryption, unusual methods) is refused rather than interpreted.
 */
function checkZip(bytes: Uint8Array): ZipCheck {
  const refuse = (reason: string, tooBig = false): ZipCheck => ({ ok: false, reason, tooBig })
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = bytes.length

  // xlsx scans backwards from the last 4 bytes for the FIRST end-of-central-directory signature; so must this.
  const lowest = Math.max(0, length - 22 - 0xffff)
  let end = length - 4
  while (end >= lowest && view.getUint32(end, true) !== EOCD_SIGNATURE) end--
  if (end < lowest) return refuse('no end-of-central-directory record')
  if (end + 22 > length) return refuse('truncated end-of-central-directory record')
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIGNATURE) return refuse('zip64')

  const diskNumber = view.getUint16(end + 4, true)
  const centralDirectoryDisk = view.getUint16(end + 6, true)
  // xlsx reads the entry count at +8 ("on this disk"); most other readers use +10 ("total"). They must agree.
  const entries = view.getUint16(end + 8, true)
  const totalEntries = view.getUint16(end + 10, true)
  const centralSize = view.getUint32(end + 12, true)
  const centralOffset = view.getUint32(end + 16, true)
  if (diskNumber !== 0 || centralDirectoryDisk !== 0) return refuse('split archive')
  if (entries !== totalEntries) return refuse('entry counts disagree')
  if (entries === 0 || entries > MAX_ZIP_ENTRIES) return refuse(`${entries} entries`)
  // Unsigned 32-bit sums cannot overflow a JS number; 0xffffffff (zip64 marker) always lands outside the file.
  if (centralOffset + centralSize > end || centralSize < entries * 46) return refuse('central directory outside the file')

  const centralEnd = centralOffset + centralSize
  let position = centralOffset
  let total = 0
  for (let i = 0; i < entries; i++) {
    if (position + 46 > centralEnd || view.getUint32(position, true) !== CENTRAL_ENTRY_SIGNATURE) return refuse('bad central directory entry')
    const centralFlags = view.getUint16(position + 8, true)
    const centralCompressed = view.getUint32(position + 20, true)
    const centralUncompressed = view.getUint32(position + 24, true)
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    const localOffset = view.getUint32(position + 42, true)
    position += 46 + nameLength + extraLength + commentLength
    if (position > centralEnd) return refuse('central directory entry runs past the directory')
    if (centralCompressed === 0xffffffff || centralUncompressed === 0xffffffff || localOffset === 0xffffffff) return refuse('zip64')

    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) return refuse('bad local header')
    const flags = view.getUint16(localOffset + 6, true)
    if (((flags | centralFlags) & ENCRYPTED_FLAGS) !== 0) return refuse('encrypted entry')
    const method = view.getUint16(localOffset + 8, true)
    const localCompressed = view.getUint32(localOffset + 18, true)
    const localUncompressed = view.getUint32(localOffset + 22, true)
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    if (dataStart > centralOffset) return refuse('entry data outside the file')
    // Cheap early exit; also stops a lie in the local header reaching xlsx's fallback inflater, which allocates that size.
    if (Math.max(centralUncompressed, localUncompressed) > MAX_ENTRY_BYTES) return refuse('declared entry size', true)

    let size: number
    if (method === 0) {
      // Stored: xlsx slices the local header's compressed size.
      size = localCompressed
      if (dataStart + size > centralOffset) return refuse('stored entry runs past the file')
    } else if (method === 8) {
      try {
        // The real stream decides the size. maxOutputLength makes zlib stop (and throw) at the cap instead of allocating it all.
        // It must be at least 1, so a budget spent to the byte still falls through to the "over the limit" check below.
        size = inflateRawSync(bytes.subarray(dataStart, centralOffset), {
          maxOutputLength: Math.max(1, Math.min(MAX_ENTRY_BYTES, MAX_EXPANDED_BYTES - total)),
        }).length
      } catch (err) {
        const code = (err as { code?: string } | null)?.code
        if (code === 'ERR_BUFFER_TOO_LARGE') return refuse('entry expands past the limit', true)
        return refuse(`entry could not be inflated: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      return refuse(`compression method ${method}`)
    }

    total += size
    if (total > MAX_EXPANDED_BYTES) return refuse('workbook expands past the limit', true)
  }
  return { ok: true }
}

function columnLetters(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  return letters
}

function cleanCell(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f ﻿]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_CHARS + 1)
}

/** Shared by both readers: finds the heading row, drops blank rows and applies the limits. */
function buildSheet(records: SheetRow[], sheetName: string | null, sheetCount: number): ParseOutcome {
  const cleaned = records.map(r => ({ n: r.n, cells: r.cells.map(cleanCell) }))
  const isBlank = (row: SheetRow) => row.cells.every(c => c === '')
  const headerIndex = cleaned.findIndex(r => !isBlank(r))
  if (headerIndex === -1) return fail('That file is empty. Add a heading row and at least one person, then try again.')

  const dataRows = cleaned.slice(headerIndex + 1).filter(r => !isBlank(r))
  if (dataRows.length === 0) return fail('That file only has a heading row. Add at least one person below it, then try again.')
  if (dataRows.length > MAX_IMPORT_ROWS) return tooManyRows()

  const width = Math.max(
    ...[cleaned[headerIndex], ...dataRows].map(r => r.cells.reduce((last, cell, i) => (cell === '' ? last : i + 1), 0)),
  )
  if (width > MAX_COLUMNS) return fail(`That file has more than ${MAX_COLUMNS} columns. Remove the columns you do not need and try again.`)

  const headers = Array.from({ length: width }, (_, i) => cleaned[headerIndex].cells[i] || `Column ${columnLetters(i)}`)
  const rows = dataRows.map(r => ({ n: r.n, cells: Array.from({ length: width }, (_, i) => r.cells[i] ?? '') }))
  return { ok: true, sheet: { sheetName, sheetCount, headers, rows } }
}

// ---- CSV ------------------------------------------------------------------

/** Excel on Windows saves "CSV" as UTF-8 (with a BOM), UTF-16 ("Unicode text") or plain Windows-1252. */
function decodeText(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const body = bytes.subarray(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0)
  if (body.subarray(0, 8192).includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return new TextDecoder('windows-1252').decode(body)
  }
}

/** Comma, semicolon (European Excel), tab or pipe: whichever appears most in the first line outside quotes. */
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 }
  let inQuotes = false
  for (const ch of text.slice(0, 10_000)) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === '\n' || ch === '\r') && Object.values(counts).some(n => n > 0)) break
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  return Object.keys(counts).reduce((best, d) => (counts[d] > counts[best] ? d : best), ',')
}

/** Standard CSV: quoted cells may hold commas, line breaks and doubled quotes. Returns null past `maxRecords`. */
function splitCsv(text: string, delimiter: string, maxRecords: number): string[][] | null {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch !== '"') field += ch
      else if (text[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = false
    } else if (ch === '"' && field === '') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      records.push(row)
      if (records.length > maxRecords) return null
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) records.push([...row, field])
  return records
}

function readCsv(bytes: Uint8Array): ParseOutcome {
  const text = decodeText(bytes)
  if (text === null) return fail(UNREADABLE)
  const records = splitCsv(text, detectDelimiter(text), MAX_SHEET_ROWS)
  if (!records) return tooManyRows()
  return buildSheet(records.map((cells, i) => ({ n: i + 1, cells })), null, 1)
}

// ---- Excel ----------------------------------------------------------------

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return ''
  switch (cell.t) {
    case 'd': {
      // The reader builds dates in local time at the sheet's wall-clock value, so read them back the same way.
      const d = cell.v as Date
      return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    case 'n': return Number.isInteger(cell.v) ? String(cell.v) : String(Number((cell.v as number).toPrecision(12)))
    case 'b': return cell.v ? 'TRUE' : 'FALSE'
    case 'e': return ''
    default: return String(cell.v)
  }
}

function readWorkbook(bytes: Uint8Array): ParseOutcome {
  if (isZip(bytes)) {
    const zip = checkZip(bytes)
    if (!zip.ok) {
      console.error('import: zip refused', zip.reason)
      return fail(zip.tooBig ? EXPANDS_TOO_MUCH : UNREADABLE)
    }
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellText: false,
      cellStyles: false,
      bookVBA: false,
      sheetRows: MAX_SHEET_ROWS,
    })
  } catch (err) {
    console.error('import: workbook could not be read', err instanceof Error ? err.message : err)
    return fail(UNREADABLE)
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet?.['!ref']) return fail('The first sheet in that file is empty.')
  // The reader records the sheet's real extent here when it stopped early at sheetRows.
  if (sheet['!fullref']) return tooManyRows()

  const range = XLSX.utils.decode_range(sheet['!ref'])
  const lastColumn = Math.min(range.e.c, range.s.c + MAX_COLUMNS + 20)
  const records: SheetRow[] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = []
    for (let c = range.s.c; c <= lastColumn; c++) cells.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })]))
    records.push({ n: r + 1, cells })
  }
  return buildSheet(records, sheetName, workbook.SheetNames.length)
}

// ---- Entry point ----------------------------------------------------------

/** Reads the upload. The first bytes decide whether it is a spreadsheet or text; the file name only has to look right. */
export function parseSheetFile(fileName: string, bytes: Uint8Array): ParseOutcome {
  if (!hasImportExtension(fileName)) return fail('Choose a .csv, .xlsx or .xls file.')
  if (bytes.length === 0) return fail('That file is empty.')
  return isZip(bytes) || isOleDocument(bytes) ? readWorkbook(bytes) : readCsv(bytes)
}

import { addMonths, todayIso } from './format'
import { isIsoDate, optDate, optStr, str } from './validate'
import type { DocumentType } from './types'

// A two-digit year typed into a date picker gives 0025-01-01; keep dates in a sane range.
const EARLIEST_DOCUMENT_DATE = '1950-01-01'
const LATEST_DOCUMENT_DATE = '2100-12-31'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

type DocumentFieldsInput = {
  documentTypeId: number | null
  title: string
  referenceNo: string | null
  issuedOn: string | null
  expiresOn: string | null
  notes: string | null
}

type ParsedDocumentFields = { ok: true; value: DocumentFieldsInput } | { ok: false; error: string }

/**
 * Reads and validates the descriptive fields of a document record (everything
 * except the file). `allowedTypes` is the set of types the caller may pick;
 * anything else in the form is rejected rather than trusted.
 */
export function parseDocumentFields(fd: FormData, allowedTypes: DocumentType[]): ParsedDocumentFields {
  const rawType = str(fd, 'documentTypeId')
  let type: DocumentType | null = null
  if (rawType) {
    type = allowedTypes.find(t => String(t.id) === rawType) ?? null
    if (!type) return { ok: false, error: 'Choose a document type from the list.' }
  }

  const title = str(fd, 'title') || type?.name || ''
  if (!title) return { ok: false, error: 'Choose a document type or enter a title.' }
  if (title.length > 200) return { ok: false, error: 'The title is too long (200 characters at most).' }

  const referenceNo = optStr(fd, 'referenceNo')
  if (referenceNo && referenceNo.length > 100) return { ok: false, error: 'The reference number is too long (100 characters at most).' }

  const notes = optStr(fd, 'notes')
  if (notes && notes.length > 2000) return { ok: false, error: 'The notes are too long (2,000 characters at most).' }

  const issuedOn = optDate(fd, 'issuedOn')
  if (issuedOn && (!isIsoDate(issuedOn) || issuedOn < EARLIEST_DOCUMENT_DATE)) return { ok: false, error: 'Enter a valid issue date.' }
  if (issuedOn && issuedOn > todayIso()) return { ok: false, error: 'The issue date cannot be in the future.' }

  let expiresOn = optDate(fd, 'expiresOn')
  if (expiresOn && (!isIsoDate(expiresOn) || expiresOn < EARLIEST_DOCUMENT_DATE || expiresOn > LATEST_DOCUMENT_DATE)) return { ok: false, error: 'Enter a valid expiry date.' }
  if (!expiresOn && issuedOn && type?.default_validity_months) {
    expiresOn = addMonths(issuedOn, type.default_validity_months)
  }
  if (!expiresOn && type?.requires_expiry) {
    return {
      ok: false,
      error: type.default_validity_months
        ? `${type.name} needs an expiry date. Enter it, or enter the issue date and it will be worked out for you.`
        : `${type.name} needs an expiry date.`,
    }
  }
  if (expiresOn && issuedOn && expiresOn < issuedOn) return { ok: false, error: 'The expiry date cannot be before the issue date.' }

  return { ok: true, value: { documentTypeId: type?.id ?? null, title, referenceNo, issuedOn, expiresOn, notes } }
}

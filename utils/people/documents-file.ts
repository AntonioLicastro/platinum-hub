import { ALLOWED_DOCUMENT_MIME_TYPES } from './constants'

// Pure helpers for validating an uploaded HR document. No server-only imports,
// so the upload form can reuse the extension list and size formatting in the browser.
// The server (app/api/document/route.ts) is the only place that decides.

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

type DocumentExtension = keyof typeof MIME_BY_EXTENSION

/** Value for <input accept>. */
export const DOCUMENT_ACCEPT = Object.keys(MIME_BY_EXTENSION).map(ext => `.${ext}`).join(',')

export const DOCUMENT_FORMATS_LABEL = 'PDF, JPG, PNG, WebP, HEIC, DOC or DOCX'

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

function isDocumentExtension(ext: string): ext is DocumentExtension {
  return Object.hasOwn(MIME_BY_EXTENSION, ext)
}

export function hasAllowedExtension(name: string): boolean {
  return isDocumentExtension(fileExtension(name))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Strips any path, unusual characters and leading dots; the extension must already be validated. */
function safeFileName(name: string, ext: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const stem = base
    .slice(0, base.length - ext.length - 1)
    .normalize('NFKD')
    .replace(/[^\w.()-]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80)
  return `${stem || 'document'}.${ext}`
}

function hasBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b)
}

const ascii = (text: string) => [...text].map(c => c.charCodeAt(0))

function looksLike(ext: DocumentExtension, bytes: Uint8Array): boolean {
  switch (ext) {
    case 'pdf': {
      // The spec allows a little junk before the header.
      const head = String.fromCharCode(...bytes.subarray(0, 1024))
      return head.includes('%PDF-')
    }
    case 'jpg':
    case 'jpeg': return hasBytes(bytes, [0xff, 0xd8, 0xff])
    case 'png': return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'webp': return hasBytes(bytes, ascii('RIFF')) && hasBytes(bytes, ascii('WEBP'), 8)
    case 'heic': return hasBytes(bytes, ascii('ftyp'), 4)
    case 'doc': return hasBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'docx': return hasBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
  }
}

export type InspectedFile = { ok: true; mime: string; fileName: string } | { ok: false; error: string }

/**
 * Accepts a file only when its extension, its declared MIME type and its first
 * bytes all agree. Browsers often send an empty or generic type for HEIC and
 * Word files, so a missing type falls back to the one implied by the extension.
 */
export function inspectDocumentFile(name: string, declaredMime: string, bytes: Uint8Array): InspectedFile {
  const ext = fileExtension(name)
  if (!isDocumentExtension(ext)) {
    return { ok: false, error: `That file type is not accepted. Use ${DOCUMENT_FORMATS_LABEL}.` }
  }
  const declared = declaredMime.split(';')[0].trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream' && !ALLOWED_DOCUMENT_MIME_TYPES.includes(declared)) {
    return { ok: false, error: `That file type is not accepted. Use ${DOCUMENT_FORMATS_LABEL}.` }
  }
  if (!looksLike(ext, bytes)) {
    return { ok: false, error: 'The file contents do not match its type. Check it opens correctly and try again.' }
  }
  return { ok: true, mime: MIME_BY_EXTENSION[ext], fileName: safeFileName(name, ext) }
}

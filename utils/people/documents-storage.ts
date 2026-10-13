import { HR_DOCUMENTS_BUCKET } from './constants'
import { createAdminClient } from './db'

// Server-only helpers for the private hr-documents bucket. Object paths embed
// the employee id and the original file name (John_Murphy_Garda_vetting.pdf), so
// nothing in here ever logs or returns one: callers log document / employee ids.

type StorageFailure = { message: string; status?: number; statusCode?: string }

const isNotFound = (error: StorageFailure) =>
  error.status === 404 || error.statusCode === '404' || /not.?found/i.test(error.message)

/** A storage error that is safe to log: its code, and its message with the object path (and so the file name) taken out. */
export function describeStorageError(error: StorageFailure, path: string): string {
  const fileName = path.split('/').pop() ?? ''
  let message = path ? error.message.split(path).join('[path]') : error.message
  if (fileName) message = message.split(fileName).join('[file]')
  return `${error.statusCode ?? error.status ?? 'error'}: ${message}`
}

/**
 * Removes a stored file, retrying transient failures. A file that is already
 * gone counts as removed, so a delete that failed half way can simply be run
 * again. Never throws; `reason` is safe to log.
 */
export async function removeStoredFile(path: string, attempts = 3): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = createAdminClient()
  let reason = 'unknown error'
  for (let i = 0; i < attempts; i++) {
    try {
      const { error } = await admin.storage.from(HR_DOCUMENTS_BUCKET).remove([path])
      if (!error || isNotFound(error)) return { ok: true }
      reason = describeStorageError(error, path)
    } catch (err) {
      // Not a storage API error, so its text is free-form and can't be scrubbed reliably: keep only its type.
      reason = `request failed (${err instanceof Error ? err.name : 'unknown error'})`
    }
  }
  return { ok: false, reason }
}

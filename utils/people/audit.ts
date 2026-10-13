import { createAdminClient, withRetry } from './db'
import type { PeopleViewer } from './access'

type AuditInput = {
  action: string            // e.g. 'employee.update', 'document.download', 'pps.reveal'
  entity: string            // e.g. 'hr_employees', 'hr_documents'
  entityId?: string | null
  employeeId?: string | null
  /** Small, non-sensitive context. Log which fields changed, never PPS numbers or pay values. */
  detail?: Record<string, unknown>
}

/**
 * Appends to hr_audit_log, retrying the transient service-role failures that
 * the rest of the app also retries. Returns whether the row was written; it
 * never throws. For WRITES (already committed) callers may ignore the result.
 * For reads of sensitive data (PPS reveal, pay, document download, exports) use
 * auditBeforeRead() instead, which fails closed.
 */
export async function logAudit(viewer: Pick<PeopleViewer, 'email' | 'userId'>, input: AuditInput): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { error } = await withRetry(() => admin.from('hr_audit_log').insert({
      actor_email: viewer.email,
      actor_id: viewer.userId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      employee_id: input.employeeId ?? null,
      detail: input.detail ?? null,
    }))
    if (error) {
      console.error('logAudit failed', input.action, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('logAudit failed', input.action, err)
    return false
  }
}

/**
 * Record a read of sensitive data BEFORE handing it over. Returns false when the
 * audit row could not be written, in which case the caller must refuse the read:
 * no data may leave without a trace.
 */
export async function auditBeforeRead(viewer: Pick<PeopleViewer, 'email' | 'userId'>, input: AuditInput): Promise<boolean> {
  return logAudit(viewer, input)
}

export const AUDIT_UNAVAILABLE = 'This access could not be recorded in the audit log, so it was not allowed. Please try again.'

import type { EmployeeEvent } from './types'

// Types shared between the profile server actions and the client components
// that call them. Kept out of the 'use server' actions file, which may only
// export async functions.

export type RevealPpsResult = { ok: true; pps: string } | { ok: false; error: string }

/** A row for hr_events as the profile actions insert it (the table fills in id and created_at). */
export type EventInsertRow = Pick<EmployeeEvent, 'employee_id' | 'event_type' | 'title' | 'visibility' | 'created_by'> &
  Partial<Pick<EmployeeEvent, 'occurred_on' | 'details'>>

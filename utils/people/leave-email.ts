import { formatLeaveRange } from './leave-calc'

// Optional email nudges for leave, sent through Resend like app/approvals/notify.ts.
// They never throw and are never awaited by the user's action (callers use
// after()), so a mail problem can't make a saved request look like it failed.
// Text is kept minimal and never includes a reason: leave can be sick or statutory.

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

let warnedNotConfigured = false

// A cancel-and-re-request loop must not flood a manager: one "requested leave"
// email per employee per manager per window. Per server instance, which is
// enough to blunt a loop; it is not a delivery guarantee.
const REQUESTED_WINDOW_MS = 2 * 60_000
const lastRequestedMail = new Map<string, number>()

function claimRequestedMail(key: string): boolean {
  const now = Date.now()
  if (lastRequestedMail.size > 500) {
    for (const [k, at] of lastRequestedMail) if (now - at >= REQUESTED_WINDOW_MS) lastRequestedMail.delete(k)
  }
  const last = lastRequestedMail.get(key)
  if (last !== undefined && now - last < REQUESTED_WINDOW_MS) return false
  lastRequestedMail.set(key, now)
  return true
}

async function send(to: string, subject: string, lines: string[]): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      if (!warnedNotConfigured) {
        warnedNotConfigured = true
        console.error('leave email: RESEND_API_KEY or EMAIL_FROM is not set, so leave emails are skipped')
      }
      return
    }

    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://hr-locker.vercel.app'}/leave`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject,
        html: `${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${link}">Open HR Locker</a></p>`,
        text: `${lines.join('\n\n')}\n\nOpen HR Locker: ${link}`,
      }),
    })
    if (!res.ok) console.error('leave email: Resend responded', res.status, await res.text())
  } catch (err) {
    console.error('leave email failed', err)
  }
}

/** Tells a line manager that someone on their team has asked for leave. `typeName` is null for sick / statutory leave. */
export function notifyLeaveRequested(input: {
  managerEmail: string
  /** Who asked, so repeat requests from the same person can be throttled. */
  employeeId: string
  employeeName: string
  typeName: string | null
  startIso: string
  endIso: string
  days: number
}): Promise<void> {
  if (!claimRequestedMail(`${input.managerEmail.toLowerCase()}|${input.employeeId}`)) return Promise.resolve()
  const what = input.typeName ? `${input.typeName.toLowerCase()} leave` : 'leave'
  return send(
    input.managerEmail,
    `${input.employeeName} has requested leave`,
    [`${input.employeeName} has requested ${input.days} ${input.days === 1 ? 'day' : 'days'} of ${what}: ${formatLeaveRange(input.startIso, input.endIso)}.`],
  )
}

/** Tells an employee that their request was decided, or that approved leave was cancelled. */
export function notifyLeaveDecided(input: {
  employeeEmail: string
  decision: 'approved' | 'rejected' | 'cancelled'
  startIso: string
  endIso: string
  /** The approver's note, only passed for leave that isn't sick or statutory. */
  note: string | null
}): Promise<void> {
  const outcome = { approved: 'approved', rejected: 'not approved', cancelled: 'cancelled' }[input.decision]
  const lines = [`Your leave for ${formatLeaveRange(input.startIso, input.endIso)} has been ${outcome}.`]
  if (input.note) lines.push(`Note: ${input.note}`)
  return send(input.employeeEmail, `Your leave request was ${outcome}`, lines)
}

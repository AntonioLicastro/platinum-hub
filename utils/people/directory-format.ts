import type { Tone } from './constants'
import { formatDate, tenure, todayIso } from './format'
import type { Employee } from './types'

type Service = Pick<Employee, 'employment_status' | 'start_date' | 'end_date'>

/** Length of service ("2 yrs 3 mos"), or '' when it can't be worked out: no start date, not started yet, or a leaver with no leaving date. */
export function tenureText(e: Service): string {
  const start = e.start_date
  if (!start || start > todayIso()) return ''
  if (e.employment_status === 'leaver') return e.end_date && e.end_date >= start ? tenure(start, e.end_date) : ''
  return tenure(start)
}

/** One line about service for a card, or null while no start date is recorded. */
export function serviceSummary(e: Service): string | null {
  const start = e.start_date
  if (!start) return null
  if (start > todayIso()) return `Starts ${formatDate(start)}`
  const length = tenureText(e)
  if (e.employment_status === 'leaver') {
    return length ? `${formatDate(start)} to ${formatDate(e.end_date)} (${length})` : `Started ${formatDate(start)}`
  }
  return `Since ${formatDate(start)} (${length})`
}

/** Calm colour for the profile-completeness bar: gaps are expected, so nothing is shown in red. */
export function completenessTone(percent: number): Tone {
  if (percent >= 80) return 'green'
  if (percent >= 50) return 'blue'
  return 'amber'
}

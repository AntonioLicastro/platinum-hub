import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, labelOf } from './constants'
import { addMonths } from './format'
import {
  averageHeadcount, emptyResult, groupByLabel, headcountOn, isInPost, mean, median, monthPointDate, monthsBetween,
  NO_AREA, NO_TITLE, NO_TYPE, percentOf, recentMonths, round1, shortMonth, wholeMonths, type Group,
} from './report-core'
import { formatMonths, formatNumber, formatPercent, formatSigned, plural } from './report-format'
import type { BarItem, ReportResult, ReportTable } from './report-types'
import type { Employee } from './types'

// The four reports that need nothing but the employee rows: workforce, starters
// and leavers, turnover and tenure. Every function is pure: rows and `today` in,
// plain tables, series and numbers out, so the page and the CSV share them.

const FILL_IN = 'Reports fill in as employee records and start dates are added.'

const MOVEMENT_MONTHS = 12
const TREND_MONTHS = 24

function breakdownTable(
  id: string, title: string, firstColumn: string, rows: { label: string; count: number }[], total: number,
  emptyText: string, displayLimit?: number,
): ReportTable {
  return {
    id,
    title,
    columns: [{ label: firstColumn }, { label: 'Headcount', kind: 'integer' }, { label: 'Share of staff (%)', kind: 'percent' }],
    rows: rows.map(r => [r.label, r.count, percentOf(r.count, total)]),
    emptyText,
    displayLimit,
  }
}

/** The biggest `limit` groups, the rest rolled into one grey bar, and "nothing recorded" always shown on its own. */
function topBars(groups: Group<Employee>[], limit: number, noun: string): BarItem[] {
  const named = groups.filter(g => !g.blank)
  const items: BarItem[] = named.slice(0, limit).map(g => ({ label: g.label, value: g.items.length }))
  const rest = named.slice(limit)
  if (rest.length > 0) {
    items.push({ label: `${rest.length} other ${noun}`, value: rest.reduce((sum, g) => sum + g.items.length, 0), tone: 'gray' })
  }
  const blank = groups.find(g => g.blank)
  if (blank) items.push({ label: blank.label, value: blank.items.length, tone: 'gray' })
  return items
}

const countOf = (groups: Group<Employee>[]) => groups.map(g => ({ label: g.label, count: g.items.length }))

// ---- 1. Workforce ------------------------------------------------------------

export function buildWorkforce(employees: readonly Employee[], today: string): ReportResult {
  if (employees.length === 0) {
    return emptyResult('workforce', 'No employees to report on yet', FILL_IN)
  }

  const inPost = employees.filter(isInPost)
  const joining = employees.filter(e => e.employment_status === 'pre_start').length

  // People with no start date cannot be placed on a timeline, so the trend leaves them out.
  const trend = recentMonths(today, TREND_MONTHS).map(key => ({
    label: shortMonth(key),
    value: headcountOn(employees, monthPointDate(key, today), 'exclude'),
  }))
  const now = trend[trend.length - 1].value
  const yearAgo = trend[trend.length - 13].value

  const byArea = groupByLabel(inPost, e => e.area, NO_AREA)
  const byTitle = groupByLabel(inPost, e => e.job_title, NO_TITLE)
  const byType = groupByLabel(inPost, e => (e.employment_type ? labelOf(EMPLOYMENT_TYPES, e.employment_type) : null), NO_TYPE)
  const byStatus = EMPLOYMENT_STATUSES.map(s => ({
    label: s.label, tone: s.tone, count: employees.filter(e => e.employment_status === s.value).length,
  }))

  const undated = inPost.filter(e => !e.start_date).length
  const leaversNoEnd = employees.filter(e => e.employment_status === 'leaver' && !e.end_date).length
  const notices: string[] = []
  if (undated > 0) {
    notices.push(
      `${plural(undated, 'current employee has', 'current employees have')} no start date recorded yet. They are counted in today's headcount but cannot appear in the trend.`,
    )
  }
  if (leaversNoEnd > 0) {
    notices.push(`${plural(leaversNoEnd, 'leaver has', 'leavers have')} no end date recorded, so they are not in the trend.`)
  }

  const namedAreas = byArea.filter(g => !g.blank).length
  const namedTitles = byTitle.filter(g => !g.blank).length

  return {
    id: 'workforce',
    empty: null,
    notices,
    stats: [
      {
        label: 'In post today', value: formatNumber(inPost.length), tone: 'blue', icon: 'people',
        hint: joining > 0 ? `${joining} more joining soon` : 'Active, on leave or suspended',
      },
      { label: 'Change in 12 months', value: formatSigned(now - yearAgo), tone: now >= yearAgo ? 'green' : 'amber', icon: 'trend', hint: `${yearAgo} a year ago, ${now} now (dated records)` },
      { label: 'Areas covered', value: formatNumber(namedAreas), tone: 'purple', icon: 'people', hint: `${plural(namedTitles, 'job title', 'job titles')} in use` },
    ],
    charts: [
      {
        kind: 'line',
        title: 'Headcount over the last 24 months',
        description: 'People in post at the end of each month, worked out from start and end dates.',
        points: trend,
      },
      { kind: 'bars', title: 'By area', description: 'Current staff', items: topBars(byArea, 12, 'areas') },
      { kind: 'bars', title: 'By job title', description: 'Current staff', items: topBars(byTitle, 10, 'job titles') },
      { kind: 'bars', title: 'By employment type', description: 'Current staff', items: topBars(byType, 8, 'types') },
      {
        kind: 'bars',
        title: 'By status',
        description: 'Everyone on record',
        items: byStatus.map(s => ({ label: s.label, value: s.count, tone: s.tone })),
      },
    ],
    tables: [
      breakdownTable('by-area', 'Headcount by area', 'Area', countOf(byArea), inPost.length, 'No current staff yet.'),
      breakdownTable('by-title', 'Headcount by job title', 'Job title', countOf(byTitle), inPost.length, 'No current staff yet.', 25),
      breakdownTable('by-type', 'Headcount by employment type', 'Employment type', countOf(byType), inPost.length, 'No current staff yet.'),
      breakdownTable('by-status', 'Everyone on record by status', 'Status', byStatus, employees.length, 'No employees yet.'),
      {
        id: 'trend',
        title: 'Headcount at the end of each month',
        description: 'The latest figure is today.',
        columns: [{ label: 'Month' }, { label: 'Headcount', kind: 'integer' }],
        rows: trend.map(p => [p.label, p.value]),
        emptyText: 'No dated records yet.',
      },
    ],
    method: [
      'Headcount counts people whose status is active, on leave or suspended. Pre-start staff and leavers are not counted.',
      'The trend counts someone from their start date to their last working day, both included. It needs a start date, so people without one are left out until it is recorded.',
      'Titles and areas are matched ignoring capital letters and extra spaces.',
    ],
  }
}

// ---- 2. Starters and leavers --------------------------------------------------

export function buildMovement(employees: readonly Employee[], today: string): ReportResult {
  if (!employees.some(e => e.start_date || e.end_date)) {
    return emptyResult(
      'movement', 'No start or leaving dates recorded yet',
      'Starters and leavers are counted from start dates and last working days. Add them on employee profiles and this fills in.',
    )
  }

  const months = recentMonths(today, MOVEMENT_MONTHS)
  const slot = new Map(months.map((key, i) => [key, i]))
  const starters = months.map(() => 0)
  const leavers = months.map(() => 0)
  for (const e of employees) {
    const joined = e.start_date && e.start_date <= today ? slot.get(e.start_date.slice(0, 7)) : undefined
    if (joined !== undefined) starters[joined] += 1
    const left = e.end_date && e.end_date <= today ? slot.get(e.end_date.slice(0, 7)) : undefined
    if (left !== undefined) leavers[left] += 1
  }
  const totalStarters = starters.reduce((a, b) => a + b, 0)
  const totalLeavers = leavers.reduce((a, b) => a + b, 0)

  const upcoming = employees.filter(e => e.start_date && e.start_date > today).length
  const undated = employees.filter(e => isInPost(e) && !e.start_date).length
  const leaversNoEnd = employees.filter(e => e.employment_status === 'leaver' && !e.end_date).length
  const notices: string[] = []
  if (undated > 0) {
    notices.push(`${plural(undated, 'current employee has', 'current employees have')} no start date recorded, so they are not counted as starters.`)
  }
  if (leaversNoEnd > 0) {
    notices.push(`${plural(leaversNoEnd, 'leaver has', 'leavers have')} no end date recorded, so they are not counted as leavers.`)
  }

  return {
    id: 'movement',
    empty: null,
    notices,
    stats: [
      {
        label: 'Starters', value: formatNumber(totalStarters), tone: 'green', icon: 'starter',
        hint: upcoming > 0 ? `${upcoming} more due to start` : 'Started in the last 12 months',
      },
      { label: 'Leavers', value: formatNumber(totalLeavers), tone: 'amber', icon: 'leaver', hint: 'Last working day in the last 12 months' },
      { label: 'Net change', value: formatSigned(totalStarters - totalLeavers), tone: totalStarters >= totalLeavers ? 'green' : 'amber', icon: 'trend', hint: 'Starters minus leavers' },
    ],
    charts: [
      {
        kind: 'columns',
        title: 'Starters and leavers by month',
        description: 'Last 12 months, including this one so far.',
        categories: months.map(shortMonth),
        series: [
          { name: 'Starters', tone: 'green', values: starters },
          { name: 'Leavers', tone: 'amber', values: leavers },
        ],
      },
    ],
    tables: [
      {
        id: 'by-month',
        title: 'Starters and leavers by month',
        columns: [
          { label: 'Month' }, { label: 'Starters', kind: 'integer' }, { label: 'Leavers', kind: 'integer' },
          { label: 'Net change', kind: 'change' },
        ],
        rows: [
          ...months.map((key, i): (string | number)[] => [shortMonth(key), starters[i], leavers[i], starters[i] - leavers[i]]),
          ['Last 12 months', totalStarters, totalLeavers, totalStarters - totalLeavers],
        ],
        emptyText: 'No movement recorded yet.',
        hasTotalRow: true,
      },
    ],
    method: [
      'A starter is counted in the month of their start date, a leaver in the month of their last working day. Dates in the future are not counted yet.',
      'Someone who joined and left within the 12 months appears in both columns.',
    ],
  }
}

// ---- 3. Turnover ---------------------------------------------------------------

/** Why each leaver left, by employee id; null when the viewer may not see it (private details are HR only). */
export type LeavingReasons = ReadonlyMap<string, string | null> | null

/** People whose last working day falls in the 12 months up to and including `today`. */
export function leaversInLastYear(employees: readonly Employee[], today: string): Employee[] {
  const from = addMonths(today, -12)
  return employees.filter(e => e.end_date !== null && e.end_date > from && e.end_date <= today)
}

type TurnoverRow = { label: string; average: number; leavers: number; turnover: number | null; exitMonths: number | null }

export function buildTurnover(employees: readonly Employee[], today: string, reasons: LeavingReasons): ReportResult {
  // Thirteen snapshots a month apart, from a year ago to today.
  const dates = Array.from({ length: 13 }, (_, k) => addMonths(today, -k))
  const leavers = leaversInLastYear(employees, today)
  const leaverIds = new Set(leavers.map(e => e.id))
  const average = averageHeadcount(employees, dates, 'assume')

  if (average === 0 && leavers.length === 0) {
    return emptyResult(
      'turnover', 'Not enough data for turnover yet',
      'Turnover compares leavers with the number of people in post. It fills in as start dates and last working days are recorded.',
    )
  }

  const summarise = (label: string, people: readonly Employee[]): TurnoverRow => {
    const left = people.filter(e => leaverIds.has(e.id))
    const avg = averageHeadcount(people, dates, 'assume')
    const exits = left.flatMap(e => (e.start_date && e.end_date ? [monthsBetween(e.start_date, e.end_date)] : []))
    const exitMean = mean(exits)
    return {
      label,
      average: round1(avg),
      leavers: left.length,
      turnover: percentOf(left.length, avg),
      exitMonths: exitMean === null ? null : round1(exitMean),
    }
  }

  const rows = groupByLabel(employees, e => e.area, NO_AREA)
    .map(g => summarise(g.label, g.items))
    .filter(r => r.average > 0 || r.leavers > 0)
  const overall = summarise('All areas', employees)
  const withExitDates = leavers.filter(e => e.start_date && e.end_date).length

  const undated = employees.filter(e => isInPost(e) && !e.start_date).length
  const leaversNoEnd = employees.filter(e => e.employment_status === 'leaver' && !e.end_date).length
  const notices: string[] = []
  if (undated > 0) {
    notices.push(
      `${plural(undated, 'current employee has', 'current employees have')} no start date recorded. They are treated as in post for the whole year, so turnover is not overstated while records fill in.`,
    )
  }
  if (leaversNoEnd > 0) {
    notices.push(`${plural(leaversNoEnd, 'leaver has', 'leavers have')} no end date recorded, so they are not counted.`)
  }
  if (average < 10 && leavers.length > 0) {
    notices.push('With fewer than 10 people in post, a single leaver moves the percentage a lot. Read it with care.')
  }

  const reasonGroups = reasons ? groupByLabel(leavers, e => reasons.get(e.id), 'Reason not recorded') : null
  const turnoverBars = rows.filter(r => r.turnover !== null)

  return {
    id: 'turnover',
    empty: null,
    notices,
    stats: [
      {
        label: 'Turnover, last 12 months',
        value: overall.turnover === null ? 'n/a' : formatPercent(overall.turnover),
        tone: 'purple',
        icon: 'percent',
        hint: `${plural(leavers.length, 'leaver', 'leavers')} ÷ average headcount of ${formatNumber(overall.average)}`,
      },
      { label: 'Leavers', value: formatNumber(leavers.length), tone: 'amber', icon: 'leaver', hint: 'Last working day in the last 12 months' },
      {
        label: 'Average tenure at exit',
        value: overall.exitMonths === null ? '–' : formatMonths(overall.exitMonths),
        tone: 'sky',
        icon: 'clock',
        hint: overall.exitMonths === null ? 'Needs start and end dates' : `Across ${plural(withExitDates, 'leaver', 'leavers')} with both dates`,
      },
    ],
    charts: [
      ...(turnoverBars.length >= 2
        ? [{
            kind: 'bars' as const,
            title: 'Turnover by area',
            description: 'Leavers as a share of average headcount, last 12 months',
            items: turnoverBars.map((r): BarItem => ({
              label: r.label, value: r.turnover ?? 0, display: formatPercent(r.turnover ?? 0), note: plural(r.leavers, 'leaver', 'leavers'),
            })),
          }]
        : []),
      ...(reasonGroups && leavers.length > 0
        ? [{
            kind: 'bars' as const,
            title: 'Why people left',
            description: 'Reasons recorded on leavers’ records',
            items: reasonGroups.map((g): BarItem => ({ label: g.label, value: g.items.length, tone: g.blank ? 'gray' : undefined })),
          }]
        : []),
    ],
    tables: [
      {
        id: 'by-area',
        title: 'Turnover by area',
        columns: [
          { label: 'Area' }, { label: 'Average headcount', kind: 'decimal' }, { label: 'Leavers', kind: 'integer' },
          { label: 'Turnover (%)', kind: 'percent' }, { label: 'Average tenure at exit (months)', kind: 'months' },
        ],
        rows: [...rows, ...(rows.length > 1 ? [overall] : [])].map(r => [r.label, r.average, r.leavers, r.turnover, r.exitMonths]),
        emptyText: 'No data yet.',
        hasTotalRow: rows.length > 1,
      },
      ...(reasonGroups
        ? [{
            id: 'reasons',
            title: 'Leaving reasons',
            description: 'Visible to HR only. Record a reason on each leaver’s record to fill this in.',
            columns: [{ label: 'Reason for leaving' }, { label: 'Leavers', kind: 'integer' as const }, { label: 'Share of leavers (%)', kind: 'percent' as const }],
            rows: reasonGroups.map(g => [g.label, g.items.length, percentOf(g.items.length, leavers.length)]),
            emptyText: 'No one has left in the last 12 months.',
          }]
        : []),
    ],
    method: [
      'Turnover is leavers in the last 12 months divided by average headcount, as a percentage.',
      'Average headcount is the mean of 13 snapshots, one a month from a year ago until today.',
      'Tenure at exit is the time from start date to last working day, averaged over leavers who have both dates.',
      'People with no start date are assumed to have been in post throughout, so the percentage is not inflated while records fill in.',
    ],
  }
}

// ---- 4. Tenure -----------------------------------------------------------------

const TENURE_BANDS = [
  { label: 'Under 3 months', upTo: 3 },
  { label: '3 to 6 months', upTo: 6 },
  { label: '6 to 12 months', upTo: 12 },
  { label: '1 to 2 years', upTo: 24 },
  { label: '2 to 5 years', upTo: 60 },
  { label: '5 years or more', upTo: Infinity },
]

const NO_START = 'No start date recorded'

export function buildTenure(employees: readonly Employee[], today: string): ReportResult {
  const current = employees.filter(isInPost)
  const dated = current.filter(e => e.start_date !== null)
  if (dated.length === 0) {
    return emptyResult(
      'tenure', 'No start dates recorded yet',
      'Tenure is worked out from each person’s start date. Add start dates on employee profiles and this report fills in.',
    )
  }

  // A start date in the future (someone marked active early) counts as day one.
  const startOf = (e: Employee): string | null => (e.start_date && e.start_date > today ? today : e.start_date)
  const tenures = (people: readonly Employee[]) =>
    people.flatMap(e => {
      const start = startOf(e)
      return start ? [monthsBetween(start, today)] : []
    })
  const all = tenures(current)
  const bandCounts = TENURE_BANDS.map(() => 0)
  for (const e of current) {
    const start = startOf(e)
    if (start) bandCounts[TENURE_BANDS.findIndex(b => wholeMonths(start, today) < b.upTo)] += 1
  }
  const undated = current.length - dated.length

  const averageMonths = mean(all)
  const medianMonths = median(all)
  const underAYear = bandCounts[0] + bandCounts[1] + bandCounts[2]

  const areaRows = groupByLabel(current, e => e.area, NO_AREA).map(g => {
    const average = mean(tenures(g.items))
    return [g.label, g.items.length, g.items.filter(e => e.start_date).length, average === null ? null : round1(average)]
  })

  return {
    id: 'tenure',
    empty: null,
    notices: undated > 0
      ? [`${plural(undated, 'current employee has', 'current employees have')} no start date recorded and ${undated === 1 ? 'is' : 'are'} left out of the averages.`]
      : [],
    stats: [
      { label: 'Average tenure', value: averageMonths === null ? '–' : formatMonths(averageMonths), tone: 'blue', icon: 'clock', hint: `${plural(dated.length, 'person', 'people')} with a start date` },
      { label: 'Median tenure', value: medianMonths === null ? '–' : formatMonths(medianMonths), tone: 'sky', icon: 'clock', hint: 'Half have been here longer' },
      { label: 'Under a year', value: formatNumber(underAYear), tone: 'amber', icon: 'people', hint: `${formatPercent(percentOf(underAYear, dated.length) ?? 0)} of staff with a start date` },
    ],
    charts: [
      {
        kind: 'columns',
        title: 'How long current staff have been here',
        description: 'People in post today, by time since their start date.',
        categories: TENURE_BANDS.map(b => b.label),
        series: [{ name: 'Staff', tone: 'blue', values: bandCounts }],
      },
    ],
    tables: [
      {
        id: 'distribution',
        title: 'Tenure distribution',
        columns: [{ label: 'Time in post' }, { label: 'Headcount', kind: 'integer' }, { label: 'Share of staff (%)', kind: 'percent' }],
        rows: [
          ...TENURE_BANDS.map((b, i) => [b.label, bandCounts[i], percentOf(bandCounts[i], current.length)]),
          ...(undated > 0 ? [[NO_START, undated, percentOf(undated, current.length)]] : []),
        ],
        emptyText: 'No current staff yet.',
      },
      {
        id: 'by-area',
        title: 'Average tenure by area',
        columns: [
          { label: 'Area' }, { label: 'Headcount', kind: 'integer' }, { label: 'With a start date', kind: 'integer' },
          { label: 'Average tenure (months)', kind: 'months' },
        ],
        rows: areaRows,
        emptyText: 'No current staff yet.',
      },
    ],
    method: [
      'Tenure runs from the start date to today for people whose status is active, on leave or suspended.',
      'The average and median use exact time served; the bands use whole months.',
      'People with no start date appear in their own row and are left out of the averages.',
    ],
  }
}

// ---- Index: how complete the records are -------------------------------------------

export type CoverageItem = { label: string; filled: number; total: number; reports: string }

/** How many current records have the fields the reports lean on, so HR can see what to fill in next. */
export function buildCoverage(employees: readonly Employee[]): CoverageItem[] {
  const current = employees.filter(e => e.employment_status !== 'leaver')
  const filled = (has: (e: Employee) => boolean) => current.filter(has).length
  return [
    { label: 'Start date', filled: filled(e => !!e.start_date), total: current.length, reports: 'Headcount trend, starters, turnover, tenure' },
    { label: 'Area', filled: filled(e => !!e.area?.trim()), total: current.length, reports: 'Every breakdown by area' },
    { label: 'Job title', filled: filled(e => !!e.job_title?.trim()), total: current.length, reports: 'Workforce, compliance requirements' },
    { label: 'Employment type', filled: filled(e => !!e.employment_type), total: current.length, reports: 'Workforce' },
  ]
}

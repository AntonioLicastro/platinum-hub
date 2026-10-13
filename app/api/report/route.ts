import { NextResponse, type NextRequest } from 'next/server'
import { can, getViewer, type PeopleViewer } from '@/utils/people/access'
import { AUDIT_UNAVAILABLE, auditBeforeRead } from '@/utils/people/audit'
import { reportToCsv } from '@/utils/people/report-csv'
import { AREA_NONE, NO_AREA } from '@/utils/people/report-core'
import { runReport, type ReportRun } from '@/utils/people/report-load'
import { isRateLimited } from '@/utils/rate-limit'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

/** A database problem is temporary: a clean 503 the person can retry, never an unhandled 500. */
const UNAVAILABLE = 'The report could not be prepared just now. Please try again in a moment.'

/**
 * GET /api/report?report=<id>&area=<area>&year=<year>: the report the
 * page is showing, as a CSV. It goes through the same runReport as the page, so
 * the viewer's role and scope decide exactly what is in the file: a manager's
 * file only ever describes their own people, and leaving reasons and sick-leave
 * categories are left out for anyone who may not see them.
 */
export async function GET(request: NextRequest) {
  // getViewer() throws on a database error rather than guessing a role.
  let viewer: PeopleViewer | null
  try {
    viewer = await getViewer()
  } catch (err) {
    console.error('report export: could not identify the viewer', err)
    return fail(UNAVAILABLE, 503)
  }
  if (!viewer) return fail('Not authenticated', 401)
  if (!can(viewer, 'reports.view')) return fail('You do not have permission to export reports', 403)
  if (isRateLimited(`people-report:${viewer.userId}`, 10)) {
    return fail('Too many exports in a short time. Wait a minute and try again.', 429)
  }

  let run: ReportRun
  try {
    run = await runReport(viewer, Object.fromEntries(request.nextUrl.searchParams))
  } catch (err) {
    // runReport throws when any query fails, so a partial report is never exported.
    console.error('report export failed', err)
    return fail(UNAVAILABLE, 503)
  }
  if (!run.ok) {
    return run.reason === 'unknown' ? fail('Report not found', 404) : fail('You do not have permission to export this report', 403)
  }
  const { def, filters, areas, result, today } = run
  if (result.empty) return fail('There is nothing to export for this report yet', 404)

  // Recorded BEFORE the file is built, and the export is refused when the row cannot be
  // written: no data may leave without a trace. Counts and filter names only.
  const audited = await auditBeforeRead(viewer, {
    action: 'report.export',
    entity: 'report',
    entityId: def.id,
    detail: {
      tables: result.tables.length,
      rows: result.tables.reduce((sum, table) => sum + table.rows.length, 0),
      areaFiltered: filters.area !== '',
      includesLeavingReasons: result.tables.some(table => table.id === 'reasons'),
      ...(def.hasYear ? { year: filters.year } : {}),
    },
  })
  if (!audited) return fail(AUDIT_UNAVAILABLE, 503)

  const areaLabel = filters.area === AREA_NONE ? NO_AREA : areas.find(a => a.value === filters.area)?.label
  const scope: [string, string][] = [
    ['Area', areaLabel ?? 'All areas'],
    ...(def.hasYear ? [['Year', String(filters.year)] as [string, string]] : []),
  ]
  const csv = reportToCsv(`${def.title} report`, today, scope, result)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="platinum-people-${def.id}-${today}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

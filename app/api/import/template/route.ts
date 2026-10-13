import { NextResponse } from 'next/server'
import { can, getViewer } from '@/utils/people/access'
import { templateCsv } from '@/utils/people/import-csv'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

/** GET /api/import/template: a CSV with every column the import understands and one example row. */
export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return fail('Not authenticated', 401)
  if (!can(viewer, 'import.run')) return fail('You do not have permission to import people', 403)

  return new NextResponse(templateCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="platinum-people-import-template.csv"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

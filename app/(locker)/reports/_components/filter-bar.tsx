import Link from 'next/link'
import type { ReportDef } from '@/utils/people/report-catalog'
import type { AreaOption } from '@/utils/people/report-core'
import type { ReportFilters } from '@/utils/people/report-types'
import { buttonClass, Field, inputClass } from '../../_components/ui'

/**
 * A plain GET form, so the filters live in the URL: the page stays a server
 * component, the browser's back button works, and the CSV link can carry the
 * same filters. Hidden entirely when there is nothing to choose.
 */
export function FilterBar({ def, filters, areas, years }: { def: ReportDef; filters: ReportFilters; areas: AreaOption[]; years: number[] }) {
  const showArea = areas.length > 1
  if (!showArea && !def.hasYear) return null

  return (
    <form
      method="get"
      action="/reports"
      aria-label="Report filters"
      className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="report" value={def.id} />
      {showArea && (
        <div className="w-full sm:w-64">
          <Field label="Area" htmlFor="report-area">
            <select id="report-area" name="area" defaultValue={filters.area} className={inputClass}>
              <option value="">All areas</option>
              {areas.map(area => <option key={area.value} value={area.value}>{area.label}</option>)}
            </select>
          </Field>
        </div>
      )}
      {def.hasYear && (
        <div className="w-full sm:w-36">
          <Field label="Year" htmlFor="report-year">
            <select id="report-year" name="year" defaultValue={String(filters.year)} className={inputClass}>
              {years.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </Field>
        </div>
      )}
      <button type="submit" className={buttonClass('primary')}>Apply</button>
      {filters.area && <Link href={`/reports?report=${def.id}`} className={buttonClass('ghost')}>Clear filters</Link>}
    </form>
  )
}

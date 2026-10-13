import Link from 'next/link'
import { Search, SlidersHorizontal } from 'lucide-react'
import { EMPLOYMENT_TYPES } from '@/utils/people/constants'
import {
  activeFilterNames, clearFiltersHref, DIRECTORY_NONE, DIRECTORY_SORTS, directoryHref, STATUS_FILTER_OPTIONS,
  type DirectoryFilters, type DirectoryOptions,
} from '@/utils/people/directory-query'
import { buttonClass, Field, inputClass } from '../../_components/ui'

type Choice = { value: string; label: string }

/** The dropdown's choices, plus the URL's current value when it is not one of them, so the control never misreports the filter. */
function withSelected(choices: Choice[], selected: string, labelOf: (value: string) => string = v => v): Choice[] {
  return selected && !choices.some(c => c.value.toLowerCase() === selected.toLowerCase())
    ? [...choices, { value: selected, label: labelOf(selected) }]
    : choices
}

function Select({ id, name, label, value, blank, choices }: {
  id: string
  name: string
  label: string
  value: string
  blank: string
  choices: Choice[]
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} name={name} defaultValue={value} className={inputClass}>
        <option value="">{blank}</option>
        {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </Field>
  )
}

/**
 * A plain GET form: every filter lives in the URL, so views can be bookmarked and
 * shared, and the page needs no client-side JavaScript.
 */
export function FilterPanel({ filters, options, offerCompliance }: {
  filters: DirectoryFilters
  options: DirectoryOptions
  offerCompliance: boolean
}) {
  const none = { value: DIRECTORY_NONE, label: 'Not recorded yet' }
  const areas = withSelected([
    ...options.areas.map(a => ({ value: a, label: a })),
    ...(options.anyWithoutArea ? [none] : []),
  ], filters.area, v => (v === DIRECTORY_NONE ? none.label : v))
  const titles = withSelected([
    ...options.titles.map(t => ({ value: t, label: t })),
    ...(options.anyWithoutTitle ? [none] : []),
  ], filters.title, v => (v === DIRECTORY_NONE ? none.label : v))
  const types = [
    ...EMPLOYMENT_TYPES,
    ...(options.anyWithoutType || filters.type === DIRECTORY_NONE ? [none] : []),
  ]
  const managers = withSelected([
    ...options.managers.map(m => ({ value: m.email, label: m.label })),
    ...(options.anyWithoutManager ? [{ value: DIRECTORY_NONE, label: 'No manager recorded yet' }] : []),
  ], filters.manager, v => (v === DIRECTORY_NONE ? 'No manager recorded yet' : v))

  const filtered = activeFilterNames(filters).length > 0
  const moreActive = Boolean(filters.title || filters.type || filters.manager || filters.complianceIssues) || filters.sort !== 'name'

  return (
    <form
      // Remounted on every URL change so the uncontrolled inputs always show what is actually applied.
      key={directoryHref(filters)}
      method="get"
      action="/directory"
      role="search"
      aria-label="Search and filter the directory"
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
    >
      {filters.view !== 'cards' && <input type="hidden" name="view" value={filters.view} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Search" htmlFor="dir-q">
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="dir-q" name="q" type="search" defaultValue={filters.q} autoComplete="off" maxLength={100}
                placeholder="Name, email, payroll no., employee no. or job title"
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
        </div>
        <Select id="dir-area" name="area" label="Area" value={filters.area} blank="All areas" choices={areas} />
        <Select id="dir-status" name="status" label="Status" value={filters.status === 'current' ? '' : filters.status}
          blank={STATUS_FILTER_OPTIONS[0].label} choices={STATUS_FILTER_OPTIONS.slice(1)} />
      </div>

      <details className="mt-4" open={moreActive}>
        <summary className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg py-1 text-sm font-medium text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
          <SlidersHorizontal size={16} aria-hidden="true" /> More filters and sorting
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select id="dir-title" name="title" label="Job title" value={filters.title} blank="All job titles" choices={titles} />
          <Select id="dir-type" name="type" label="Employment type" value={filters.type} blank="All types"
            choices={types.map(t => ({ value: t.value, label: t.label }))} />
          <Select id="dir-manager" name="manager" label="Line manager" value={filters.manager} blank="Anyone" choices={managers} />
          <Field label="Sort by" htmlFor="dir-sort">
            <select id="dir-sort" name="sort" defaultValue={filters.sort} className={inputClass}>
              {DIRECTORY_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        {offerCompliance && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-sm">
            <input
              type="checkbox" name="compliance" value="1" defaultChecked={filters.complianceIssues}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#323398] focus:ring-[#323398]"
            />
            <span>
              <span className="block font-medium text-slate-800">Compliance issues only</span>
              <span className="block text-slate-500">People with a required document that is expired, expiring soon or missing.</span>
            </span>
          </label>
        )}
      </details>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonClass('primary')}>
          <Search size={16} aria-hidden="true" /> Apply
        </button>
        {(filtered || filters.sort !== 'name') && (
          <Link href={clearFiltersHref(filters)} className={buttonClass('ghost')}>Clear filters</Link>
        )}
      </div>
    </form>
  )
}

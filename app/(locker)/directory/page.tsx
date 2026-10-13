import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, SearchX, TriangleAlert, Upload, UserPlus, Users } from 'lucide-react'
import { can, requireCapability } from '@/utils/people/access'
import { loadDirectory } from '@/utils/people/directory-load'
import {
  buildDirectoryOptions, clearFiltersHref, exportHref, PAGE_SIZES, paginate, parseDirectoryParams,
} from '@/utils/people/directory-query'
import { buttonClass, EmptyState, PageHeader } from '../_components/ui'
import { EmployeeCards } from './_components/employee-cards'
import { EmployeeTable } from './_components/employee-table'
import { FilterPanel } from './_components/filter-panel'
import { Pagination } from './_components/pagination'
import { ResultsBar } from './_components/results-bar'

export const metadata: Metadata = { title: 'Directory · HR Locker' }

export default async function DirectoryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireCapability('employees.view')
  const filters = parseDirectoryParams(await searchParams)
  const { all, filtered, statusCounts, compliance } = await loadDirectory(viewer, filters)

  // A compliance filter that could not be applied must not linger in the form, the links or the export.
  const shown = compliance === 'ready' ? filters : { ...filters, complianceIssues: false }
  const options = buildDirectoryOptions(all)
  const slice = paginate(filtered, filters.page, PAGE_SIZES[filters.view])
  const canAdd = can(viewer, 'employees.edit')
  const canImport = can(viewer, 'import.run')
  const addButton = (variant: 'primary' | 'secondary') => (
    <Link href="/employees/new" className={buttonClass(variant)}>
      <UserPlus size={16} aria-hidden="true" /> Add employee
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Directory"
        icon={Users}
        subtitle={viewer.role === 'manager'
          ? 'The people in your areas and your direct reports.'
          : 'Everyone at Platinum Home Care. Search, filter and export.'}
        actions={all.length > 0 && (
          <>
            <a
              href={exportHref(shown)}
              title={can(viewer, 'private.view') ? 'Includes personal contact details' : undefined}
              className={buttonClass('secondary')}
            >
              <Download size={16} aria-hidden="true" /> Export CSV
            </a>
            {canAdd && addButton('primary')}
          </>
        )}
      />

      {all.length === 0 ? (
        canAdd || canImport ? (
          <EmptyState
            icon={Users}
            title="No employees in HR Locker yet"
            body="Sync everyone from the Platinum directory to get started, or add people one at a time. Job titles, start dates and documents can be filled in later, as the information comes in."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {canImport && (
                  <Link href="/settings/import" className={buttonClass('primary')}>
                    <Upload size={16} aria-hidden="true" /> Sync from the Platinum directory
                  </Link>
                )}
                {canAdd && addButton(canImport ? 'secondary' : 'primary')}
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No one to show yet"
            body="People in your areas, and anyone who reports to you, will appear here once HR has added them."
          />
        )
      ) : (
        <div className="space-y-5">
          <FilterPanel filters={shown} options={options} offerCompliance={compliance === 'ready'} />

          {compliance === 'failed' && filters.complianceIssues && (
            <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <p>Document compliance could not be checked just now, so the compliance filter has not been applied. Try again in a moment.</p>
            </div>
          )}

          <ResultsBar filters={shown} total={slice.total} statusCounts={statusCounts} />

          {slice.total === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No one matches these filters"
              body="Try a different search, or clear the filters to see everyone again."
              action={<Link href={clearFiltersHref(shown)} className={buttonClass('secondary')}>Clear filters</Link>}
            />
          ) : (
            <>
              {filters.view === 'table'
                ? <EmployeeTable employees={slice.items} filters={shown} managerLabels={options.managerLabels} />
                : <EmployeeCards employees={slice.items} />}
              <Pagination slice={slice} filters={shown} />
            </>
          )}
        </div>
      )}
    </>
  )
}

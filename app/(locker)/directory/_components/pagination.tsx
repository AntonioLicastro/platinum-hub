import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { directoryHref, type DirectoryFilters, type PageSlice } from '@/utils/people/directory-query'
import { buttonClass } from '../../_components/ui'

export function Pagination({ slice, filters }: { slice: PageSlice<unknown>; filters: DirectoryFilters }) {
  if (slice.total === 0) return null
  const hasPrevious = slice.page > 1
  const hasNext = slice.page < slice.pageCount
  const disabled = `${buttonClass('secondary', 'sm')} pointer-events-none opacity-50`

  return (
    <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">
        Showing <span className="font-medium tabular-nums text-slate-900">{slice.from}–{slice.to}</span> of{' '}
        <span className="font-medium tabular-nums text-slate-900">{slice.total}</span>
        {slice.pageCount > 1 && <span className="text-slate-500"> · Page {slice.page} of {slice.pageCount}</span>}
      </p>
      {slice.pageCount > 1 && (
        <div className="flex items-center gap-2">
          {hasPrevious
            ? (
              <Link href={directoryHref(filters, { page: slice.page - 1 })} rel="prev" className={buttonClass('secondary', 'sm')}>
                <ChevronLeft size={14} aria-hidden="true" /> Previous
              </Link>
            )
            : <span aria-disabled="true" className={disabled}><ChevronLeft size={14} aria-hidden="true" /> Previous</span>}
          {hasNext
            ? (
              <Link href={directoryHref(filters, { page: slice.page + 1 })} rel="next" className={buttonClass('secondary', 'sm')}>
                Next <ChevronRight size={14} aria-hidden="true" />
              </Link>
            )
            : <span aria-disabled="true" className={disabled}>Next <ChevronRight size={14} aria-hidden="true" /></span>}
        </div>
      )}
    </nav>
  )
}

import Link from 'next/link'
import { CheckCircle2, Download, TriangleAlert, Users } from 'lucide-react'
import { problemReportCsv } from '@/utils/people/import-csv'
import type { CommitData } from '@/utils/people/import-shared'
import { buttonClass } from '../../../_components/ui'
import { downloadCsv } from './download'
import { IssueList } from './issue-list'
import { SummaryTiles } from './summary-tiles'

export function ResultStep({ result, fileName, onAnother }: { result: CommitData; fileName: string; onAnother: () => void }) {
  const { counts, issues } = result
  const saved = counts.created + counts.updated
  const nothingSaved = saved === 0

  return (
    <div className="space-y-6">
      <div className={`flex items-start gap-4 rounded-2xl px-5 py-5 ${nothingSaved && counts.errors > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`} role="status">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${nothingSaved && counts.errors > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {nothingSaved && counts.errors > 0 ? <TriangleAlert size={22} /> : <CheckCircle2 size={22} />}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">
            {nothingSaved ? (counts.errors > 0 ? 'Nothing was imported' : 'Everything was already up to date') : 'Import finished'}
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            {nothingSaved
              ? counts.errors > 0
                ? 'Every row had a problem, so nothing was saved. Download the list below, fix the file and import it again.'
                : `${fileName} matched what HR Locker already holds, so nothing needed to change.`
              : `${counts.created} added and ${counts.updated} updated from ${fileName}.`}
          </p>
        </div>
      </div>

      <SummaryTiles counts={counts} variant="result" />

      {issues.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Rows to look at</h3>
              <p className="text-sm text-slate-500">Fix these in your file and import it again. Re-importing is safe: people already added are not duplicated.</p>
            </div>
            <button type="button" onClick={() => downloadCsv('platinum-people-import-problems.csv', problemReportCsv(issues))} className={buttonClass('secondary', 'sm')}>
              <Download size={14} /> Download problem report (CSV)
            </button>
          </div>
          <IssueList issues={issues} total={issues.length} />
        </section>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        <p className="font-semibold text-slate-900">Checking your work</p>
        <p className="mt-1">
          Imports only add and update, and nobody is deleted. Open the Directory to review the people you imported. If a value
          is wrong, change it on the person’s own page, or fix your file and import again using “Overwrite existing values”.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/directory" className={buttonClass('primary')}><Users size={16} /> Review in the Directory</Link>
        <button type="button" onClick={onAnother} className={buttonClass('secondary')}>Import another file</button>
      </div>
    </div>
  )
}

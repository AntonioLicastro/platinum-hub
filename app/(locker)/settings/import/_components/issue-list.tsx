import type { ImportIssue } from '@/utils/people/import-shared'
import { Badge } from '../../../_components/ui'

/** Rows that were rejected or need a second look, with plain-language reasons. */
export function IssueList({ issues, total }: { issues: ImportIssue[]; total: number }) {
  return (
    <div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {issues.map(issue => (
          <li key={issue.row} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex shrink-0 items-center gap-2 sm:w-52">
              <Badge tone={issue.level === 'error' ? 'red' : 'amber'} dot>{issue.level === 'error' ? 'Not imported' : 'Check'}</Badge>
              <span className="text-sm font-semibold tabular-nums text-slate-900">Row {issue.row}</span>
            </div>
            <div className="min-w-0 text-sm">
              <p className="break-words text-slate-500">{[issue.name, issue.email].filter(Boolean).join(' · ') || 'No name or email'}</p>
              <ul className="mt-0.5 space-y-0.5 text-slate-700">
                {issue.messages.map(message => <li key={message}>{message}</li>)}
              </ul>
            </div>
          </li>
        ))}
      </ul>
      {total > issues.length && (
        <p className="mt-2 text-sm text-slate-500">Showing the first {issues.length} of {total} rows with a problem.</p>
      )}
    </div>
  )
}

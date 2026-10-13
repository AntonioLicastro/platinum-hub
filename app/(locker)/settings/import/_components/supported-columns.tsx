import { ChevronDown, Lock } from 'lucide-react'
import { FIELD_GROUPS, IMPORT_FIELDS } from '@/utils/people/import-fields'
import { Card } from '../../../_components/ui'

export function SupportedColumns() {
  return (
    <Card padded={false}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20">
          <span>
            <span className="block text-base font-semibold text-slate-900">Which columns can I include?</span>
            <span className="block text-sm text-slate-500">
              Headings like Surname, Forename, DOB or Line Manager are matched for you. You can change any match before importing.
            </span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-slate-100 px-5 py-5">
          {FIELD_GROUPS.map(group => (
            <div key={group.value}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.hrOnly && <Lock size={12} aria-hidden="true" />}
                {group.label}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {IMPORT_FIELDS.filter(field => field.group === group.value).map(field => (
                  <li key={field.key} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{field.label}</li>
                ))}
              </ul>
            </div>
          ))}
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Only the work email is required. It is how HR Locker knows who each row is about.</li>
            <li>Dates are read day first: 05/01/2024 means 5 January 2024. Excel dates, 5 Jan 2024 and 2024-01-05 also work.</li>
            <li>Contract type and status are only understood when they are clear (for example Permanent, Part time, Fixed term, Casual, Active, Leaver). Anything else is flagged for you to fix, never guessed.</li>
            <li>Columns you do not map are ignored. Rows without a work email are reported, not matched by name.</li>
          </ul>
        </div>
      </details>
    </Card>
  )
}

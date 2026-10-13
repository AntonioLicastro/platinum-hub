import { FIELD_GROUPS, IMPORT_FIELDS, isImportFieldKey } from '@/utils/people/import-fields'
import type { ColumnMapping } from '@/utils/people/import-shared'
import { Badge, inputClass } from '../../../_components/ui'

function MatchBadge({ current, suggested }: { current: ColumnMapping[number]; suggested: ColumnMapping[number] }) {
  if (!current) return <Badge tone="gray">Ignored</Badge>
  if (current === suggested) return <Badge tone="green" dot>Matched automatically</Badge>
  return <Badge tone="blue" dot>Chosen by you</Badge>
}

/** One row per spreadsheet column: what it holds, and a menu to say which HR Locker field it feeds. */
export function MappingList({ headers, samples, mapping, suggested, disabled, onChange }: {
  headers: string[]
  samples: string[][]
  mapping: ColumnMapping
  suggested: ColumnMapping
  disabled: boolean
  onChange: (column: number, key: ColumnMapping[number]) => void
}) {
  return (
    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      {headers.map((header, column) => (
        <li key={column} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:items-center">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-slate-900">{header}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {samples[column]?.length ? `e.g. ${samples[column].join(' · ')}` : 'No values in this column'}
            </p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={`map-${column}`} className="sr-only">Which HR Locker field is “{header}”?</label>
            <select
              id={`map-${column}`}
              value={mapping[column] ?? ''}
              disabled={disabled}
              onChange={event => onChange(column, isImportFieldKey(event.target.value) ? event.target.value : null)}
              className={inputClass}
            >
              <option value="">Ignore this column</option>
              {FIELD_GROUPS.map(group => (
                <optgroup key={group.value} label={group.label}>
                  {IMPORT_FIELDS.filter(field => field.group === group.value).map(field => (
                    <option key={field.key} value={field.key}>{field.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <MatchBadge current={mapping[column] ?? null} suggested={suggested[column] ?? null} />
          </div>
        </li>
      ))}
    </ul>
  )
}

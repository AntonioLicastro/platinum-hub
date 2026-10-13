import type { ImportMode } from '@/utils/people/import-shared'
import { Badge, labelClass } from '../../../_components/ui'

const OPTIONS: { value: ImportMode; title: string; recommended?: boolean; body: string }[] = [
  {
    value: 'fill',
    title: 'Fill blank fields only',
    recommended: true,
    body: 'The safe choice. Empty fields are filled in and anything already recorded stays exactly as it is.',
  },
  {
    value: 'overwrite',
    title: 'Overwrite existing values',
    body: 'Replaces what is stored with what is in your file, for the columns you match. An empty cell never wipes out a value.',
  },
]

export function ModePicker({ mode, onChange, disabled = false }: { mode: ImportMode; onChange: (mode: ImportMode) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={labelClass}>If someone is already in HR Locker</legend>
      <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map(option => (
          <label
            key={option.value}
            className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#323398]/40 has-[:checked]:border-[#323398] has-[:checked]:bg-indigo-50/50 has-[:checked]:ring-2 has-[:checked]:ring-[#323398]/15 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name="import-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onChange(option.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-[#323398]"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                {option.title}
                {option.recommended && <Badge tone="green">Recommended</Badge>}
              </span>
              <span className="mt-1 block text-sm text-slate-600">{option.body}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

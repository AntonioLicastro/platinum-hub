import { TITLE_OPTIONS } from '@/utils/org-options'

/**
 * Checkbox grid of job titles (field name `applies_to_titles`). Titles already
 * saved stay selectable even if they have since left the company list.
 */
export function TitlePicker({ idPrefix, selected = [] }: { idPrefix: string; selected?: string[] }) {
  const titles = [...TITLE_OPTIONS, ...selected.filter(t => !TITLE_OPTIONS.includes(t))]
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Applies to job titles</legend>
      <p className="mb-3 text-xs text-slate-500">
        Tick the job titles this applies to. Leave every box empty and it applies to everyone.
      </p>
      <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {titles.map((title, index) => (
          <label
            key={title}
            htmlFor={`${idPrefix}-title-${index}`}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-200 has-[:checked]:border-[#323398]/40 has-[:checked]:bg-[#323398]/5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20"
          >
            <input
              id={`${idPrefix}-title-${index}`} type="checkbox" name="applies_to_titles" value={title}
              defaultChecked={selected.includes(title)} className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#323398]"
            />
            {title}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

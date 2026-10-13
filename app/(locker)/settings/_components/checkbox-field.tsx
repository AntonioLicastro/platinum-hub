import type { ReactNode } from 'react'

/** A labelled tick box with a one-line explanation. Server-safe; the box is uncontrolled. */
export function CheckboxField({ id, name, label, hint, defaultChecked = false }: {
  id: string
  name: string
  label: string
  hint: ReactNode
  defaultChecked?: boolean
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm transition hover:border-slate-300 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20">
      <input
        id={id} type="checkbox" name={name} defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#323398]"
      />
      <span>
        <span className="block font-medium text-slate-900">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  )
}

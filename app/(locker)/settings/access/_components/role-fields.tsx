'use client'

import { useEffect, useRef, useState } from 'react'
import { AREA_OPTIONS } from '@/utils/org-options'
import { ACCESS_ROLES, type AccessRoleValue } from '@/utils/people/settings-input'

/**
 * The role picker, with a plain-English description of what each role can see,
 * and the area tick boxes that only apply to managers.
 */
export function RoleFields({ idPrefix, defaultRole, defaultAreas }: {
  idPrefix: string
  defaultRole: AccessRoleValue
  defaultAreas: string[]
}) {
  const [role, setRole] = useState<AccessRoleValue>(defaultRole)
  const anchor = useRef<HTMLFieldSetElement>(null)

  // The browser resets the radios itself when the form resets; keep our copy of the choice in step.
  useEffect(() => {
    const form = anchor.current?.form
    if (!form) return
    const onReset = () => setRole(defaultRole)
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [defaultRole])

  return (
    <>
      <fieldset ref={anchor} className="sm:col-span-2">
        <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Role<span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </legend>
        <div className="space-y-2">
          {ACCESS_ROLES.map(option => {
            const selected = role === option.value
            return (
              <label
                key={option.value}
                htmlFor={`${idPrefix}-role-${option.value}`}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20 ${
                  selected ? 'border-[#323398]/50 bg-[#323398]/5' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  id={`${idPrefix}-role-${option.value}`} type="radio" name="role" value={option.value} required
                  checked={selected} onChange={() => setRole(option.value)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#323398]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{option.summary}</span>
                  {selected && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-500">
                      {option.points.map(point => <li key={point}>{point}</li>)}
                    </ul>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {role === 'manager' && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Areas they manage</legend>
          <p className="mb-3 text-xs text-slate-500">
            They will see everyone whose area is ticked here, plus anyone who has them named as their line manager. Tick none to give
            them their direct reports only.
          </p>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {AREA_OPTIONS.map((area, index) => (
              <label
                key={area}
                htmlFor={`${idPrefix}-area-${index}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-200 has-[:checked]:border-[#323398]/40 has-[:checked]:bg-[#323398]/5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20"
              >
                <input
                  id={`${idPrefix}-area-${index}`} type="checkbox" name="areas" value={area}
                  defaultChecked={defaultAreas.includes(area)} className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#323398]"
                />
                {area}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  )
}

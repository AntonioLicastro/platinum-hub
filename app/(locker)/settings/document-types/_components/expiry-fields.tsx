'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_REMINDER_DAYS, MAX_VALIDITY_MONTHS } from '@/utils/people/settings-input'
import { Field, inputClass } from '../../../_components/ui'

/**
 * The "documents expire" tick box with the two inputs that only matter when it
 * is ticked. Unticked inputs are disabled, so they are not sent to the server.
 */
export function ExpiryFields({ idPrefix, defaultRequiresExpiry, defaultMonths, defaultReminderDays }: {
  idPrefix: string
  defaultRequiresExpiry: boolean
  defaultMonths: number | null
  defaultReminderDays: number
}) {
  const [requiresExpiry, setRequiresExpiry] = useState(defaultRequiresExpiry)
  const box = useRef<HTMLInputElement>(null)

  // The browser resets the tick box itself when the form resets; keep our copy of it in step.
  useEffect(() => {
    const form = box.current?.form
    if (!form) return
    const onReset = () => setRequiresExpiry(defaultRequiresExpiry)
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [defaultRequiresExpiry])

  return (
    <>
      <label
        htmlFor={`${idPrefix}-requires_expiry`}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm transition hover:border-slate-300 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#323398]/20 sm:col-span-2"
      >
        <input
          ref={box} id={`${idPrefix}-requires_expiry`} type="checkbox" name="requires_expiry" checked={requiresExpiry}
          onChange={event => setRequiresExpiry(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#323398]"
        />
        <span>
          <span className="block font-medium text-slate-900">These documents expire</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Each document gets an expiry date and shows up in the compliance alerts before it runs out.
          </span>
        </span>
      </label>
      <Field
        label="Valid for (months)" htmlFor={`${idPrefix}-months`}
        hint="Fills in the expiry date when someone uploads a document. Leave blank to enter dates one by one."
      >
        <input
          id={`${idPrefix}-months`} name="default_validity_months" type="number" inputMode="numeric" min={1} max={MAX_VALIDITY_MONTHS} step={1}
          defaultValue={defaultMonths ?? ''} disabled={!requiresExpiry} placeholder="e.g. 36" className={inputClass}
        />
      </Field>
      <Field label="Remind (days before expiry)" htmlFor={`${idPrefix}-reminder`} hint="How early the compliance alerts start flagging it.">
        <input
          id={`${idPrefix}-reminder`} name="reminder_days" type="number" inputMode="numeric" min={0} max={MAX_REMINDER_DAYS} step={1}
          defaultValue={defaultReminderDays} disabled={!requiresExpiry} className={inputClass}
        />
      </Field>
    </>
  )
}

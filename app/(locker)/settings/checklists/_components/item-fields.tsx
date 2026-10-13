import { ITEM_TEXT_MAX, ITEM_TITLE_MAX, MAX_OFFSET_DAYS } from '@/utils/people/checklist-input'
import { OWNER_ROLES } from '@/utils/people/constants'
import type { ChecklistTemplateItem } from '@/utils/people/types'
import { Field, FormGrid, inputClass } from '../../../_components/ui'

/** The fields of one template task, for both the add form and the inline editor. */
export function ItemFields({ idPrefix, item }: { idPrefix: string; item?: ChecklistTemplateItem }) {
  const id = (name: string) => `${idPrefix}-${name}`
  return (
    <FormGrid>
      <Field label="Task" htmlFor={id('title')} required wide>
        <input
          id={id('title')} name="title" type="text" required maxLength={ITEM_TITLE_MAX} autoComplete="off"
          defaultValue={item?.title ?? ''} placeholder="e.g. Garda vetting received" className={inputClass}
        />
      </Field>
      <Field label="Details" htmlFor={id('description')} wide hint="Optional. Shown under the task so whoever does it knows what “done” means.">
        <textarea
          id={id('description')} name="description" rows={2} maxLength={ITEM_TEXT_MAX}
          defaultValue={item?.description ?? ''} className={inputClass}
        />
      </Field>
      <Field
        label="Due (days from start)" htmlFor={id('days')} required
        hint="0 is the start day itself. Use a negative number for before it: -7 is a week earlier."
      >
        <input
          id={id('days')} name="due_offset_days" type="number" inputMode="numeric" step={1} required
          min={-MAX_OFFSET_DAYS} max={MAX_OFFSET_DAYS} defaultValue={item?.due_offset_days ?? 0} className={inputClass}
        />
      </Field>
      <Field label="Owner" htmlFor={id('owner')} required hint="Who is responsible for getting it done.">
        <select id={id('owner')} name="owner_role" defaultValue={item?.owner_role ?? 'hr'} className={inputClass}>
          {OWNER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
    </FormGrid>
  )
}

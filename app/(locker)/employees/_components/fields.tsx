import type { ReactNode } from 'react'
import { Field, inputClass } from '../../_components/ui'

// Labelled form controls for the profile forms. Server-component safe: the
// uncontrolled inputs are read by the server action from FormData, and every
// control gets an id derived from its name so labels are always connected.
// Names must be unique within a page.

type Common = {
  name: string
  label: string
  hint?: ReactNode
  wide?: boolean
  required?: boolean
  /** Set when two forms on one page share a field name, so their ids stay unique. */
  idPrefix?: string
}

export function TextField({
  name, label, hint, wide, required, idPrefix, defaultValue, type = 'text', placeholder, list, autoComplete, inputMode,
  maxLength, min, max, step,
}: Common & {
  defaultValue?: string | number | null
  type?: 'text' | 'email' | 'tel' | 'date' | 'number'
  placeholder?: string
  /** id of a <datalist> offering suggestions while still allowing free text. */
  list?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'decimal' | 'tel' | 'email' | 'text'
  maxLength?: number
  min?: string | number
  max?: string | number
  step?: string | number
}) {
  const id = `${idPrefix ?? 'f'}-${name}`
  return (
    <Field label={label} htmlFor={id} hint={hint} wide={wide} required={required}>
      <input
        id={id} name={name} type={type} defaultValue={defaultValue ?? ''} placeholder={placeholder} list={list}
        autoComplete={autoComplete ?? 'off'} inputMode={inputMode} maxLength={maxLength} min={min} max={max} step={step}
        required={required} className={inputClass}
      />
    </Field>
  )
}

export function SelectField({
  name, label, hint, wide, required, idPrefix, defaultValue, options, blank,
}: Common & {
  defaultValue?: string | null
  options: readonly { value: string; label: string }[]
  /** Label for the empty choice; omit when a value must be picked. */
  blank?: string
}) {
  const id = `${idPrefix ?? 'f'}-${name}`
  return (
    <Field label={label} htmlFor={id} hint={hint} wide={wide} required={required}>
      <select id={id} name={name} defaultValue={defaultValue ?? ''} required={required} className={inputClass}>
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

export function TextAreaField({
  name, label, hint, wide = true, required, idPrefix, defaultValue, rows = 3, maxLength, placeholder,
}: Common & { defaultValue?: string | null; rows?: number; maxLength?: number; placeholder?: string }) {
  const id = `${idPrefix ?? 'f'}-${name}`
  return (
    <Field label={label} htmlFor={id} hint={hint} wide={wide} required={required}>
      <textarea
        id={id} name={name} rows={rows} defaultValue={defaultValue ?? ''} maxLength={maxLength} placeholder={placeholder}
        required={required} className={inputClass}
      />
    </Field>
  )
}

export function Datalist({ id, options }: { id: string; options: readonly string[] }) {
  return (
    <datalist id={id}>
      {options.map(o => <option key={o} value={o} />)}
    </datalist>
  )
}

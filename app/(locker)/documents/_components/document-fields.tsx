'use client'

import { useId, useState } from 'react'
import { addMonths, formatDate } from '@/utils/people/format'
import { groupTypesByCategory, type DocumentTypeOption } from '@/utils/people/documents-meta'
import { Field, FormGrid, inputClass } from '../../_components/ui'

type DocumentFieldDefaults = {
  documentTypeId: number | null
  title: string
  referenceNo: string
  issuedOn: string
  expiresOn: string
  notes: string
}

/**
 * The descriptive fields of a document record, shared by the "add" and "edit"
 * forms. Field names match what parseDocumentFields() reads on the server. The
 * expiry hint mirrors the server rule (blank expiry + issue date + a type with a
 * default validity = worked out for you); the server remains the authority.
 */
export function DocumentFields({ types, defaults, lockedTypeId }: {
  types: DocumentTypeOption[]
  defaults?: DocumentFieldDefaults
  /** Fixes the type (the "Add" button next to a required document). */
  lockedTypeId?: number
}) {
  const uid = useId()
  const [typeId, setTypeId] = useState<number | null>(lockedTypeId ?? defaults?.documentTypeId ?? null)
  const [issuedOn, setIssuedOn] = useState(defaults?.issuedOn ?? '')
  const [expiresOn, setExpiresOn] = useState(defaults?.expiresOn ?? '')

  const type = types.find(t => t.id === typeId) ?? null
  const months = type?.default_validity_months ?? null
  const autoExpiry = !expiresOn && issuedOn && months ? addMonths(issuedOn, months) : null
  const expiryRequired = Boolean(type?.requires_expiry && !autoExpiry)

  let expiryHint = 'Leave blank if it does not expire.'
  if (autoExpiry) expiryHint = `Left blank, this will be set to ${formatDate(autoExpiry)} (${months} months after it was issued).`
  else if (type?.requires_expiry) expiryHint = months ? 'Needed for this type. Enter it, or the issue date and it is worked out for you.' : 'Needed for this type of document.'

  return (
    <FormGrid>
      {lockedTypeId !== undefined ? (
        <input type="hidden" name="documentTypeId" value={lockedTypeId} />
      ) : (
        <>
          <Field label="Document type" htmlFor={`${uid}-type`} hint="Pick a type so it counts towards compliance, or leave blank and give it a title.">
            <select
              id={`${uid}-type`}
              name="documentTypeId"
              value={typeId ?? ''}
              onChange={e => setTypeId(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            >
              <option value="">Other (enter a title)</option>
              {groupTypesByCategory(types).map(group => (
                <optgroup key={group.value} label={group.label}>
                  {group.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Title" htmlFor={`${uid}-title`} required={!type} hint={type ? `Optional. Defaults to "${type.name}".` : undefined}>
            <input
              id={`${uid}-title`}
              name="title"
              defaultValue={defaults?.title ?? ''}
              required={!type}
              maxLength={200}
              autoComplete="off"
              placeholder={type?.name ?? 'e.g. Signed policy acknowledgement'}
              className={inputClass}
            />
          </Field>
        </>
      )}
      <Field label="Reference number" htmlFor={`${uid}-ref`} hint="Certificate, disclosure or permit number, if there is one.">
        <input id={`${uid}-ref`} name="referenceNo" defaultValue={defaults?.referenceNo ?? ''} maxLength={100} autoComplete="off" className={inputClass} />
      </Field>
      <Field label="Issued on" htmlFor={`${uid}-issued`}>
        <input id={`${uid}-issued`} name="issuedOn" type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Expires on" htmlFor={`${uid}-expires`} required={expiryRequired} hint={expiryHint}>
        <input
          id={`${uid}-expires`}
          name="expiresOn"
          type="date"
          value={expiresOn}
          onChange={e => setExpiresOn(e.target.value)}
          required={expiryRequired}
          className={inputClass}
        />
      </Field>
      <Field label="Notes" htmlFor={`${uid}-notes`} wide>
        <textarea id={`${uid}-notes`} name="notes" defaultValue={defaults?.notes ?? ''} rows={2} maxLength={2000} className={inputClass} />
      </Field>
    </FormGrid>
  )
}

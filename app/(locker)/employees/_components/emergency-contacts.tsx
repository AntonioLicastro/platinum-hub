import { HeartPulse, Phone, Plus, Star, Trash2 } from 'lucide-react'
import { ActionButton, ActionForm } from '../../_components/action-form'
import { Badge, Card, CardHeader, EmptyState, FormGrid } from '../../_components/ui'
import type { EmergencyContact } from '@/utils/people/types'
import { deleteEmergencyContact, addEmergencyContact, setPrimaryEmergencyContact } from '../actions'
import { TextAreaField, TextField } from './fields'

/** The people to call if something happens to an employee. Editors can add, remove and choose the first contact. */
export function EmergencyContacts({ employeeId, contacts, canEdit, loadFailed }: {
  employeeId: string
  contacts: EmergencyContact[]
  canEdit: boolean
  loadFailed: boolean
}) {
  return (
    <Card>
      <CardHeader title="Emergency contacts" icon={HeartPulse} description="Who to ring first if there is an incident" />

      {loadFailed ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Emergency contacts could not be loaded. Refresh the page to try again.
        </p>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No emergency contact recorded yet"
          body={canEdit
            ? 'Add at least one person we can call. The first contact you add becomes the primary contact.'
            : 'HR has not recorded an emergency contact for you yet. Let them know who to add.'}
        />
      ) : (
        <ul className="space-y-3">
          {contacts.map(contact => (
            <li key={contact.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    {contact.name}
                    {contact.is_primary && <Badge tone="green"><Star size={11} className="mr-1" aria-hidden="true" />Primary</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{contact.relationship || <span className="italic text-slate-400">Relationship not recorded</span>}</p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!contact.is_primary && (
                      <ActionButton
                        action={setPrimaryEmergencyContact.bind(null, employeeId, contact.id)}
                        label="Make primary"
                        pendingLabel="Saving…"
                        icon={<Star size={14} />}
                      />
                    )}
                    <ActionButton
                      action={deleteEmergencyContact.bind(null, employeeId, contact.id)}
                      label="Remove"
                      pendingLabel="Removing…"
                      variant="ghost"
                      confirm={`Remove ${contact.name} as an emergency contact?`}
                      icon={<Trash2 size={14} />}
                    />
                  </div>
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {[contact.phone, contact.alt_phone].filter((p): p is string => !!p).map(phone => (
                  <li key={phone}>
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-[#323398] hover:underline">
                      <Phone size={14} aria-hidden="true" /> {phone}
                    </a>
                  </li>
                ))}
              </ul>
              {contact.notes && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{contact.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !loadFailed && (
        <details open={contacts.length === 0} className="group mt-4 rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-[#323398] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20 [&::-webkit-details-marker]:hidden">
            <Plus size={16} className="transition group-open:rotate-45" aria-hidden="true" /> Add an emergency contact
          </summary>
          <div className="border-t border-slate-100 px-4 pb-4 pt-4">
            <ActionForm action={addEmergencyContact.bind(null, employeeId)} submitLabel="Add contact" pendingLabel="Adding…" resetOnSuccess>
              <FormGrid>
                <TextField name="contact_name" label="Name" required maxLength={120} autoComplete="off" />
                <TextField name="contact_relationship" label="Relationship" maxLength={60} placeholder="e.g. Spouse, Mother, Friend" />
                <TextField name="contact_phone" label="Phone" type="tel" inputMode="tel" maxLength={30} hint="At least one number is needed." />
                <TextField name="contact_alt_phone" label="Alternative phone" type="tel" inputMode="tel" maxLength={30} />
                <TextAreaField name="contact_notes" label="Notes" rows={2} maxLength={500} placeholder="Anything useful, e.g. best time to call" />
              </FormGrid>
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  )
}

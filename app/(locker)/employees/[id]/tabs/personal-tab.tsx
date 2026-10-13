import Link from 'next/link'
import { ArrowRight, Home, IdCard, Lock, LogOut, Mail, TriangleAlert } from 'lucide-react'
import { canOnEmployee } from '@/utils/people/access'
import { COUNTIES } from '@/utils/people/constants'
import { formatDate, maskPps, todayIso } from '@/utils/people/format'
import { auditProfileView } from '@/utils/people/profile-audit'
import { getEmployeePrivate, listEmergencyContacts } from '@/utils/people/profile-data'
import type { EmployeePrivate } from '@/utils/people/types'
import { ActionForm } from '../../../_components/action-form'
import { Card, CardHeader, DataGrid, DataItem, EmptyState, Field, FormGrid, inputClass, NotRecorded } from '../../../_components/ui'
import { recordLeaver, saveLeavingDetails, savePersonal } from '../../actions'
import { EmergencyContacts } from '../../_components/emergency-contacts'
import { Datalist, SelectField, TextAreaField, TextField } from '../../_components/fields'
import { RevealPps } from '../../_components/reveal-pps'
import type { TabProps } from './types'

const RIGHT_TO_WORK_SUGGESTIONS = [
  'Irish citizen', 'EU / EEA / Swiss citizen', 'Stamp 4 (Irish Residence Permit)', 'Employment permit', 'Other',
]
const LEAVING_REASON_SUGGESTIONS = [
  'Resignation', 'End of fixed-term contract', 'Dismissal', 'Redundancy', 'Retirement', 'Failed probation', 'Other',
]
/** hr_employee_private columns that are bookkeeping rather than the person's data. */
const NOT_PERSONAL_DATA: ReadonlySet<string> = new Set(['employee_id', 'updated_by', 'updated_at'])
const REHIRE_OPTIONS = [
  { value: 'yes', label: 'Yes, would rehire' },
  { value: 'no', label: 'No, would not rehire' },
]

export default async function PersonalTab({ viewer, employee }: TabProps) {
  // The shell already hid this tab, but ?tab=personal can still be typed in by hand.
  if (!canOnEmployee(viewer, 'private.view', employee)) {
    return <Card><EmptyState icon={Lock} title="Personal details are restricted" body="You do not have access to this person's personal details." /></Card>
  }
  const canEdit = canOnEmployee(viewer, 'private.edit', employee)
  const canRecordLeaver = canEdit && canOnEmployee(viewer, 'employees.edit', employee)
  const canStartOffboarding = canOnEmployee(viewer, 'checklists.manage', employee)

  const [personal, contacts] = await Promise.all([getEmployeePrivate(employee.id), listEmergencyContacts(employee.id)])
  if (personal.failed) {
    return (
      <Card>
        <p role="alert" className="flex items-center gap-2 text-sm text-amber-800">
          <TriangleAlert size={16} /> Personal details could not be loaded. Refresh the page to try again.
        </p>
      </Card>
    )
  }

  const priv = personal.data
  // HR opening someone else's personal details is logged (counts only, de-duplicated; own record is not).
  const fieldsOnFile = Object.entries(priv ?? {}).filter(([key, value]) => !NOT_PERSONAL_DATA.has(key) && value !== null && value !== '').length
  await auditProfileView(viewer, employee, 'private.view', { fields_on_file: fieldsOnFile, emergency_contacts: contacts.data.length })

  // Only the masked form is ever rendered; the full number is fetched on demand by RevealPps.
  const masked = maskPps(priv?.pps_number)
  const isLeaver = employee.employment_status === 'leaver'

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {!priv && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
            {canEdit
              ? 'No personal details have been recorded yet. Fill in what you have; you can come back and add the rest.'
              : 'HR has not recorded your personal details yet.'}
          </p>
        )}
        {canEdit
          ? <PersonalForm employeeId={employee.id} priv={priv} masked={masked} />
          : <PersonalReadOnly employeeId={employee.id} priv={priv} masked={masked} />}
      </div>

      <div className="space-y-5">
        <EmergencyContacts employeeId={employee.id} contacts={contacts.data} canEdit={canEdit} loadFailed={contacts.failed} />

        {canEdit && (
          <Card>
            <Datalist id="leaving-reasons" options={LEAVING_REASON_SUGGESTIONS} />
            <CardHeader
              title="Leaving details"
              icon={LogOut}
              description={isLeaver ? 'Why and how this person left' : 'Record notice here if someone has resigned but is still working'}
            />
            {isLeaver && canStartOffboarding && (
              <Link href={`/onboarding?start=${employee.id}&kind=offboarding`} className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm font-medium text-[#323398] transition hover:bg-indigo-50">
                Start an offboarding checklist
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
            <ActionForm action={saveLeavingDetails.bind(null, employee.id)} submitLabel="Save leaving details">
              <FormGrid>
                <TextField name="notice_given_on" label="Notice given on" type="date" defaultValue={priv?.notice_given_on} />
                <SelectField name="eligible_for_rehire" label="Eligible for rehire" defaultValue={rehireValue(priv)} blank="Not decided" options={REHIRE_OPTIONS} />
                <TextField name="leaving_reason" label="Reason for leaving" defaultValue={priv?.leaving_reason} list="leaving-reasons" maxLength={200} wide />
                <TextAreaField name="leaving_notes" label="Notes" defaultValue={priv?.leaving_notes} rows={3} maxLength={2000} hint="Visible to HR only." />
              </FormGrid>
            </ActionForm>
          </Card>
        )}

        {canRecordLeaver && !isLeaver && (
          <div id="record-leaver" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="Record leaver"
                icon={LogOut}
                description="Marks them as a leaver from their last working day and adds it to their timeline."
              />
              <ActionForm action={recordLeaver.bind(null, employee.id)} submitLabel="Record as leaver" pendingLabel="Recording…" submitVariant="danger">
                <FormGrid>
                  <TextField idPrefix="leaver" name="end_date" label="Last working day" type="date" required defaultValue={todayIso()}
                    hint="Recording a leaver takes effect now. If they are still working their notice, save the notice date under Leaving details instead." />
                  <TextField idPrefix="leaver" name="notice_given_on" label="Notice given on" type="date" defaultValue={priv?.notice_given_on} />
                  <TextField idPrefix="leaver" name="leaving_reason" label="Reason for leaving" defaultValue={priv?.leaving_reason} list="leaving-reasons" maxLength={200} wide />
                  <SelectField idPrefix="leaver" name="eligible_for_rehire" label="Eligible for rehire" defaultValue={rehireValue(priv)} blank="Not decided" options={REHIRE_OPTIONS} />
                  <TextAreaField idPrefix="leaver" name="leaving_notes" label="Notes" defaultValue={priv?.leaving_notes} rows={3} maxLength={2000} hint="Visible to HR only." />
                </FormGrid>
              </ActionForm>
              {canStartOffboarding && (
                <p className="mt-4 text-xs text-slate-500">
                  Afterwards you can start an offboarding checklist from their profile:{' '}
                  <Link href={`/onboarding?start=${employee.id}&kind=offboarding`} className="font-medium text-[#323398] hover:underline">
                    return of property, system access and final pay
                  </Link>.
                </p>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function rehireValue(priv: EmployeePrivate | null): string | null {
  if (priv?.eligible_for_rehire === true) return 'yes'
  if (priv?.eligible_for_rehire === false) return 'no'
  return null
}

function PersonalForm({ employeeId, priv, masked }: { employeeId: string; priv: EmployeePrivate | null; masked: string }) {
  // A county already on file stays selectable even if it is not one of the 26.
  const counties = [...COUNTIES]
  if (priv?.county && !counties.includes(priv.county)) counties.unshift(priv.county)

  return (
    <ActionForm action={savePersonal.bind(null, employeeId)} submitLabel="Save personal details" className="space-y-5">
      <Card>
        <CardHeader title="Contact" icon={Mail} description="How to reach them outside work" />
        <FormGrid>
          <TextField name="personal_email" label="Personal email" type="email" defaultValue={priv?.personal_email} maxLength={254} />
          <TextField name="mobile" label="Mobile" type="tel" inputMode="tel" defaultValue={priv?.mobile} maxLength={30} />
        </FormGrid>
      </Card>

      <Card>
        <CardHeader title="Home address" icon={Home} />
        <FormGrid>
          <TextField name="address_line1" label="Address line 1" defaultValue={priv?.address_line1} maxLength={120} wide autoComplete="off" />
          <TextField name="address_line2" label="Address line 2" defaultValue={priv?.address_line2} maxLength={120} wide />
          <TextField name="town" label="Town / city" defaultValue={priv?.town} maxLength={80} />
          <SelectField name="county" label="County" defaultValue={priv?.county} blank="Not recorded yet" options={counties.map(c => ({ value: c, label: c }))} />
          <TextField name="eircode" label="Eircode" defaultValue={priv?.eircode} maxLength={8} placeholder="D02 X285" hint="Seven characters, e.g. D02 X285." />
        </FormGrid>
      </Card>

      <Card>
        <CardHeader title="Identity and right to work" icon={IdCard} description="Held for payroll and employment-law checks" />
        <FormGrid>
          <TextField name="date_of_birth" label="Date of birth" type="date" defaultValue={priv?.date_of_birth} />
          <TextField name="nationality" label="Nationality" defaultValue={priv?.nationality} maxLength={80} />
          <TextField name="right_to_work_basis" label="Right to work basis" defaultValue={priv?.right_to_work_basis} list="right-to-work" maxLength={200} wide
            hint="How their right to work in Ireland was established. Upload the evidence on the Documents tab." />
          <Field label="PPS number" htmlFor="f-pps_number" wide
            hint={masked ? 'Enter a new number to replace the one on file, or leave blank to keep it.' : 'Seven digits followed by one or two letters, e.g. 1234567TA.'}>
            {masked && <div className="mb-2"><RevealPps employeeId={employeeId} masked={masked} /></div>}
            <input id="f-pps_number" name="pps_number" autoComplete="off" maxLength={12} placeholder={masked ? 'New PPS number' : '1234567TA'} className={`${inputClass} font-mono uppercase`} />
            {masked && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" name="clear_pps" className="h-4 w-4 rounded border-slate-300 text-[#323398] focus:ring-[#323398]" />
                Remove the PPS number on file
              </label>
            )}
          </Field>
        </FormGrid>
      </Card>

      <Datalist id="right-to-work" options={RIGHT_TO_WORK_SUGGESTIONS} />
    </ActionForm>
  )
}

function PersonalReadOnly({ employeeId, priv, masked }: { employeeId: string; priv: EmployeePrivate | null; masked: string }) {
  const address = [priv?.address_line1, priv?.address_line2, priv?.town, priv?.county, priv?.eircode].filter(Boolean)
  return (
    <>
      <Card>
        <CardHeader title="Contact" icon={Mail} />
        <DataGrid>
          <DataItem label="Personal email" value={priv?.personal_email} />
          <DataItem label="Mobile" value={priv?.mobile} />
        </DataGrid>
      </Card>
      <Card>
        <CardHeader title="Home address" icon={Home} />
        <DataGrid>
          <DataItem label="Address" wide value={address.length > 0 ? address.join(', ') : null} />
        </DataGrid>
      </Card>
      <Card>
        <CardHeader title="Identity and right to work" icon={IdCard} />
        <DataGrid>
          <DataItem label="Date of birth" value={formatDate(priv?.date_of_birth)} />
          <DataItem label="Nationality" value={priv?.nationality} />
          <DataItem label="Right to work basis" value={priv?.right_to_work_basis} wide />
          <DataItem label="PPS number" wide value={masked ? <RevealPps employeeId={employeeId} masked={masked} /> : <NotRecorded />} />
        </DataGrid>
      </Card>
    </>
  )
}

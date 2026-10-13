import type { ReactNode } from 'react'
import { AREA_OPTIONS, TITLE_OPTIONS } from '@/utils/org-options'
import { canOnEmployee } from '@/utils/people/access'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, labelOf } from '@/utils/people/constants'
import { formatDate } from '@/utils/people/format'
import { getManagerName, listManagerOptions } from '@/utils/people/profile-data'
import { listLeaveGroupNames } from '@/utils/people/leave-year'
import { DEFAULT_LEAVE_GROUPS, groupKey } from '@/utils/people/leave-year-people'
import { formatHours } from '@/utils/people/profile-format'
import { ActionForm } from '../../../_components/action-form'
import { Badge, Card, CardHeader, DataGrid, DataItem, Field, FormGrid, inputClass } from '../../../_components/ui'
import { updateEmployee } from '../../actions'
import { Datalist, SelectField, TextField } from '../../_components/fields'
import type { TabProps } from './types'

const AREA_SUGGESTIONS = [...AREA_OPTIONS, 'ALL']

export default async function EmploymentTab({ viewer, employee }: TabProps) {
  if (!canOnEmployee(viewer, 'employees.edit', employee)) return <EmploymentReadOnly employee={employee} />

  // Suggestions only: if they cannot be loaded the field still works with the standard groups.
  const groupNamesPromise = listLeaveGroupNames(viewer).catch(() => [] as string[])

  // listManagerOptions throws on a database error. Degrade to the current manager only (kept selected below, so saving
  // cannot clear it) rather than blanking the whole profile.
  let managers: Awaited<ReturnType<typeof listManagerOptions>> = []
  let managersFailed = false
  try {
    managers = await listManagerOptions(viewer, employee.id)
  } catch {
    managersFailed = true
  }
  // Keep the current manager selectable even if they have since left or have no employee record.
  const managerOptions = managers.map(m => ({ value: m.email, label: m.name }))
  if (employee.manager_email && !managers.some(m => m.email === employee.manager_email)) {
    managerOptions.unshift({ value: employee.manager_email, label: `${employee.manager_email} (not a current employee)` })
  }
  const groupSuggestions = [...DEFAULT_LEAVE_GROUPS, ...(await groupNamesPromise)]
    .filter((g, i, all) => all.findIndex(other => groupKey(other) === groupKey(g)) === i)
  const isLeaver = employee.employment_status === 'leaver'
  const statusOptions = EMPLOYMENT_STATUSES
    .filter(s => s.value !== 'leaver' || isLeaver)
    .map(s => ({ value: s.value, label: s.label }))

  return (
    <ActionForm action={updateEmployee.bind(null, employee.id)} submitLabel="Save employment details" className="space-y-5">
      <Card>
        <CardHeader title="Identity" description="How this person appears across HR Locker" />
        <FormGrid>
          <TextField name="first_name" label="First name" defaultValue={employee.first_name} required autoComplete="off" maxLength={80} />
          <TextField name="last_name" label="Last name" defaultValue={employee.last_name} maxLength={80} />
          <TextField name="preferred_name" label="Preferred name" defaultValue={employee.preferred_name} maxLength={80} hint="Shown in brackets after their name when it differs from their first name." />
          <Field label="Email" htmlFor="f-email-readonly" hint="This is the address they sign in with, so it can't be changed here.">
            <input id="f-email-readonly" value={employee.email} disabled readOnly className={inputClass} />
          </Field>
        </FormGrid>
      </Card>

      <Card>
        <CardHeader title="Role and contract" description="What they do, where, and on what terms" />
        <FormGrid>
          <TextField name="job_title" label="Job title" defaultValue={employee.job_title} list="job-titles" maxLength={120} hint="Pick a standard title or type your own." />
          <TextField name="department" label="Department" defaultValue={employee.department} maxLength={120} />
          <TextField name="area" label="Area" defaultValue={employee.area} list="areas" maxLength={80} hint="Managers see people by this exact value, so choose from the list where you can." />
          <TextField name="leave_group" label="Leave calendar group" defaultValue={employee.leave_group} list="leave-groups" maxLength={40} hint="Where they appear on the Leave year view, e.g. RMs or SLT + Support. Leave blank for none." />
          <TextField name="base_location" label="Base location" defaultValue={employee.base_location} maxLength={160} placeholder="Office or town they work from" />
          <SelectField name="employment_status" label="Employment status" defaultValue={employee.employment_status} options={statusOptions} required
            hint={isLeaver ? 'Choose another status to reverse a leaver entered by mistake.' : 'To record someone leaving, use Record leaver on the Personal tab.'} />
          <SelectField name="employment_type" label="Employment type" defaultValue={employee.employment_type} blank="Not recorded yet" options={EMPLOYMENT_TYPES} />
          <TextField name="contract_hours_per_week" label="Contracted hours per week" type="number" inputMode="decimal" min={0} max={168} step="0.01" defaultValue={employee.contract_hours_per_week} hint="Enter 0 for a zero-hours contract." />
          <TextField name="work_pattern" label="Work pattern" defaultValue={employee.work_pattern} maxLength={200} placeholder="e.g. Mon-Fri days, alternate weekends" />
          <TextField name="employee_no" label="Employee number" defaultValue={employee.employee_no} maxLength={40} hint="Must be unique." />
          <TextField name="payroll_no" label="Payroll number" defaultValue={employee.payroll_no} maxLength={40} hint="As it appears in Sage." />
        </FormGrid>
      </Card>

      <Card>
        <CardHeader title="Reporting line and contact" />
        <FormGrid>
          <SelectField name="manager_email" label="Line manager" defaultValue={employee.manager_email} blank="Not recorded yet" options={managerOptions}
            hint={managersFailed
              ? 'The list of people could not be loaded, so the line manager cannot be changed right now. Refresh the page to try again.'
              : "Line managers can see this person's directory details and approve their leave."} />
          <TextField name="work_phone" label="Work phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={employee.work_phone} maxLength={30} />
        </FormGrid>
      </Card>

      <Card>
        <CardHeader title="Key dates" />
        <FormGrid>
          <TextField name="start_date" label="Start date" type="date" defaultValue={employee.start_date} />
          <TextField name="continuous_service_date" label="Continuous service from" type="date" defaultValue={employee.continuous_service_date} hint="Only differs from the start date when earlier service counts." />
          <TextField name="probation_end_date" label="Probation ends" type="date" defaultValue={employee.probation_end_date} />
          <TextField name="end_date" label="End date" type="date" defaultValue={employee.end_date} hint="Fixed-term end date, or last working day." />
        </FormGrid>
      </Card>

      <Datalist id="job-titles" options={TITLE_OPTIONS} />
      <Datalist id="areas" options={AREA_SUGGESTIONS} />
      <Datalist id="leave-groups" options={groupSuggestions} />
    </ActionForm>
  )
}

async function EmploymentReadOnly({ employee }: { employee: TabProps['employee'] }) {
  const lookedUp = await getManagerName(employee.manager_email)
  const status = EMPLOYMENT_STATUSES.find(s => s.value === employee.employment_status)
  const managerName = employee.manager_email ? lookedUp ?? employee.manager_email : null

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Role and contract" description="What they do, where, and on what terms">
        <DataItem label="Job title" value={employee.job_title} />
        <DataItem label="Department" value={employee.department} />
        <DataItem label="Area" value={employee.area} />
        <DataItem label="Leave calendar group" value={employee.leave_group} />
        <DataItem label="Base location" value={employee.base_location} />
        <DataItem label="Status" value={status && <Badge tone={status.tone} dot>{status.label}</Badge>} />
        <DataItem label="Employment type" value={labelOf(EMPLOYMENT_TYPES, employee.employment_type)} />
        <DataItem label="Contracted hours" value={formatHours(employee.contract_hours_per_week)} />
        <DataItem label="Work pattern" value={employee.work_pattern} />
        <DataItem label="Employee number" value={employee.employee_no} />
        <DataItem label="Payroll number" value={employee.payroll_no} />
      </Section>

      <div className="space-y-5">
        <Section title="Reporting line and contact">
          <DataItem label="Line manager" value={managerName} />
          <DataItem label="Work email" value={employee.email} />
          <DataItem label="Work phone" value={employee.work_phone} />
        </Section>
        <Section title="Key dates">
          <DataItem label="Start date" value={formatDate(employee.start_date)} />
          <DataItem label="Continuous service from" value={formatDate(employee.continuous_service_date)} />
          <DataItem label="Probation ends" value={formatDate(employee.probation_end_date)} />
          <DataItem label="End date" value={formatDate(employee.end_date)} />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <DataGrid>{children}</DataGrid>
    </Card>
  )
}

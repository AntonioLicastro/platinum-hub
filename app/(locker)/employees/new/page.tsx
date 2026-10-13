import { CalendarDays, ClipboardList, UserPlus } from 'lucide-react'
import { AREA_OPTIONS, TITLE_OPTIONS } from '@/utils/org-options'
import { requireCapability } from '@/utils/people/access'
import { EMPLOYMENT_TYPES } from '@/utils/people/constants'
import { listManagerOptions } from '@/utils/people/profile-data'
import { ActionForm } from '../../_components/action-form'
import { Card, CardHeader, FormGrid, PageHeader } from '../../_components/ui'
import { createEmployee } from '../actions'
import { Datalist, SelectField, TextField } from '../_components/fields'

const AREA_SUGGESTIONS = [...AREA_OPTIONS, 'ALL']

export default async function NewEmployeePage() {
  const viewer = await requireCapability('employees.edit')
  const managers = await listManagerOptions(viewer)

  return (
    <>
      <PageHeader
        title="Add an employee"
        subtitle="Only a name and an email are needed to start. Everything else can be filled in as the information comes in."
        icon={UserPlus}
        crumbs={[{ label: 'Directory', href: '/directory' }, { label: 'New employee' }]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActionForm action={createEmployee} submitLabel="Create employee" pendingLabel="Creating…" className="space-y-5">
            <Card>
              <CardHeader title="Who are they?" />
              <FormGrid>
                <TextField name="first_name" label="First name" required maxLength={80} />
                <TextField name="last_name" label="Last name" required maxLength={80} />
                <TextField name="preferred_name" label="Preferred name" maxLength={80} hint="Only if they go by a different name." />
                <TextField name="email" label="Email" type="email" required maxLength={254} autoComplete="off"
                  hint="Their company address (name@platinumhomecare.ie) if they have one, otherwise a personal address. Each email can only be used once." />
              </FormGrid>
            </Card>

            <Card>
              <CardHeader title="Role" description="Leave anything you don't have yet" />
              <FormGrid>
                <TextField name="job_title" label="Job title" list="job-titles" maxLength={120} />
                <TextField name="area" label="Area" list="areas" maxLength={80} />
                <SelectField name="employment_type" label="Employment type" blank="Not recorded yet" options={EMPLOYMENT_TYPES} />
                <TextField name="contract_hours_per_week" label="Contracted hours per week" type="number" inputMode="decimal" min={0} max={168} step="0.01" hint="Enter 0 for a zero-hours contract." />
                <SelectField name="manager_email" label="Line manager" blank="Not recorded yet" options={managers.map(m => ({ value: m.email, label: m.name }))} />
                <TextField name="work_phone" label="Work phone" type="tel" inputMode="tel" maxLength={30} />
                <TextField name="employee_no" label="Employee number" maxLength={40} hint="Must be unique." />
                <TextField name="payroll_no" label="Payroll number" maxLength={40} hint="As it appears in Sage." />
              </FormGrid>
            </Card>

            <Card>
              <CardHeader title="Dates" icon={CalendarDays} description="A start date in the future marks them as pre-start" />
              <FormGrid>
                <TextField name="start_date" label="Start date" type="date" />
                <TextField name="continuous_service_date" label="Continuous service from" type="date" hint="Only if earlier service counts." />
                <TextField name="probation_end_date" label="Probation ends" type="date" />
              </FormGrid>
            </Card>

            <Datalist id="job-titles" options={TITLE_OPTIONS} />
            <Datalist id="areas" options={AREA_SUGGESTIONS} />
          </ActionForm>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader title="What happens next" icon={ClipboardList} />
            <ol className="space-y-3 text-sm text-slate-600">
              <li><span className="font-medium text-slate-900">1. Their profile opens.</span> A start date adds a &quot;Joined&quot; entry to their timeline.</li>
              <li><span className="font-medium text-slate-900">2. Fill in the gaps.</span> Personal details, pay and documents each have their own tab, ready for when you have them.</li>
              <li><span className="font-medium text-slate-900">3. Start onboarding.</span> You&apos;ll be offered a checklist so nothing gets missed before day one.</li>
            </ol>
          </Card>
        </aside>
      </div>
    </>
  )
}

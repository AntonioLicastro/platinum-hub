'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ListChecks, TriangleAlert } from 'lucide-react'
import { ActionForm } from '../../_components/action-form'
import { Field, FormGrid, inputClass } from '../../_components/ui'
import { suggestTemplate, type StartEmployeeOption, type StartTemplateOption } from '@/utils/people/checklist-input'
import { CHECKLIST_KINDS, labelOf } from '@/utils/people/constants'
import { addDays, formatDate } from '@/utils/people/format'
import { EARLIEST_DATE } from '@/utils/people/timeline-input'
import type { ChecklistKind } from '@/utils/people/types'
import { isIsoDate } from '@/utils/people/validate'
import { startChecklist } from '../actions'

type Props = {
  employees: StartEmployeeOption[]
  templates: StartTemplateOption[]
  today: string
  initialEmployeeId: string | null
  initialKind: ChecklistKind
  /** The profile tab fixes the employee; the Onboarding page lets the viewer choose. */
  lockEmployee?: boolean
  /** Where templates are managed. Only passed for people allowed to open Settings. */
  templatesHref?: string
  /** Keeps element ids unique when the form appears more than once on a page. */
  idPrefix: string
}

export function StartChecklistForm({
  employees, templates, today, initialEmployeeId, initialKind, lockEmployee = false, templatesHref, idPrefix,
}: Props) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? '')
  const [kind, setKind] = useState<ChecklistKind>(initialKind)
  const [templateId, setTemplateId] = useState(() => {
    const person = employees.find(e => e.id === initialEmployeeId)
    return String(suggestTemplate(templates, initialKind, person?.jobTitle)?.id ?? '')
  })
  const [startedOn, setStartedOn] = useState(today)

  const employee = employees.find(e => e.id === employeeId)
  const options = templates.filter(t => t.kind === kind)
  const template = options.find(t => String(t.id) === templateId)
  const kindLabel = labelOf(CHECKLIST_KINDS, kind).toLowerCase()

  // Picking an employee or a kind re-suggests the template; the person can still override it.
  const choose = (nextEmployeeId: string, nextKind: ChecklistKind) => {
    setEmployeeId(nextEmployeeId)
    setKind(nextKind)
    const person = employees.find(e => e.id === nextEmployeeId)
    setTemplateId(String(suggestTemplate(templates, nextKind, person?.jobTitle)?.id ?? ''))
  }

  const anchor = kind === 'offboarding' ? employee?.endDate : employee?.startDate
  const anchorLabel = kind === 'offboarding' ? 'last working day' : 'start date'

  let preview: string | null = null
  if (template && template.minOffset !== null && template.maxOffset !== null && isIsoDate(startedOn)) {
    const first = addDays(startedOn, template.minOffset)
    const last = addDays(startedOn, template.maxOffset)
    const tasks = `${template.itemCount} ${template.itemCount === 1 ? 'task' : 'tasks'}`
    preview = first === last ? `${tasks}, all due ${formatDate(first)}.` : `${tasks}, due between ${formatDate(first)} and ${formatDate(last)}.`
  }

  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <ActionForm action={startChecklist} submitLabel={`Start ${kindLabel}`} pendingLabel="Starting…" submitVariant="success">
      <FormGrid>
        {lockEmployee ? (
          <input type="hidden" name="employee_id" value={employeeId} />
        ) : (
          <Field label="Employee" htmlFor={id('employee')} required wide>
            <select
              id={id('employee')} name="employee_id" required value={employeeId}
              onChange={e => choose(e.target.value, kind)} className={inputClass}
            >
              <option value="">Choose an employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.jobTitle ? `${e.name} · ${e.jobTitle}` : e.name}</option>
              ))}
            </select>
          </Field>
        )}

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</legend>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {CHECKLIST_KINDS.map(k => (
              <label
                key={k.value}
                className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition focus-within:ring-4 focus-within:ring-[#323398]/20 ${
                  kind === k.value ? 'bg-white text-[#323398] shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <input
                  type="radio" name={id('kind')} value={k.value} checked={kind === k.value}
                  onChange={() => choose(employeeId, k.value)} className="sr-only"
                />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Template" htmlFor={id('template')} required>
          <select
            id={id('template')} name="template_id" required value={templateId} disabled={options.length === 0}
            onChange={e => setTemplateId(e.target.value)} className={inputClass}
          >
            {options.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>

        <Field label="Counting from" htmlFor={id('started')} required hint="Each task’s due date is worked out from this day.">
          <input
            id={id('started')} name="started_on" type="date" required min={EARLIEST_DATE} value={startedOn}
            onChange={e => setStartedOn(e.target.value)} className={inputClass}
          />
        </Field>

        <div className="space-y-2 text-sm sm:col-span-2" aria-live="polite">
          {options.length === 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                There is no active {kindLabel} template yet.{' '}
                {templatesHref
                  ? <Link href={templatesHref} className="font-medium underline">Create one in Settings</Link>
                  : 'Ask HR to set one up.'}
              </span>
            </p>
          )}
          {template && template.itemCount === 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                This template has no tasks yet.{' '}
                {templatesHref
                  ? <Link href={`${templatesHref}/${template.id}`} className="font-medium underline">Add some tasks</Link>
                  : 'Ask HR to add them.'}
              </span>
            </p>
          )}
          {preview && (
            <p className="flex items-start gap-2 text-slate-600">
              <ListChecks size={16} className="mt-0.5 shrink-0 text-[#323398]" aria-hidden="true" />
              <span>{preview}</span>
            </p>
          )}
          {anchor && anchor !== startedOn && (
            <button
              type="button"
              onClick={() => setStartedOn(anchor)}
              className="inline-flex items-center gap-2 rounded-lg text-[#323398] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#323398]/20"
            >
              <CalendarDays size={16} aria-hidden="true" />
              Count from their {anchorLabel} ({formatDate(anchor)})
            </button>
          )}
          {employee && !anchor && (
            <p className="text-xs italic text-slate-500">No {anchorLabel} is recorded for {employee.name} yet.</p>
          )}
        </div>
      </FormGrid>
    </ActionForm>
  )
}

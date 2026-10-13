// Row types for the hr_* tables (see supabase/migrations/20261013_people_hub_*.sql).
// Dates are ISO strings: `YYYY-MM-DD` for `date` columns, full ISO for timestamptz.

export type EmploymentStatus = 'pre_start' | 'active' | 'on_leave' | 'suspended' | 'leaver'
export type EmploymentType = 'permanent' | 'fixed_term' | 'part_time' | 'casual' | 'contract' | 'agency'
export type EmployeeSource = 'manual' | 'profiles_sync' | 'roster_sync' | 'import'

/** hr_employees: directory-level data, visible to HR and in-scope managers. */
export type Employee = {
  id: string
  profile_id: string | null
  email: string
  first_name: string
  last_name: string
  preferred_name: string | null
  employee_no: string | null
  payroll_no: string | null
  job_title: string | null
  department: string | null
  area: string | null
  /** Free-text group for the Leave year view ('RMs', 'SLT + Support'); null = none. */
  leave_group: string | null
  employment_status: EmploymentStatus
  employment_type: EmploymentType | null
  contract_hours_per_week: number | null
  work_pattern: string | null
  base_location: string | null
  manager_email: string | null
  work_phone: string | null
  start_date: string | null
  continuous_service_date: string | null
  probation_end_date: string | null
  end_date: string | null
  source: EmployeeSource
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** hr_employee_private: HR-only (and the employee themselves, read-only). */
export type EmployeePrivate = {
  employee_id: string
  personal_email: string | null
  mobile: string | null
  address_line1: string | null
  address_line2: string | null
  town: string | null
  county: string | null
  eircode: string | null
  date_of_birth: string | null
  pps_number: string | null
  nationality: string | null
  right_to_work_basis: string | null
  notice_given_on: string | null
  leaving_reason: string | null
  leaving_notes: string | null
  eligible_for_rehire: boolean | null
  updated_by: string | null
  updated_at: string
}

export type EmergencyContact = {
  id: string
  employee_id: string
  name: string
  relationship: string | null
  phone: string | null
  alt_phone: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
}

export type Compensation = {
  id: string
  employee_id: string
  effective_from: string
  pay_basis: 'hourly' | 'salary'
  rate: number
  currency: string
  hours_per_week: number | null
  reason: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type DocumentCategory = 'vetting' | 'right_to_work' | 'training' | 'licence' | 'contract' | 'compliance' | 'other'

export type DocumentType = {
  id: number
  name: string
  category: DocumentCategory
  description: string | null
  requires_expiry: boolean
  default_validity_months: number | null
  reminder_days: number
  mandatory: boolean
  /** Empty = applies to everyone, otherwise only these job titles. */
  applies_to_titles: string[]
  active: boolean
  sort_order: number
}

export type DocumentStatus = 'pending' | 'verified' | 'rejected'

export type EmployeeDocument = {
  id: string
  employee_id: string
  document_type_id: number | null
  title: string
  file_path: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  reference_no: string | null
  issued_on: string | null
  expires_on: string | null
  status: DocumentStatus
  verified_by: string | null
  verified_at: string | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type LeaveCategory = 'annual' | 'sick' | 'statutory' | 'other'

export type LeaveType = {
  id: number
  code: string
  name: string
  category: LeaveCategory
  paid: boolean
  requires_approval: boolean
  uses_balance: boolean
  default_entitlement_days: number | null
  color: string
  statutory_note: string | null
  active: boolean
  sort_order: number
}

export type LeaveEntitlement = {
  id: string
  employee_id: string
  leave_type_id: number
  year: number
  entitlement_days: number
  carried_over_days: number
  notes: string | null
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type LeaveRequest = {
  id: string
  employee_id: string
  leave_type_id: number
  start_date: string
  end_date: string
  start_half_day: boolean
  end_half_day: boolean
  days: number
  status: LeaveStatus
  reason: string | null
  requested_by: string | null
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
}

export type PublicHoliday = { holiday_date: string; name: string }

export type ReviewType =
  | 'probation' | 'annual_appraisal' | 'supervision' | 'spot_check' | 'return_to_work' | 'exit_interview' | 'other'

export type Review = {
  id: string
  employee_id: string
  review_type: ReviewType
  due_on: string | null
  completed_on: string | null
  reviewer_email: string | null
  outcome: string | null
  summary: string | null
  next_due_on: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EventType =
  | 'joined' | 'role_change' | 'area_change' | 'pay_change' | 'probation' | 'commendation' | 'warning'
  | 'disciplinary' | 'grievance' | 'absence' | 'training' | 'note' | 'leaver' | 'other'

export type EventVisibility = 'hr_only' | 'manager'

export type EmployeeEvent = {
  id: string
  employee_id: string
  event_type: EventType
  occurred_on: string
  title: string
  details: string | null
  visibility: EventVisibility
  created_by: string | null
  created_at: string
}

export type ChecklistKind = 'onboarding' | 'offboarding'
export type OwnerRole = 'hr' | 'manager' | 'employee' | 'it' | 'finance'

export type ChecklistTemplate = {
  id: number
  name: string
  kind: ChecklistKind
  description: string | null
  applies_to_titles: string[]
  active: boolean
}

export type ChecklistTemplateItem = {
  id: number
  template_id: number
  title: string
  description: string | null
  due_offset_days: number
  owner_role: OwnerRole
  sort_order: number
}

export type Checklist = {
  id: string
  employee_id: string
  template_id: number | null
  name: string
  kind: ChecklistKind
  started_on: string
  completed_at: string | null
  created_by: string | null
  created_at: string
}

export type ChecklistItem = {
  id: string
  checklist_id: string
  title: string
  description: string | null
  owner_role: OwnerRole
  due_on: string | null
  completed_at: string | null
  completed_by: string | null
  notes: string | null
  sort_order: number
}

export type AuditEntry = {
  id: number
  at: string
  actor_email: string | null
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  employee_id: string | null
  detail: Record<string, unknown> | null
}

/** Result shape for every server action in HR Locker. */
export type ActionState = {
  error: string | null
  ok?: boolean
  message?: string
}

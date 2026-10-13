// The columns HR Locker can read from an export of a previous HR system or any spreadsheet,
// and how column headings are matched to them. Pure data and helpers: safe to
// import from client components.

export type ImportFieldKey =
  | 'email' | 'first_name' | 'last_name' | 'full_name' | 'preferred_name' | 'employee_no' | 'payroll_no'
  | 'job_title' | 'department' | 'area' | 'base_location' | 'employment_status' | 'employment_type'
  | 'contract_hours_per_week' | 'work_pattern' | 'manager' | 'work_phone'
  | 'start_date' | 'continuous_service_date' | 'probation_end_date' | 'end_date'
  | 'personal_email' | 'mobile' | 'date_of_birth' | 'pps_number' | 'nationality'
  | 'address_line1' | 'address_line2' | 'town' | 'county' | 'eircode'

type FieldGroup = 'identity' | 'job' | 'dates' | 'personal'

export const FIELD_GROUPS: { value: FieldGroup; label: string; hrOnly: boolean }[] = [
  { value: 'identity', label: 'Who they are', hrOnly: false },
  { value: 'job', label: 'Job and contract', hrOnly: false },
  { value: 'dates', label: 'Key dates', hrOnly: false },
  { value: 'personal', label: 'Personal details (HR only)', hrOnly: true },
]

type FieldKind =
  | 'email' | 'text' | 'date' | 'hours' | 'status' | 'type' | 'phone' | 'pps' | 'eircode' | 'county' | 'manager'

export type ImportField = {
  key: ImportFieldKey
  /** Shown in the mapping menus and used as the heading in the template. */
  label: string
  group: FieldGroup
  /** Where the value is stored. `null` for Full name, which is split into first and last name. */
  table: 'employee' | 'private' | null
  column: string | null
  kind: FieldKind
  maxLength?: number
  /** Dates of birth cannot be in the future. */
  notFuture?: boolean
  /** A value that cannot be read is skipped with a warning instead of rejecting the whole row. */
  lenient?: boolean
  /** Other headings that mean the same thing (matching ignores case, spaces and punctuation). */
  aliases: string[]
  /** The value shown in the template's example row; null leaves the field out of the template. */
  example: string | null
}

/** The template's example row. Rows with this email are skipped, so an unedited example is never imported. */
export const TEMPLATE_EXAMPLE_EMAIL = 'example.person@example.com'

const FIELDS: Record<ImportFieldKey, Omit<ImportField, 'key'>> = {
  email: {
    label: 'Work email', group: 'identity', table: 'employee', column: 'email', kind: 'email', example: TEMPLATE_EXAMPLE_EMAIL,
    aliases: [
      'Work Email', 'Email', 'Email Address', 'Work Email Address', 'Company Email', 'Business Email', 'Official Email',
      'Primary Email', 'E-mail', 'Staff Email', 'Employee Email', 'Login Email', 'Email (Work)',
    ],
  },
  first_name: {
    label: 'First name', group: 'identity', table: 'employee', column: 'first_name', kind: 'text', maxLength: 80, example: 'EXAMPLE (delete this row)',
    aliases: ['First Name', 'Forename', 'Given Name', 'Given Names', 'First', 'Christian Name'],
  },
  last_name: {
    label: 'Last name', group: 'identity', table: 'employee', column: 'last_name', kind: 'text', maxLength: 80, example: 'Person',
    aliases: ['Last Name', 'Surname', 'Family Name', 'Last', 'Second Name'],
  },
  full_name: {
    label: 'Full name (first and last together)', group: 'identity', table: null, column: null, kind: 'text', maxLength: 160, example: null,
    aliases: ['Full Name', 'Name', 'Employee Name', 'Staff Name', 'Employee', 'Display Name', 'Name of Employee'],
  },
  preferred_name: {
    label: 'Preferred name', group: 'identity', table: 'employee', column: 'preferred_name', kind: 'text', maxLength: 80, example: 'Ex',
    aliases: ['Preferred Name', 'Preferred First Name', 'Known As', 'Nickname', 'Nick Name', 'Goes By', 'Preferred'],
  },
  employee_no: {
    label: 'Employee number', group: 'identity', table: 'employee', column: 'employee_no', kind: 'text', maxLength: 40, example: 'E1001',
    aliases: [
      'Employee Number', 'Employee No', 'Employee ID', 'Employee Code', 'Employee Ref', 'Employee Reference', 'Staff Number',
      'Staff No', 'Staff ID', 'Staff Code', 'Emp No', 'Emp ID', 'Emp Number', 'Works Number', 'Clock Number', 'Personnel Number',
    ],
  },
  payroll_no: {
    label: 'Payroll number', group: 'identity', table: 'employee', column: 'payroll_no', kind: 'text', maxLength: 40, example: '12345',
    aliases: [
      'Payroll Number', 'Payroll No', 'Payroll ID', 'Payroll Code', 'Payroll Ref', 'Payroll Reference', 'Payroll', 'Payroll Num',
      'Sage Number', 'Sage ID', 'Sage Ref',
    ],
  },
  job_title: {
    label: 'Job title', group: 'job', table: 'employee', column: 'job_title', kind: 'text', maxLength: 120, example: 'Healthcare Assistant',
    // "Title" on its own is deliberately not an alias: in HR Locker it is usually Mr / Ms.
    aliases: ['Job Title', 'Position', 'Position Title', 'Role', 'Job Role', 'Job', 'Designation', 'Occupation', 'Job Position', 'Post'],
  },
  department: {
    label: 'Department', group: 'job', table: 'employee', column: 'department', kind: 'text', maxLength: 120, example: 'Care',
    aliases: ['Department', 'Dept', 'Division', 'Team', 'Business Unit', 'Section', 'Function'],
  },
  area: {
    label: 'Area', group: 'job', table: 'employee', column: 'area', kind: 'text', maxLength: 80, example: 'CHO1',
    aliases: ['Area', 'Care Area', 'Service Area', 'Work Area', 'Operational Area', 'Region', 'CHO', 'CHO Area', 'Patch'],
  },
  base_location: {
    label: 'Base location', group: 'job', table: 'employee', column: 'base_location', kind: 'text', maxLength: 160, example: 'Cork',
    aliases: [
      'Location', 'Base Location', 'Work Location', 'Site', 'Office', 'Branch', 'Workplace', 'Base', 'Office Location',
      'Place of Work', 'Primary Location',
    ],
  },
  employment_status: {
    label: 'Employment status', group: 'job', table: 'employee', column: 'employment_status', kind: 'status', example: 'Active',
    aliases: ['Status', 'Employment Status', 'Employee Status', 'Current Status', 'Staff Status'],
  },
  employment_type: {
    label: 'Employment type', group: 'job', table: 'employee', column: 'employment_type', kind: 'type', example: 'Permanent',
    aliases: [
      'Contract Type', 'Employment Type', 'Type of Contract', 'Contract', 'Employment Contract', 'Contract Basis',
      'Type of Employment', 'Staff Type', 'Employee Type', 'Worker Type',
    ],
  },
  contract_hours_per_week: {
    label: 'Contracted hours per week', group: 'job', table: 'employee', column: 'contract_hours_per_week', kind: 'hours', example: '39',
    aliases: [
      'Hours', 'Contracted Hours', 'Contract Hours', 'Weekly Hours', 'Hours Per Week', 'Hours/Week', 'Hours a Week',
      'Contracted Hours Per Week', 'Working Hours', 'Contractual Hours', 'Hours Contracted', 'Weekly Contracted Hours',
    ],
  },
  work_pattern: {
    label: 'Work pattern', group: 'job', table: 'employee', column: 'work_pattern', kind: 'text', maxLength: 200, example: 'Mon to Fri',
    aliases: ['Work Pattern', 'Working Pattern', 'Shift Pattern', 'Pattern', 'Working Days', 'Work Days', 'Roster Pattern', 'Rota Pattern'],
  },
  manager: {
    label: 'Line manager (email or full name)', group: 'job', table: 'employee', column: 'manager_email', kind: 'manager', maxLength: 254,
    example: 'line.manager@example.com',
    aliases: [
      'Manager', 'Line Manager', 'Line Manager Email', 'Reports To', 'Manager Email', 'Supervisor', 'Direct Manager',
      'Reporting Manager', 'Line Manager Name', 'Manager Name', 'Reports To Email', 'Reporting To',
    ],
  },
  work_phone: {
    label: 'Work phone', group: 'job', table: 'employee', column: 'work_phone', kind: 'phone', maxLength: 40, lenient: true, example: '021 123 4567',
    aliases: ['Work Phone', 'Work Mobile', 'Work Telephone', 'Work Phone Number', 'Business Phone', 'Office Phone', 'Company Phone', 'Work Number'],
  },
  start_date: {
    label: 'Start date', group: 'dates', table: 'employee', column: 'start_date', kind: 'date', example: '05/01/2024',
    aliases: [
      'Start Date', 'Employment Start Date', 'Hire Date', 'Date Hired', 'Date Started', 'Date of Joining', 'Joining Date',
      'Commencement Date', 'Date of Commencement', 'Date Joined', 'Start', 'Employment Date', 'Date of Hire', 'Joined', 'Joined Date',
    ],
  },
  continuous_service_date: {
    label: 'Continuous service date', group: 'dates', table: 'employee', column: 'continuous_service_date', kind: 'date', example: '05/01/2024',
    aliases: ['Continuous Service Date', 'Continuous Service', 'Service Date', 'Date of Continuous Service', 'Seniority Date', 'Original Hire Date', 'Service Start Date'],
  },
  probation_end_date: {
    label: 'Probation end date', group: 'dates', table: 'employee', column: 'probation_end_date', kind: 'date', example: '05/07/2024',
    aliases: ['Probation End', 'Probation End Date', 'Probation Ends', 'Probation Review Date', 'End of Probation', 'Probation Date', 'Probation Period End', 'Probation Expiry'],
  },
  end_date: {
    label: 'End date (leaving date)', group: 'dates', table: 'employee', column: 'end_date', kind: 'date', example: '',
    aliases: [
      'End Date', 'Leaving Date', 'Leave Date', 'Date Left', 'Termination Date', 'Finish Date', 'Employment End Date',
      'Last Day', 'Last Working Day', 'Date of Leaving', 'Left On',
    ],
  },
  personal_email: {
    label: 'Personal email', group: 'personal', table: 'private', column: 'personal_email', kind: 'email', maxLength: 254, lenient: true,
    example: 'example.person@personal.example.com',
    aliases: [
      'Personal Email', 'Personal Email Address', 'Home Email', 'Private Email', 'Personal E-mail', 'Email (Personal)',
      'Secondary Email', 'Alternative Email', 'Other Email',
    ],
  },
  mobile: {
    label: 'Mobile', group: 'personal', table: 'private', column: 'mobile', kind: 'phone', maxLength: 40, lenient: true, example: '087 123 4567',
    // A bare "Phone" is treated as personal: the private side is the safer place for an unlabelled number.
    aliases: [
      'Mobile', 'Mobile Phone', 'Mobile Number', 'Mobile No', 'Cell', 'Cell Phone', 'Cellphone', 'Phone', 'Phone Number',
      'Telephone', 'Tel', 'Telephone Number', 'Contact Number', 'Contact Phone', 'Personal Mobile', 'Personal Phone', 'Home Phone', 'Phone No',
    ],
  },
  date_of_birth: {
    label: 'Date of birth', group: 'personal', table: 'private', column: 'date_of_birth', kind: 'date', notFuture: true, example: '14/03/1990',
    aliases: ['Date of Birth', 'DOB', 'Birth Date', 'Birthday', 'Birthdate', 'D.O.B'],
  },
  pps_number: {
    label: 'PPS number', group: 'personal', table: 'private', column: 'pps_number', kind: 'pps', example: '0000000A',
    aliases: ['PPS', 'PPSN', 'PPS Number', 'PPS No', 'PPS Num', 'Personal Public Service Number', 'Personal Public Service No'],
  },
  nationality: {
    label: 'Nationality', group: 'personal', table: 'private', column: 'nationality', kind: 'text', maxLength: 80, example: 'Irish',
    aliases: ['Nationality', 'Citizenship', 'Country of Citizenship'],
  },
  address_line1: {
    label: 'Address line 1', group: 'personal', table: 'private', column: 'address_line1', kind: 'text', maxLength: 120, example: '1 Example Street',
    aliases: ['Address', 'Address 1', 'Address Line 1', 'Address1', 'Street', 'Street Address', 'Home Address', 'Address Line One', 'Line 1', 'Address Line'],
  },
  address_line2: {
    label: 'Address line 2', group: 'personal', table: 'private', column: 'address_line2', kind: 'text', maxLength: 120, example: '',
    aliases: ['Address 2', 'Address Line 2', 'Address2', 'Address Line Two', 'Line 2'],
  },
  town: {
    label: 'Town', group: 'personal', table: 'private', column: 'town', kind: 'text', maxLength: 80, example: 'Cork',
    aliases: ['Town', 'City', 'Town/City', 'Town or City', 'Locality'],
  },
  county: {
    label: 'County', group: 'personal', table: 'private', column: 'county', kind: 'county', maxLength: 80, example: 'Cork',
    aliases: ['County', 'State', 'Province', 'State/County', 'County/State'],
  },
  eircode: {
    label: 'Eircode', group: 'personal', table: 'private', column: 'eircode', kind: 'eircode', lenient: true, example: 'T12 X285',
    aliases: ['Eircode', 'Postcode', 'Post Code', 'Postal Code', 'Zip', 'ZIP Code', 'Zip/Postcode', 'Eir Code'],
  },
}

export const IMPORT_FIELDS: ImportField[] = (Object.keys(FIELDS) as ImportFieldKey[]).map(key => ({ key, ...FIELDS[key] }))

export const FIELD_BY_KEY = Object.fromEntries(IMPORT_FIELDS.map(field => [field.key, field])) as Record<ImportFieldKey, ImportField>

export const isPrivateField = (field: ImportField) => field.table === 'private'

export function isImportFieldKey(value: unknown): value is ImportFieldKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FIELDS, value)
}

/** "Date of Birth (dd/mm/yyyy)" -> "dateofbirthddmmyyyy": lower case, no accents, spaces or punctuation. */
function squash(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
}

const ALIAS_INDEX = new Map<string, ImportFieldKey>()
for (const field of IMPORT_FIELDS) {
  for (const alias of [field.label, ...field.aliases]) {
    const key = squash(alias)
    if (!ALIAS_INDEX.has(key)) ALIAS_INDEX.set(key, field.key)
  }
}

/** Matches a column heading to a field: first as written, then without any "(…)" hint such as "(dd/mm/yyyy)". */
function matchHeading(heading: string): ImportFieldKey | null {
  const exact = ALIAS_INDEX.get(squash(heading))
  if (exact) return exact
  const withoutHint = heading.replace(/\([^)]*\)|\[[^\]]*\]|\*/g, ' ')
  return withoutHint === heading ? null : (ALIAS_INDEX.get(squash(withoutHint)) ?? null)
}

/** One field per column, one column per field: if two headings match the same field the first one wins. */
export function autoMapHeadings(headings: string[]): (ImportFieldKey | null)[] {
  const used = new Set<ImportFieldKey>()
  return headings.map(heading => {
    const key = matchHeading(heading)
    if (!key || used.has(key)) return null
    used.add(key)
    return key
  })
}

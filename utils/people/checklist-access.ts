import { canOnEmployee, inScope, isHr, isSelf, type PeopleViewer } from './access'
import type { Employee, OwnerRole } from './types'

type Subject = Pick<Employee, 'id' | 'area' | 'manager_email'>

/**
 * Who may tick off (or annotate) a task. HR and managers who cover the
 * employee may tick anything; an employee may only tick the tasks addressed to
 * them, on their own checklist. Every action re-checks this server-side.
 */
export function canTickItem(viewer: PeopleViewer, employee: Subject, ownerRole: OwnerRole): boolean {
  if (canOnEmployee(viewer, 'checklists.manage', employee)) return true
  return isSelf(viewer, employee) && ownerRole === 'employee'
}

/**
 * Whether a task is the viewer's to do, for the "My tasks" lists. HR own the
 * HR, IT and finance steps (nobody else has an HR Locker login for those), the
 * named line manager owns manager steps, and a person owns their own steps.
 */
export function isMyTask(viewer: PeopleViewer, employee: Subject, ownerRole: OwnerRole): boolean {
  switch (ownerRole) {
    case 'employee':
      return isSelf(viewer, employee)
    case 'hr':
    case 'it':
    case 'finance':
      return isHr(viewer)
    case 'manager':
      if (employee.manager_email) return employee.manager_email === viewer.email
      // No named line manager: whoever covers the employee picks it up.
      return isHr(viewer) || (viewer.role === 'manager' && inScope(viewer, employee) && !isSelf(viewer, employee))
  }
}

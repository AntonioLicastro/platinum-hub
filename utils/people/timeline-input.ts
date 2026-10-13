// Limits and id checks shared by the timeline and reviews server actions and their forms.
// Pure module: safe to import from client components.

export const TITLE_MAX = 200
export const TEXT_MAX = 5000

/** Earliest date a form accepts; catches typos such as 0202-01-01 while allowing old start dates. */
export const EARLIEST_DATE = '1990-01-01'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids reach server actions as plain arguments, so check the shape before they hit a uuid column. */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}

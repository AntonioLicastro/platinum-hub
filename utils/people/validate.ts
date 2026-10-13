// Small FormData parsing/validation helpers shared by every HR Locker server action.
// Each `opt*` returns null for a blank field, and `undefined`-safe values otherwise.

export function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null
}

export function optEmail(fd: FormData, key: string): string | null {
  const v = str(fd, key).toLowerCase()
  return v || null
}

export function optNumber(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export function optDate(fd: FormData, key: string): string | null {
  return str(fd, key) || null
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === 'on' || v === 'true' || v === '1'
}

export function isIsoDate(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/** Irish PPS number: 7 digits followed by one or two letters (e.g. 1234567TA). */
export function normalisePps(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase()
}
export function isPps(v: string): boolean {
  return /^\d{7}[A-W][A-IW]?$/.test(normalisePps(v))
}

/** Eircode: routing key (A65, D6W) + 4 character unique identifier. */
export function normaliseEircode(v: string): string {
  const s = v.replace(/\s+/g, '').toUpperCase()
  return s.length > 3 ? `${s.slice(0, 3)} ${s.slice(3)}` : s
}
export function isEircode(v: string): boolean {
  return /^[AC-FHKNPRTV-Y]\d{2}[0-9AC-FHKNPRTV-Y]{4}$/i.test(v.replace(/\s+/g, '')) ||
    /^D6W[0-9AC-FHKNPRTV-Y]{4}$/i.test(v.replace(/\s+/g, ''))
}

/** Checks `value` is one of the allowed option values; returns it typed, or null. */
export function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

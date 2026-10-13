import type { Compensation } from './types'

export function formatEuro(amount: number, currency = 'EUR'): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'EUR'
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: code }).format(amount)
}

/** "€14.50 / hour" or "€32,000.00 / year" */
export function formatRate(c: Pick<Compensation, 'pay_basis' | 'rate' | 'currency'>): string {
  return `${formatEuro(c.rate, c.currency)} / ${c.pay_basis === 'hourly' ? 'hour' : 'year'}`
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return ''
  return `${Math.round(hours * 100) / 100} hrs / week`
}

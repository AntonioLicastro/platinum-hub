'use server'

import { revalidatePath } from 'next/cache'
import { authorize } from '@/utils/people/access'
import { logAudit } from '@/utils/people/audit'
import { createAdminClient } from '@/utils/people/db'
import { FIRST_HOLIDAY_YEAR, irishPublicHolidays, isSupportedHolidayYear } from '@/utils/people/settings-holidays'
import { NAME_MAX } from '@/utils/people/settings-input'
import type { ActionState } from '@/utils/people/types'
import { isIsoDate, str } from '@/utils/people/validate'

// Server actions for Settings > Public holidays. Every action re-checks
// settings.manage: the date, year and form values come from the browser.

const BASE = '/settings/holidays'
const TRY_AGAIN = 'Please try again.'
/** Sanity bounds for hand-added dates; the generator has its own, narrower range. */
const MIN_YEAR = 2000
const MAX_YEAR = 2100

function refresh() {
  revalidatePath(BASE)
  revalidatePath('/settings')
  // Leave day counts and the calendar skip public holidays.
  revalidatePath('/leave')
}

const yearOf = (iso: string) => Number(iso.slice(0, 4))

export async function addHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }

  const date = str(formData, 'holiday_date')
  if (!isIsoDate(date)) return { error: 'Choose a valid date' }
  if (yearOf(date) < MIN_YEAR || yearOf(date) > MAX_YEAR) return { error: `Choose a date between ${MIN_YEAR} and ${MAX_YEAR}` }
  const name = str(formData, 'name')
  if (!name) return { error: 'Give the holiday a name' }
  if (name.length > NAME_MAX) return { error: `The name must be ${NAME_MAX} characters or fewer` }

  const { error } = await createAdminClient().from('hr_public_holidays').insert({ holiday_date: date, name })
  if (error) {
    if (error.code === '23505') return { error: 'There is already a public holiday on that date.' }
    console.error('addHoliday failed', error.code, error.message)
    return { error: `Could not add the holiday. ${TRY_AGAIN}` }
  }

  await logAudit(auth.viewer, { action: 'holiday.add', entity: 'hr_public_holidays', entityId: date, detail: { year: yearOf(date) } })
  refresh()
  return { error: null, ok: true, message: 'Holiday added' }
}

export async function deleteHoliday(date: string): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isIsoDate(date)) return { error: 'That holiday no longer exists' }

  const { data, error } = await createAdminClient()
    .from('hr_public_holidays')
    .delete()
    .eq('holiday_date', date)
    .select('holiday_date')
  if (error) {
    console.error('deleteHoliday failed', error.code, error.message)
    return { error: `Could not delete the holiday. ${TRY_AGAIN}` }
  }
  if (!data || data.length === 0) return { error: 'That holiday no longer exists' }

  await logAudit(auth.viewer, { action: 'holiday.delete', entity: 'hr_public_holidays', entityId: date, detail: { year: yearOf(date) } })
  refresh()
  return { error: null, ok: true }
}

/** Adds the standard Irish set for a year. Dates already on the list are left exactly as they are. */
export async function generateHolidays(year: number): Promise<ActionState> {
  const auth = await authorize('settings.manage')
  if (!auth.ok) return { error: auth.error }
  if (!isSupportedHolidayYear(year)) {
    return { error: `The standard set starts in ${FIRST_HOLIDAY_YEAR}, when St Brigid's Day was added. Add earlier dates by hand.` }
  }

  const admin = createAdminClient()
  const standard = irishPublicHolidays(year)
  const { data: existing, error: readError } = await admin
    .from('hr_public_holidays')
    .select('holiday_date')
    .gte('holiday_date', `${year}-01-01`)
    .lte('holiday_date', `${year}-12-31`)
    .returns<{ holiday_date: string }[]>()
  if (readError) {
    console.error('generateHolidays read failed', readError.code, readError.message)
    return { error: `Could not read the current holidays. ${TRY_AGAIN}` }
  }
  const have = new Set((existing ?? []).map(h => h.holiday_date))
  const missing = standard.filter(h => !have.has(h.holiday_date))
  const skipped = standard.length - missing.length

  if (missing.length > 0) {
    const { error } = await admin
      .from('hr_public_holidays')
      .upsert(missing, { onConflict: 'holiday_date', ignoreDuplicates: true })
    if (error) {
      console.error('generateHolidays failed', error.code, error.message)
      return { error: `Could not add the holidays. ${TRY_AGAIN}` }
    }
  }

  await logAudit(auth.viewer, {
    action: 'holiday.generate',
    entity: 'hr_public_holidays',
    detail: { year, added: missing.length, skipped },
  })
  refresh()
  if (missing.length === 0) {
    return { error: null, ok: true, message: `All ${standard.length} standard holidays for ${year} were already on the list.` }
  }
  return {
    error: null,
    ok: true,
    message:
      `Added ${missing.length} ${missing.length === 1 ? 'holiday' : 'holidays'} for ${year}` +
      `${skipped > 0 ? ` (${skipped} already on the list were left as they are)` : ''}. ` +
      'Check them against the official list, as the rules can change.',
  }
}

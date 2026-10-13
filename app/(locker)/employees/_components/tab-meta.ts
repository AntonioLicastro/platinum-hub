import {
  Banknote, Briefcase, CalendarDays, ClipboardCheck, FileCheck, History, IdCard, ListChecks, UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { ProfileTabKey } from '@/utils/people/profile-tabs'

export const TAB_ICONS: Record<ProfileTabKey, LucideIcon> = {
  overview: UserRound,
  employment: Briefcase,
  personal: IdCard,
  pay: Banknote,
  documents: FileCheck,
  leave: CalendarDays,
  reviews: ClipboardCheck,
  checklists: ListChecks,
  timeline: History,
}

/** One line shown on the overview's quick links, saying what lives on each tab. */
export const TAB_BLURBS: Record<ProfileTabKey, string> = {
  overview: 'Key dates and what is still missing',
  employment: 'Role, area, contract and line manager',
  personal: 'Contact, address, PPS and emergency contacts',
  pay: 'Current rate and pay history',
  documents: 'Vetting, right to work and training',
  leave: 'Entitlements, balances and requests',
  reviews: 'Probation, appraisals and supervision',
  checklists: 'Onboarding and offboarding tasks',
  timeline: 'Role changes, notes and case history',
}

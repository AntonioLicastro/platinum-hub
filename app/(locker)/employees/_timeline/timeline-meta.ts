import {
  Award, Briefcase, CalendarOff, CircleDot, ClipboardCheck, Euro, Gavel, GraduationCap, Hourglass, LogOut, MapPin,
  MessageSquareWarning, StickyNote, TreePalm, TriangleAlert, UserPlus, type LucideIcon,
} from 'lucide-react'
import { EVENT_TYPES, type Tone } from '@/utils/people/constants'
import type { TimelineCategory } from '@/utils/people/timeline-data'

// How each timeline category looks: icon, tone and label. Stored event types
// take their label and tone from EVENT_TYPES; the two derived categories
// (approved leave, completed reviews) are defined here.

const ICONS: Record<TimelineCategory, LucideIcon> = {
  joined: UserPlus,
  role_change: Briefcase,
  area_change: MapPin,
  pay_change: Euro,
  probation: Hourglass,
  commendation: Award,
  warning: TriangleAlert,
  disciplinary: Gavel,
  grievance: MessageSquareWarning,
  absence: CalendarOff,
  training: GraduationCap,
  note: StickyNote,
  leaver: LogOut,
  other: CircleDot,
  leave: TreePalm,
  review: ClipboardCheck,
}

type CategoryMeta = { label: string; tone: Tone; icon: LucideIcon }

export function categoryMeta(category: TimelineCategory): CategoryMeta {
  const icon = ICONS[category]
  if (category === 'leave') return { label: 'Leave', tone: 'sky', icon }
  if (category === 'review') return { label: 'Review', tone: 'purple', icon }
  const type = EVENT_TYPES.find(t => t.value === category)
  return { label: type?.label ?? category, tone: type?.tone ?? 'gray', icon }
}

/** Icon-dot colours (soft background + strong icon) for each tone. */
export const DOT_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-violet-100 text-violet-700',
  sky: 'bg-sky-100 text-sky-700',
  pink: 'bg-pink-100 text-pink-700',
  gray: 'bg-slate-100 text-slate-600',
}

import type { ComponentType } from 'react'
import {
  ArrowLeftRight, CalendarDays, ClipboardCheck, Clock, FileCheck, HeartPulse, Hourglass, Palmtree, Percent, ShieldCheck,
  TrendingUp, TriangleAlert, UserMinus, UserPlus, Users,
} from 'lucide-react'
import type { ReportId, StatIcon } from '@/utils/people/report-types'

type Icon = ComponentType<{ size?: number; className?: string }>

export const REPORT_ICONS: Record<ReportId, Icon> = {
  workforce: Users,
  movement: ArrowLeftRight,
  turnover: Percent,
  tenure: Hourglass,
  leave: Palmtree,
  compliance: ShieldCheck,
  reviews: ClipboardCheck,
}

export const STAT_ICONS: Record<StatIcon, Icon> = {
  people: Users,
  trend: TrendingUp,
  starter: UserPlus,
  leaver: UserMinus,
  percent: Percent,
  clock: Clock,
  leave: CalendarDays,
  sick: HeartPulse,
  document: FileCheck,
  alert: TriangleAlert,
}

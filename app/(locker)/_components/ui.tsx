import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { initials } from '@/utils/people/format'
import type { Tone } from '@/utils/people/constants'

// Shared presentational primitives for HR Locker. Server-component safe (no
// hooks); anything interactive lives in action-form.tsx / nav-links.tsx.
// Brand colours: indigo #323398 (primary), green #179048 (accent).

// ---- Class helpers --------------------------------------------------------

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'shadow-sm transition focus:border-[#323398] focus:outline-none focus:ring-4 focus:ring-[#323398]/10 disabled:bg-slate-50 disabled:text-slate-500'

export const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
type ButtonSize = 'sm' | 'md'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[#323398] text-white shadow-sm hover:bg-[#282a7a] focus-visible:ring-[#323398]/30',
  success: 'bg-[#179048] text-white shadow-sm hover:bg-[#127a3d] focus-visible:ring-[#179048]/30',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-slate-300/50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500/30',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300/50',
}

/** className for <button>, <Link> or <a> so every button in the app looks the same. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
  return (
    `inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-4 ` +
    `disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${BUTTON_VARIANTS[variant]}`
  )
}

// ---- Layout ---------------------------------------------------------------

export type Crumb = { label: string; href?: string }

export function PageHeader({
  title, subtitle, actions, crumbs, icon: Icon,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  crumbs?: Crumb[]
  icon?: ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href ? <Link href={c.href} className="hover:text-[#323398] hover:underline">{c.label}</Link> : <span>{c.label}</span>}
              {i < crumbs.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#323398]/10 text-[#323398] sm:flex">
              <Icon size={20} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${padded ? 'p-5' : ''} ${className}`}>
      {children}
    </section>
  )
}

export function CardHeader({ title, description, actions, icon: Icon }: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon size={18} className="mt-0.5 shrink-0 text-[#323398]" />}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---- Badges, avatars, stats ----------------------------------------------

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  pink: 'bg-pink-50 text-pink-700 ring-pink-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

const DOT_TONES: Record<Tone, string> = {
  green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-blue-500',
  purple: 'bg-violet-500', sky: 'bg-sky-500', pink: 'bg-pink-500', gray: 'bg-slate-400',
}

export function Badge({ tone = 'gray', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT_TONES[tone]}`} />}
      {children}
    </span>
  )
}

// A stable colour per person so lists are easy to scan.
const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-800', 'bg-pink-100 text-pink-700', 'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700', 'bg-rose-100 text-rose-700',
]

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const sizing = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-20 w-20 text-2xl' }[size]
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${sizing} ${AVATAR_COLORS[hash % AVATAR_COLORS.length]}`}
    >
      {initials(name)}
    </span>
  )
}

export function Stat({ label, value, hint, icon: Icon, tone = 'blue', href }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
  tone?: Tone
  href?: string
}) {
  const iconTone: Record<Tone, string> = {
    green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    blue: 'bg-indigo-50 text-[#323398]', purple: 'bg-violet-50 text-violet-600', sky: 'bg-sky-50 text-sky-600',
    pink: 'bg-pink-50 text-pink-600', gray: 'bg-slate-100 text-slate-500',
  }
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {Icon && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone[tone]}`}>
          <Icon size={20} />
        </span>
      )}
    </div>
  )
  const cls = 'block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm'
  return href
    ? <Link href={href} className={`${cls} transition hover:border-[#323398]/30 hover:shadow-md`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

export function ProgressBar({ value, tone = 'green', label }: { value: number; tone?: Tone; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${DOT_TONES[tone]} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ---- Empty / not-yet-recorded states -------------------------------------

export function EmptyState({ icon: Icon, title, body, action }: {
  icon?: ComponentType<{ size?: number; className?: string }>
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
          <Icon size={22} />
        </span>
      )}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Inline "nothing recorded yet" marker, so every field has a visible home even when empty. */
export function NotRecorded({ label = 'Not recorded yet' }: { label?: string }) {
  return <span className="text-sm italic text-slate-400">{label}</span>
}

/** Read-only label/value pair. Empty values render as <NotRecorded />. */
export function DataItem({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  const empty = value === null || value === undefined || value === '' || value === false
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-900">{empty ? <NotRecorded /> : value}</dd>
    </div>
  )
}

export function DataGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-5 ${cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</dl>
  )
}

// ---- Forms ----------------------------------------------------------------

export function Field({ label, htmlFor, hint, children, wide = false, required = false }: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
  wide?: boolean
  required?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}{required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}

// ---- Tables ---------------------------------------------------------------

export const tableClass = 'w-full text-left text-sm'
export const thClass = 'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500'
export const tdClass = 'px-4 py-3 align-middle text-slate-700'

export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

/** Small coloured legend dot + label. */
export function LegendDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${DOT_TONES[tone]}`} /> {label}
    </span>
  )
}

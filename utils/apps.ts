export type AppKey = 'mileage' | 'retention' | 'compliance' | 'leave' | 'ops'

export type AppLink = {
  key: AppKey
  name: string
  description: string
  url: string
  // Where on the app's site the sign-in handoff lives. Defaults to '/auth/handoff'; a
  // tile can add ?next=/path to land somewhere other than the app's home page.
  handoffPath?: string
}

// URLs can be overridden per-environment (e.g. pointed at localhost during
// local dev) via these env vars; production falls back to the real domains.
export const APPS: AppLink[] = [
  {
    key: 'mileage',
    name: 'Easy Mileage',
    description: 'Log mileage and travel expense claims',
    url: process.env.NEXT_PUBLIC_EASY_MILEAGE_URL ?? 'https://easymileage.vercel.app',
  },
  {
    key: 'retention',
    name: 'Retention Hub',
    description: 'Track leavers and exit interviews',
    url: process.env.NEXT_PUBLIC_RETENTION_HUB_URL ?? 'https://retention-hub.vercel.app',
  },
  {
    key: 'compliance',
    name: 'Compliance Wizard',
    description: 'Staff compliance checks and document tracking',
    url: process.env.NEXT_PUBLIC_COMPLIANCE_WIZARD_URL ?? 'https://compliance-tracker-six.vercel.app',
  },
  {
    key: 'leave',
    name: 'HR Locker',
    description: '',
    // HR Locker is built into Easy Mileage (its /people area) and replaces the A/L Tracker.
    url: process.env.NEXT_PUBLIC_EASY_MILEAGE_URL ?? 'https://easymileage.vercel.app',
    handoffPath: '/auth/handoff?next=/people',
  },
  {
    key: 'ops',
    name: 'Platinum 360',
    description: 'Monthly CHO KPIs: recruitment, POC records and capacity',
    url: process.env.NEXT_PUBLIC_OPS_WIZARD_URL ?? 'https://ops-wizard.vercel.app',
  },
]
